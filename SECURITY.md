# Filmlab04 网站安全备忘录

> 这不是正式的漏洞上报流程（没有外部贡献者），单纯是维护这个 repo 时要记得的安全重点。有问题直接找 Jun Min（junminlee26@gmail.com）。

## 架构小背景

这个网站是纯静态前端（GitHub Pages）+ 3 个 Google Apps Script Web App（Products/Admin、Orders、Drop-offs）当后端，Google Sheets 当资料库。细节见 `TECH-STACK.md`。

因为没有真正的服务器，**没有地方可以藏密钥**——前端 JS（`js/*.js`）里的东西，打开浏览器 DevTools 或直接看 `view-source:` 就能看到全部。所以：

- Apps Script 的 `/exec` 网址（`PRODUCTS_ENDPOINT`、`ORDER_ENDPOINT`、`DROPOFF_ENDPOINT`、`ADMIN_ENDPOINT`）本来就是公开的，任何人都看得到、都能打。这是设计上的限制，不是漏洞。
- 真正需要权限的动作（改商品、改订单状态、开关维护模式、存 Blog 文章）都挡在 `verifyLogin_()` 后面，要求前端送一个 Google ID Token，后端拿去跟 Google 验证，并检查 email 在不在 `ALLOWED_EMAILS` 白名单——这一层是真的管用的。
- 不需要登入、但也不该让陌生人乱写的动作（例如 `decrement-stock`、各个表单的 submit），目前只靠一个共享密钥（`INTERNAL_KEY`）或栏位检查（像 Drop-off 的 `method` 白名单）挡，强度比 idToken 弱很多。

## 已知风险 / 待处理

### 1. `INTERNAL_KEY` 已经被公开 —— 2026-10-08 发现，已修好 ✅
旧密钥 `flb04-internal-9c72e1a4` 曾经写死在 `apps-script/order-handler.gs` 和 `apps-script/admin-api.gs`，而这个 GitHub repo 是 **Public**，所以密钥被任何人看得到。

**修法**：两个档案都改成从 `PropertiesService.getScriptProperties().getProperty('INTERNAL_KEY')` 读取，不再写死在代码里——这样以后密钥永远不会进 git。新密钥只透过聊天给了 Jun Min，两个 Apps Script 专案都在 **Project Settings → Script Properties** 设好了同一个新值、也都重新部署了。2026-10-08 实测确认：旧密钥打 `decrement-stock` 已被拒绝（`Not authorized`），新密钥正常。

### 2. Google Sheet 的共享设定要人工确认
`ORDERS_SHEET_ID`、`DROPOFFS_SHEET_ID`、`BLOG_SHEET_ID` 这几个 ID 也写死在 `admin-api.gs` 并且公开可见。ID 本身不会让人打开表格，但如果表格的 Share 设定是「知道连结的人都能查看/编辑」，别人拿到 ID 就能绕过网站直接看到真实客人姓名、电话、email。

**待办**：到 Filmlab04 Orders / Filmlab04 Drop-offs / Filmlab04 Blog 三张表确认 Share 设定是「限制」，只有指定帐号能开，不是「知道连结的人都可以」。

### 3. 公开的 write 端点没有防滥用机制
`submit-dropoff`、结账送单这些端点任何人都能打，没有 rate limit，理论上可以被写入大量垃圾资料（像 2026-10-08 在 Orders 表发现的一批 `test-dedupe` / `warmup-test` 测试资料，虽然那次是开发测试留下的，不是恶意攻击，但说明这类端点确实没有防线）。目前靠栏位格式检查（例如 Drop-off 的 `method` 白名单）做最基本的防呆，不是真正的防滥用。

**现状**：先不处理，等真的出现滥用再加（例如简单的 reCAPTCHA 或頻率限制）。

## 维护时的守则

- **`admin-api.gs` 的 live 版本有真实的 `GOOGLE_CLIENT_ID` 和 `ALLOWED_EMAILS`，这个 repo 里的 `apps-script/admin-api.gs` 永远只放占位符**（`PASTE_YOUR_OAUTH_CLIENT_ID_HERE`、`junminlee26@gmail.com` 示例），不要把 Jun Min 真实的管理员名单或正式 Client ID 贴进这个 repo。改 live 版本时用 Cmd+F 对照贴片段，不要整份覆盖。
- 新增任何密钥/共享密钥时，不要写死在 `.gs` 文件里再 commit——目前 `INTERNAL_KEY` 就是这样被暴露的，这个做法以后要避免，考虑改用 Apps Script 的 `PropertiesService`（不会进 git）。
- 改 Sheet ID、常数这类设定时，commit 前检查一下这个值是不是不该公开的东西。
- 任何新的 Apps Script `doGet`/`doPost` action，先想清楚：要不要验证 idToken？不验证的话，有没有栏位/格式检查防止乱写？

---
*最近更新：2026-10-08*
