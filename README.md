# 每日额度 PWA

一个完全本地、无账号、无后端的极简每日消费额度工具。金额以“分”为整数保存，避免 JavaScript 浮点数造成金额误差。

## 本地运行

Service Worker 需要通过 HTTP 访问。在本目录打开 PowerShell，运行：

```powershell
python -m http.server 8080
```

然后在浏览器打开 `http://localhost:8080`。

## 部署

把此目录中的文件原样部署到 GitHub Pages、Cloudflare Pages 或任意静态网站托管即可，不需要构建命令。

在 iPhone Safari 打开部署后的 HTTPS 地址，点击“分享” → “添加到主屏幕”。首次成功打开后，Service Worker 会缓存页面，可离线使用。

## 数据说明

- 每日额度和每一笔消费保存在当前浏览器的 `localStorage` 中。
- 当本地日期变化时，首页自动显示新一天；旧记录保留在历史记录中。
- 清除 Safari 网站数据、卸载 PWA 或更换浏览器会删除本地数据。
