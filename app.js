/**
 * app.js — 轴镜像工具主逻辑
 *
 * 功能：UI 交互、文件上传、画布渲染、面板切换、控制点拖动、预览导出
 * 同时处理鼠标和触摸事件
 */

// ======================== 全局状态 ========================

const AppState = {
  // 源图像（左侧面板）
  sourceType: null,      // 'static' | 'gif' | null
  sourceImage: null,     // HTMLImageElement (静态图)
  sourceGifFrames: null, // [{canvas, delay}] (GIF 帧)

  // 镜像结果（右侧面板）
  resultType: null,
  resultCanvas: null,     // HTMLCanvasElement (静态图结果)
  resultGifFrames: null,  // [{canvas, delay}] (GIF 结果)

  // 对称轴控制点（图像坐标）
  axisP1: { x: 0, y: 0 },
  axisP2: { x: 0, y: 0 },
  keepPositiveSide: true,
  randomOrder: false,
  enableMirror: true,
  // 背景颜色与透明度（0=透明，100=完全不透明）
  bgColor: '#000000',
  bgOpacity: 0,

  // 图像尺寸
  imgWidth: 0,
  imgHeight: 0,

  // GIF 动画
  animFrameIndex: 0,
  animLastTime: 0,
  animRAFId: null,

  // UI 状态
  isProcessing: false,
  isDragging: false,
  dragTarget: null,      // 'p1' | 'p2'
  fileLoaded: false,

  // 暗色模式（默认跟随系统）
  isDarkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
};

// ======================== DOM 引用 ========================

const DOM = {};

function cacheDOM() {
  DOM.leftCanvas = document.getElementById('left-canvas');
  DOM.rightCanvas = document.getElementById('right-canvas');
  DOM.leftCtx = DOM.leftCanvas.getContext('2d');
  DOM.rightCtx = DOM.rightCanvas.getContext('2d');
  DOM.leftWrapper = document.getElementById('left-panel');
  DOM.rightWrapper = document.getElementById('right-panel');
  DOM.uploadArea = document.getElementById('upload-area');
  DOM.uploadInput = document.getElementById('file-input');
  DOM.fileInfo = document.getElementById('file-info');
  DOM.controls = document.getElementById('controls');
  DOM.btnSwapSide = document.getElementById('btn-swap-side');
  DOM.btnUseResult = document.getElementById('btn-use-result');
  DOM.btnDownloadPNG = document.getElementById('btn-download-png');
  DOM.btnDownloadGIF = document.getElementById('btn-download-gif');
  DOM.chkRandomOrder = document.getElementById('chk-random-order');
  DOM.lblRandomOrder = document.getElementById('lbl-random-order');
  DOM.chkEnableMirror = document.getElementById('chk-enable-mirror');
  DOM.lblEnableMirror = document.getElementById('lbl-enable-mirror');
  DOM.bgColorPicker = document.getElementById('bg-color-picker');
  DOM.bgOpacitySlider = document.getElementById('bg-opacity-slider');
  DOM.bgOpacityValue = document.getElementById('bg-opacity-value');
  DOM.btnDarkMode = document.getElementById('btn-dark-mode');
  DOM.loadingOverlay = document.getElementById('loading-overlay');
  DOM.loadingText = document.getElementById('loading-text');
  DOM.coordsDisplay = document.getElementById('coords-display');
  DOM.keepSideDisplay = document.getElementById('keep-side-display');
  DOM.gifInfo = document.getElementById('gif-info');
  DOM.appTitle = document.getElementById('app-title');
}

// ======================== 显示坐标 <-> 图像坐标 ========================

function getDisplayRect(canvas, imgW, imgH) {
  const cw = canvas.width;
  const ch = canvas.height;
  if (imgW <= 0 || imgH <= 0) return { scale: 1, dw: cw, dh: ch, ox: 0, oy: 0 };
  const scale = Math.min(cw / imgW, ch / imgH);
  const dw = imgW * scale;
  const dh = imgH * scale;
  const ox = (cw - dw) / 2;
  const oy = (ch - dh) / 2;
  return { scale, dw, dh, ox, oy };
}

function imgToDisplay(imgX, imgY, rect) {
  return { x: imgX * rect.scale + rect.ox, y: imgY * rect.scale + rect.oy };
}

