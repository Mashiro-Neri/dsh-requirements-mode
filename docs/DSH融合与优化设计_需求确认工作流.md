# DSH 融合与优化设计（需求确认工作流落地）

> **状态**：设计已定稿，文件已就位，**尚未安装到 profile**。运行时激活未验证。
> **日期**：2026-09-26
> **宿主版本**：`@deepseek-ai/dsh-desktop-runtime` 0.1.7-rc.2（desktop profile）
> **源码参考**：`<DSH_SOURCE>`（0.1.7-rc.2 全量源码，无 `.git`）
> **运行时参考**：`<DSH_INSTALL>\resources\app.asar`（打包版，本文档中的机制结论多以此为据）

---

## 1. 目标

把《项目需求确认工作流 V2》从一份**纯提示词文档**变成 DSH 里的一等公民：一个可选模式，具备自己的身份、工具面、子 agent 与硬环节，且不依赖模型自觉。

分层目标（用户选定 L0+L1+L2，软约束路线）：

| 层 | 承载物 | 强度 |
|---|---|---|
| L0 常驻策略 | `dsh-persona` 的 prefix（约 2267 字） | 每轮必在场 |
| L1 细化规则 | 4 个 skill（项目/用户级，热重载） | 按需加载 |
| L2 模式 | 一个 out-of-tree bundle 里的 agent preset 声明 | 会话创建时定型 |

---

## 2. 调查得到的硬事实（**这部分是本文档最有价值的部分**）

以下结论全部来自读源码或读打包版 README，**不是推测**。每条都附了依据。

### 2.1 旧格式 `.agent-presets` 已死

`$DSH_HOME/.agent-presets/<id>/`（内含 `preset.yml` + `agent.cordis.yml`）是**历史格式**。官方随包 skill `editing-cordis-compositions` 原文：

> *"Before declaration rows, a user preset was a directory `$DSH_HOME/.agent-presets/<id>/` holding `preset.yml` … and `agent.cordis.yml` … **Nothing reads that directory any more.** To migrate one, create a bundle…"*

**依据**：`@deepseek-ai/dsh-agent-preset/skills/editing-cordis-compositions/SKILL.md`（提取自 `app.asar`）。

**影响**：本机 `~/.dsh/.agent-presets/` 下的 `router-standard`、`anchored-standard`、`router-spec` 三个预设在此版本中不会被加载，也不会出现在模式选择器里。`dsh-agent-preset-registry` 的 README 亦明确："注册表不扫描目录，也不接受 preset 路径。"

### 2.2 preset 的正确创建方式 = 装一个 bundle

声明行由 bundle 的补丁文件承载。最小形态是**两个文件**：

```
<dir>/package.json          { "dsh": { "bundle": { "patch": "./cordis.patch.yml" } } }
<dir>/cordis.patch.yml      - insert: [{ id: preset-<id>, name: '@deepseek-ai/dsh-agent-preset', config: {...} }]
```

安装：`plugin_manager` → `action: install_bundle` → `target` 为**绝对目录路径**。它会自己跑包安装与 bundle 选择，不要用 shell 复现。
**依据**：同上 skill 的 "Create a preset" 一节；`dsh-plugin-manager` 的 `install-spec.ts`（本地路径必须绝对）。

补丁里插件行的 `name` 解析规则：**相对路径**会被锚定为补丁文件旁的 `file://` URL；**裸模块名**（如 `@deepseek-ai/dsh-tool-fs`）从 profile 锚点解析，安装自带包可解析。
**依据**：`packages/boot/app-boot/src/index.ts` 的 `anchorInsertedPluginNames`。

### 2.3 preset 管不了权限

沙箱与审批是**会话级**，归 `permission-presets` 所有；且 preset 不能设置它们。`dsh-tool-pwsh` 的 Config **只接受两个字段**：`enableRunInBackground`、`promoteOnTimeout`——没有 `sandboxMode`。
**依据**：`dsh-tool-pwsh/lib/index.js` 的 `Config = z.object({...})`；`dsh-permission-presets` 的 README。

沙箱模式的解析优先级是 **显式批准 > 会话 `sandbox/mode` 事件 > 部署默认**，因此**会话的 `/permission` 选择压过一切**，preset 层面无法覆盖。

