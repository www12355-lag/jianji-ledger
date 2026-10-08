# 简记

一个轻量的手机网页记账应用，可记录每日收支、设置分类月度预算，并为记录添加照片。

应用只在当前浏览器保存数据：收支与预算使用 localStorage，照片使用 IndexedDB。不同设备或不同网站地址之间不会自动同步数据。

## 使用

直接打开根目录的 `index.html`，或通过 GitHub Pages 访问发布页面。根目录的 `index.html` 与 `app.js` 是 GitHub Pages 发布文件；`dist/` 保留原有站点构建文件。