function displayToImg(dispX, dispY, rect) {
  return { x: (dispX - rect.ox) / rect.scale, y: (dispY - rect.oy) / rect.scale };
}

// ======================== 画布尺寸管理 ========================

function resizeCanvases() {
  const panels = document.querySelectorAll('.panel-content');
  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    const canvas = panel.querySelector('canvas');
    const rect = panel.getBoundingClientRect();
    // 留出内边距
    const w = Math.max(100, rect.width - 4);
    const h = Math.max(100, rect.height - 4);
    // 使用 devicePixelRatio 确保高清显示
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    // 存储逻辑尺寸用于坐标计算
    canvas._logicalWidth = w;
    canvas._logicalHeight = h;
  }
}

// ======================== 绘制函数 ========================

/**
 * 在指定画布上绘制图像（带缩放居中）
 */
function drawImageOnCanvas(canvas, image) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas._logicalWidth || (canvas.width / dpr);
  const ch = canvas._logicalHeight || (canvas.height / dpr);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!image) return;

  const rect = getDisplayRect(
    { width: cw, height: ch },
    AppState.imgWidth,
    AppState.imgHeight
  );
  // 注意：这里 rect 的 scale 是基于逻辑尺寸的，但 canvas 实际是物理尺寸
  const scaleX = canvas.width / cw;
  const scaleY = canvas.height / ch;

  ctx.save();
  ctx.scale(scaleX, scaleY);
  ctx.drawImage(
    image,
    rect.ox, rect.oy,
    rect.dw, rect.dh
  );
  ctx.restore();
}

/**
 * 绘制对称轴和两个控制点到画布上
 */
function drawAxis(canvas, forceP1, forceP2) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas._logicalWidth || (canvas.width / dpr);
  const ch = canvas._logicalHeight || (canvas.height / dpr);
  const scaleX = canvas.width / cw;
  const scaleY = canvas.height / ch;

  if (!AppState.fileLoaded || AppState.imgWidth === 0) return;

  const rect = getDisplayRect(
    { width: cw, height: ch },
    AppState.imgWidth,
    AppState.imgHeight
  );

  // 控制点显示坐标
  const p1 = forceP1 || AppState.axisP1;
  const p2 = forceP2 || AppState.axisP2;
  const dp1 = imgToDisplay(p1.x, p1.y, rect);
  const dp2 = imgToDisplay(p2.x, p2.y, rect);

  ctx.save();
  ctx.scale(scaleX, scaleY);

  // --- 绘制无限延伸的对称轴 ---
  // 计算直线延伸到画布边界
  const dx = dp2.x - dp1.x;
  const dy = dp2.y - dp1.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0.1) {
    const extX = dx / len * (cw + ch) * 2;
    const extY = dy / len * (cw + ch) * 2;
    ctx.beginPath();
    ctx.moveTo(dp1.x - extX, dp1.y - extY);
    ctx.lineTo(dp2.x + extX, dp2.y + extY);
    ctx.strokeStyle = 'rgba(255, 200, 50, 0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // --- 绘制法线方向指示（小箭头）---
  // 法向量为 (-dy, dx) 方向
  const nx = -dy / len;
  const ny = dx / len;
  const arrowLen = 20;
  const midX = (dp1.x + dp2.x) / 2;
  const midY = (dp1.y + dp2.y) / 2;
  const sign = AppState.keepPositiveSide ? 1 : -1;
  const arrowEndX = midX + sign * nx * arrowLen;
  const arrowEndY = midY + sign * ny * arrowLen;

  ctx.beginPath();
  ctx.moveTo(midX, midY);
  ctx.lineTo(arrowEndX, arrowEndY);
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 箭头头部
  const headSize = 8;
  const angle = Math.atan2(sign * ny, sign * nx);
  ctx.beginPath();
  ctx.moveTo(arrowEndX, arrowEndY);
  ctx.lineTo(
    arrowEndX - headSize * Math.cos(angle - 0.5),
    arrowEndY - headSize * Math.sin(angle - 0.5)
  );
  ctx.moveTo(arrowEndX, arrowEndY);
  ctx.lineTo(
    arrowEndX - headSize * Math.cos(angle + 0.5),
    arrowEndY - headSize * Math.sin(angle + 0.5)
  );
  ctx.stroke();

  // --- 绘制控制点 ---
  const pointRadius = 10;
  const drawPoint = (dp, label, color) => {
    // 发光效果
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    // 外圈
    ctx.beginPath();
    ctx.arc(dp.x, dp.y, pointRadius + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fill();
    // 内圈
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(dp.x, dp.y, pointRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 标签
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, dp.x, dp.y);
    // 坐标数值
    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `(${Math.round(p1.x)}, ${Math.round(p1.y)})`,
      dp.x + pointRadius + 4,
      dp.y - 10
    );
  };

  drawPoint(dp1, 'A', '#ff6b6b');
  drawPoint(dp2, 'B', '#4ecdc4');

  ctx.restore();
}