**推论**：想让"讨论阶段只读"具备物理保证，唯一可靠的旋钮是**会话级 `/permission read-only`**。

### 2.4 沙箱只管文件操作

`dsh-sandbox-policy` README 明确：SandboxMode 管控**文件操作**；网络与进程**不在其词汇中**。
**推论**：只读 ≠ 无副作用——`npm install`、`git fetch`、起服务不一定被挡。文件写入会被挡。

### 2.5 沙箱不是虚拟机（同一台机器）

`dsh-sandbox-local` 在 Windows 上解析为 **ACL 受限令牌执行链**——同一台机器、同一个操作系统、同一套已装软件与运行时版本，只是访问范围受限。
**依据**：`dsh-pwsh-sandbox/lib/index.js` 注释："which on Windows resolves to the ACL restricted-token runner chain"。

**唯一显著差异**：read-only 下 pwsh 运行在 **ConstrainedLanguage** 模式，`.NET` 静态调用（`[System.IO.*]::`）、`Add-Type`、COM、反射会以 *"only core types"* 失败。
**依据**：`dsh-tool-pwsh` 生成的工具描述原文。

**推论（重要）**：沙箱里跑测试失败，常常是**语言级别限制造成的假阴性**，而不是方案不可行。必须在报告里区分"事实如此"与"被沙箱挡住"。

### 2.6 `ctx.tools.restrict` 按**工具注册名**匹配，写错会静默失效

`dsh-tool-subagent` 的 `toolFilter`（`allow`/`deny`）最终交给 `ctx.tools.restrict(composition.toolFilter)`，而 `dsh-tools` 的 `admits(name)` 比对的是**工具注册名**：

| 插件包 | 实际注册的工具名 |
|---|---|
| `dsh-tool-fs` | `read`、`write`、`edit`、`read_image` |
| `dsh-tool-fs-search` | `glob`、`grep` |
| `dsh-tool-web` | `web_search`、`web_fetch` |
| `dsh-tool-ask-user` | `ask_user_question` |
| `dsh-tool-skill` | `skill` |
| `dsh-tool-todo` | `todo_write` |

**⚠️ 陷阱**：写 `allow: ['tool-fs', 'tool-fs-search']`（插件行名）**不会报错**，只会把子 agent 变成**没有任何工具的瞎子**。这是本次设计中唯一一个"错了也不报错"的地方。
**依据**：`dsh-subagent/lib/index.js:522`、`dsh-tools/lib/index.js` 的 `admits()`；工具名由各 `lib/index.js` 的 `ctx.tools.register(defineTool({ name: ... }))` 提取。

### 2.7 子 agent 的关键能力

| 能力 | 结论 | 依据 |
|---|---|---|
| `toolFilter` / `persona` | 支持，且**按实例**配置 | `spawn` provider 的 `capabilities` |
| 可继续（`continuable`） | **支持**——`spawn` 实现了 `prepareContinuable()` | `dsh-subagent-spawn-in-process/lib/index.js` |
| 继承父级上下文 | **否**（`inheritsParentContext = false`）→ 每次委派都要自带背景 | 同上 |
| `ask_user_question` | **子 agent 被拒**（`DELEGATED_CALLER`）→ 决策必须留在主 agent；**子 agent 之间也只能靠 `send_message` 对话，不能直接问用户** | `dsh-tool-ask-user` README |
| 后台结果回传 | `one-shot` 前台等待并返回最终文本；`continuable` 返回 `childId`，之后用 `send_message` 派活 | `dsh-tool-subagent` README |
| `send_message` / `list_agents` / `interrupt_agent` | 由 Host 组合的 `dsh-tool-subagent-control` 提供，**全局可用**，preset 无需重复挂载（本机 profile 的 276-280 行已挂） | 本机 `cordis.yml` |

### 2.8 skill 的 token 与经济性

- 目录（**每轮**）：name + **有长度上限的** description，每技能一两行。
- 正文（**仅加载时**）：进入已保留的工具历史。
- 正文编辑**不改变目录 digest**；目录变更以**追加替换目录**的方式生效，不破坏前缀缓存。
- 随包 SKILL.md 保持在 **8192 字符**阈值之下；标准 preset 的工具结果修剪器超过该阈值才会裁剪。

**依据**：`dsh-skill-filesystem` / `dsh-tool-skill` 的 README「模型体验」章节。

