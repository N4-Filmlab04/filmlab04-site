# Filmlab04 网站技术栈

> 整理时间：2026-09-06（最近更新：2026-10-02）　网址：https://filmlab04.com　repo：N4-Filmlab04/filmlab04-site

> 2026-09-24 当天后续更新：维护模式改成后端强制拦截、WhatsApp 消息补齐联络资料/运费/真实商品清单、Mark as paid 卡死问题修好、Drop-off 时区修正——细节见下方各节。
>
> 2026-09-25 更新：手机版导航加了汉堡选单（原本 `.nav-links` 在窄屏直接整组隐藏、完全没有替代，手机等于点不到 Shop）；维护模式检查拖慢下单速度（约15秒）的问题也修好了；结账现在有 client-side timeout，避免卡住不放——细节见下方各节。
>
> 2026-09-26 更新：结账加了防重复下单保护（client ref 去重，实测确认同一笔重试不会写成两行）；网站根目录补上 favicon.ico，修正 Google 搜索结果显示通用图示而不是真正 logo 的问题；下单速度进一步优化（扣库存改平行处理 + 两个 Apps Script 专案都加了保温 trigger），实测从偶尔20-30秒降到稳定4-6秒；手机版导航面板改成浮动悬浮 + 滑出动画 + 半透明背景遮罩；购物车图示点击会立刻跳页导致滑出动画看不到的问题也修好了；手机版商品格子改成两栏；admin 销售总览加了 Pending/Paid 数量统计、日期筛选（Today/Yesterday/Last 7 days/This month）——细节见下方各节。
>
> 2026-09-28 更新：admin 后台新增 **Drop-offs** 分页，从独立的 Filmlab04 Drop-offs 表读资料显示（之前预约资料完全没接进后台，只能开原始 Sheet 看）；admin 页面排版调整（分页按钮置中、表格 Time 栏不换行、拿掉页面宽度上限改用满版）——细节见下方各节。
>
> 2026-09-29 更新：冲洗预约表单（services.html）的「How are you sending it?」加了第三个选项 **Nearby outlet**——客人可以选择就近的 N4 分店代收底片，再由分店转寄过来，不用只能 Walk-in 或自己寄快递；选 Nearby outlet 时付款方式锁死只能 Pay now（前端锁 + 后端也强制改写，双重保险）；加收 RM12 分店转寄费——细节见下方各节。
>
> 2026-09-30 更新：Nearby outlet 的 Pay now WhatsApp 收据文字补上 Outlet 那一行，不然只看收据不知道客人是丢在哪一间分店；Blog 从「全部文章塞在同一页」改成「列表页 + 每篇文章自己的页面」（跟 shop/product 同一个做法）；admin.html 新增 **Blog** 分页，之后 Jun Min 可以直接在后台加/改/删文章，不用再麻烦我改 code——**这部分后端还没接上**，需要 Jun Min 建一张新 Google Sheet + 更新 admin-api.gs 才会真的动起来，细节见下方「资料库 / 后端」一节。

## 资料流向

浏览器（客人 / Jun Min）→ GitHub Pages（静态 HTML/CSS/JS）→ Apps Script（3 个 Web App：商品／订单／预约）→ Google Sheets / Drive（资料实际存放的地方）

## 前端