/**
 * 绘制 GIF 帧到画布
 */
function drawGifFrameOnCanvas(canvas, frameCanvas, frameIndex, totalFrames) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas._logicalWidth || (canvas.width / dpr);
  const ch = canvas._logicalHeight || (canvas.height / dpr);
  const scaleX = canvas.width / cw;
  const scaleY = canvas.height / ch;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!frameCanvas) return;

  const rect = getDisplayRect(
    { width: cw, height: ch },
    AppState.imgWidth,
    AppState.imgHeight
  );

  ctx.save();
  ctx.scale(scaleX, scaleY);
  ctx.drawImage(frameCanvas, rect.ox, rect.oy, rect.dw, rect.dh);
  ctx.restore();
}

// ======================== 主渲染循环 ========================

function renderAll() {
  if (!DOM.leftCanvas || !DOM.rightCanvas) return;

  // --- 左侧面板：显示源图像 ---
  if (AppState.sourceType === 'static' && AppState.sourceImage) {
    drawImageOnCanvas(DOM.leftCanvas, AppState.sourceImage);
    if (AppState.fileLoaded) drawAxis(DOM.leftCanvas);
  } else if (AppState.sourceType === 'gif' && AppState.sourceGifFrames) {
    const frames = AppState.sourceGifFrames;
    const idx = Math.min(AppState.animFrameIndex, frames.length - 1);
    drawGifFrameOnCanvas(DOM.leftCanvas, frames[idx].canvas, idx, frames.length);
    if (AppState.fileLoaded) drawAxis(DOM.leftCanvas);
  } else {
    // 无图时显示提示文字
    const ctx = DOM.leftCtx;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, DOM.leftCanvas.width, DOM.leftCanvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = AppState.isDarkMode ? '#555' : '#bbb';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cw = DOM.leftCanvas._logicalWidth || (DOM.leftCanvas.width / dpr);
    const ch = DOM.leftCanvas._logicalHeight || (DOM.leftCanvas.height / dpr);
    ctx.fillText(getText('noImage'), cw / 2, ch / 2);
    ctx.restore();
  }

  // --- 右侧面板：显示镜像结果 ---
  if (AppState.resultType === 'static' && AppState.resultCanvas) {
    drawImageOnCanvas(DOM.rightCanvas, AppState.resultCanvas);
    drawAxis(DOM.rightCanvas);
  } else if (AppState.resultType === 'gif' && AppState.resultGifFrames) {
    const frames = AppState.resultGifFrames;
    const idx = Math.min(AppState.animFrameIndex, frames.length - 1);
    drawGifFrameOnCanvas(DOM.rightCanvas, frames[idx].canvas, idx, frames.length);
    drawAxis(DOM.rightCanvas);
  } else {
    const ctx = DOM.rightCtx;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, DOM.rightCanvas.width, DOM.rightCanvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = AppState.isDarkMode ? '#555' : '#bbb';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cw = DOM.rightCanvas._logicalWidth || (DOM.rightCanvas.width / dpr);
    const ch = DOM.rightCanvas._logicalHeight || (DOM.rightCanvas.height / dpr);
    ctx.fillText(getText('noImage'), cw / 2, ch / 2);
    ctx.restore();
  }

  // --- 更新 UI ---
  updateUI();
}

// ======================== GIF 动画循环 ========================

