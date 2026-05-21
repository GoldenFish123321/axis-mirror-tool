/**
 * gif-handler.js — GIF 解码、逐帧镜像处理、随机顺序、重新编码导出
 *
 * 使用 CDN 引用的库：
 * - gifuct-js: GIF 解码（parseGIF + decompressFrames）
 * - gif.js: GIF 编码（GIF 类）
 *
 * 依赖配置：在 index.html 中通过 script 标签引入
 *   - https://unpkg.com/gifuct-js
 *   - https://unpkg.com/gif.js
 */

/**
 * 解析 GIF 文件为帧数据
 *
 * @param {ArrayBuffer} arrayBuffer - GIF 文件的 ArrayBuffer
 * @returns {Promise<Array<{canvas: HTMLCanvasElement, delay: number}>>} 帧数组
 */
async function parseGIFToFrames(arrayBuffer) {
  // 检查 gifuct-js 是否已加载（暴露 parseGIF 和 decompressFrames 全局函数）
  if (typeof parseGIF === 'undefined') {
    throw new Error('gifuct-js library not loaded');
  }

  // parseGIF 和 decompressFrames 是 gifuct-js 暴露的全局函数
  const gif = parseGIF(arrayBuffer);
  const parsedFrames = decompressFrames(gif, true);

  if (!parsedFrames || parsedFrames.length === 0) {
    throw new Error('No frames found in GIF');
  }

  // 获取 GIF 的完整尺寸
  const width = gif.lsd.width;
  const height = gif.lsd.height;

  // 构建完整帧（处理帧合成和 disposal）
  const fullFrames = compositeAllFrames(parsedFrames, width, height);

  return fullFrames;
}

/**
 * 帧合成：将所有帧拼合为完整尺寸的 Canvas 序列
 * 正确处理 disposalType (0=无, 1=保留, 2=恢复背景)
 *
 * @param {Array} parsedFrames - gifuct-js 解析的帧数组（已 decompress）
 * @param {number} fullWidth - GIF 完整宽度
 * @param {number} fullHeight - GIF 完整高度
 * @returns {Array<{canvas: HTMLCanvasElement, delay: number}>}
 */
function compositeAllFrames(parsedFrames, fullWidth, fullHeight) {
  const result = [];

  // 累积画布：一层层叠加帧
  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = fullWidth;
  compositeCanvas.height = fullHeight;
  const compositeCtx = compositeCanvas.getContext('2d');

  for (let i = 0; i < parsedFrames.length; i++) {
    const frame = parsedFrames[i];

    // --- 处理上一帧的 disposal ---
    if (i > 0) {
      const prev = parsedFrames[i - 1];
      if (prev.disposalType === 2) {
        // Restore to background: 清除上一帧的区域
        compositeCtx.clearRect(
          prev.dims.left, prev.dims.top,
          prev.dims.width, prev.dims.height
        );
      }
      // disposalType 0/1: 保留当前累积内容
    }

    // --- 绘制当前帧 ---
    // 从 frame.pixels (RGBA Uint8Array) 创建临时 Canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = frame.dims.width;
    tempCanvas.height = frame.dims.height;
    const tempCtx = tempCanvas.getContext('2d');
    const imageData = tempCtx.createImageData(frame.dims.width, frame.dims.height);
    // 注意：gifuct-js 的 pixels 可能不是标准的 RGBA 排列
    // 它返回的是 Uint8ClampedArray - 直接设置
    imageData.data.set(new Uint8ClampedArray(frame.pixels));
    tempCtx.putImageData(imageData, 0, 0);

    // 将帧合成到累积画布上
    compositeCtx.drawImage(tempCanvas, frame.dims.left, frame.dims.top);

    // --- 保存当前帧的快照 ---
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = fullWidth;
    frameCanvas.height = fullHeight;
    frameCanvas.getContext('2d').drawImage(compositeCanvas, 0, 0);

    // 帧延时时间（毫秒）
    // gifuct-js 的 delay 是百分之一秒，转换为毫秒
    const delay = (frame.delay != null) ? frame.delay * 10 : 100;

    result.push({
      canvas: frameCanvas,
      delay: delay
    });
  }

  return result;
}

/**
 * 对 GIF 的每一帧应用镜像变换
 *
 * @param {Array<{canvas: HTMLCanvasElement, delay: number}>} frames - 原始帧
 * @param {object} p1 - 对称轴点1（图像坐标）
 * @param {object} p2 - 对称轴点2（图像坐标）
 * @param {boolean} keepPositiveSide - 保留侧
 * @returns {Array<{canvas: HTMLCanvasElement, delay: number}>} 处理后的帧
 */
function applyMirrorToGIF(frames, p1, p2, keepPositiveSide) {
  return frames.map(frame => ({
    canvas: applyMirror(frame.canvas, p1, p2, keepPositiveSide),
    delay: frame.delay
  }));
}

/**
 * 打乱帧顺序（Fisher-Yates 洗牌）
 *
 * @param {Array} frames - 帧数组（会被原地修改）
 * @returns {Array} 打乱后的帧数组
 */
function shuffleFrames(frames) {
  const arr = [...frames];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 将帧序列编码为 GIF Blob
 *
 * @param {Array<{canvas: HTMLCanvasElement, delay: number}>} frames - 帧数组
 * @param {number} [quality=10] - GIF 质量 (1-20, 越低质量越好但文件越大)
 * @returns {Promise<Blob>} GIF Blob
 */
function encodeGIF(frames, quality = 10) {
  return new Promise((resolve, reject) => {
    // gif.js 在全局暴露 GIF 构造函数
    if (typeof GIF === 'undefined' || typeof GIF !== 'function') {
      reject(new Error('gif.js library not loaded'));
      return;
    }

    // gif.js 构造函数
    // 使用 workers=0（主线程编码）避免 Web Worker 跨域问题
    const encoder = new GIF({
      workers: 0,
      quality: quality,
      width: frames[0].canvas.width,
      height: frames[0].canvas.height,
      background: '#00000000' // 透明背景
    });

    // 添加每一帧
    for (const frame of frames) {
      encoder.addFrame(frame.canvas, {
        delay: frame.delay,
        copy: true,
        dispose: 1 // 保留上一帧（GIF 的 disposal=1 即 "do not dispose"）
      });
    }

    encoder.on('progress', (progress) => {
      // 进度回调（可忽略或用于 UI 反馈）
      // console.log(`GIF encoding: ${Math.round(progress * 100)}%`);
    });

    encoder.on('finished', (blob) => {
      resolve(blob);
    });

    encoder.on('error', (err) => {
      reject(err);
    });

    encoder.render();
  });
}

/**
 * 检查文件是否为 GIF
 *
 * @param {File} file - 文件对象
 * @returns {boolean}
 */
function isGIF(file) {
  return file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
}

/**
 * 从 Image 元素中提取像素数据到 Canvas
 *
 * @param {HTMLImageElement} img - 图片元素
 * @returns {HTMLCanvasElement} 包含图片的 Canvas
 */
function imageToCanvas(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return canvas;
}