- 纯 HTML / CSS / JavaScript（没有用 React、Vue 这类框架）
- 字体：Google Fonts（Inter、Poppins）
- 页面：index、shop、product、cart（结账流程做在这页里面，不是独立页面）、services（含冲洗预约表单）、blog（文章列表）、blog-post（单篇文章，读网址 `?id=...`）、compare、admin、track-order（客人查订单状态用）
- Blog：2026-09-30 从「所有文章塞在 blog.html 同一页」改成「列表页 + 每篇文章自己的页面」，做法照抄 shop.html/product.html 那一套——`js/blog.js` 负责在 blog.html 渲染列表（`.blog-list` 容器）、`js/blog-post.js` 负责在 blog-post.html 读网址的 `?id=` 渲染单篇（`.post-detail` 容器），两个页面都会载入 `js/blog.js`（`blog-post.js` 靠它的 `loadPosts()` 抓资料，所以载入顺序要在 `blog-post.js` 前面）；每篇文章：`id`（网址用，小写连字号）、`title`、`date`、`excerpt`（列表页摘要）、`coverImage`（可留空——跟商品图不同，留空就直接不显示图片区块，不会有「photo coming soon」占位，纯文字文章不需要硬塞一个空图框）、`content`（字串阵列，每个元素渲染成一个段落）
  - 文章详情页的封面图一开始沿用商品那套 `.product-card-img`（固定 16:9 裁切、`object-fit: cover`），拿来放直式海报图（像活动宣传图）会被硬裁掉大半——改成直接显示原图原比例（`width:100%; height:auto`，不裁切、不强制比例），封面图可能是横的直的方的都显示得出完整内容
  - 一开始资料放在纯静态的 `data/posts.json`（改文章要直接编辑这个 JSON、git push），2026-09-30 当天马上决定要能从 admin.html 直接管理，改接 Google Sheet 后端（见下方「资料库 / 后端」）；一开始刻意先不让 `js/blog.js` 的 `loadPosts()` 切过去，等 Jun Min 把 Blog 的 Google Sheet 建好、`admin-api.gs` 部署、且实际在 admin.html 新增一篇文章测试成功之后，**2026-10-02 才正式切过去**，`loadPosts()` 现在改成打 `${PRODUCTS_ENDPOINT}?action=blog-posts`（跟商品共用同一个 Apps Script Web App），不再读 `data/posts.json`——这个档案留在 repo 里当历史参考，但已经没有任何页面在用了；原本 `data/posts.json` 里的两篇占位文章（Welcome to Filmlab04 / How we pick which film stocks to carry）**还没搬进 Sheet**，目前 Sheet 里只有 Jun Min 测试时建的那篇真实文章，blog.html 暂时只会显示那一篇
- 手机导航：窄屏（≤720px）时桌面版的 Home/Shop/Services/Blog 连结会隐藏，改用汉堡选单（☰ 按钮）+ 下拉面板显示同样四个连结，逻辑写在 `js/cart.js`（每个页面都会载入这个档案）；汉堡按钮跟购物车图示包在同一个 `.nav-actions` 容器里、放在导览列最右边，两个挨在一起——分开当独立 flex 元素的话，购物车会被 `space-between` 排版挤到导览列正中间
  - 面板一开始是塞进正常文件流的，打开时会把下面的内容（LOGO、首图等）往下推开——改成 `position: fixed`，`top` 用 JS 量 nav 实际高度去对齐，变成浮在内容上面，不会再推版
  - 打开/关闭现在有滑出 + 淡入动画，背后加了半透明黑色遮罩（`.nav-mobile-backdrop`），点遮罩也能关闭菜单，跟一般手机网站的菜单手感一致
  - 手机版商品格子（Shop 页 + 首页「本月精选」，都是同一个 `.product-grid`）从原本自动塌缩成1栏，改成强制2栏（参考同行 theduckroom.com 的手机版排版）；为了塞得下，说明文字跟 ISO/格式规格标签在手机上隐藏，价格跟按钮改上下排列