### 2.9 【实测踩坑】preset 的四种致命/静默失败

以下全部是**实际运行时踩出来的**，不是推测。共同点：失败后界面只表现为"这个模式不存在"，错误文本**只出现在 设置 →「模式」那张红色卡片**上。

| 症状 | 错误原文 | 根因 | 正确做法 |
|---|---|---|---|
| preset 整体 broken，选择器里看不到 | `service "subagents" has been registered at <SubagentRuntime>`<br>`a subagent provider named "spawn" is already registered` | 在 preset **顶层**挂了提供 service 的行（`dsh-subagent` / `dsh-subagent-spawn-in-process`），而宿主根已注册同名 service 与 provider 名 | 把 provider **与全部消费方**放进同一个 isolate 组：`name: cordis:group` + `group: true` + `isolate: {subagents: true}` + `config: [...]` |
| 同上（同类） | `service "shell" ...` | `dsh-pwsh-sandbox` 在 preset 顶层挂 → 与宿主 `shell` 冲突 | 放进 isolate 组，或不挂 |
| 子 agent 创建即失败 | `tools.restrict() names unknown global tools "pwsh", "bash"; known global tools: ...` | `toolFilter` 写了**本作用域不存在**的工具名（`pwsh` 只存在于标准 preset 的 realm） | `allow` 只写**本作用域已注册**的名字 |
| 子 agent 有工具但"瞎" | 无错误 | `toolFilter` 写了**插件行名**（`tool-fs`）而不是工具注册名（`read`） | 用 `read` / `read_image` / `glob` / `grep` / `web_search` / `web_fetch` / `ask_user_question` / `skill` / `todo_write` |
| 技能全部找不到 | `skill "xxx" is unknown or no longer available` | 只挂了消费方 `tool-skill`，**没挂 provider** `dsh-skill-filesystem`（宿主根那份 `enabled: false`，provider 按 preset 作用域提供） | 每个需要技能的 preset 自挂一份 `dsh-skill-filesystem` |

**两条通用规律（本次最值钱的经验）**：

1. **preset 作用域看不见宿主根的插件行。** 别的 preset 里的工具（如标准 preset 的 `tool-pwsh`）在本 preset 里**不存在**；要什么自己挂。
2. **提供 service 的行不能直接挂 preset 顶层**，必须连同全部消费方放进 `isolate` 组，否则与宿主根撞名、**整份 preset 变 broken**。

**诊断路径（务必记住）**：模式选择器只渲染**健康**的 preset（客户端 `presetOptions()` 里 `presets.filter(p => p.broken === undefined)`）。失败时它静默消失，**唯一能看到错误文本的地方是 设置 →「模式」页红卡上的「加载失败」徽标**（悬停显示原因）。

### 2.10 实测验证结果与残余缺口

**已在本机 desktop profile 上真实跑通**：

| 项 | 结果 |
|---|---|
| preset 挂载健康、出现在模式选择器 | ✅ |
| `subagent_explore` 创建成功 | ✅（修好 `toolFilter` 后） |
| 调查员用 `read`/`glob`/`grep` 完成真实调查 | ✅ 读 profile 文件、核对 bundle 列表，并主动标注"单凭该文件不足以断定运行时生效值" |
| `subagent_review` 创建成功、工具面收窄到只读 | ✅ 自报工具只有 `read`/`glob`/`grep` 等，无 write、无 shell |
| 4 个技能可被 `skill` 工具加载 | ✅（自挂 `dsh-skill-filesystem` 后） |
| 主 agent 工具面：有 `write`/`edit`、**无 shell**、有 `subagent_*`/`send_message` | ✅ |
| **`send_message(agent_id)` 能唤回调查员** | ✅ 关掉 Agent Teams 后实测：`message delivered to agent <childId>` |
| 调查员带回原文证据、主动区分"事实／推断／未能确认" | ✅ 它标为推断的 `cg_mc` 路径疑点，我用 shell 核实为**误报**（`mc.bat` 是目录且含 `.codegraph`）——正是"推断不当结论、由调用方核实"的正确用法 |

**`continuable` 调查员的时序规则（实测，必须写进 persona）**：