function startGIFAnimation() {
  stopGIFAnimation();

  const maxFrames = Math.max(
    AppState.sourceGifFrames ? AppState.sourceGifFrames.length : 0,
    AppState.resultGifFrames ? AppState.resultGifFrames.length : 0
  );

  if (maxFrames === 0) return;

  AppState.animFrameIndex = 0;
  AppState.animLastTime = performance.now();

  function animate(time) {
    const elapsed = time - AppState.animLastTime;

    // 获取当前帧的延时
    let delay = 100; // 默认 100ms
    if (AppState.resultGifFrames && AppState.resultGifFrames.length > 0) {
      const idx = Math.min(AppState.animFrameIndex, AppState.resultGifFrames.length - 1);
      delay = AppState.resultGifFrames[idx].delay;
    } else if (AppState.sourceGifFrames && AppState.sourceGifFrames.length > 0) {
      const idx = Math.min(AppState.animFrameIndex, AppState.sourceGifFrames.length - 1);
      delay = AppState.sourceGifFrames[idx].delay;
    }

    if (elapsed >= delay) {
      AppState.animFrameIndex = (AppState.animFrameIndex + 1) % maxFrames;
      AppState.animLastTime = time;
      renderAll();
    }

    AppState.animRAFId = requestAnimationFrame(animate);
  }

  AppState.animRAFId = requestAnimationFrame(animate);
}

function stopGIFAnimation() {
  if (AppState.animRAFId) {
    cancelAnimationFrame(AppState.animRAFId);
    AppState.animRAFId = null;
  }
}

// ======================== 镜像计算 ========================

/**
 * 将当前 UI 中的背景色和透明度转为 RGBA 对象
 * 当透明度为 0 时返回 null（透明背景）
 */
function getBgColorRgba() {
  const opacity = AppState.bgOpacity;
  if (opacity <= 0) return null;

  // 解析十六进制颜色 #RRGGBB
  const hex = AppState.bgColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const a = Math.round(opacity / 100 * 255);

  return { r, g, b, a };
}

/**
 * 重新计算镜像结果
 */
async function recomputeMirror() {
  if (!AppState.fileLoaded || AppState.imgWidth === 0) return;

  AppState.isProcessing = true;
  showLoading(true);

  try {
    await new Promise(resolve => setTimeout(resolve, 0)); // 让 UI 更新

    if (AppState.sourceType === 'static') {
      // 静态图
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = AppState.imgWidth;
      sourceCanvas.height = AppState.imgHeight;
      const ctx = sourceCanvas.getContext('2d');
      ctx.drawImage(AppState.sourceImage, 0, 0);

      const result = applyMirror(
        sourceCanvas,
        AppState.axisP1,
        AppState.axisP2,
        AppState.keepPositiveSide,
        getBgColorRgba() // 背景色参数
      );
      AppState.resultCanvas = result;
      AppState.resultType = 'static';
      AppState.resultGifFrames = null;
    } else if (AppState.sourceType === 'gif') {
      // GIF
      let frames;

      if (AppState.enableMirror) {
        frames = applyMirrorToGIF(
          AppState.sourceGifFrames,
          AppState.axisP1,
          AppState.axisP2,
          AppState.keepPositiveSide,
          getBgColorRgba() // 背景色参数
        );
      } else {
        // 不镜像：深拷贝原始帧（不做镜像变换，但保留随机帧顺序能力）
        frames = AppState.sourceGifFrames.map(f => ({
          canvas: cloneCanvas(f.canvas),
          delay: f.delay
        }));
      }

      if (AppState.randomOrder) {
        frames = shuffleFrames(frames);
      }

      AppState.resultGifFrames = frames;
      AppState.resultType = 'gif';
      AppState.resultCanvas = null;
    }
  } catch (err) {
    console.error('[Mirror] Recompute error:', err);
    const detail = err.code ? ` (${err.code})` : '';
    const cause = err.cause ? `\n${err.cause.message || err.cause}` : '';
    alert(`${getText('errorLoad')}${detail}\n${err.message}${cause}`);
  } finally {
    AppState.isProcessing = false;
    showLoading(false);
    renderAll();
    startGIFAnimation();
  }
}

// ======================== 加载提示显示 ========================

function showLoading(visible) {
  if (DOM.loadingOverlay) {
    DOM.loadingOverlay.style.display = visible ? 'flex' : 'none';
  }
  if (visible && DOM.loadingText) {
    DOM.loadingText.textContent = getText('processing');
  }
}

// ======================== 文件上传处理 ========================

