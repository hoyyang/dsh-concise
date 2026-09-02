# dsh-concise

![banner](assets/banner.png)

把 Claude Code 内置的 **Concise 输出风格** 带进 DeepSeek Harness（dsh）：composer 模型选择按钮右侧一键开关，开启后每一轮回复都**结果先行、少废话**——而调查、验证、双查的工作深浅完全不变。

[**English**](README.en.md) · [Releases](https://github.com/hoyyang/dsh-concise/releases) · [更新日志](CHANGELOG.md)

<p align="center">
  <img alt="dsh compatibility" src="https://img.shields.io/badge/dsh-0.1.0--rc.8%2B-blue">
  <img alt="release" src="https://img.shields.io/github/v/release/hoyyang/dsh-concise">
  <img alt="license" src="https://img.shields.io/github/license/hoyyang/dsh-concise">
  <img alt="stars" src="https://img.shields.io/github/stars/hoyyang/dsh-concise?style=flat">
</p>

## 安装

```sh
dsh plugin add hoyyang/dsh-concise
```

**零配置，开箱即用**：不需要任何 API Key、账号或设置项，装完刷新 Web 界面即可看到开关按钮。要求 dsh web 0.1.0-rc.8 或更新版本（0.1.0-rc.8 实测通过）。

也可以从 Release 手动安装：

```sh
dsh plugin add https://github.com/hoyyang/dsh-concise/releases/latest/download/dsh-concise-0.1.0.tgz
```

## 功能一览

- **一键开关**：composer 工具行模型选择按钮右侧的 `● Concise 开/关` 按钮，单击即切换
- **`/concise` 命令**：slash 菜单与 CLI 会话均可 `/concise`（切换）、`/concise on|off`（显式设置）、`/concise status`（查状态与风格来源）——对齐 Claude Code 的 `/output-style`
- **自定义风格**：把任意文本放进 `~/.dsh/dsh-concise/style.md` 即可整体覆盖内置风格文本（改完保存，下一轮组装即生效）——对齐 Claude Code 的 `/output-style:new`
- **Claude 同款风格**：完整移植 Claude Code 内置 "Concise" output style 的行为定义（结果先行、跳过开场白与旁白、不重复收尾）
- **工作深浅不变**：只约束表达方式——调查、验证、多角度审查照旧，绝不因简洁而牺牲严谨
- **下一轮即生效**：通过系统提示词 section 动态注入，切换后无需重开会话、无需重启
- **按会话独立生效**：开关只影响当前会话的新回复，会话之间互不干扰（新会话默认关闭，可用配置 `defaultEnabled` 调整）
- **跨重启持久**：开关状态原子写入 `~/.dsh/dsh-concise/state.json`，重启后保持
- **状态自动同步**：按钮以 15s 轻量轮询（仅可见标签页）+ focus/visibility 重取，`/concise`、API、其它标签页的改动 ≤15s 自动跟上，无需刷新
- **可视化状态**：开启态 Claude 橙描边 + 实心圆点 + 「开」，关闭态中性灰 + 空心点，一眼可辨
- **无障碍友好**：`aria-pressed` 开关语义 + 中英双语 tooltip 说明
- **多标签页同步**：任意一个窗口切换后，同页其它开关实例经自定义事件即时同步
- **UI 精准落位**：自动锚定模型选择按钮紧右侧（官方 right 槽实际渲染在模型按钮左侧，本插件做了位置修正）
- **优雅降级**：找不到模型按钮的异常布局下自动退化为原位渲染，功能不丢
- **卸载即净**：提示词 section、HTTP 路由、host 命令、样式表全部随插件卸载移除，无残留
- **本地化**：界面文案跟随 dsh 语言设置，内置中英双语兜底

## 用法介绍

### 1. 开关在哪

打开 dsh Web 界面，输入框下方工具行：**模型选择按钮（如 `GLM-5.3 Flash`）的右侧**就是 Concise 开关，再往右是上下文用量与发送按钮。

![composer 上的 Concise 开关（开启态）](assets/shot-hero-composer-zh.png)

### 2. 点一下就切换

单击开关：灰色空心点（关）⇄ Claude 橙实心点（开）。按钮文案实时显示 `Concise 开` / `Concise 关`：

![开启态：会话视图](assets/shot-composer-on-zh.png)

![关闭态](assets/shot-composer-off-zh.png)

### 3. 开启后回复长这样

以「用一句话说明什么是 HTTP 302」为例，**开启 Concise 后的真实回复**（无开场白，第一句即答案）：

> HTTP 302 是一种重定向状态码，表示请求的资源临时移动到了 Location 头指定的 URL，客户端应使用新地址重新发起请求，且原 URL 仍应继续使用（与 301 永久重定向不同，搜索引擎不转移权重）。

再如「用两句话解释什么是数据库索引，以及它的代价」：

> 数据库索引是一种以额外数据结构（如 B+ 树）存储的"键 → 行位置"映射，让查询无需全表扫描即可快速定位数据，类似书的目录。代价是额外存储空间，且每次写入（增删改）都要同步维护索引结构，拖慢写入速度。

![开启态：真实回复效果](assets/shot-reply-concise-zh.png)

关闭后，模型恢复其自然风格（短问答上差别不大，任务类、解释类、报告类输出上差异显著）。

### 4. 实际注入的提示词（原文）

开启后，以下文本会作为系统提示词 section 注入每一轮模型请求（`order 40`，位于人格 section 之后）：

```text
Concise output style (active): lead with the result. Put the answer, the decision, or the finished artifact in the first sentence or two; explanation follows only as needed.
- Skip preamble and narration: no "Sure", "Great question", "Let me...", "I'll now..." — never announce what you are about to do; just do it and report what changed.
- Skip filler closers: no recap of what you just did, no "In summary" restating the response, no boilerplate apologies or hedges.
- Keep every load-bearing detail: constraints, risks, exact commands, file paths, and next actions are content, not filler — compress wording, never omit substance.
- Prefer structure over prose when it shortens reading: short paragraphs, tight lists, verbatim code and paths.
- Thoroughness of the work is unchanged: investigate, verify, and double-check exactly as you otherwise would; only the reporting is compressed.
- When you made a choice, state it with a one-line reason; surface alternatives only when they are viable and materially different.
```

### 5. 斜杠命令：`/concise`

输入 `/concise` 即可在 slash 菜单里看到命令（CLI 会话里同样可用），四种用法：

```text
/concise          # 切换（开 ⇄ 关）
/concise on       # 显式开启
/concise off      # 显式关闭
/concise status   # 查看状态与风格来源（built-in 内置 / custom 自定义）
```

执行后命令反馈会直接显示结果，例如：

> Concise output style ENABLED — replies lead with results and skip preamble/narration. Effective on the next turn.

### 6. 自定义风格文本（覆盖内置）

想要自己的风格？把文本放进 `~/.dsh/dsh-concise/style.md`，非空即整体覆盖内置风格；删除该文件即恢复内置。修改保存后下一轮模型组装即生效（按 mtime 缓存，无需重载）。`/concise status` 会显示当前来源（custom + 文件路径）。

实测示例——style.md 内容为「Answer in one short sentence, then stop. No lists, no elaboration.」时，问「什么是 REST API」的真实回复：

> REST API 是一种基于 HTTP 协议、用 GET/POST/PUT/DELETE 等标准方法对 URL 表示的资源进行无状态增删改查的网络接口规范。

恰好一句、无列表、无展开。

### 7. 也可以用 API 直接控制（脚本/自动化友好）

```sh
# 查询当前状态
curl http://127.0.0.1:3080/dsh-concise/api/state
# → {"enabled":false}

# 切换
curl -X POST http://127.0.0.1:3080/dsh-concise/api/toggle
# → {"enabled":true}

# 显式设置（幂等）
curl -X POST -H 'content-type: application/json' \
  -d '{"enabled":true}' http://127.0.0.1:3080/dsh-concise/api/set
# → {"enabled":true}
```

状态落盘内容：

```json
{
  "enabled": true
}
```

### 8. 怎么确认它生效了

开着开关随便问一个解释类问题：答案会**直接以结论开头**，没有"好的，让我来解释一下"式开场白，也没有结尾"综上所述"式复述。会话日志（Session log）的上下文视图里也能看到注入的 style section。

## 适用场景

- **日常问答 / 学习总结**：概念解释、术语速查，直接要结论
- **代码评审意见**：先给判定与修复建议，再给理由
- **Bug 分析汇报**：根因一句话先行，证据链后置
- **周报 / 日报生成**：成果先行，过程压缩成列表
- **方案与架构讨论**：先给决策与一句话理由，备选方案只在有实质差异时提及
- **命令行 / 运维协作**：命令与路径原样保留，解释压到最短
- **多轮长会话**：累积上下文时省掉每轮的寒暄与复述 token
- **工作区隔离验证**：给正在跑别的任务的会话开 Concise，不影响其它会话的输出风格
- **给别的模型当风格基线**：配合模型切换按钮使用，任何模型都套同一输出风格
- **自动化流水线**：用 `/toggle`、`/set` API 让脚本按阶段切换输出风格（如生成阶段简洁、评审阶段自然）
- **演示与教学录制**：录屏时回复紧凑，画面信息密度更高

## 工作原理

![架构图](assets/architecture-zh.png)

| 层 | 机制 |
| --- | --- |
| 提示词注入 | `systemPrompt.section({ name: 'dsh-concise:style', order: 40 })`，text 为函数、每次模型组装按 `context.agent.session.id` 取当前会话开关求值；关闭时返回空串，渲染层自动丢弃该 section |
| host 命令 | `commands.register({ name: 'concise' })`：`/concise [on\|off\|status]`，作用于当前会话，slash 菜单自动收录，CLI 会话同样可执行 |
| 自定义风格 | `$DSH_HOME/dsh-concise/style.md` 非空时覆盖内置文本，mtime 缓存按次求值，改完即生效 |
| 开关 API | `webServer.register` 前缀路由 `/dsh-concise/api`：`GET /state`、`POST /toggle`、`POST /set`，带 `sessionId` 操作该会话，不带则操作新会话默认值（仅本机回环） |
| 会话级状态 | `$DSH_HOME/dsh-concise/state.json`：`default` + 每会话覆盖（500 条 LRU 淘汰），tmp + rename 原子写 |
| UI 落位 | client 模块注册 `conversation.input.right` 槽作锚点，把按钮 portal 到模型 seat 紧右侧，`MutationObserver` 维持相对位置；React 重渲染/seat 重建后自动对位 |
| 状态同步 | toggle 后按会话广播 `dsh-concise:change` 自定义事件；15s 轻量轮询（仅可见标签页）+ focus/visibility 重取，覆盖命令行/API/其它会话入口的状态变更 |

### 设计细节

- **为什么不用官方 right 槽直接放按钮？** 实测官方 `conversation.input.right` 列表槽渲染在模型按钮**左侧**（与其文档描述相反）。本插件以槽位条目为自定位锚点，将 portal 容器插入模型 seat 的紧右侧，并保持会话切换/重渲染后的位置正确。
- **为什么 text 用函数而不是注册/注销 section？** 函数式 text 让"开关"只是求值结果的变化，不触碰 slot 注册表，避免与其它插件的注册时序竞争。
- **权限模型**：API 只绑定本机回环；提示词注入不触碰任何工具 schema，不影响会话权限模式。

## 可靠性与验收

以下验收项在 dsh 0.1.0-rc.8 实机全部通过（记录于仓库验收文档）：

- API 矩阵：`/state`、`/toggle`、`/set`、未知路径 404，输入输出全部断言通过
- 端到端提示词验证：开启后新会话请求的 system prompt 实测携带 `Concise output style (active)`（会话日志逐字核验）；关闭后同会话下一轮请求 0 命中
- 自定义风格端到端：style.md 写入后请求实测携带自定义文本且内置文本 0 命中（完全替换）；删除后恢复内置；回复实测遵循自定义指令（恰合一句、无列表）
- `/concise` 命令矩阵：toggle / on / off / status 四路径实测通过，slash 菜单正确收录与执行，status 输出含状态与风格来源
- 回复风格实测：解释类问答开启后直接以结论开头，无开场白、无收尾复述
- UI 落位断言：composer 工具行 DOM 顺序为 `[模型选择][Concise][上下文][发送]`
- 交互断言：单击翻转状态、`aria-pressed` 同步、按钮文案与状态一致
- 跨入口同步断言：API 翻转后按钮 ≤15s 自动跟上（轮询实测），focus/visibility 重取生效
- 持久化断言：切换后 `state.json` 即时落盘，页面刷新后状态一致
- 热重载验证：`lib/client.js` 热重载后 fiber 重建、UI 即时更新
- 卸载即净验证：卸载后 entry / registry / junction / client 模块表全部移除，提示词 section 消失
- 注入器回归：宿主注入器自检 8/8 PASS，确认无连带破坏
- 稳定性验证：全流程浏览器 console 0 错误 0 警告
- 优雅降级：模型 seat 不可寻时自动退化为 right 槽原位渲染；locale 服务缺失时内置文案兜底
- 并发安全：状态写采用 tmp+rename 原子替换，同页多实例经事件同步不串状态

## 常见问题

**开了之后复杂任务的回答会变得敷衍吗？**
不会。提示词明确约束"工作深浅不变"（investigate、verify、double-check 照旧），只压缩表达——该查证的照常查证，该给出的命令/路径/风险一字不少。

**和直接在 AGENTS.md 里写"请简洁回复"有什么区别？**
一是开关粒度：随时一键切换、只作用于当前会话，不用改文件、不用重载；二是作用层级：本插件注入的是系统提示词 section，优先级和稳定性高于项目级指令，且不会污染你的项目配置；三是模型无关：任何模型都套同一输出风格。

**开关是全局的还是按会话的？**
**按会话。** 每个会话独立记忆自己的开关状态，互不影响；新会话默认关闭（可用插件配置 `defaultEnabled: true` 让新会话默认开启）。切换后当前会话的下一轮回复即生效，其它会话不受影响。

**支持暗色主题吗？**
支持。样式全部使用 dsh 的 `--dsw-alias-*` 设计令牌与少量半透明品牌色，明暗主题下均可读。

**会显著增加 token 消耗吗？**
注入文本约 210 token，且作为系统提示词一部分参与前缀缓存；相对它省下的开场白/复述 token，长会话下通常是净节省。

## 本地构建

```sh
git clone https://github.com/hoyyang/dsh-concise.git
cd dsh-concise
npm run build        # tsc 编译 host + tsdown 打包 client + npm pack
npm run typecheck    # 双 tsconfig 类型检查
```

目录结构：

```text
src/index.ts         host：提示词 section + HTTP API + 持久化
src/client/index.ts  client：槽位锚点 + portal 落位 + 开关按钮
scripts/build.sh     自包含构建脚本（pnpm/npm 均可）
assets/              README 截图与图示
```

## 许可证

[MIT](LICENSE)