1. `subagent_explore` 省略 `run_in_background` → 返回 `started subagent <childId>`。
2. 它的**最终文本不是同步返回的**，而是这一轮**跑完后作为收尾通知异步到达**。
3. **它运行中不可投递**：此时 `send_message` 返回 `Error: subagent "<id>" is unavailable`。这不是故障，等它跑完（收到回报）再发即可，**不要重试**。
4. 因此节奏是 **"派活 → 等回报 → 再派下一条"**（一轮一投递），不是"边跑边 steering"。

**环境前提（重要）**：以上成立的前提是**关掉 `@deepseek-ai/dsh-experimental-agent-team-profile`**。因为 base 宿主平面自带的 `tool-subagent-control`（参数 `agent_id`）被该 bundle override 成了队友版（参数 `target`）。关掉后 base 版本回落生效；代价是失去 `spawn_teammate`、团队任务板与团队面板。

**残余缺口**：

| 缺口 | 原因 | 现状 |
|---|---|---|
| **本 preset 没有 shell** | `dsh-pwsh-sandbox` 提供 `shell` service，顶层挂会撞宿主根；放进 isolate 组的做法**未验证** | `subagent_explore` 只直读文件；persona 要求把"必须跑命令才能得到的事实（进程/端口/版本）"标为待确认并给出建议命令。调用方自己有 shell，可代为核实（如上面 `cg_mc` 那次） |

### 2.10.1 `send_message` 续聊失败：一次误判与真正的根因

**现象**（会话日志原文，非推测）：

```
CALL   subagent_explore :: {...}                       ← 未设 run_in_background
RESULT isError=false :: started subagent 5f127435-…    ← ✅ 确实返回了真实 childId
CALL   send_message :: {"target":"5f127435-…", …}
RESULT isError=true  :: Error: active teammate "5f127435-…" not found   ← ❌ 连真实 id 都不认
```

**我最初的误判**：认定是本机 profile 的 **Agent Teams** bundle（它 `overrides` 了 `tool-subagent-control`）把通用 `send_message` 覆盖成了"只服务队友网格"，据此判定"环境不支持、修不了"，并把调查员与复核者都退回 `one-shot`。

**真正的根因**（分三层，逐层修正后才定准）：

**第一层**：preset 里根本没有本 scope 的 `send_message`。它由 **`dsh-tool-subagent-control`** 注册（`inject = ["tools", "subagents"]`），那一行是**每个 preset 自挂的**（标准 preset 挂了三处）。我的 preset 漏挂了，却让 persona 去调它——与 `skill-filesystem`、`tool-pwsh` 是**同一个错**：preset 作用域看不见别的 preset 的行。

**第二层**：补挂后**仍然失败**——因为我把那两行放进了 `isolate` 组**里面**。**工具是 scope 贡献，不是 service，不需要跟着 service 一起隔离**；塞进独立 realm 后它们没进入会话工具面，模型于是调到了**全局的 Agent Teams `send_message`**（参数 `target`）。正确挂法是**放到 preset 顶层**（与 `subagent-realm` 平级），只把"提供 service 的行 + 其消费方"放进 isolate 组。

**第三层（最后一层）**：即使挂对了位置，**base 的通用控件仍被 Agent Teams override**——因为 `dsh-base` 自带的 `tool-subagent-control` 就是被 `@deepseek-ai/dsh-experimental-agent-team-profile` 覆盖的那一行。所以最终需要**关掉 Agent Teams bundle**，base 版本才回落生效。这也是为什么上面 2.10 的实测结果标注了"环境前提"。

**一眼定性两个同名工具的方法（最有用的一条）**：

| | base 的 `dsh-tool-subagent-control` | Agent Teams 的 `dsh-experimental-tool-agent-team` |
|---|---|---|
| 参数名 | **`agent_id`** | **`target`** |
| 契约 | "你自己的直接 continuable 子级" | "队友成员" |
| 失败措辞 | `subagent "<id>" is unavailable`（时序，跑完即可） | `active teammate "<id>" not found`（调错工具） |

所以看到 `target` + "active teammate" 就能确定**调错了工具**，而不是"环境不支持"。

**教训（三条）**：

