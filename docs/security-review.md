> 修复状态：前三项源码问题已修复，详见 [安全修复记录](security-fixes.md)。下文保留原始审查结论与当时证据。

# 博客源码安全审查

审查日期：2026-09-14。范围：Astro/Svelte 前端、NestJS/Express API、Prisma/Redis 与 JWT、Socket.IO。仅审查，未修改安全相关源码；未读取真实 `.env` 或凭据，未对线上站点发起攻击测试。

结论：后端存在 1 项高危默认配置、2 项中危防滥用问题。生产依赖审计另报 196 项告警（3 严重、100 高、76 中、17 低），这些是依赖数据库匹配数，不等于 196 个可利用的网站漏洞。静态部署不运行 API，以下后端问题在启用 API 时适用。

## 1. 高危：缺失 JWT 密钥时仍允许生产启动

- 位置：`apps/api/src/config/env.validation.ts:63`；签名配置 `apps/api/src/auth/auth.module.ts:20`；验签 `apps/api/src/auth/strategies/jwt.strategy.ts:19`。
- 证据：`JWT_SECRET` 缺失会回退到源码中公开的固定字符串，生产环境没有例外。用独立 VM 加载该校验函数，传入测试数据库地址及 `NODE_ENV=production`、不传密钥，已验证函数正常返回；没有访问实际数据库或使用真实凭据。
- 影响：部署遗漏该变量时，攻击者可自行签署有效令牌。策略通过 `payload.sub` 查询真实用户（`jwt.strategy.ts:24`），所以伪造 role 本身不能提权；但公开文章返回作者 ID（`articles.service.ts:71`、`:409`），当该作者是管理员时可以冒充其身份。
- 建议：强制要求随机密钥，拒绝空值及已知占位值，生产缺失直接停止启动。若曾以默认值上线，需要更换密钥并使旧令牌失效。
- 边界：这是已验证的源码默认行为；未断言现网正在使用默认值。

## 2. 中危：登录与注册缺少应用层限流

- 位置：`apps/api/src/auth/auth.controller.ts:22`、`:28`；`auth.service.ts:33`、`:40`；`users/users.service.ts:13`；`app.module.ts:34`。
- 证据：公开登录与注册直接进入查库、Argon2 验证/哈希流程，未发现账户/IP 频率限制或全局节流 Guard。留言接口的独立限流不覆盖认证接口。
- 影响：可持续撞库、猜测密码，或批量注册消耗 CPU、内存和数据库空间。Argon2 是正确的密码存储选择，但昂贵计算需要频率控制。
- 建议：给登录增加账户与可信来源 IP 两级限流；给注册增加频率及账户创建配额。多实例使用共享存储，代理 IP 仅信任明确的反向代理。
- 边界：未核验帽子云网关限流；若网关已经覆盖这些路径，风险会降低。

## 3. 中危：匿名心跳可以任意创建访客统计成员

- 位置：`apps/api/src/dashboard/dashboard.gateway.ts:113`、`:121`、`:176`；`dashboard.service.ts:54`。HTTP 统计另见 `interceptors/article-view-dashboard.interceptor.ts:61` 及 `dashboard.service.ts:34`。
- 证据：单一匿名连接的每次 `presence:heartbeat` 都接受新的 `visitorId`，将其作为 Redis sorted set 成员；没有将访客 ID 固定绑定到连接，也没有心跳频率/长度配额。HTTP UV 同样接受客户端任意 ID，集合保留七天。
- 影响：单一客户端可以制造虚假的大量在线人数与 UV；高频请求会扩大 Redis 写入与内存占用。心跳字段只有 TypeScript 类型，传入非字符串还会触发 `.trim()` 异常；不能依此断言整个进程崩溃。
- 建议：握手时验证长度与类型并固定连接身份，限制心跳频率；为匿名统计设置容量及写入预算。UV 作为近似统计展示，不用于授权或计费。
- 边界：在线成员有过期清理，不能称为永久内存泄漏；没有执行负载攻击。

## 4. 依赖告警：先区分构建环境与线上可达面

执行 `pnpm audit --prod --json` 返回 196 项告警，审计命令因发现漏洞退出 1；另用结构化输出提取总数与严重项，未升级依赖或改写锁文件。

严重项包括：

- `fast-xml-parser`：实体名称注入绕过，受影响范围 `>=5.0.0 <5.3.5`。[公告](https://github.com/advisories/GHSA-m7jm-9gc2-mpf2)
- `tar`：解压/解析无界输入导致 DoS，受影响范围 `<=7.5.18`。[公告](https://github.com/advisories/GHSA-23hp-3jrh-7fpw)
- `astro`：AVIF 图像优化远程代码执行，数据库匹配范围 `<7.2.8`；当前根依赖指定 `5.18.0`。[公告](https://github.com/advisories/GHSA-26w7-cxv4-gfx2)

上述是审计服务返回的公告信息，未验证具体利用链。尤其仅上传静态 `dist` 时，线上不运行 Astro 图像优化服务，不能把该公告直接认定为线上远程代码执行。建议结合实际构建、预览和服务端运行方式，审核公告适用条件后分批升级并运行构建及 API 回归；不要直接强制跨主版本升级。

## 已确认的防护与未确认为漏洞的事项

- API 有全局 JWT 和角色 Guard；文章管理限制 ADMIN，公开查询限定 PUBLISHED。注册明确写入 USER，未发现请求直接指定管理员角色的路径。
- JWT 策略查询数据库当前角色且检查令牌有效期；密码使用 Argon2，公开用户响应不包含密码哈希。
- 请求 DTO 经全局白名单与验证，数据库查询使用 Prisma；本次未发现原始 SQL 拼接或请求输入进入 shell 的路径。
- 后端 Markdown 阅读器有标签、属性及 URL 协议过滤，未确认可利用 XSS。管理员令牌存于 localStorage（`src/components/admin/AdminConsole.svelte:301`）会放大未来同源 XSS 的影响，但单独不证明存在 XSS。
- Bearer 头认证不属于自动携带 Cookie 的传统 CSRF 场景。Socket.IO 的宽松 Origin 配置不等同于绕过管理员令牌校验。
- 未验证现网 TLS、响应安全头、WAF、防火墙、真实环境变量、数据库网络暴露及凭据轮换情况；这些不是本报告已确认漏洞。

## 验证记录

完成入口、认证/授权、文章读写、留言、前端 HTML 输出、匿名统计及相关 DTO 的静态检查；以合成输入确认生产缺失 JWT 密钥仍被接受；完成生产依赖审计。未改变源码行为，未执行数据库写入、线上测试或自动修复。