function handleFileUpload(file) {
  if (!file) return;

  // 检查文件大小（限制 50MB）
  if (file.size > 50 * 1024 * 1024) {
    alert(getText('fileSizeError'));
    return;
  }

  // 检查格式
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
  const ext = file.name.split('.').pop().toLowerCase();
  const validExts = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

  if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
    alert(getText('errorFormat'));
    return;
  }

  const isGif = file.type === 'image/gif' || ext === 'gif';

  if (isGif) {
    // 处理 GIF
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        showLoading(true);
        const arrayBuffer = e.target.result;
        const frames = await parseGIFToFrames(arrayBuffer);

        AppState.sourceGifFrames = frames;
        AppState.sourceType = 'gif';
        AppState.sourceImage = null;
        AppState.imgWidth = frames[0].canvas.width;
        AppState.imgHeight = frames[0].canvas.height;
        AppState.fileLoaded = true;

        // 初始化对称轴位置（水平居中）
        initAxisPosition();

        // 更新 GIF 信息
        if (DOM.gifInfo) {
          DOM.gifInfo.textContent = `${frames.length} ${getText('gifFrames')}`;
          DOM.gifInfo.style.display = 'block';
        }

        // 显示 GIF 专用 UI
        document.querySelectorAll('.gif-only').forEach(el => { el.style.display = 'flex'; });
        document.querySelectorAll('.separator.gif-only').forEach(el => { el.style.display = 'block'; });
        DOM.btnDownloadGIF.style.display = 'inline-flex';

        // 显示背景色控件
        document.querySelectorAll('.bg-color-group').forEach(el => { el.style.display = 'flex'; });
        document.getElementById('sep-bg').style.display = 'block';

        // 同步复选框状态
        AppState.randomOrder = DOM.chkRandomOrder.checked;
        AppState.enableMirror = DOM.chkEnableMirror.checked;

        await recomputeMirror();
        updateFileInfo(file.name);
      } catch (err) {
        console.error('[GIF] Parse error:', err);
        // 显示详细错误信息
        const detail = err.code ? ` (${err.code})` : '';
        const cause = err.cause ? `\n${err.cause.message || err.cause}` : '';
        alert(`${getText('errorGIF')}${detail}\n${err.message}${cause}`);
        showLoading(false);
      }
    };
    reader.onerror = () => {
      alert(getText('errorRead'));
    };
    reader.readAsArrayBuffer(file);
  } else {
    // 处理静态图
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        AppState.sourceImage = img;
        AppState.sourceType = 'static';
        AppState.sourceGifFrames = null;
        AppState.imgWidth = img.naturalWidth || img.width;
        AppState.imgHeight = img.naturalHeight || img.height;
        AppState.fileLoaded = true;

        // 初始化对称轴位置
        initAxisPosition();

        // 隐藏 GIF 相关 UI
        document.querySelectorAll('.gif-only').forEach(el => { el.style.display = 'none'; });
        DOM.btnDownloadGIF.style.display = 'none';
        DOM.gifInfo.style.display = 'none';

        // 显示背景色控件
        document.querySelectorAll('.bg-color-group').forEach(el => { el.style.display = 'flex'; });
        document.getElementById('sep-bg').style.display = 'block';

        await recomputeMirror();
        updateFileInfo(file.name);
      };
      img.onerror = () => {
        alert(getText('errorLoad'));
      };
      img.src = e.target.result;
    };
    reader.onerror = () => {
      alert(getText('errorRead'));
    };
    reader.readAsDataURL(file);
  }
}

/**
 * 初始化对称轴位置：图像中心水平线
 */
function initAxisPosition() {
  const w = AppState.imgWidth;
  const h = AppState.imgHeight;
  AppState.axisP1 = { x: Math.round(w * 0.25), y: Math.round(h * 0.5) };
  AppState.axisP2 = { x: Math.round(w * 0.75), y: Math.round(h * 0.5) };
  AppState.keepPositiveSide = true;
}

function updateFileInfo(name) {
  if (DOM.fileInfo) {
    DOM.fileInfo.textContent = name;
    DOM.fileInfo.style.display = 'block';
  }
}

// ======================== 控制点拖动（鼠标 + 触摸） ========================

function getEventPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  let clientX, clientY;

  if (e.touches) {
    // 触摸事件
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  // 转换为 canvas 逻辑坐标
  const dpr = window.devicePixelRatio || 1;
  const logicalWidth = canvas._logicalWidth || (canvas.width / dpr);
  const logicalHeight = canvas._logicalHeight || (canvas.height / dpr);
  const canvasRect = canvas.getBoundingClientRect();
  const scaleX = logicalWidth / canvasRect.width;
  const scaleY = logicalHeight / canvasRect.height;

  return {
    x: (clientX - canvasRect.left) * scaleX,
    y: (clientY - canvasRect.top) * scaleY
  };
}