- 购物车图示（`.nav-cart`）本身是个连去 cart.html 的连结，点击时原本会同时触发「打开抽屉」跟「跳转页面」，抽屉的滑出动画根本来不及播放就已经跳走了——修成只有页面上真的有抽屉（首页/Shop/Product/Services/Blog/Compare）时才拦下跳转、改成开抽屉；没有抽屉的页面（cart.html 本身、admin、track-order）維持正常跳转
- admin.html 的资料表格（Sales overview、Drop-offs）：分页按钮（Product catalog / Sales overview / Drop-offs）置中；表格第一栏（Time）设 `white-space: nowrap`，不然日期时间会挤成好几行很难看，表格本来就有横向卷动（`.admin-table-scroll`）所以栏位变宽没差；admin 页面本身拿掉了 `.container` 原本 1120px 的宽度上限（用专属的 `.admin-wide-container`），满版显示、减少表格需要横向卷动的机会——这个上限只对 admin.html 拿掉，其他页面维持原本的阅读宽度
- 冲洗预约表单（services.html / `js/dropoff.js`）「How are you sending it?」原本只有 Walk-in / Mail / Courier 两个选项，2026-09-29 加了第三个 **Nearby outlet**——选了之后会多出一个下拉选单，列出 N4 全马分店（写死在 `js/dropoff.js` 的 `DROPOFF_OUTLETS` 常数里），让客人选就近的分店代收；每个选项前面都带真实的 Outlet Code（N4-01、N4-05...，跟 Jun Min 提供的 N4 分店清单一致，会跳号因为 N4-02/03/04 不在这个清单里），方便跟分店对账/员工内部代号对上；**注意 Alor Setar 有两间**——N4-07（Aman Central）跟 N4-15（Pekan Melayu）不是同一间：N4-15 Pekan Melayu 是这个冲洗 lab 自己的门市，已经被 Walk-in 选项涵盖，所以**没有**放进 Nearby outlet 清单；N4-07 Aman Central 是不同的分店，**有**放进清单（2026-09-29 一开始漏放，后来补上）；每个选项后面也带楼层（例如「(1st floor)」），照原始分店清单的地址资料填，方便客人到商场直接找到楼层，不用再问；N4-13 JioSpace 没有楼层（原始地址没写，可能是独立门市不是商场里的一个楼层），所以没加；分店资料来源是 Jun Min 提供的 N4 分店清单截图（2026-09-29），之后 N4 开新分店或分店资讯有变，要手动更新这个常数（前端）+ 如果要在 admin 显示也不用动，因为是直接存文字进 Google Sheet，不是查表
  - 选 Nearby outlet 时「When to pay?」的 Pay later 按钮会自动变灰、不能点，付款方式强制锁定 Pay now——因为代收的分店不是自己的收银台，没有「之后再收款」这个流程；`dropoff-handler.gs` 后端也不信任前端送来的 payment 栏位，只要 method 是 Nearby outlet 一律强制改写成 Pay now 再存进表，双重防呆
  - 选 Nearby outlet 会额外加收 **RM12 分店转寄费**（一次性，不是每卷都收）——前端 `js/dropoff.js` 的 `OUTLET_FEE` 常数跟后端 `dropoff-handler.gs` 的 `priceDropoff_()` 都要算这笔费用，后端是权威计算（不信任前端送来的金额），前端只负责即时预览；跟结账「寄送」的 RM12 运费金额刚好一样，纯属巧合，两个是独立设定的常数，之后要改其中一个价钱不会互相影响
  - Pay now 的 WhatsApp 收据文字（`dropoff-payment-step` 那步骤）原本只有 Name/Phone/Email，选 Nearby outlet 时看不出客人是在哪间分店寄的——2026-09-30 补上，只有 method 是 Nearby outlet 时才多加一行 Outlet；Walk-in（本来就是这间 lab）跟 Mail/Courier（本来就有 tracking number）不需要，维持原样
- Favicon：网站根目录有 `favicon.ico`（跟 `images/favicon.png` 是同一个 logo，只是格式/位置不同）——Google 搜索结果等爬虫习惯先去网站根目录找 `/favicon.ico`，不一定会看页面 `<link rel="icon">` 指到的路径，少了根目录这个档案就会显示通用图示而不是真正 logo。改了之后 Google 搜索结果的图示要等它自己重新爬网站才会更新，通常要几天到几周，没办法用代码强制刷新

## 托管 / 部署

- GitHub（repo：N4-Filmlab04/filmlab04-site）
- GitHub Pages（网站实际跑在这上面，push 到 main 分支后自动重新部署）
- 自定义域名：filmlab04.com

## 资料库 / 后端

