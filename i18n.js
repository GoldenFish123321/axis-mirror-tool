/**
 * i18n.js — 中英文国际化模块
 * 根据浏览器语言自动切换，无需手动按钮
 */

const I18N = {
  en: {
    appTitle: 'Axis Mirror Tool',
    upload: 'Upload Image',
    uploadHint: 'Click or drag & drop image here',
    dropHint: 'Drop image here',
    swapSide: 'Swap Mirror Side',
    useResult: 'Use This Result →',
    randomOrder: 'Random Frame Order',
    enableMirror: 'Enable Mirror',
    useCompression: 'Compress Output',
    downloadPNG: 'Download PNG',
    downloadGIF: 'Download GIF',
    sourcePanel: 'Source Image',
    resultPanel: 'Preview Result',
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
    errorLoad: 'Failed to load image. Please try a different file.',
    errorFormat: 'Unsupported file format. Please upload a PNG, JPG, or GIF image.',
    errorRead: 'Failed to read file. Please check the file and try again.',
    errorGIF: 'Failed to process GIF animation.',
    noImage: 'No image loaded',
    keepSide: 'Keep Side',
    sideA: 'Side A',
    sideB: 'Side B',
    pointA: 'A',
    pointB: 'B',
    processing: 'Processing...',
    loadSuccess: 'Image loaded successfully',
    gifFrames: 'frames',
    confirmUseResult: 'Apply this result as new source image?',
    axisLine: 'Mirror Axis',
    dragToAdjust: 'Drag the dots to adjust mirror axis',
    fileSizeError: 'File is too large. Maximum size: 50MB',
  },

  zh: {
    appTitle: '对称镜像工具',
    upload: '上传图片',
    uploadHint: '点击或拖拽图片到此处',
    dropHint: '释放以加载图片',
    swapSide: '交换镜像侧',
    useResult: '使用此结果 →',
    randomOrder: '随机帧顺序',
    enableMirror: '启用镜像',
    useCompression: '压缩输出',
    downloadPNG: '下载 PNG',
    downloadGIF: '下载 GIF',
    sourcePanel: '待加工图像',
    resultPanel: '预览结果',
    darkMode: '暗色模式',
    lightMode: '亮色模式',
    errorLoad: '图片加载失败，请尝试其他文件。',
    errorFormat: '不支持的文件格式，请上传 PNG、JPG 或 GIF 图片。',
    errorRead: '文件读取失败，请检查文件后重试。',
    errorGIF: 'GIF 动画处理失败。',
    noImage: '未加载图像',
    keepSide: '保留侧',
    sideA: '侧 A',
    sideB: '侧 B',
    pointA: 'A',
    pointB: 'B',
    processing: '处理中...',
    loadSuccess: '图片加载成功',
    gifFrames: '帧',
    confirmUseResult: '将当前结果作为新的源图像？',
    axisLine: '对称轴',
    dragToAdjust: '拖动圆点调整对称轴',
    fileSizeError: '文件过大，最大支持 50MB。',
  }
};

/**
 * 获取当前浏览器语言
 * @returns {string} 'zh' 或 'en'
 */
function getCurrentLanguage() {
  const lang = navigator.language || navigator.userLanguage || '';
  return lang.startsWith('zh') ? 'zh' : 'en';
}

/**
 * 根据当前语言获取文本
 * @param {string} key - 文本键名
 * @param {object} [params] - 可选插值参数 (如 {count: 5})
 * @returns {string} 当前语言对应的文本
 */
function getText(key, params) {
  const lang = getCurrentLanguage();
  const dict = I18N[lang] || I18N.en;
  let text = dict[key];
  if (text === undefined) {
    // 回退到英文
    text = I18N.en[key];
  }
  if (text === undefined) {
    return `[${key}]`;
  }
  // 简单插值：替换 {paramName} 占位符
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}
