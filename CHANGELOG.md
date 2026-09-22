# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.11.1] - 2026-09-22

### Fixed
- **「摘要卡没显示」根因收口（用户指令：排查「autofill 打点」会话）**：该会话 133 条带文本最终回复中
  9 条缺摘要卡（93% 合规）。逐轮转写实证：全部为模型侧未生成摘要文本，无一条是渲染故障（凡有摘要
  文本的回复均正常打卡）；且 9 次中 7 次 COMPLIANCE WARNING 当时在场、8 次 0.8.3+ 完整措辞在场、
  最后 1 次（t133）甚至已运行在 0.11.0 措辞下——泛化警告 + 通用点名在长设备驱动监控会话里被模型
  持续无视。修复三层（host only，client 渲染零改动）：
  1. **警告点名化**：首屏 banner 与尾部 warning 引用违规回复的开场原句（如
     「图已生成且事实核对无误。交付如下：」）；missing（无卡）与 misplaced（摘要卡中置，实测 t126
     开头段落后才出卡）分别措辞——中置卡用户看得见但违反「digest 先于一切」契约，此前被混同于
     「无卡」误述。
  2. **连击升级**：同会话连续违规按「回复签名」（长度+首行）去重计数，x2 起追加 REPEAT OFFENSE，
     合规即清零（内存态，进程重启清零可接受）。
  3. **检测口径与渲染口径同源**：host 此前只认严格 `> **摘要：**`，把 client MARK_RE 已渲染成卡的
     变体（`> 摘要：…`、`>**摘要：**…`、`> **说人话：**…`，实测 t0 即说人话卡）误判为缺卡 →
     误告警；新增 DIGEST_DETECT_RE 对齐，digestFinding 四态判定（ok/misplaced/missing/indeterminate）
     替代布尔口径，isDigestMissing 保持兼容语义。
- **措辞点名第三大漏卡家族（实测「autofill 打点」设备驱动会话）**：监控/进度播报型（【进度】 /
  账目对上了 / 确认无误 / 明白 开场）与账目/清单/最终汇总汇总型短确认，style 与 reminder 双点名；
  同时明确「摘要块中置也是违约」。
- **防再犯基线扩容（0.8.1 协议延续）**：合规回归样本从 3 类扩到 5 类 = 长解释型 / 表格型 / 短任务
  + 监控确认型 / 交付清单型；任何措辞或检测口径改动必须用全样本集回归（staging headless 实测）。


## [0.11.0] - 2026-09-21

### Added
- **摘要卡书写规则融合 caveman × humanizer 精华（纯提示词文本增量，client 渲染零改动）**：style 正文新增
  `Digest content style (caveman × humanizer)` 条款——①首句即结论（答案 / 决定 / 产物，绝不背景与过程
  复述）②电报体密度（砍客套与连接词填充，只留事实与数字）③去 AI 套话（禁空洞总结句、三连排比、
  「不是X而是Y」句式、模糊归因、夸大意义词），同一事物只用一个名称且只提一次。
  `> **摘要：**` 格式契约、MARK_RE 渲染、划选复制、chip 与交付物点击打开全部不变；
  state / config / schema 零变更，升级无迁移。措辞回归沿用 0.8.1 防再犯基线
  （长解释型 + 表格型 + 交付话术型样本 staging 实测）。
- 精华来源：JuliusBrussee/caveman（电报体压缩）与 blader/humanizer（Wikipedia《Signs of AI writing》
  模式清单精选）——两者均为 Claude Code / Codex 形态，本插件将其核心规则移植进摘要卡契约。

## [0.10.6] - 2026-09-20

### Fixed
- **交付物漏列中文文件名的带目录相对路径（用户实测：autofill-ai-parser-L3/L4 会话 L4 叙事卡
  draw-code/l3-解析-agent-喂什么-做什么-出什么-l4-mu9j2r4n.html 未进交付物，同类问题第三次）**：
  相对路径识别分支仍是纯 ASCII 字符类，在 CJK 处断裂后回切出「碎片」（-l4-mu9j2r4n.html）——
  碎片文件不存在 → verify-paths 过滤 → 真产物与 spec 双双漏列。修复 = 新增「带目录相对路径」
  分支（至少一段 dir/ 前缀作路径信号，目录与文件名均放行 CJK）：0.10.4 只修了绝对分支，本次
  补齐相对分支；纯正文（无 /）不进该分支，杜绝「见图x.png」式正文粘连；裸中文文件名（无目录）
  仍不支持——正文歧义，宁可漏不可错切。回归测试 3 组：实测会话复刻（html+json 全列）、多段目录
  双扩展名、粘连守卫 + ASCII 行为不变。

## [0.10.5] - 2026-09-20