- Google Sheets 当资料库（4 张表：Filmlab04 Products 商品、Filmlab04 Orders 订单、Filmlab04 Drop-offs 冲洗预约、**Filmlab04 Blog 文章**——2026-09-30 决定加，2026-10-02 正式接上线）
- Google Apps Script（3 个独立的 Web App，各自绑一张表）：
  - `admin-api.gs` — 商品 CRUD、销售总览、图片上传（新增商品时要选是单一款式还是多颜色/款式；库存状态改成填 Quantity 数字自动判断，不再是手动切 in-stock/sold-out）；销售总览统计方块除了 Total orders / Total order value，也加了 Pending / Paid 各自的笔数——从整张 Orders 表算，不是只算画面上显示的最近 200 笔，所以订单一多也不会算错；四个方块的文字都置中显示；销售总览也加了日期筛选（Today/Yesterday/Last 7 days/This month），纯前端算、不用改后端
    - Drop-offs 分页透过新的 `?action=dropoffs` 读取，跟 Orders 一样用 Sheet ID（`DROPOFFS_SHEET_ID`）跨表读取，不是绑定在这个专案自己的表上——欄位对照要照 `dropoff-handler.gs` 实际写入的顺序（Submitted At、Name、Phone、Email、Method、Courier Provider、Tracking Number、Rolls、Service、High-Res Scan、Subtotal、Payment、Keep Strips、Strips Return、Reference、Notes），不能照 Sheet 第一行的栏位标题读——**那张表本身的标题列历史上少打了「Subtotal (RM)」这个栏位，导致从 Payment 开始往右的栏位标题全部错位**，但实际储存的资料本身没有错，是标题列本身没跟上），所以后端改用固定栏位顺序（index）去读，不要照标题列
    - Reference 跟 Notes 是两个独立栏位（客人可能两个都填，或用途不一样——Reference 常常填「参考编号/信封编号」，Notes 才是「有什么要提醒我们的」自由文字），画面上要分开显示，不能合并成一栏，不然会漏资料
    - 2026-09-30 新增 Blog CRUD：`?action=blog-posts`（GET，公开不用登入——客人端 blog.html/blog-post.html 也是读这个）读取全部文章；`{action:'save-posts'}`（POST，要 idToken）整批覆写，跟商品的 `save-all` 同一套「整份清空重写」做法，不是一笔一笔改；文章存在独立的 Filmlab04 Blog 表（`BLOG_SHEET_ID`），栏位固定顺序 Post ID / Title / Date / Excerpt / Cover Image / Content，Content 一格里多段落用空行分隔（`\n\n`），前端 textarea 输入也用空行分段；封面图片直接借用商品图片上传的 `upload-image` action，不用另外做一套
    - 2026-10-02 已实测上线：admin.html 新增文章 → 存进 Sheet → `blog.html`/`blog-post.html` 读到——全部串通确认过
    - 踩到一个坑：admin 填的 Date 栏位（像「2 October 2026」这种文字）被 Google Sheets 自动侦测成「日期」格式存进去，读回来变成 `Fri Oct 02 2026 00:00:00 GMT+0800...` 这种乱码——跟 Drop-offs 表当初的时区坑是同一个类型的问题（Sheets 自作主张转型别）。修法：`writeAllPosts_` 存档前把整个栏位的 number format 强制设成纯文字（`setNumberFormat('@')`），`readAllPosts_` 读取时也检查如果读到的是真正的 Date 物件（表示已经被转过型、或是旧资料），就用 `Utilities.formatDate` 转回乾净的日期字串——这样旧的、已经被污染的那一行资料下次读取也会自动修好，不用手动重打
  - `order-handler.gs` — 处理购物车结账送来的订单
  - `dropoff-handler.gs` — 处理冲洗预约表单；2026-09-29 加了 `Outlet Branch` 栏位（第17栏，加在 Notes 后面，不是插在中间——避免打乱既有栏位的固定 index 读法），对应表单新增的 Nearby outlet 选项