1. **控制类工具（`send_message`/`list_agents`/`interrupt_agent`）不是宿主全局提供的**，要按 preset 自挂；判定顺序应是"先查本 scope 有没有这个工具"。
2. **隔离规则只适用于提供 service 的行。** 工具注册是 scope 贡献，放进 isolate 组会导致它不可见——这是把规则过度套用。
3. **不要在证据不足时把根因归给"环境限制"。** 我先后两次误判（先怪 Agent Teams、又漏掉 isolate 的影响），每次都据此改坏本来正确的设计。**低成本定性法**：读那个工具的源码，看它注册的**参数名**与 `inject` 依赖——`agent_id` vs `target` 一眼分清是谁。

### 2.11 其他可复用机制
| 机制 | 用途 |
|---|---|
| `dsh-persona` 的 `complete: true` | 让 preset 的 prefix 成为该系统提示词**唯一**段落 |
| `dsh-persona` 的 `includeRuntimeContext` | 保留沙箱/审批策略等真实约束的运行时快照 |
| `dsh-plan-mode` 的 `exit_plan_mode` | 已有"经评审退出"，可作三段闸门的第二道门 |
| `dsh-commands` 的 `ctx.commands.register()` | 可注册 `/` 命令（作用域可限定到单个 agent） |
| `dsh-fs-observation-policy` | 编辑前必须读过；失效报 `FS_STALE_VERSION`（长文档编辑要注意） |
| skill 根目录 | rank 100 `<project>/.dsh/skills`、200 `<project>/.agents/skills`、400 `<dshHome>/skills`；**只发现一层** |

---

## 3. 落地方案

### 3.1 三层结构

```
bundle（out-of-tree，待安装）
  <DSH_HOME>\dsh-local-bundles\dsh-requirements-mode\
    package.json          dsh.bundle.patch → ./cordis.patch.yml
    cordis.patch.yml      1 条 insert 声明，11 行插件

skills（用户级，rank 400，改文件即热生效）
  <DSH_HOME>\skills\
    requirements-refinement\SKILL.md              阶段 A/B + 真机调查 + 一致性维护   4383 B
    requirements-clarification-checklist\SKILL.md  阶段 C 检查维度表                 2794 B
    requirements-questioning-ledger\SKILL.md       提问方式 + 确认台账               3276 B
    requirements-doc-template\SKILL.md             文档骨架 + 交付前复核 + 三段闸门   6000 B
```

### 3.2 preset 的 11 行插件

| 行 | 包 | 作用 |
|---|---|---|
| `persona` | `dsh-persona` | 工作流常驻策略，`complete: true`、`includeRuntimeContext: true` |
| `tool-fs` | `dsh-tool-fs` | 读 + **写最终文档**（唯一写能力） |
| `tool-fs-search` | `dsh-tool-fs-search` | `glob` / `grep` |
| `tool-web` | `dsh-tool-web` | `web_search` / `web_fetch`（可行性查证） |
| `tool-ask-user` | `dsh-tool-ask-user` | 结构化提问 |
| `tool-skill` | `dsh-tool-skill` | 按需加载 4 个技能 |
| `tool-todo` | `dsh-tool-todo` | 确认台账 |
| `tool-subagent-explore` | `dsh-tool-subagent` | 调查员：`continuable`，有 shell，**无 write/edit** |
| `subagent` | `dsh-subagent` | subagent seam |
| `subagent-spawn` | `dsh-subagent-spawn-in-process` | 进程内 spawn 后端 |
| `tool-subagent-review` | `dsh-tool-subagent` | 复核者：`one-shot`，**无 shell、无写工具** |

**主 agent 没有 shell**——这是本设计的核心物理约束：装依赖、起服务、改环境的能力在工具面上就不存在，不依赖模型自觉。

### 3.3 三段闸门

| 阶段 | 在哪做 | 产物 | 闸门 |
|---|---|---|---|
| 1 需求确认 | 需求确认模式 | 开发文档 | 用户确认方向 |
| 2 计划 | 同项目内 plan 模式 | 经批准的实施方案 | 用户批准计划 |
| 3 实现 | 标准模式新会话（有 shell、可写） | 可运行代码 | 用户提出开发请求 |

设计要点：第 1 段的文档是第 2 段的**输入**；每段之间都有真人闸门，任何一段完成后不自动进入下一段。

### 3.4 两个子 agent 的分工（**故意不对称**）