### Fixed
- **miss 警告在 agentic 会话误告警常驻（告警疲劳），用户实测 autofill-ai-parser-L3/L4 会话最终回复
  缺摘要卡**：isDigestMissing 把回合中途带 tool-call 的工具环消息也当「上一条最终回复」判定——
  82K prompt 的深 agentic 会话里警告几乎每轮组装都在场且多数为误告警（上一条真实最终回复其实合规），
  模型习惯化后连真漏卡也无视（实测：⚠️ COMPLIANCE ALERT + 尾部 WARNING 双双在场仍 0 遵循）。
  修复 = 向前扫描跳过带 tool-call 块的 assistant 消息，只判「最后一条纯文本 assistant」= 真正的
  最终回复；无先前最终回复（首轮/纯工具环）返回 false——style 段 MANDATORY 契约不依赖警告，
  全程有效，误告警源铲除。
- **技能交付模板与摘要契约冲突（本次漏卡直接诱因）**：最终回复开头是 draw-code 技能交付话术
  （「图已生成并通过 lint。交付：…」），技能模板压过了 system prompt 契约。修复 = ①style/reminder
  点名「技能交付模板（draw-code/archify/HTML 工坊等）同样是 user-facing final reply，模板内容
  排在摘要块之后、不得替换或推迟」②draw-code.md 交付话术补摘要卡首行契约（对齐 0.8.0 bugfix
  F12 先例）；同族审计：其余技能无交付模板冲突面。

## [0.10.4] - 2026-09-20