function findNearestControlPoint(pos, canvas) {
  if (!AppState.fileLoaded) return null;

  const cw = canvas._logicalWidth || (canvas.width / (window.devicePixelRatio || 1));
  const ch = canvas._logicalHeight || (canvas.height / (window.devicePixelRatio || 1));
  const rect = getDisplayRect({ width: cw, height: ch }, AppState.imgWidth, AppState.imgHeight);

  const dp1 = imgToDisplay(AppState.axisP1.x, AppState.axisP1.y, rect);
  const dp2 = imgToDisplay(AppState.axisP2.x, AppState.axisP2.y, rect);

  const hitRadius = 20;
  const d1 = Math.hypot(pos.x - dp1.x, pos.y - dp1.y);
  const d2 = Math.hypot(pos.x - dp2.x, pos.y - dp2.y);

  if (d1 <= hitRadius && d1 <= d2) return 'p1';
  if (d2 <= hitRadius) return 'p2';
  return null;
}

// --- 鼠标事件 ---

function onPointerDown(e, canvas) {
  if (e.type === 'mousedown') {
    // 只处理左键
    if (e.button !== 0) return;
  }

  const pos = getEventPos(e, canvas);
  const target = findNearestControlPoint(pos, canvas);

  if (target) {
    AppState.isDragging = true;
    AppState.dragTarget = target;
    canvas.style.cursor = 'grabbing';
    if (e.touches) {
      e.preventDefault();
    }
  }
}

function onPointerMove(e, canvas) {
  const pos = getEventPos(e, canvas);

  if (AppState.isDragging && AppState.dragTarget) {
    // 正在拖动控制点
    const cw = canvas._logicalWidth || (canvas.width / (window.devicePixelRatio || 1));
    const ch = canvas._logicalHeight || (canvas.height / (window.devicePixelRatio || 1));
    const rect = getDisplayRect({ width: cw, height: ch }, AppState.imgWidth, AppState.imgHeight);

    const imgPos = displayToImg(pos.x, pos.y, rect);

    // 约束到图像范围内
    imgPos.x = Math.max(0, Math.min(AppState.imgWidth - 1, imgPos.x));
    imgPos.y = Math.max(0, Math.min(AppState.imgHeight - 1, imgPos.y));

    if (AppState.dragTarget === 'p1') {
      AppState.axisP1 = imgPos;
    } else {
      AppState.axisP2 = imgPos;
    }

    // 更新坐标显示
    updateCoordsDisplay();

    // ★ 立即重绘轴线（不等待镜像计算），让拖动手感流畅
    renderAll();

    // 后台防抖计算镜像结果（慢操作）
    debouncedRecompute();

    if (e.touches) {
      e.preventDefault();
    }
  } else {
    // 悬停检测
    const target = findNearestControlPoint(pos, canvas);
    canvas.style.cursor = target ? 'grab' : 'default';
  }
}

function onPointerUp(e, canvas) {
  if (AppState.isDragging) {
    AppState.isDragging = false;
    AppState.dragTarget = null;
    canvas.style.cursor = 'default';
  }
}

// --- 事件绑定辅助函数 ---

function setupCanvasEvents(canvas) {
  if (!canvas) return;

  // 鼠标事件
  canvas.addEventListener('mousedown', (e) => onPointerDown(e, canvas));
  canvas.addEventListener('mousemove', (e) => onPointerMove(e, canvas));
  canvas.addEventListener('mouseup', (e) => onPointerUp(e, canvas));
  canvas.addEventListener('mouseleave', (e) => onPointerUp(e, canvas));

  // 触摸事件
  canvas.addEventListener('touchstart', (e) => onPointerDown(e, canvas), { passive: false });
  canvas.addEventListener('touchmove', (e) => onPointerMove(e, canvas), { passive: false });
  canvas.addEventListener('touchend', (e) => onPointerUp(e, canvas));
  canvas.addEventListener('touchcancel', (e) => onPointerUp(e, canvas));
}

// ======================== 防抖计算 ========================

let debounceTimer = null;
function debouncedRecompute() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    recomputeMirror();
  }, 50); // 50ms 防抖
}

// ======================== UI 更新 ========================