| | `subagent_explore` | `subagent_review` |
|---|---|---|
| 模式 | `continuable`（**一次创建、反复派活**） | `continuable`（**可对话；但重新复核新草稿必须新建**） |
| shell | 有（`pwsh` / `bash`） | 无 |
| 写文件 | 不能（allow 不含 `write`/`edit`） | 不能 |
| 职责 | 回答"机器是什么样"，只跑只读命令，带回原始输出 | 对抗式证伪草稿，十项逐条检查，给明确结论 |
| 为什么这样 | 共用可省掉每轮重讲背景的上下文开销 | 复用**已看过的同一版草稿**会毁掉对抗性；复用**同一版**做澄清/申辩则正是需要的 |

**双向对话机制（避免"只有主 agent 知道的细节"被漏掉）**：复核者看不到讨论过程，因此它的严重度分了**四档**，多一档 `待澄清`——凡"草稿这么写但看不出用户是否真同意"的地方，它先问而不是直接判阻断。主 agent 用 `send_message` 把依据（用户原话、当时的选择、现场约束）告诉它，它**必须逐条二选一**：撤回（理由成立）或维持（理由不充分，缺的是 X）。

两条防滥用规则，保证申辩不会变成橡皮图章：

- **主 agent 只重复"这是用户要的"而拿不出具体依据 → 该条维持并升级为阻断。**
- **同一条意见最多来回两轮**，之后仍有分歧归入"需用户裁决"，由主 agent 上报用户。
- 复核者评估的是**理由本身**，不是语气；理由成立就明确撤回，不为了结束争论而撤回，也不死守站不住的意见。

流程顺序也随之固定：`草稿 → 复核 → 先申辩（不给用户看）→ 申辩后仍成立的才回报用户 → 修订则新建复核者 → 最多两轮`。这样用户看到的意见都是**经过一轮对质后仍然站得住的**，既少噪音，又不会因为复核者缺上下文而误杀。

---

## 4. 对 V2 的优化项

| V2 的缺口 | 落地方式 | 约束类型 |
|---|---|---|
| 未要求先读后写文档 | `## 权限边界` 明确"确认前不生成任何文件" | 提示词 |
| "已确认项"缺防伪 | `ask_user_question` 的结构化答案（`id`/`selected`/`custom`）作唯一证据；台账必须可溯源；复核者把追溯失败记为**阻断** | 提示词 + 结构 |
| "不进入实现"缺物理约束 | 主 agent 工具面无 shell | **物理** |
| 变更同步靠人肉检查 | 台账带"影响面"字段；`requirements-refinement` 给"改一处查所有引用"的方法 | 提示词 |
| 每轮问题数量失控 | 技能限定 1–3 个、必须带推荐项与 `(Recommended)` | 提示词 |
| 子 agent 不能替用户拍板 | `DELEGATED_CALLER` 机制天然保证；写进两份人格与台账规则 | **物理** |
| 需求确认 → 开发 AI 的交接 | 文档路径固定 `requirements/<项目名>-开发文档.md`；三段闸门串起后续 | 约定 |
| 缺独立审查环节 | 新增 `subagent_review` 硬环节（V2 原本是自证） | 结构 |
| 审查者与产出者信息不对称 | 复核者四档严重度含 `待澄清`；主 agent 用 `send_message` 申辩，复核者必须逐条"撤回/维持"；拿不出依据则升级阻断；同条最多两轮 | 结构 |
| 无法做真机事实核对 | 新增 `subagent_explore`（V2 原本只能靠用户贴输出） | 结构 |
| 模糊词未落地 | 检查维度表含"模糊词落地"横切项 | 提示词 |

---

## 5. 已知代价与折中

1. **persona 常驻成本**：2045 字，每个请求固定付费。已从 3511 字瘦身，代价是阶段细则改为按需加载（模型若跳过技能加载，细节可能漏）。选择理由是：硬约束与流程骨架必须每轮在场，细则可以按需。
2. **`/permission` 是会话级、统一的**：切成 read-only 会同时约束主 agent。所以写最终文档前必须切回可写——这一步需要**人工配合**，persona 已要求主动提醒。
3. **"只读"不是"无副作用"**：沙箱只覆盖文件操作（见 2.4）。网络与进程行为靠调查员人格约束（强约定，非物理）。
4. **skill 根只发现一层**：`<root>/<name>/SKILL.md` 或 `<root>/<name>.md`，嵌套 `**/SKILL.md` 刻意不支持。
5. **旧预设不会自动迁移**：`~/.dsh/.agent-presets/` 下三个预设需按 2.1/2.2 手工迁移（id 取目录名，`plugins` 取自 `agent.cordis.yml`，并逐个核对包名是否已重命名）。

