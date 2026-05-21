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
    const err = new Error('gifuct-js library not loaded: parseGIF() is undefined. Check that https://unpkg.com/gifuct-js is accessible.');
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
    const err = new Error(`Invalid GIF header: expected "GIF" at bytes 0-2, got "${headerStr}"`);
    err.code = 'BAD_HEADER';
    throw err;
  }

  // parseGIF 和 decompressFrames 是 gifuct-js 暴露的全局函数
  let gif;
  try {
    gif = parseGIF(arrayBuffer);
  } catch (parseErr) {
    const err = new Error(`GIF parsing failed at binary level: ${parseErr.message || parseErr}`);
    err.code = 'PARSE_FAILED';
    err.cause = parseErr;
    throw err;
  }

  if (!gif.lsd) {
    const err = new Error('GIF parse result missing Logical Screen Descriptor (lsd) — file may be corrupt');
    err.code = 'NO_LSD';
    throw err;
  }

  const width = gif.lsd.width;
  const height = gif.lsd.height;
  if (!width || !height || width <= 0 || height <= 0 || width > 8000 || height > 8000) {
    const err = new Error(`GIF has invalid dimensions: ${width}x${height}`);
    err.code = 'BAD_DIMENSIONS';
    throw err;
  }

  let parsedFrames;
  try {
    parsedFrames = decompressFrames(gif, true);
  } catch (decompressErr) {
    const err = new Error(`GIF frame decompression failed: ${decompressErr.message || decompressErr}`);
    err.code = 'DECOMPRESS_FAILED';
    err.cause = decompressErr;
    throw err;
  }

  if (!parsedFrames || parsedFrames.length === 0) {
    const err = new Error('No frames found in GIF — file may contain a single-frame static image, or be corrupt');
    err.code = 'NO_FRAMES';
    throw err;
  }

  if (parsedFrames.length > 500) {
    const err = new Error(`GIF has too many frames (${parsedFrames.length}). Maximum supported: 500 frames.`);
    err.code = 'TOO_MANY_FRAMES';
    throw err;
  }

  console.log(`[GIF] Parsed ${parsedFrames.length} frames, ${width}x${height}`);

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

    // 验证帧结构
    if (!frame.dims) {
      const err = new Error(`Frame ${i} is missing dims (dimensions) — GIF may be corrupt`);
      err.code = 'FRAME_NO_DIMS';
      err.frameIndex = i;
      throw err;
    }
    if (!frame.pixels || frame.pixels.length === 0) {
      const err = new Error(`Frame ${i} has no pixel data (${fullWidth}x${fullHeight})`);
      err.code = 'FRAME_NO_PIXELS';
      err.frameIndex = i;
      throw err;
    }

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
      const err = new Error('gif.js library not loaded: GIF constructor is undefined. Check that https://unpkg.com/gif.js is accessible.');
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

    // gif.js 构造函数
    // 使用 workers=0（主线程编码）避免 Web Worker 跨域问题
    const encoder = new GIF({
      workers: 0,
      quality: quality,
      width: w,
      height: h,
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