function updateCoordsDisplay() {
  if (DOM.coordsDisplay) {
    DOM.coordsDisplay.textContent =
      `A(${Math.round(AppState.axisP1.x)}, ${Math.round(AppState.axisP1.y)})  ` +
      `B(${Math.round(AppState.axisP2.x)}, ${Math.round(AppState.axisP2.y)})`;
  }
}

function updateKeepSideDisplay() {
  if (DOM.keepSideDisplay) {
    const side = AppState.keepPositiveSide ? getText('sideA') : getText('sideB');
    DOM.keepSideDisplay.textContent = `${getText('keepSide')}: ${side}`;
  }
}

function updateUI() {
  updateCoordsDisplay();
  updateKeepSideDisplay();

  // 下载按钮
  const hasResult = AppState.fileLoaded && (
    (AppState.resultType === 'static' && AppState.resultCanvas) ||
    (AppState.resultType === 'gif' && AppState.resultGifFrames)
  );
  DOM.btnDownloadPNG.disabled = !hasResult;
  DOM.btnDownloadGIF.disabled = !(AppState.resultType === 'gif');

  // 使用结果按钮
  DOM.btnUseResult.disabled = !hasResult;

  // 暗色模式按钮文本
  if (DOM.btnDarkMode) {
    DOM.btnDarkMode.textContent = AppState.isDarkMode
      ? '☀️ ' + getText('lightMode')
      : '🌙 ' + getText('darkMode');
  }
}

// ======================== 面板操作 ========================

/**
 * "使用此结果"：将右侧结果设为新的左侧源图像
 */
async function useResult() {
  if (AppState.resultType === 'static' && AppState.resultCanvas) {
    // 静态图：从结果 Canvas 创建 Image
    const img = new Image();
    img.src = AppState.resultCanvas.toDataURL();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    AppState.sourceImage = img;
    AppState.sourceType = 'static';
    AppState.sourceGifFrames = null;

    // 保留镜像参数，重新计算
    await recomputeMirror();
  } else if (AppState.resultType === 'gif' && AppState.resultGifFrames) {
    // GIF：复制帧（深拷贝）
    AppState.sourceGifFrames = AppState.resultGifFrames.map(f => ({
      canvas: cloneCanvas(f.canvas),
      delay: f.delay
    }));
    AppState.sourceType = 'gif';
    AppState.sourceImage = null;

    // 重置动画
    await recomputeMirror();
  }
}

function cloneCanvas(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  c.getContext('2d').drawImage(canvas, 0, 0);
  return c;
}

// ======================== 导出功能 ========================

function downloadPNG() {
  if (!AppState.resultCanvas) return;

  const link = document.createElement('a');
  link.download = 'mirror-result.png';
  link.href = AppState.resultCanvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function downloadGIF() {
  if (!AppState.resultGifFrames || AppState.resultGifFrames.length === 0) {
    return;
  }

  showLoading(true);

  try {
    const blob = await encodeCompressedGIF(AppState.resultGifFrames);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'mirror-result.gif';
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    console.error('[GIF] Encode error:', err);
    const detail = err.code ? ` (${err.code})` : '';
    const cause = err.cause ? `\n${err.cause.message || err.cause}` : '';
    alert(`${getText('errorGIF')}${detail}\n${err.message}${cause}`);
  } finally {
    showLoading(false);
  }
}

// ======================== 暗色模式 ========================

function toggleDarkMode() {
  AppState.isDarkMode = !AppState.isDarkMode;
  applyDarkMode();
}

function applyDarkMode() {
  if (AppState.isDarkMode) {
    document.body.classList.add('dark-mode');
    document.body.classList.remove('light-mode');
  } else {
    document.body.classList.remove('dark-mode');
    document.body.classList.add('light-mode');
  }
  if (DOM.btnDarkMode) {
    DOM.btnDarkMode.textContent = AppState.isDarkMode
      ? '☀️ ' + getText('lightMode')
      : '🌙 ' + getText('darkMode');
  }
}

// ======================== 国际化 ========================

function applyI18n() {
  document.title = getText('appTitle');
  if (DOM.appTitle) DOM.appTitle.textContent = getText('appTitle');

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = getText(key);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = getText(key);
  });

  // 动态更新的文本
  updateUI();
}

