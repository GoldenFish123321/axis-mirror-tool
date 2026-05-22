/**
 * gif-handler.js — GIF 解码、逐帧镜像处理、随机顺序、重新编码导出
 *
 * 解码使用 omggif，编码使用 gif.js
 * omggif / gif.js 已本地内联在 lib/ 目录中（通过 index.html script 标签引入）
 *
 * 依赖（按加载顺序）：
 *   1. lib/omggif.js  → 暴露 GifReader / GifWriter 全局函数
 *   2. lib/gif.js     → 暴露 GIF 全局构造函数
 *
 * omggif 的 CommonJS 导出在浏览器中不生效，但 GifReader 和 GifWriter
 * 是函数声明，加载后自动成为 window 上的全局变量。
 * index.html 中有一个内联脚本确保 window.Omggif 命名空间已创建。
 */

/**
 * 解析 GIF 文件为帧数据（使用 omggif）
 *
 * @param {ArrayBuffer} arrayBuffer - GIF 文件的 ArrayBuffer
 * @returns {Promise<Array<{canvas: HTMLCanvasElement, delay: number}>>} 帧数组
 */
async function parseGIFToFrames(arrayBuffer) {
  // 检查 omggif 是否已加载
  const GifReader = window.GifReader || (window.Omggif && window.Omggif.GifReader);
  if (typeof GifReader !== 'function') {
    const err = new Error(
      'omggif library not loaded: GifReader is undefined. ' +
      'Ensure lib/omggif.js is loaded before this script.'
    );
    err.code = 'LIB_NOT_LOADED';
    throw err;
  }

  // 验证输入数据
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    const err = new Error('GIF file is empty (0 bytes)');
    err.code = 'EMPTY_FILE';
    throw err;
  }

  // 检查 GIF 头标记
  const header = new Uint8Array(arrayBuffer, 0, 3);
  const headerStr = String.fromCharCode(header[0], header[1], header[2]);
  if (headerStr !== 'GIF') {
    const err = new Error(
      `Invalid GIF header: expected "GIF" at bytes 0-2, got "${headerStr}"`
    );
    err.code = 'BAD_HEADER';
    throw err;
  }

  // 使用 omggif 解析
  let reader;
  try {
    reader = new GifReader(new Uint8Array(arrayBuffer));
  } catch (parseErr) {
    const err = new Error(
      `GIF parsing failed: ${parseErr.message || parseErr}`
    );
    err.code = 'PARSE_FAILED';
    err.cause = parseErr;
    throw err;
  }

  const width = reader.width;
  const height = reader.height;

  if (!width || !height || width <= 0 || height <= 0 || width > 8000 || height > 8000) {
    const err = new Error(`GIF has invalid dimensions: ${width}x${height}`);
    err.code = 'BAD_DIMENSIONS';
    throw err;
  }

  const numFrames = reader.numFrames();
  if (numFrames === 0) {
    const err = new Error(
      'No frames found in GIF — file may contain a single-frame static image, or be corrupt'
    );
    err.code = 'NO_FRAMES';
    throw err;
  }

  if (numFrames > 500) {
    const err = new Error(
      `GIF has too many frames (${numFrames}). Maximum supported: 500 frames.`
    );
    err.code = 'TOO_MANY_FRAMES';
    throw err;
  }

  console.log(`[GIF] Parsed ${numFrames} frames, ${width}x${height}`);

  // 用 omggif 逐帧解码为完整 RGBA Canvas
  const frames = decodeAllFrames(reader, numFrames, width, height);

  return frames;
}

/**
 * 使用 omggif 解码所有帧为完整尺寸的 Canvas 序列
 *
 * 正确处理 GIF disposal types：
 * - 0/1: 保留当前画布内容（下帧在其上叠加）
 * - 2:  恢复到背景色（清除本帧区域为透明）
 * - 3:  恢复到上一帧绘制前的状态
 *
 * @param {object} reader - omggif GifReader 实例
 * @param {number} numFrames - 帧数
 * @param {number} width - 宽度
 * @param {number} height - 高度
 * @returns {Array<{canvas: HTMLCanvasElement, delay: number}>}
 */
function decodeAllFrames(reader, numFrames, width, height) {
  const result = [];

  // 累积画布（Uint8Array RGBA）
  const rgba = new Uint8Array(width * height * 4);
  // 用于 disposal_type=3 时恢复：保存每一帧绘制前的画布状态
  let stateBeforeDraw = null;

  for (let i = 0; i < numFrames; i++) {
    const info = reader.frameInfo(i);
    // delay 以百分之一秒为单位，转为毫秒
    const delay = (info.delay != null) ? info.delay * 10 : 100;

    // --- 保存当前画布状态（用于帧自身的 disposal_type=3 后续恢复）---
    stateBeforeDraw = new Uint8Array(rgba);

    // --- 将当前帧合成到累积画布上 ---
    // decodeAndBlitFrameRGBA 会处理帧内透明度（将透明索引像素跳过）
    reader.decodeAndBlitFrameRGBA(i, rgba);

    // --- 保存当前帧快照 ---
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(rgba);
    ctx.putImageData(imageData, 0, 0);
    result.push({ canvas, delay });

    // --- 应用当前帧的 disposal，准备下一帧的画布 ---
    const disposalType = info.disposal_type || 0;

    if (disposalType === 2) {
      // Restore to background：将本帧区域清为透明
      clearRectInBuffer(rgba, width, height,
        info.x, info.y, info.width, info.height);
    } else if (disposalType === 3) {
      // Restore to previous：恢复到本帧绘制前的画布状态
      rgba.set(stateBeforeDraw);
    }
    // disposalType 0 或 1：保留当前画布内容不变
  }

  return result;
}

