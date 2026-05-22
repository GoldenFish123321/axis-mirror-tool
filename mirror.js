/**
 * mirror.js — 核心镜像变换算法
 *
 * 功能：根据两个点定义的对称轴（无限直线），将保留侧像素反射到另一侧
 *
 * 数学原理：
 * - 直线由两个点 P1(x1,y1), P2(x2,y2) 定义
 * - 点到直线的有符号距离使用叉积计算
 * - 点关于直线的反射：先投影到直线，再对称
 */

/**
 * 对源 Canvas 应用镜像变换，返回新的 Canvas
 *
 * @param {HTMLCanvasElement} sourceCanvas - 源图像 Canvas
 * @param {object} p1 - 对称轴上的第一个点 {x, y}（图像坐标）
 * @param {object} p2 - 对称轴上的第二个点 {x, y}（图像坐标）
 * @param {boolean} keepPositiveSide - true=保留法线指向侧，false=保留另一侧
 * @param {object|null} [bgColor] - 背景色 {r, g, b, a}，为 null 表示透明
 * @returns {HTMLCanvasElement} 变换后的新 Canvas
 */
function applyMirror(sourceCanvas, p1, p2, keepPositiveSide, bgColor) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  // 读取源图像像素数据
  const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const srcData = srcCtx.getImageData(0, 0, width, height);

  // 创建目标像素数据
  const dstData = new ImageData(width, height);
  const dstPixels = dstData.data;
  const srcPixels = srcData.data;

  // 直线方向向量 (dx, dy)
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lineLen2 = dx * dx + dy * dy;

  // 防止除以零（两点重合时默认水平线）
  if (lineLen2 < 1e-10) {
    return applyMirror(sourceCanvas, { x: 0, y: p1.y }, { x: width, y: p1.y }, keepPositiveSide, bgColor);
  }

  const lineLen = Math.sqrt(lineLen2);

  // 法向量（垂直于直线方向）：(-dy, dx) 归一化
  const nx = -dy / lineLen;
  const ny = dx / lineLen;

  // 预计算常量用于快速有符号距离计算
  const distA = dy / lineLen;
  const distB = -dx / lineLen;
  const distC = (-p1.x * dy + p1.y * dx) / lineLen;

  // 如果有指定背景色，先用背景色填充整个目标，再覆盖保留侧和反射像素
  if (bgColor) {
    // ImageData 初始是全 0（透明黑），直接分块写入背景色效率低
    // 改为：在循环中，对丢弃侧像素采样后，如果采样点出界则使用 bgColor
    // 保留侧像素仍然用源图
    // 这样无需预先填充整图
  }

  // 逐像素处理
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;

      // 计算有符号距离
      const signedDist = distA * x + distB * y + distC;

      // 判断是否在保留侧
      const isKeepSide = keepPositiveSide ? signedDist >= 0 : signedDist < 0;

      if (isKeepSide) {
        // 保留侧：直接复制像素
        dstPixels[dstIdx]     = srcPixels[dstIdx];
        dstPixels[dstIdx + 1] = srcPixels[dstIdx + 1];
        dstPixels[dstIdx + 2] = srcPixels[dstIdx + 2];
        dstPixels[dstIdx + 3] = srcPixels[dstIdx + 3];
      } else {
        // 丢弃侧：反射到保留侧采样
        const t = ((x - p1.x) * dx + (y - p1.y) * dy) / lineLen2;
        const px = p1.x + t * dx;
        const py = p1.y + t * dy;
        const refX = 2 * px - x;
        const refY = 2 * py - y;

        // 从源图采样反射点像素（双线性插值），出界时使用 bgColor
        const sampled = sampleBilinear(srcPixels, width, height, refX, refY, bgColor);
        dstPixels[dstIdx]     = sampled.r;
        dstPixels[dstIdx + 1] = sampled.g;
        dstPixels[dstIdx + 2] = sampled.b;
        dstPixels[dstIdx + 3] = sampled.a;
      }
    }
  }

  // 构建结果 Canvas
  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = width;
  resultCanvas.height = height;
  const resultCtx = resultCanvas.getContext('2d', { alpha: true });

  if (bgColor && bgColor.a >= 255) {
    // 完全不透明背景：使用 fillRect 一次性填充比 putImageData 更快
    // 但 putImageData 已经包含了像素数据，不需要额外填充
  }

  resultCtx.clearRect(0, 0, width, height);
  resultCtx.putImageData(dstData, 0, 0);

  return resultCanvas;
}

/**
 * 双线性插值采样像素
 *
 * 对于浮点坐标 (x, y)，取周围 4 个像素的加权平均
 *
 * @param {Uint8ClampedArray} pixels - 像素数据 (RGBA)
 * @param {number} width - 图像宽度
 * @param {number} height - 图像高度
 * @param {number} x - 采样点 X 坐标（浮点）
 * @param {number} y - 采样点 Y 坐标（浮点）
 * @param {object|null} [bgColor] - 出界时的背景色 {r, g, b, a}，null 则返回透明
 * @returns {{r, g, b, a}} 插值后的 RGBA 值
 */
function sampleBilinear(pixels, width, height, x, y, bgColor) {
  // 边界检查：如果采样点在图像外，返回背景色或透明
  if (x < 0 || x >= width || y < 0 || y >= height) {
    if (bgColor) {
      return { r: bgColor.r, g: bgColor.g, b: bgColor.b, a: bgColor.a };
    }
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  // 四个相邻像素的整数坐标
  const x1 = Math.floor(x);
  const y1 = Math.floor(y);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);

  // 插值权重（小数部分）
  const fx = x - x1;
  const fy = y - y1;

  // 读取四个像素
  const idx11 = (y1 * width + x1) * 4;
  const idx21 = (y1 * width + x2) * 4;
  const idx12 = (y2 * width + x1) * 4;
  const idx22 = (y2 * width + x2) * 4;

  // 双线性插值
  const w11 = (1 - fx) * (1 - fy);
  const w21 = fx * (1 - fy);
  const w12 = (1 - fx) * fy;
  const w22 = fx * fy;

  return {
    r: Math.round(w11 * pixels[idx11]     + w21 * pixels[idx21]     + w12 * pixels[idx12]     + w22 * pixels[idx22]),
    g: Math.round(w11 * pixels[idx11 + 1] + w21 * pixels[idx21 + 1] + w12 * pixels[idx12 + 1] + w22 * pixels[idx22 + 1]),
    b: Math.round(w11 * pixels[idx11 + 2] + w21 * pixels[idx21 + 2] + w12 * pixels[idx12 + 2] + w22 * pixels[idx22 + 2]),
    a: Math.round(w11 * pixels[idx11 + 3] + w21 * pixels[idx21 + 3] + w12 * pixels[idx12 + 3] + w22 * pixels[idx22 + 3]),
  };
}

/**
 * 获取关于指定直线对称的反射点坐标
 */
function reflectPoint(x, y, p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lineLen2 = dx * dx + dy * dy;

  if (lineLen2 < 1e-10) return { x, y };

  const t = ((x - p1.x) * dx + (y - p1.y) * dy) / lineLen2;
  const px = p1.x + t * dx;
  const py = p1.y + t * dy;

  return {
    x: 2 * px - x,
    y: 2 * py - y
  };
}

/**
 * 计算点到直线的有符号距离
 */
function signedDistance(x, y, p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lineLen = Math.sqrt(dx * dx + dy * dy);
  if (lineLen < 1e-10) return 0;
  return (dx * (y - p1.y) - dy * (x - p1.x)) / lineLen;
}