// 监听语言变化（仅部分浏览器支持）
if (window.addEventListener) {
  window.addEventListener('languagechange', () => {
    applyI18n();
    if (DOM.uploadArea) {
      const hint = DOM.uploadArea.querySelector('.upload-hint');
      if (hint) hint.textContent = getText('uploadHint');
    }
  });
}

// ======================== 窗口大小变化 ========================

let resizeTimeout = null;
function handleResize() {
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    resizeCanvases();
    renderAll();
  }, 100);
}

// ======================== 初始化 ========================

async function initApp() {
  // 缓存 DOM
  cacheDOM();

  // 应用暗色模式
  applyDarkMode();

  // 应用国际化
  applyI18n();

  // 显示上传提示
  if (DOM.uploadArea) {
    const hint = DOM.uploadArea.querySelector('.upload-hint');
    if (hint) hint.textContent = getText('uploadHint');
  }

  // 初始画布尺寸
  resizeCanvases();

  // 仅右侧画布绑定拖拽事件（修改对称轴控制点）
  setupCanvasEvents(DOM.rightCanvas);

  // --- 文件上传事件 ---

  // 点击上传
  if (DOM.uploadArea) {
    DOM.uploadArea.addEventListener('click', (e) => {
      if (e.target === DOM.uploadArea || e.target.closest('.upload-area')) {
        DOM.uploadInput.click();
      }
    });
  }

  if (DOM.uploadInput) {
    DOM.uploadInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileUpload(e.target.files[0]);
      }
    });
  }

  // 拖拽上传
  const dropTargets = [DOM.uploadArea, document.body];
  for (const el of dropTargets) {
    if (!el) continue;

    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (DOM.uploadArea) {
        DOM.uploadArea.classList.add('drag-over');
      }
    });

    el.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (DOM.uploadArea) {
        DOM.uploadArea.classList.remove('drag-over');
      }
    });

    el.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (DOM.uploadArea) {
        DOM.uploadArea.classList.remove('drag-over');
      }
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileUpload(e.dataTransfer.files[0]);
      }
    });
  }

  // --- 按钮事件 ---

  if (DOM.btnSwapSide) {
    DOM.btnSwapSide.addEventListener('click', () => {
      AppState.keepPositiveSide = !AppState.keepPositiveSide;
      recomputeMirror();
    });
  }

  if (DOM.btnUseResult) {
    DOM.btnUseResult.addEventListener('click', useResult);
  }

  if (DOM.btnDownloadPNG) {
    DOM.btnDownloadPNG.addEventListener('click', downloadPNG);
  }

  if (DOM.btnDownloadGIF) {
    DOM.btnDownloadGIF.addEventListener('click', downloadGIF);
  }

  if (DOM.chkRandomOrder) {
    DOM.chkRandomOrder.addEventListener('change', () => {
      AppState.randomOrder = DOM.chkRandomOrder.checked;
      if (AppState.sourceType === 'gif') {
        recomputeMirror();
      }
    });
  }

  if (DOM.chkEnableMirror) {
    DOM.chkEnableMirror.addEventListener('change', () => {
      AppState.enableMirror = DOM.chkEnableMirror.checked;
      if (AppState.sourceType === 'gif') {
        recomputeMirror();
      }
    });
  }

  // --- 背景色控件 ---
  if (DOM.bgColorPicker) {
    DOM.bgColorPicker.addEventListener('input', () => {
      AppState.bgColor = DOM.bgColorPicker.value;
      debouncedRecompute();
    });
  }

  if (DOM.bgOpacitySlider) {
    DOM.bgOpacitySlider.addEventListener('input', () => {
      AppState.bgOpacity = parseInt(DOM.bgOpacitySlider.value, 10);
      if (DOM.bgOpacityValue) {
        DOM.bgOpacityValue.textContent = AppState.bgOpacity + '%';
      }
      debouncedRecompute();
    });
  }

  if (DOM.btnDarkMode) {
    DOM.btnDarkMode.addEventListener('click', toggleDarkMode);
  }

  // --- 窗口事件 ---

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => {
    setTimeout(handleResize, 300);
  });

  // 初始渲染
  renderAll();

  // 监听系统暗色主题变化
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    // 仅当用户没有手动切换过时才跟随系统
    // 简单起见：总是跟随
    AppState.isDarkMode = e.matches;
    applyDarkMode();
  });
}

// ======================== 页面加载完成后初始化 ========================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
