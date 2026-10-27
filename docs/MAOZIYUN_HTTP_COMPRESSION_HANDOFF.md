# 帽子云 HTTP 压缩核验与技术支持交接

状态：**线上采样未返回压缩；账号可用设置 UNVERIFIED**。2026-10-26 的复验对象为当前已发布站点，Phase 2 没有部署。未修改账号、CDN、Cloudflare、D1、KV 或 Secrets，未向外发送本交接内容。

官方[常见问题](https://www.maoziyun.com/docs/asked-question)说明默认浏览器缓存 20 分钟，并提供技术支持渠道；公开说明中未确认 gzip/Brotli 开关或设置路径。浏览器缓存、CDN 缓存命中和 Content-Encoding 是三个独立问题。采样可同时出现 `My-Cache-Status: HIT` 与 `cf-cache-status: MISS`，不能把其中一个 MISS 认定为压缩故障。

本地完整证据：`.axis/phase2/http-compression.json`、`http-compression-primary.json` 和 `http-*.headers/.body`；上一轮证据为 `.axis/asset-integrity/release-http-compression.json`。UTC 12:44 起的补充采样覆盖 Layout CSS 与 MusicPlayer JS，结论相同。这些文件保留本地，未加入发布文件。使用 curl 显式发送 Accept-Encoding，未使用 `--compressed`，保存服务端响应体，再按响应 Content-Encoding 解码并计算 SHA-256。`size_download` 是响应体传输字节，不包括请求/响应头及 TLS 开销。

可直接发送的支持请求：

> 站点 https://star-0vl490158.maozi.io 的 HTML、CSS、JS，在 2026-10-26 UTC 12:31 起采样。分别发送 `Accept-Encoding: identity`、`gzip`、`br`，均收到 HTTP 200，未返回 Content-Encoding，响应体字节没有减少；同一 URL 的三个解码 SHA 一致。请确认：
>
> 1. 当前套餐、默认 maozi.io 域名及自定义域名分别支持 gzip/Brotli 吗？是否存在最小文件大小、Content-Type、缓存状态或协议限制？
> 2. 压缩由边缘节点还是源站完成？当前默认域名是否经过额外 CDN 层，哪一层负责协商及 `Vary: Accept-Encoding`？
> 3. 如有账号级设置，请提供准确控制台路径、字段及所需权限；如需技术支持开启，请说明操作范围及回退方式。
> 4. 是否支持静态 `.br`/`.gz` 预压缩文件的自动协商？若支持，请提供官方说明及正确 Content-Encoding/Content-Type/Vary 行为；我们不会仅上传压缩文件后假设生效。
> 5. 开启后是否需刷新现有缓存？请协助确认当前请求的 My-Request-Id、My-Cache-Status 与 cf-cache-status 各自属于哪一层。

发送时附上 JSON 中的实际 CSS/JS URL、三组 body 字节和 SHA，以及对应原始响应头的 Date/My-Request-Id。不要附账号凭据、Cookies 或 Token。

平台确认后，先记录设置路径并获取修改授权，再按相同 URL/协议执行三组请求。验收要求：协商正确、实际响应体减少、正确 Content-Encoding、解码 SHA 与 identity 一致；缓存失效后复验。若平台没有可确认设置，继续保持 **UNVERIFIED**，不猜测 Nginx/OpenResty 配置，不替换托管平台，不把本地 gzip 大小当线上收益。
