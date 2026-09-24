# Filmlab04 网站技术栈

> 整理时间：2026-09-06（最近更新：2026-09-24）　网址：https://filmlab04.com　repo：N4-Filmlab04/filmlab04-site

## 资料流向

浏览器（客人 / Jun Min）→ GitHub Pages（静态 HTML/CSS/JS）→ Apps Script（3 个 Web App：商品／订单／预约）→ Google Sheets / Drive（资料实际存放的地方）

## 前端

- 纯 HTML / CSS / JavaScript（没有用 React、Vue 这类框架）
- 字体：Google Fonts（Inter、Poppins）
- 页面：index、shop、product、cart（结账流程做在这页里面，不是独立页面）、services（含冲洗预约表单）、blog、compare、admin、track-order（客人查订单状态用）

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
- 订单时间用马来西亚时区（Asia/Kuala_Lumpur）记录，不是 UTC
- 结账可以选「自取」或「寄送」，选寄送要填地址、加收 RM12 运费
- 手机号码栏位用国旗＋国码选择器（`js/phone-picker.js`，跟 services.html 的预约表单共用同一个元件）
- Email 栏位只要求有 `@` 就算合法，没有更严格的格式检查
- 订单确认页有「传 WhatsApp」按钮，会自动带上编号好的商品清单文字
- 下单成功会自动扣商品库存（含前面提到的 per-color 分开扣）
- 客人可以上 track-order.html 输入追踪编号查订单状态（付款确认了没），不需要额外留电话核对身份
- admin 后台有「结账维护模式」开关：开了之后客人结账画面会改显示「请用 WhatsApp 联络我们」，用在订单系统临时故障、来不及修的时候；开着的时候订单其实还是会照常在背景送出，只是客人看不到正常的付款画面
- 服务预约表单（冲洗/drop-off）选「Pay now」会走跟结账一样的付款确认画面，选「Pay later」就直接完成预约
- 购物车下单前会先在前端挡库存上限（不能加超过现有库存的数量），下单当下后端也会用商品目录真实库存再夹一次、重新算价钱——两层都挡是因为只挡前端的话，有心人还是可以直接打 API 绕过去下单超卖

## 安全性

- 订单金额一律由后端依商品目录重新计算，不直接信任前端送来的小计（防止改前端 JS 乱报价）
- 商品资料渲染到网页前会先做 HTML escape，避免商品名称等栏位被拿来做 stored XSS
- Orders / Drop-offs 表单送资料用 GET（网址带参数）不是 POST——因为 Apps Script Web App 的 POST 路由在实测中不稳定（Google 平台本身的已知问题，跟我们的程式码无关），GET 目前测下来比较稳

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