---

## 6. 未验证的运行时假设（安装后必须逐条验证）

| # | 假设 | 验证方法 | 失败会怎样 |
|---|---|---|---|
| A1 | preset 能挂载（11 行插件全部激活） | `plugin_manager` `list_plugins` 查 `preset-requirements` 行的激活状态 | 声明留在花名册带诊断，无法组装会话 |
| A2 | `dsh-subagent` + `dsh-subagent-spawn-in-process` 能与 Host 的组合共存 | 同上，看该行是否报服务冲突/缺失 | 子 agent 不可用 |
| A3 | `subagent_explore` / `subagent_review` 出现在工具列表 | 开新会话看工具面 | 硬环节失效 |
| A4 | `toolFilter` 真的挡住 `write` | 让调查员尝试写一个文件，应被拒 | 只读约束降级为约定 |
| A5 | `continuable` 模式可创建并 `send_message` 派活 | 调一次 `subagent_explore`，再 `send_message` | 需退回 `one-shot` |
| A6 | 4 个技能出现在会话技能目录 | 开新会话看技能目录 | 细则不可用 |
| A8 | `send_message` 能唤回复核者并换回"撤回/维持"结论 | 报告后发一条申辩，看它是否逐条响应 | 双向对话失效，退回单向复核 |
| A7 | ~~preset 能设置只读~~ | **已排除**，见 2.3 | — |

**验收顺序**：装 → 开新会话 → A1/A2/A3 → A4 → A5 → A6 → A8。**任何一项失败都要先修 bundle，不要带着未验证的假设往下走。**

---

## 7. 后续可选升级（L3）

1. **per-agent 物理只读**：在 preset 的 `isolate` 组内挂载 `dsh-sandbox-policy`（`mode: read-only`）+ `dsh-pwsh-sandbox` + `tool-pwsh`，让该 agent 的解析走到自己的实例上。**风险**：`sandboxPolicy.resolve()` 会读会话的 `sandbox/mode` 事件，因此**需要真验证**"会话选了 danger-full-access 时 preset 内是否仍只读"；若否，这个方案没有价值。另外 `dsh-sandbox-local` 已在根 realm 注册，隔离副本能否共存未验证。
2. **协作状态插件化**：仿 `dsh-plan-mode` 做一条 `plan/mode` 式的仅记日志协作状态 + `exit_requirements_mode` 工具 + `/requirements` 命令；再用 `ctx.tools.guard()`（单调同步守卫）在讨论态**硬拒**写调用。`dsh-plan-mode` 的开发备注明确说"未来的协作状态只应在出现两个具体用例后建立共享 seam"——需求确认正是第二个用例。这需要 DSH 源码构建环境（`<DSH_SOURCE>` 可用）。
3. **确认台账结构化**：把台账做成 `outputSchema` 约束的子 agent 产物（`spawn` 支持 `outputSchema`），让"来源必须存在"由 schema 保证而非提示词。

---

## 8. 本机速查

```
bundle 目录   <DSH_HOME>\dsh-local-bundles\dsh-requirements-mode\
skills 目录   <DSH_HOME>\skills\requirements-*\
profile       <DSH_HOME>\profiles\desktop\
  cordis.yml         46793 B，preset 花名册在 601-1238 行（standard/ptc/minimal/cordis）
  cordis.patch.yml   用户补丁层，patchReload: live
  package.json       dsh.profile.bundles 有序列表
DSH 源码      <DSH_SOURCE>\（packages/preset、packages/bundle/web-app）
打包版        <DSH_INSTALL>\resources\app.asar（117 MB，含全部 @deepseek-ai/* 的 README 与 lib）
旧格式预设    <DSH_HOME>\.agent-presets\（router-standard / anchored-standard / router-spec，已失效）
```

**读打包版内容的办法**（shell 无法直接打开 asar）：解析 asar 头（8 字节 pickle + JSON 头），按 `files` 树递归取 `offset`/`size` 切片即可导出任意文件。本次调查就是用它把 `@deepseek-ai/*` 的 README 与 `lib/index.js` 提取出来读的。
