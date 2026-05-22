# Axis Mirror Tool / 对称镜像工具

基于任意自定义对称轴的在线图像镜像工具，支持静态图和 GIF 动画。

**在线体验：** [https://goldenfish123321.github.io/axis-mirror-tool/](https://goldenfish123321.github.io/axis-mirror-tool/)

---

## 功能

- **自定义对称轴** — 拖动两个锚点定义任意角度和位置
- **交换镜像侧** — 一键切换保留侧
- **多层镜像** — 重复叠加对称变换
- **GIF 支持** — 逐帧解码→镜像→重编码（自动压缩）
- **随机帧顺序** — 打乱 GIF 帧顺序
- **背景颜色** — 自定义颜色+透明度，填充镜像空白区
- **响应式布局** — 桌面并排 / 手机堆叠

## 使用

| 步骤 | 操作 |
|------|------|
| 1 | 浏览器打开 `index.html`（跨域就用 `python3 -m http.server 8080`） |
| 2 | 上传图片（PNG/JPG/GIF/WebP） |
| 3 | 在预览区拖动红/绿圆点调整对称轴 |
| 4 | 点击"交换镜像侧"切换保留侧 |
| 5 | 点击"使用此结果 →"继续叠加镜像 |
| 6 | 导出：下载 PNG / 下载 GIF |

## 目录结构

```
axis-mirror-tool/
├── index.html         # 入口
├── styles.css         # 样式（响应式 + 暗色模式）
├── app.js             # 主逻辑
├── mirror.js          # 镜像算法
├── gif-handler.js     # GIF 处理
├── i18n.js            # 国际化（中/英自动检测）
├── lib/               # 第三方库（本地，无 CDN 依赖）
├── README.md          # 英文文档
└── README-cn.md       # 中文文档
```

## License

MIT
