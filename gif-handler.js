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
 * @param {object} reader - omggif GifReader 实例
 * @param {number} numFrames - 帧数
 * @param {number} width - 宽度
 * @param {number} height - 高度
 * @returns {Array<{canvas: HTMLCanvasElement, delay: number}>}
 */
function decodeAllFrames(reader, numFrames, width, height) {
  const result = [];

  // omggif 的 decodeAndBlitFrameRGBA 会自动处理帧合成（disposal）
  // 每一帧都输出完整的 RGBA 图像，无需手动 composite
  const rgba = new Uint8Array(width * height * 4);

  for (let i = 0; i < numFrames; i++) {
    // 获取帧信息
    const info = reader.frameInfo(i);
    // gif delay 以百分之一秒为单位，转为毫秒
    const delay = (info.delay != null) ? info.delay * 10 : 100;

    // 解码为完整 RGBA（omggif 自动处理 disposal）
    reader.decodeAndBlitFrameRGBA(i, rgba);

    // 将 RGBA 数据写入 Canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(rgba);
    ctx.putImageData(imageData, 0, 0);

    result.push({ canvas, delay });
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