/**
 * 将 RGBA 缓冲区中指定矩形区域清为全透明
 */
function clearRectInBuffer(rgba, bufWidth, bufHeight, x, y, w, h) {
  const x1 = Math.max(0, x);
  const y1 = Math.max(0, y);
  const x2 = Math.min(bufWidth, x + w);
  const y2 = Math.min(bufHeight, y + h);

  for (let row = y1; row < y2; row++) {
    const rowStart = (row * bufWidth + x1) * 4;
    const rowLen = (x2 - x1) * 4;
    rgba.fill(0, rowStart, rowStart + rowLen);
  }
}

/**
 * 对 GIF 的每一帧应用镜像变换
 *
 * @param {Array<{canvas: HTMLCanvasElement, delay: number}>} frames - 原始帧
 * @param {object} p1 - 对称轴点1（图像坐标）
 * @param {object} p2 - 对称轴点2（图像坐标）
 * @param {boolean} keepPositiveSide - 保留侧
 * @param {object|null} [bgColor] - 背景色 {r,g,b,a}，null=透明
 * @returns {Array<{canvas: HTMLCanvasElement, delay: number}>} 处理后的帧
 */
function applyMirrorToGIF(frames, p1, p2, keepPositiveSide, bgColor) {
  return frames.map(frame => ({
    canvas: applyMirror(frame.canvas, p1, p2, keepPositiveSide, bgColor),
    delay: frame.delay
  }));
}

/**
 * 打乱帧顺序（Fisher-Yates 洗牌）
 *
 * @param {Array} frames - 帧数组（不会修改原数组）
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
 * 压缩并编码 GIF：自动缩放到合理尺寸，最低质量，确保导出文件小于 5MB
 *
 * 压缩策略：
 * 1. 最大尺寸：限制最长边 ≤ 600px（等比缩放）
 * 2. 最低质量：quality=20（gif.js 中最小的文件尺寸）
 * 3. 帧采样：超过 50 帧时自动降采样
 *
 * @param {Array<{canvas: HTMLCanvasElement, delay: number}>} frames - 帧数组
 * @param {number} [maxDimension=600] - 最长边最大像素
 * @param {number} [maxFrames=50] - 最大帧数
 * @returns {Promise<Blob>} 压缩后的 GIF Blob
 */
function encodeCompressedGIF(frames, maxDimension, maxFrames) {
  maxDimension = maxDimension || 600;
  maxFrames = maxFrames || 50;

  if (!frames || frames.length === 0) {
    return Promise.reject(new Error('No frames to encode'));
  }

  // 1. 帧采样：超过 maxFrames 帧时合并相邻帧的 delay 以保持总时长不变
  let processedFrames = frames;
  if (frames.length > maxFrames) {
    // 分组大小 = ceil(原帧数 / 目标帧数)，将相邻帧的 delay 累积到每组第一帧
    const groupSize = Math.ceil(frames.length / maxFrames);
    processedFrames = [];
    for (let i = 0; i < frames.length; i += groupSize) {
      const group = frames.slice(i, Math.min(i + groupSize, frames.length));
      // 累积该组所有帧的 delay
      const totalDelay = group.reduce((sum, f) => sum + f.delay, 0);
      processedFrames.push({
        canvas: group[0].canvas,
        delay: totalDelay
      });
    }
  }

  // 2. 计算目标尺寸（最长边 ≤ maxDimension）
  const origW = processedFrames[0].canvas.width;
  const origH = processedFrames[0].canvas.height;
  let scale = 1;
  if (Math.max(origW, origH) > maxDimension) {
    scale = maxDimension / Math.max(origW, origH);
  }
  const targetW = Math.round(origW * scale);
  const targetH = Math.round(origH * scale);

  // 3. 缩放所有帧到目标尺寸
  if (scale < 1) {
    const scaledFrames = [];
    for (const frame of processedFrames) {
      const c = document.createElement('canvas');
      c.width = targetW;
      c.height = targetH;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(frame.canvas, 0, 0, targetW, targetH);
      scaledFrames.push({ canvas: c, delay: frame.delay });
    }
    processedFrames = scaledFrames;
  }

  // 4. 使用最低质量编码
  return encodeGIF(processedFrames, 20 /* quality=20 = 最小文件 */);
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
    if (typeof window.GIF !== 'function') {
      const err = new Error(
        'gif.js library not loaded: GIF constructor is undefined. ' +
        'Ensure lib/gif.js is loaded before this script.'
      );
      err.code = 'ENC_LIB_NOT_LOADED';
      reject(err);
      return;
    }

    if (!frames || frames.length === 0) {
      reject(new Error('Cannot encode GIF: no frames provided (0 frames)'));
      return;
    }

    const w = frames[0].canvas.width;
    const h = frames[0].canvas.height;
    if (!w || !h || w <= 0 || h <= 0) {
      reject(new Error(`Cannot encode GIF: frame 0 has invalid dimensions ${w}x${h}`));
      return;
    }

    const encoder = new window.GIF({
      workers: 2,
      quality: quality,
      width: w,
      height: h,
      background: '#00000000', // 透明背景
      workerScript: 'lib/gif.worker.js' // 同源 Worker，避免 CDN 跨域问题
    });

    // 添加每一帧
    for (const frame of frames) {
      encoder.addFrame(frame.canvas, {
        delay: frame.delay,
        copy: true,
        dispose: 1
      });
    }

    encoder.on('progress', (progress) => {
      // 进度回调（可忽略或用于 UI 反馈）
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