### Fixed
- **交付物聚合区漏列产物图片（用户实测：「AutofillService 的解析实现」/draw-code --L0 会话摘要卡
  交付物只列了 .l0.prompt.md，成品 PNG 缺失）**：根因 = 绝对路径识别分支用「负向排除表」定义尾段，
  漏掉（）：、？！《》等全角标点——回复渲染后 \`<code>\` 行内代码的反引号在 textContent 中消失，
  代码内路径与紧随的中文说明（…全景-l0-mu9d14h5.png（已通过视觉核验：…）在文本层无界粘连成
  一段，detectPathKind 判为 folder → collectDeliverables 排除目录 → 产物图片被静默丢弃。
  修复 = ①绝对路径尾段改「正向字符类」（字母 \p{L} 含中文文件名 + 数字 + 路径标点 .-_ / ~ @ +
  括号），任何其他标点/空白/引号即停，粘连从根上不发生；②URL 分支同步补齐全角标点排除；
  ③新增 trimProseTail 回锚兜底：正文汉字无标点直接粘在路径尾部（…x.png已核验）时回锚到最后
  一个已知扩展名，截下的正文残段保留为文本段（切分无损往返）；无扩展名的 CJK 候选可能是真实
  中文目录名，不做丢弃判断（不误伤）。回归测试 7 组：实测会话复刻（png+md 全列、表格散文零误报）、
  全角标点家族逐字边界、回锚纯函数、无标点粘连、URL 边界、中文目录与括号文件名共存、无损往返。

## [0.10.3] - 2026-09-18

### Fixed
- **邮箱/域名被误切成假 chip（用户实测：dsh-improve-prompt 会话摘要卡把 hoyyang@users.noreply.github.com
  切成「hoyyang@」+ 假 chip「users.noreply.github.c」+ 残段「om」）**：相对路径识别正则缺词尾边界，
  域名尾部被回溯出合法扩展名（com 逐字符回退命中 c，c 是注册过的 .c 代码扩展名），.com/.cn/.ch 类
  域名全家族同理误 chip。修复 = 相对路径扩展名后加负向前瞻（不得紧跟字母/数字/下划线）；文件名后跟
  中文/标点/空白/串尾的既有行为不变，真实相对路径（src/index.ts 等）回归用例固化。已渲染的错误
  卡片在页面刷新/会话重开后以新逻辑重建。

## [0.10.2] - 2026-09-18

### Fixed
- **交付物 chip 点击只能复制、无法打开（用户实测：draw-code/e2e-*.png 两张期望打开的图点击仅复制）**：
  根因 = verify-paths 与点击打开的解析能力不对称——verify 按 basename 递归查找能确认文件存在
  （chip 因此渲染），却把递归找到的绝对路径丢弃（findInDir 只回 boolean）；点击只做「cwd 候选直连
  拼接」，相对路径真身不在任何候选直连位置（实测真身在 dsh-draw-code/draw-code/ 下，而候选 cwd
  直连指向同名的无关目录）时全部 400 → 降级复制。修复 = ①verify-paths 响应新增 resolved 映射
  （原始相对路径 → 递归解析出的绝对路径），client 渲染聚合区时把它随 chip 携带，点击直接开；
  ②点击期兜底：cwd 直连全败后对该路径单发一次 verify 取 resolved 绝对路径再开（卡内相对路径
  chip 同样受益）；open 端点仍只收已存在绝对路径，安全口径不变。回归测试：resolved 映射断言 +
  递归解析专用用例（直连不可解 / 递归命中 / 假路径不过）。

## [0.10.1] - 2026-09-18

### Fixed
- **交付物聚合区误报假文件（用户实测：列出的 4 个文件全部不存在、点击只能复制）**：启发式扫描无法区分交付产物与正文示例（实测 Mermaid CLI 用法 `mmdc -i x.mmd -o x.png` 的参数被当成交付物）。修复 = 存在性过滤：新增 POST /api/verify-paths（只读 existsSync，Origin 同源校验，<=32 条；相对路径按 cwd 直解 + 按 basename 递归查找（深度 4 / 条目预算 4000 / 每候选独立预算 / 跳 node_modules/.git/dist/build/.cache））；client 渲染聚合区前先校验，不存在的直接不列，全部不存在则不渲染聚合区；verify 不可用时降级保留启发式结果。回归测试：verify 端点用例（假路径过滤 / 绝对+相对存在 / 去重 / 超量 400）。
- **cwd 解析缺口**：历史会话内存缓存为空（插件重装后未组装）导致相对路径点击降级复制。修复 = client 把 slot 注入的会话 id 广播到 globalThis 并随 cwd/verify 请求携带；host 按 sessionId 做磁盘兜底（node:zlib 解会话转写首行 cwd，>8MB 跳过）并回填缓存；cwd 端点返回候选列表供点击依次尝试。真机验证：点击聚合区 chip dcc-opened（OS 默认应用打开）。
- **聚合区启动竞态**：digest 渲染早于会话 id 广播时 verify 拿空 sid 被滤空且页面静止不再重试 - 渲染失败时延迟 2s 重试，最多 2 次。
- recentSessionCwds 加 60s TTL 缓存（需解压数 MB 转写，verify/cwd 高频调用不得反复解）。

## [0.10.0] - 2026-09-18

### Added
- **摘要卡交付物聚合区**：回答里生成的产物文件不再要求模型写进摘要文本——client 端在摘要卡内容稳定后
  （复用 1.2s 稳定窗口）扫描同一条回复全文（_markdown 容器，fallback 启发式向上找），把卡片之外的
  文件路径以「交付物 · FILES」chip 区列在卡片底部，点击 = 既有交互（cwd 解析 + OS 默认应用打开）。
  排除 URL 与目录、卡内已有路径不重复列、去重按出现顺序、上限 8 个；容器不可判退化为只扫卡内；
  无文件不渲染（卡片外观零变化）。业界参照：Copilot Studio「代理创建的文件」/ Claude Artifacts /
  开源 chat 的 Files-in-chat 面板（借鉴改造，无现成 dsh 插件）。

### Fixed
- **扩展名交替顺序截断（0.8.5 起）**：路径识别正则的扩展名交替「先短后长」（h 在 html 前、js 在 json 前、
  doc 在 docx 前），正则交替先到先得导致 .html→.h、.json→.js、.docx→.doc、.xlsx→.xls、.cpp/.css/.csv→.c
  路径残缺——chip 与交付物聚合区点击打开必失败。全部改为长优先排序。
- **摘要卡遵循强化（用户实测：拍板提问型回复漏摘要）**：miss 警告此前只追加在 system prompt 尾部
  （reminder 之后），在 80K+ 字符 prompt 里被模型持续忽略（转写逐轮实证：警告在，摘要依旧缺）。
  现在 miss 时把首屏警告（COMPLIANCE ALERT）插到 style section 最开头——模型最先读到的位置，
  尾部 WARNING 保留双保险；style 与 reminder 措辞点名「以 ask_user_question 拍板提问结尾的回复
  同样是 user-facing final reply，不得豁免」。

## [0.9.2] - 2026-09-18

### Fixed
- **摘要卡冻结在流式中间帧（用户实测 autofill-ai-parser 会话）**：屏幕上摘要卡内容与持久化转写不一致（中间稿措辞），切会话重进才恢复完整。根因：卡内 chip 化在流式中途 replaceChild 换掉宿主 React 正在维护的文本节点，后续增量更新全部打到已被摘除的「幽灵节点」；整条回复只有摘要卡截断，因为只有它被插件动过内部 DOM。修复 = 卡片样式类即时挂（className 不干扰 React 文本更新），链接兜底与 chip 化延迟到「内容连续 1.2s 无变化」（近似流式结束）；内容再变 → 重置窗口重来，chip 被宿主重渲染覆盖后自动补挂（幂等）。交互差异：流式刚结束时 chip 延迟约 1.2s 出现。
- **合规警告（miss 反馈闭环）通道重构**：0.9.2 发布时的表述「waterfall 真机从未生效」经后续转写逐轮复查修正——waterfall 版在正式组装轮的注入大部分有效（COMPLIANCE WARNING 实际出现在多轮 system prompt 中），当时误把「上下文预算预组装」（user 消息前数毫秒、不进模型的组装）当成正式组装证据。真实缺口只有两处：会话首轮组装早于监听 attach 的时序窗，以及模型在超长 system prompt 里持续忽略尾部警告（见 0.10.0 首屏警告）。0.9.2 的重构（miss 检测移入 reminder section text(context)、纯函数 isDigestMissing 不可判不告警不阻断、cwd 缓存刷新随迁）保留——通道简化且消除 attach 时序窗，行为与 waterfall 版等效。
- 顺带修复：src/index.ts 中 validateOpenTarget 的空格字符曾被写入事故替换为 NUL 字节（含空格路径无法点击打开）；已还原。
- 回归测试：waterfall 两个用例重写为 isDigestMissing 七形态 + reminder 内嵌组合用例（mock 调用签名与真机派发对齐：assembly/context/next 三参）。

## [0.9.1] - 2026-09-18

### Fixed
- 用户实测（job 自查会话摘要卡）：正文里的「A~E」波浪号代称被误判为路径并渲染成文件夹 chip，
  且点击无动作。根因：路径识别的 tilde 分支只要求「~」不要求「~/」，单个 ~ 前缀的散文文本即命中。
  修复 = tilde 分支强制「~/」；新增两条回归用例（A~E 文案零 chip / 真 ~/.zshrc 仍 chip）。
- 真文件夹 chip 点击验证通过：POST /dsh-concise/api/open → 200 → Finder 打开目标目录
  （绝对路径场景；相对路径依赖会话 cwd 缓存——该会话发过消息即有）。

## [0.9.0] - 2026-09-18

### Changed
- **文件 chip 交互统一为 OS 默认应用打开**：点击（全部类型）→ 宿主新端点
  POST /dsh-concise/api/open { path } → spawn OS open verb（macOS open / Windows start / Linux
  xdg-open）——与双击文件完全一致：图片→看图器、md→默认编辑器、pdf→阅读器、word→Word、目录→Finder。
- 移除全部浏览器侧打开通道（cursor:// 等外部协议弹窗元凶清零；/api/file 预览分支随之退役；
  ideSchemeUrl/probeApps/openViaHost/isPreviewableKind 退役）。
- **/open 端点安全**：Origin 同源校验（跨站 403）、绝对路径 + existsSync 校验（非法 400 fail loud）、
  spawn 失败 500；路径存在性校验防探测。
- 相对路径经 /dsh-concise/api/cwd（会话 cwd）解析保留。

### Verified
- 端点双分支：不存在路径 400 fail-loud；真实目录 200 且 Finder 弹出。
- 真机 GUI：png chip 点击 → POST 200 → Preview.app 打开图片。
- host 5/5 + chips 7/7 + normalize 4/4 + typecheck/build/热重载绿。

## [0.8.9] - 2026-09-18

### Changed
- 文件 chip 交互升级为**双通道**（用户实测 0.8.8 反馈：IDE 协议弹确认框、图片应用不匹配）：
  ① **单击 = 浏览器原生预览**（/api/file 认证文件服务）：图片直接显示、PDF 内置阅读器、
     代码/Markdown 文本展示——零弹窗，即浏览器中「打开文件」的默认方式；
  ② **Shift+单击 = 系统编辑器打开文件本体**（cursor/vscode/windsurf/zed 协议按探测优先）：
     首次使用浏览器会请求一次确认，勾选「始终允许 http://127.0.0.1:3080…」后永久静默；
  ③ URL 依旧直接跳转（http 跳转本无弹窗）；文件夹依旧 Finder 真开目录；
     word/excel/zip 等浏览器不可渲染类型：复制路径降级（明示）。
- 划选复制不受影响（chip click 的 stopPropagation 仅作用于自身 click 事件）。

### Verified
- 真机：URL chip 点击新 tab 跳转；预览/编辑双通道逻辑与 cwd 解析（/dsh-concise/api/cwd）
  spy 实测通过。host 5/5 + chips 7/7 + normalize 4/4 + typecheck/build/热重载绿。

## [0.8.8] - 2026-09-18

### Fixed
- 用户实测：图片 chip 点击用 Cursor 打开（弹浏览器协议确认框且应用不匹配）、md chip 仍只复制。
- **交互重做为浏览器原生预览**：发现宿主认证文件服务 GET /api/file?path=<abs>（任意本地路径、
  MIME 自动判定、连接服务认证后无路径限制，dsh-api-session-controller media-references 模块）——
  浏览器可渲染类型（图片/PDF/代码/Markdown/文本）点击直接新 tab 打开文件内容：图片原生显示、
  PDF 内置阅读器、文本纯文本展示——零弹窗、真打开文件内容。
- 移除 IDE 协议（cursor:// 等）——浏览器对外部协议必弹确认框（多此一举且应用不匹配文件类型）。
- word/excel/zip 等浏览器不可渲染类型 + 打开失败：降级复制路径（徽标「已复制 ✓」）；
  文件夹仍走宿主 open-in-app 真开目录。
- 相对路径经 /dsh-concise/api/cwd 解析（0.8.7 引入）。

### Verified
- 真机 fetch 实测：/api/file 对桌面 png 返回 200 + image/png + 819119 字节；对 README.md 返回
  200 + text/markdown。host 5/5 + chips 7/7（isPreviewableKind 契约）。

## [0.8.7] - 2026-09-17

### Fixed
- 用户实测两问题：①图片 chip 点击打开的是所在文件夹而非文件本身；②md 文件 chip 点击只复制路径。
  根因：宿主 open-in-app open 路由的 wire 校验只接受**已存在目录**（读宿主源码确认 isDirectory 硬校验，
  文件路径一律 404）→ 0.8.6 的目录回退只解决了「有反应」没解决「打开文件」；且**相对路径**（摘要里的
  var/scripts/….md）未经绝对化直接 POST → 400 → 降级复制。
- 修复：
  ① 文本/图片类（代码/Markdown/图片/文件）点击改为 **IDE 协议真打开文件本身**：cursor/vscode/windsurf/zed
     协议按探测优先（window.open(ide://file<abs>)），宿主目录回退保留为无 IDE 时的兜底；
  ② 相对路径绝对化：host 在 assemble waterfall 缓存 session.header.cwd + 新增 GET /dsh-concise/api/cwd
     （sid 缓存 → 最近 cwd → process.cwd 兜底）；client 点击时 GET cwd → resolveAbsolute（~/按 home、
     相对按 cwd）；cwd 不可得时按原样尝试失败降级复制。
- 划选复制依旧不受影响。

### Verified
- 真机 spy 实测：绝对路径 → cursor://file/Users/demo/Desktop/测试.png ✓；相对路径解析链路通（注入卡
  无组装历史走 process.cwd 兜底；真实时序发消息后即有正确 cwd）。host 5/5 + chips 7/7。

## [0.8.6] - 2026-09-17

### Fixed
- 点击 chip 无动作（用户报告「只复制不跳转/不打开」）：
  ① URL chip 改为显式 window.open 跳转（不依赖 <a> 默认行为，任何宿主点击拦截都不影响）。
  ② 本地文件 chip 接入宿主 open-in-app 系统打开路由，点击真正用系统应用打开：GET /open-in-app/apps
     探测（响应形态 {apps:[…]}，0.8.5 只认裸数组导致永远走复制降级——已修）→ POST /open-in-app/open。
     宿主 wire 校验只接受已存在目录：文件路径 404 时自动回退打开所在目录（Finder 定位）；
     应用选择 = OS 文件管理器优先（shell-open 可开任何路径）、代码类先试 cursor/vscode；
     打开失败自动降级复制路径。徽标：已打开 ✓ / 已复制 ✓。
- 划选复制（mouseup 划选→松开复制）不受影响：chip click 的 stopPropagation 仅作用于 chip 自身 click。

### Verified
- 真机（playwright）：点击 URL chip 新 tab 打开目标页；点击文件 chip → POST 404（文件）→ 自动目录回退
  → POST 200（Finder 打开）。host 5/5 + chips 5/5。

## [0.8.5] - 2026-09-17

### Added
- 摘要卡内路径 chip 系统：卡内的网页链接与本地文件路径自动转为类型化可交互 chip——网页链接直接
  跳转（target=_blank + noopener），本地文件点击复制路径（web 安全模型内最可靠的「直接可用」交互，
  宿主无 file:// 打开机制已实测）；按扩展名分 10 类图标与类型色（图片/PDF/Word/表格/代码/Markdown/
  压缩包/文件夹/网页/文件），hover 上浮 + 类型色辉光、入场淡入、复制后「已复制 ✓」徽标，
  prefers-reduced-motion 全适配。**摘要卡片本体样式零改动**（chip 全部限定卡内作用域）。
- 设计参考：ui-screenshot-system 模板生成 chip 组件系统设计稿（assets 未入库，设计定稿为代码实现）。

### Security
- 路径文本一律 textContent 注入（防 HTML 注入）；图标为静态内联 SVG 常量。

### Tests
- chips.test.ts 5/5：10 类扩展名映射、混合摘要文本切分边界（中文句读不吞入、尾标点剥离、
  无路径纯文本无误报）、类型色与标签携带。

## [0.8.4] - 2026-09-17

### Fixed
- 首轮长评估型最终回复缺失摘要卡（实证：AutoFillUI 气泡转发评估会话第一轮「## 结论」开头 9k 字方案
  无摘要；第二轮也缺——0.8.3 miss 闭环无历史可依且事件链路死亡）。
- **0.8.3 事件闭环实测废弃**：assistant/message + user/message 探针零到达（session.append 落盘事件不
  派发到插件 ctx）——Phase 2 教训：事件可达性必须实测，不能以类型声明推断。
- **v0.8.4 真实现**：system-prompt/assemble waterfall（可达性有 dsh-smart-compact 生产先例）监听中用
  session.deriveMessages() 同步判定最后一条 assistant 消息是否以摘要块开头；缺失或首轮无历史 → 向
  assembly 追加 COMPLIANCE WARNING（逐会话判定、覆盖首轮、无事件依赖）。回调失败不阻断组装。
- style 点名：heading opener（## 结论 / ## 方案）不是摘要。

### Tests
- waterfall 契约 2 用例（缺摘要→assembly 追加警告；合规与全新会话首轮→分别无/有警告），
  host 5/5；staging 真机首轮评估场景带卡 PASS。

## [0.8.3] - 2026-09-17

### Fixed
- 深会话「任务完成汇报型」最终回复系统性缺失摘要卡（实证：autofill-ai-parser-L3/L4 会话 09-17
  16:09-17:53 五条交付汇报型最终回复 0/5 带卡，短任务回复 8/8 正常；v0.8.1/0.8.2 措辞均未覆盖）。
  措辞点名追不上模型自分类，本轮引入机制性修复：
  ① miss 检测反馈闭环：host 监听 assistant/message + user/message 会话事件，跟踪「最后一条带文本的
     assistant 消息」是否以摘要块开头，user 消息到达（= 上个 turn 结束）时固化标记；reminder section
     据此在下一轮注入 COMPLIANCE WARNING。已知边界：事件载荷无 sessionId → 全局单标记（并行会话
     可能跨会话注入无害警告）；事件不可见环境静默降级为纯措辞。
  ② reminder 改为发送前自检清单式（SELF-CHECK + 豁免不带进最终回复）。
  ③ style 点名 task-completion reports（全部完成/已实施/方案已落盘/交付物清单）不是摘要的替代品。

### Changed
- host.test.mjs 新增 miss 闭环 2 用例（缺摘要→WARNING 注入→带摘要清除）；mockCtx 增加 on 事件捕获。

## [0.8.3] - 2026-09-17

### Fixed
- 深会话「任务完成汇报型」最终回复系统性缺失摘要卡（实证：autofill-ai-parser-L3/L4 会话 09-17
  16:09-17:53 五条交付汇报型最终回复 0/5 带卡，短任务回复 8/8 正常；v0.8.1/0.8.2 措辞均未覆盖）。
  措辞点名追不上模型自分类，本轮引入机制性修复：
  ① miss 检测反馈闭环：host 监听 assistant/message + user/message 会话事件，跟踪「最后一条带文本的
     assistant 消息」是否以摘要块开头，user 消息到达（= 上个 turn 结束）时固化标记；reminder section
     据此在下一轮注入 COMPLIANCE WARNING。已知边界：事件载荷无 sessionId → 全局单标记（并行会话
     可能跨会话注入无害警告）；事件不可见环境静默降级为纯措辞。
  ② reminder 改为发送前自检清单式（SELF-CHECK + 豁免不带进最终回复）。
  ③ style 点名 task-completion reports（全部完成/已实施/方案已落盘/交付物清单）不是摘要的替代品。

### Changed
- host.test.mjs 新增 miss 闭环 2 用例（缺摘要→WARNING 注入→带摘要清除）；mockCtx 增加 on 事件捕获。

## [0.8.2] - 2026-09-17

### Fixed
- 摘要卡内链接被宿主渲染管线污染：blockquote 内容走「纯文本 + 自定义 linkify」路径，其 URL 字符类
  含 * 与 pct 编码段，把紧贴 URL 的粗体标记与中文句读一并吞进 href（实测形态
  https://feishu.cn/wiki/xxx**%E3%80%82，飞书 404）；同一 URL 在正文以 [label](url) 写法则正常。
  修复 = client 摘要卡渲染增强内新增确定性兜底：normalizeDigestHref/normalizeDigestText 剥离 href
  与链接文字尾部的星号/中文句读（循环至稳定；剥空或无 scheme 回退原值）。标准链接为 no-op。
- style 措辞新增：URLs, file paths, and code spans stay bare (or [label](url)) — bold corrupts links。

### Changed
- 单测新增长 digest 链接规范化契约（test/normalize.test.ts，node --test --experimental-strip-types 直跑 TS，零新增依赖）。

## [0.8.1] - 2026-09-16

### Fixed
- 摘要卡在长解释型最终回复中缺失（实证：L4 会话 seq388/464，注入链路与开关均正常，模型对长文档式回复不遵循 digest 契约）。
- style 正文新增「Length and structure are NOT exemptions」点名长解释/表格型回复不得豁免；reminder 尾部提醒升级为「首渲染元素必须是摘要块 + 长回复最易漏」双重措辞。

### Changed
- 合规回归新增长解释型样本（复刻失效模式），不再只测短任务样本（0.8.0 的 86% 合规率盲区，STATE 风险③兑现）。

## [0.8.0] - 2026-09-15

### Changed

- Digest mandate rescoped: "every reply, no exceptions" → "every user-facing final
  reply" (intermediate step narration between tool calls is exempt). Empirical
  transcript audit (45 sessions, 2026-09-15) showed the unconditional mandate
  loses to skill-report formats in long agentic runs — 0 digests in both /bugfix
  runs and in tool-heavy turns, while chat finals complied. Narrowing the scope
  removes the conflict instead of fighting it.
- Added a tail reminder prompt section (`dsh-concise:reminder`, order 900, same
  per-session gating) that re-states the digest-first requirement at the end of
  the system prompt, countering long-prompt compliance decay.

### Fixed

- Headless/CLI profiles can now assemble the plugin: `webServer` is no longer a
  hard `inject` dependency (it blocked assembly forever in any profile without a
  web server — the style sections never reached headless sessions). The HTTP
  toggle API now attaches reactively via `ctx.inject(['webServer'], …)` and the
  style/reminder sections work everywhere; only the API degrades when absent.
- Client digest renderer matches blockquote prefixes 摘要： and 说人话： — digest
  outputs from sessions run under pre-0.7 style text render as cards again
  instead of degrading to plain quotes.
- state.json LRU eviction (500 cap) evicts entries whose value equals the
  session default first, so entries carrying explicit user intent survive:
  an explicitly-disabled session no longer silently flips back to the default
  after eviction.

## [0.7.0] - 2026-09-15

### Added

- Plain-language digest card: with Concise on, EVERY reply opens with a
  fixed-format blockquote — `> **摘要：** <2-3 plain sentences>` — restating
  the turn's conclusion in plain words. The rule is MANDATORY (unconditional,
  first rule of the style text, re-injected on every model assembly) so the
  card triggers on every Concise-on turn. Guardrail: the digest may only
  restate conclusions already present in the body (no new facts, trade-offs,
  or analogies).
- Client renderer enhancement: blockquotes starting with 摘要： are upgraded
  to an engineering-blueprint card — white face with a faint grid (::before,
  brightens on hover), four orange corner measurement brackets (::after, eight
  gradient layers, drawn in on mount), monospace font stack at 1.18em, header
  `DIGEST // 说人话`, and a real interaction: selecting any text inside the card
  copies it on mouse-up (header flashes COPIED ✓). Implemented via a
  document-subtree MutationObserver with rAF batching; classes, state and
  listeners are removed cleanly on uninstall. Design reference:
  `assets/style-digest-v07e.png` (generated with GPT-Image-2; v07 pastel,
  v07b dark-glass and v07c warm-paper were rejected directions).