- Google Drive — 存放商品图片、Blog 封面图（透过 Apps Script 的 DriveApp 上传，`uploadImage_()` 这个 function 两边共用）
  - 2026-10-02 发现一个坑：上传后原本回传 `drive.google.com/uc?export=view&id=...` 这种网址——直接在浏览器网址列打开没问题，但当成 `<img>` 嵌在 filmlab04.com 页面里（跨网域）会不稳定跳 503（实测验证：同一个网址，直接导航 OK，跨网域嵌入会失败），应该是 Google 针对「被其他网站盗连当图片用」的请求跟「使用者直接造访」这两种情境给的待遇不一样。改用 `lh3.googleusercontent.com/d/<file id>`（Google 自己的图片 CDN，Drive/Photos 预览图用的也是这个）——跨网域嵌入实测没问题。这个改动影响所有透过 admin.html 上传的图片（商品图 + Blog 封面图都算），不是 Blog 独有的问题，只是刚好是第一张透过这个功能上传、又放在正式站上测试的图片，才被抓到
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
- 扣库存（`decrementStock_`）原本也是顺序处理——购物车有几样商品就依序各打一次 Google 服务器，客人要等全部扣完才有回应，多商品的订单因此特别慢（实测一笔单飙到快30秒、另一笔快50秒）；改成一样用 `UrlFetchApp.fetchAll` 全部同时发出去，不管购物车几样商品都只算一次往返的时间
- **Apps Script 保温 trigger**：Orders（`order-handler.gs`）跟 Products/Admin（`admin-api.gs`）两个专案都加了一个空函数 `keepWarm()`，在 Apps Script 编辑器的 Triggers 里设成每5分钟自动跑一次，避免脚本太久没人用被 Google 冷启动（cold start，重新唤醒的那几秒是变慢的一大原因）。**踩过的坑**：函数名字一开始叫 `keepWarm_`（跟专案里其他内部函数一样加底线），结果完全没出现在 Trigger 的函数选单里——Google Apps Script 会把底线结尾的函数当作「私有」，不给外部（含 Trigger UI）选取，所以专门给 Trigger 用的函数不能加底线
- 三个修复（防重复下单、扣库存平行化、保温 trigger）一起生效后，实测下单速度稳定在4-6秒，没有再出现20-30秒以上的离谱情况
- 服务预约表单（冲洗/drop-off）选「Pay now」会走跟结账一样的付款确认画面，选「Pay later」就直接完成预约
- 购物车下单前会先在前端挡库存上限（不能加超过现有库存的数量），下单当下后端也会用商品目录真实库存再夹一次、重新算价钱——两层都挡是因为只挡前端的话，有心人还是可以直接打 API 绕过去下单超卖
- 结账送出的请求有设 client-side timeout（提交20秒、维护模式检查10秒——提交原本设15秒，测到一笔真实请求要27秒才回应，才调宽到20秒），避免手机网路不稳时画面卡住不放——普通 `fetch()` 本身不会自己超时，之前实测过一笔订单在手机上卡了快2分钟才跳出失败画面，但后端其实早就写进 Orders 表了。**这代表客人看到「失败/维护中」画面，不一定代表真的没下成功**——处理客人反映下单失败前，先去 Orders 表或 track-order.html 查一下订单号有没有进去，避免误判成重复下单
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
- **下单速度进一步优化**（2026-09-26 记录，Jun Min 表示暂缓、之后再改）：目前实测稳定 4-6 秒，主因是 `order-handler.gs` 每笔单要透过网址呼叫 `admin-api.gs` 两次（查库存/维护模式、扣库存），每次都有 Apps Script 专案间转发的延迟。要压到 1-2 秒，得让 Orders 专案直接读写 Products 那张 Google Sheet（不透过网址呼叫），跳过这层延迟——但这样「结账维护模式」开关现在存放的位置（`admin-api.gs` 自己的私有设定，PropertiesService，别的专案读不到）就得搬到 Sheet 里，两个专案都要重新部署跟测试，範圍比较大
