# Filmlab04 网站技术栈

> 整理时间：2026-09-06（最近更新：2026-09-26）　网址：https://filmlab04.com　repo：N4-Filmlab04/filmlab04-site

> 2026-09-24 当天后续更新：维护模式改成后端强制拦截、WhatsApp 消息补齐联络资料/运费/真实商品清单、Mark as paid 卡死问题修好、Drop-off 时区修正——细节见下方各节。
>
> 2026-09-25 更新：手机版导航加了汉堡选单（原本 `.nav-links` 在窄屏直接整组隐藏、完全没有替代，手机等于点不到 Shop）；维护模式检查拖慢下单速度（约15秒）的问题也修好了；结账现在有 client-side timeout，避免卡住不放——细节见下方各节。
>
> 2026-09-26 更新：结账加了防重复下单保护（client ref 去重，实测确认同一笔重试不会写成两行）；网站根目录补上 favicon.ico，修正 Google 搜索结果显示通用图示而不是真正 logo 的问题——细节见下方各节。

## 资料流向

浏览器（客人 / Jun Min）→ GitHub Pages（静态 HTML/CSS/JS）→ Apps Script（3 个 Web App：商品／订单／预约）→ Google Sheets / Drive（资料实际存放的地方）

## 前端

- 纯 HTML / CSS / JavaScript（没有用 React、Vue 这类框架）
- 字体：Google Fonts（Inter、Poppins）
- 页面：index、shop、product、cart（结账流程做在这页里面，不是独立页面）、services（含冲洗预约表单）、blog、compare、admin、track-order（客人查订单状态用）
- 手机导航：窄屏（≤720px）时桌面版的 Home/Shop/Services/Blog 连结会隐藏，改用汉堡选单（☰ 按钮）+ 下拉面板显示同样四个连结，逻辑写在 `js/cart.js`（每个页面都会载入这个档案）；汉堡按钮跟购物车图示包在同一个 `.nav-actions` 容器里、放在导览列最右边，两个挨在一起——分开当独立 flex 元素的话，购物车会被 `space-between` 排版挤到导览列正中间
- Favicon：网站根目录有 `favicon.ico`（跟 `images/favicon.png` 是同一个 logo，只是格式/位置不同）——Google 搜索结果等爬虫习惯先去网站根目录找 `/favicon.ico`，不一定会看页面 `<link rel="icon">` 指到的路径，少了根目录这个档案就会显示通用图示而不是真正 logo。改了之后 Google 搜索结果的图示要等它自己重新爬网站才会更新，通常要几天到几周，没办法用代码强制刷新

## 托管 / 部署

- GitHub（repo：N4-Filmlab04/filmlab04-site）
- GitHub Pages（网站实际跑在这上面，push 到 main 分支后自动重新部署）
- 自定义域名：filmlab04.com

## 资料库 / 后端

- Google Sheets 当资料库（3 张表：Filmlab04 Products 商品、Filmlab04 Orders 订单、Filmlab04 Drop-offs 冲洗预约）
- Google Apps Script（3 个独立的 Web App，各自绑一张表）：
  - `admin-api.gs` — 商品 CRUD、销售总览、图片上传（新增商品时要选是单一款式还是多颜色/款式；库存状态改成填 Quantity 数字自动判断，不再是手动切 in-stock/sold-out）
  - `order-handler.gs` — 处理购物车结账送来的订单
  - `dropoff-handler.gs` — 处理冲洗预约表单
- Google Drive — 存放商品图片（透过 Apps Script 的 DriveApp 上传）
- 有多个颜色/款式（variant）的商品，Quantity 可以细到每个颜色分开算——卖掉某个颜色只扣那个颜色的库存，归零自动变 sold-out，其他颜色不受影响（还没填过颜色数量的旧商品，暂时会退回用整体 Quantity 当预设值）

## 订单与结账流程

