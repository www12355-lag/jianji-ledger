# 简记

一个轻量的本地记账应用，支持 Android App 和手机网页。底部导航包含首页、明细和统计：

- 首页显示当月结余、分类预算和最近记录。
- 明细按月份查看全部、支出或收入记录。
- 统计展示当月收支、支出分类和近六个月趋势。

“记一笔”按钮在三个页面均可使用，也可以为记录添加照片。

应用只在当前设备上的当前安装环境保存数据：收支与预算使用 localStorage，照片使用 IndexedDB。网页与 Android App 的数据互不相通，也不会自动同步到其他设备。

## 使用

网页可直接打开根目录的 `index.html`，或通过 GitHub Pages 访问发布页面。根目录的 `index.html`、`app.js`、`styles.css` 是网页发布文件；`dist/` 是打包进 Android App 的对应页面。修改页面后，需要同步 `dist/` 中的文件并运行 `npm run android:sync`，再构建 Android 包。