### Changed

- **Fork declaration**: dsh-concise is no longer a byte-parity port of Claude
  Code's built-in Concise output style — it is now Claude Code Concise plus
  this plugin's digest-card extension. Verified 2026-09-15 against Claude Code
  2.1.272: upstream Concise is unchanged since 2.1.258, so nothing to re-sync.

## [0.6.0] - 2026-09-14

### Changed

- Placement swap: the Concise toggle now portals immediately LEFT of the
  prompt-enhancer entry (row order: Concise → ✦标准 pill → model picker).
  dsh-improve-prompt is untouched — it simply sits where Concise used to be.
- Expansion direction: inside the pill the DOM order is now [Concise
  label][switch] — the switch stays pinned against the prompt-enhancer's left
  side (right edge fixed) while the label expands to the left on hover or
  keyboard focus. Label reveal uses a slight leftward drift and clips without
  an ellipsis flash.

### Fixed

- Anchor resolution climbed from the prompt-enhancer element to its row-level
  wrapper: the official right-slot renders multiple plugin entries inside one
  shared container, so the previous child-wise probe skipped the container
  (it also contains this plugin's own seat root) and the button silently fell
  back to the old position. Resolution now starts from the `.dip-root`
  element itself and walks up to the direct child of the tool row.

## [0.5.0] - 2026-09-14

### Added

- Collapsed toggle: only the 30×16 switch shows by default; the Concise label
  smoothly expands on hover or keyboard focus (max-width + opacity + translate
  transitions). The button is absolutely positioned and right-anchored inside
  a fixed-width placeholder, so expanding never shifts neighboring composer
  controls — the right edge stays pinned and the pill grows leftward.
- Expressive styling (design concept: `assets/style-concept-v05.png`, generated
  with GPT-Image-2): glass shell with top highlight, Claude-orange aurora
  gradient track (135°, #F0B08F → #D97757 → #C25E3F) with a breathing glow
  while on, one-shot diagonal sheen sweep on hover, press-scale + springy knob
  feedback. All motion disabled under `prefers-reduced-motion: reduce`; the
  focus-visible ring stays intact in the on state.

### Changed

- Collapsed width ≈42 px (switch only); expanded ≈100 px while hovered.
- README feature list updated for the collapsed interaction and new visuals.

## [0.4.1] - 2026-09-14

### Changed

- Toggle placement moved into the left zone of the composer tool row: the
  Concise button now portals immediately right of the dsh-improve-prompt
  entry (the sparkle "标准/轻量" pill) — i.e. left of the model selection
  buttons (official model picker and kiro model selector alike).
- Resilient anchor resolution against concurrent restyles of improve-prompt:
  exact `.dip-root` class, then a `dip-` class-prefix probe, then an
  aria-label text match (增强提示词 / enhance prompt).
- Fallback placement without improve-prompt: immediately left of the model
  seat (same zone), replacing the old right-of-model position; the in-slot
  last-resort fallback is unchanged.

## [0.4.0] - 2026-09-02

### Added

- Sliding-switch toggle UI: the solid dot is now an iOS-style track + knob
  (spring cubic-bezier slide, press-to-stretch feedback, Claude-orange glow
  when on) — state reads instantly from the switch itself; the redundant
  开/关 text was removed.

### Changed

- Stronger concise style prompt: never open by restating the question or with
  pleasantries; no closing offers unless a decision is required; enumerable
  facts prefer tables/tight lists ("structure is not verbosity"); no
  between-step narration. Verified live: a knowledge question that took the
  default style 5m21s / 2.5K tok of sprawling sections answered in 57s /
  1.6K tok with an essence-first line plus a compact table.

### Fixed

- Session switching no longer flashes a loading state on the toggle: per-
  session state is cached client-side (stale-while-revalidate) and the API
  now reports the new-session default so unknown sessions render instantly.

## [0.3.1] - 2026-09-02

### Changed

- README restructure: a real before/after comparison (same question, same
  model, only the Concise toggle differs) now leads the document, followed by
  a 30-second start guide; reader priority is install → what changes → how
  to use → advanced → internals.

## [0.3.0] - 2026-09-02

### Changed

- **Scope: per-session.** The toggle now affects only the session it is
  toggled in — each session remembers its own state, sessions stay
  independent, and new sessions start from a configurable default
  (`defaultEnabled`, off by default). The section text resolves the
  assembling session via `context.agent.session.id`.

### Added

- Session-scoped API: `GET /state`, `POST /toggle`, `POST /set` accept a
  `sessionId` (query or body); calls without one operate on the new-session
  default. `/concise` operates on the invoking session.
- Session-state persistence with 500-entry LRU pruning, plus automatic
  migration of the 0.2.0 single-switch state file.

## [0.2.0] - 2026-09-02

### Added

- `/concise` host command — toggle or query the style from the slash menu and
  CLI sessions: `/concise`, `/concise on`, `/concise off`, `/concise status`
  (parity with Claude Code's `/output-style`).
- Custom style override: a non-empty `$DSH_HOME/dsh-concise/style.md` replaces
  the built-in style text (mtime-cached, edits effective on the next model
  assembly) — parity with Claude Code's `/output-style:new` custom styles.
- Composer button now re-syncs its state on a light 15 s interval (visible tab
  only) plus on window focus and visibility change, so changes made through
  `/concise`, the HTTP API, or another tab are reflected without reload.

## [0.1.0] - 2026-09-02

### Added

- Concise output style toggle button placed immediately right of the model
  selection button in the dsh web composer, with Claude-orange on state and
  neutral grey off state.
- System prompt section injection (`dsh-concise:style`, order 40) with a
  function-valued `text` evaluated per assembly; disabling yields an empty
  string which the renderer drops, so toggling is effective on the next turn.
- Local HTTP API under `/dsh-concise/api`: `GET /state`, `POST /toggle`,
  `POST /set` (loopback only).
- Persistent state file `$DSH_HOME/dsh-concise/state.json` written atomically
  (tmp + rename), surviving restarts.
- Self-anchoring UI placement: portal container inserted right after the model
  seat element, position maintained by a MutationObserver across React
  re-renders and seat rebuilds; falls back to in-slot rendering when the model
  seat cannot be found.
- Multi-instance synchronization via a `dsh-concise:change` custom event plus
  window-focus refetch.
- zh/en locale dictionaries with built-in fallback labels.
- Accessibility: `aria-pressed` toggle semantics and localized tooltips.

[0.7.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.7.0
[0.6.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.6.0
[0.5.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.5.0
[0.4.1]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.4.1
[0.4.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.4.0
[0.3.1]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.3.1
[0.3.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.3.0
[0.2.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.2.0
[0.1.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.1.0