- 客人下单后会拿到一个可自己查询的追踪编号，格式 `FL04-000000` 开始依序递增（后端用 LockService 保证不会重复）
- 订单时间用马来西亚时区（Asia/Kuala_Lumpur）记录，不是 UTC——Drop-off 预约表单一开始漏改，之后也补上了同样的修正
- 结账可以选「自取」或「寄送」，选寄送要填地址、加收 RM12 运费
- 手机号码栏位用国旗＋国码选择器（`js/phone-picker.js`，跟 services.html 的预约表单共用同一个元件）
- Email 栏位只要求有 `@` 就算合法，没有更严格的格式检查
- 订单确认页有「传 WhatsApp」按钮，消息会带上：编号好的商品清单（直接用后端记进 Orders 表的那份文字，含 `[OUT OF STOCK]`／`[only N in stock]` 这类库存提示、运费那行，保证跟总额对得上，不是前端自己重组的）、姓名、电话、Email
- 维护模式或结账失败时显示的 WhatsApp 备用消息，一样带姓名/电话/Email，也一样会把运费单独列一行，不会让客人看到「小计比商品加起来贵」却不知道为什么
- 下单成功会自动扣商品库存（含前面提到的 per-color 分开扣）
- 客人可以上 track-order.html 输入追踪编号查订单状态（付款确认了没），不需要额外留电话核对身份
- admin 后台有「结账维护模式」开关：开了之后客人结账画面会改显示「请用 WhatsApp 联络我们」，用在订单系统临时故障、来不及修的时候。**这个开关现在是后端强制拦的**——`order-handler.gs` 记录订单前会自己再查一次维护模式状态，查不到也直接当作维护中处理（fail closed，宁可误挡也不漏放）；一开始只有前端在挡，查询失败就会直接放行，实测过一次真的让一笔订单在维护模式开着的情况下正常下单成功，才改成现在这样后端兜底
- 上面这个后端维护检查一开始跟既有的商品目录查询是**顺序**各打一次 Google 服务器，实测下单因此变慢到快15秒；改成用 `UrlFetchApp.fetchAll` 两个一起同时发出去，实测降回约3-4秒
- 服务预约表单（冲洗/drop-off）选「Pay now」会走跟结账一样的付款确认画面，选「Pay later」就直接完成预约
- 购物车下单前会先在前端挡库存上限（不能加超过现有库存的数量），下单当下后端也会用商品目录真实库存再夹一次、重新算价钱——两层都挡是因为只挡前端的话，有心人还是可以直接打 API 绕过去下单超卖
- 结账送出的请求有设 client-side timeout（提交15秒、维护模式检查10秒），避免手机网路不稳时画面卡住不放——普通 `fetch()` 本身不会自己超时，之前实测过一笔订单在手机上卡了快2分钟才跳出失败画面，但后端其实早就写进 Orders 表了。**这代表客人看到「失败/维护中」画面，不一定代表真的没下成功**——处理客人反映下单失败前，先去 Orders 表或 track-order.html 查一下订单号有没有进去，避免误判成重复下单
- 失败画面的文字现在会区分真实原因：只有后端真的确认维护模式开着才会显示「under maintenance」；其他所有失败（网路问题、timeout 等）改显示「无法确认订单是否送出成功，可能已经成功了，先联络确认不要重新下单」，避免误导成维护模式的问题
- **防重复下单保护**：前端每次结账会带一个随机识别码（`clientRef`，同一次购物车内容的重试都用同一个，成功后才清掉），后端 `order-handler.gs` 写入新订单前会先检查 Orders 表有没有相同的 `clientRef`（存在 L 栏「Client Ref」），有的话直接回传原本那笔订单、不会重复写入——保护的正是上面那种「客人看到失败画面又点一次」的情境，实测过确认同一个 ref 重试两次只会产生一笔订单

## 安全性

- 订单金额一律由后端依商品目录重新计算，不直接信任前端送来的小计（防止改前端 JS 乱报价）
- 商品资料渲染到网页前会先做 HTML escape，避免商品名称等栏位被拿来做 stored XSS
- Orders / Drop-offs 表单送资料用 GET（网址带参数）不是 POST——因为 Apps Script Web App 的 POST 路由在实测中不稳定（Google 平台本身的已知问题，跟我们的程式码无关），GET 目前测下来比较稳
- admin 后台里「Mark as paid」「结账维护模式开关」这两个写入动作，本来也是走 POST，实测发现会整个卡死不回应（等了 45 秒以上都没结果）——同样的 Google POST 问题，已经比照上面改成 GET。商品编辑存档（save-all）、图片上传（upload-image）因为资料量太大塞不进网址，只能留在 POST，仍然可能偶尔遇到同样的不稳定

## 登入 / 权限

- Google Identity Services（Sign in with Google 按钮）
- Google Cloud OAuth Client ID
- 后端用 Google 的 tokeninfo 端点验证登入身份、比对白名单邮箱
- 登入状态存在该分页的 sessionStorage——同一个分页 refresh 不用重新登入，大约 1 小时后 token 过期或把分页关掉才需要重新登入一次（Google 的自动登入 One Tap 实测在目前 Chrome 版本下不会触发，所以没用那个方式）

## 浏览器端存的资料

- localStorage：购物车内容、商品资料缓存（2026-09 加的加速功能，先显示上次抓到的资料，背景悄悄更新）

## 开发流程

- Git 版本控制，push 到 GitHub main 分支后 GitHub Pages 自动部署
- 本地测试用一个 Python 写的小 server（`server.py`），跑在 localhost:8090
- 每次改 CSS/JS 档案，记得同步把该档案在 HTML 里 `<link>`/`<script>` 标签的 `?v=数字` 加1，不然浏览器会一直用旧的缓存版本
- 这个 `?v=` 只对 CSS/JS 有效——`.html` 网页本身在 GitHub Pages 上有约10分钟的浏览器缓存，刚部署完的 10 分钟内 refresh 有可能还没换到新版

## 未来规划（考虑中）

- 真正的金流串接（Billplz / ToyyibPay / Stripe）+ 物流 API（J&T、Pos Laju）
- 生意做大后，可能整套换架构（例如 WordPress + WooCommerce，或真正的资料库+后端），参考同行 filmlab.com.my 的做法
