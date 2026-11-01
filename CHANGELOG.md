# 更新日志

版本号遵循语义化版本：破坏性变更升主版本，新增能力升次版本，修复升修订号。

每次发布同时打 Git tag（`vX.Y.Z`）并在 GitHub 生成一个 Release，正文取自本文件对应的版本段落。

## [2.2.0] — 2026-11-01

### 新增

- **大型项目路线**：九阶段（意图 → 现实核查 → 概念定义 → 不变量 → 深度推翻与八视角红队 → 状态语义 → 拆分 → 决策冻结 → 验收），随包规划模板 `playbooks/large-project-planning.md`。每一步有产物和闸门，红队有反方案台账与收敛标准。
- **规模分流**：项目跨多系统/多角色、重点在复用旧系统、或返工成本高时，会询问是否改走大路线；默认走常规，用户犹豫按常规。
- **大项目交付**：17 节规划文档 + 反方案台账 + 决策台账 + **验收目录**（流程、计划、证据卡、实现契约）+ 风险清单，打成 zip 并附 SHA256。
- **验收工作流** `acceptance/`：`README.md` 写流程、判定与禁止事项，`ACCEPTANCE_PLAN.md` 是可填模板。验收矩阵覆盖正常/空态/加载/失败/权限/超时/无人在场/未知/断网/重启/跨版本/性能/缓存/审计；`verified` 只能由独立验证者写。
- 常规路线**默认一份文档**，不预设份数；内容确实写不下时，模型自己拆第二份（优先验收计划）。

### 变更

- persona 增加「规模分流」一节，交付流程区分两种产物（常规：md 文件；大项目：目录 + zip）。
- 技能 7 → 8；README 中英双语同步；目录结构增加 `playbooks/` 与 `acceptance/`。

## [2.1.0] — 2026-10-31

适配 DSH 0.2.1-rc.5。这一版把"需求确认"和"实现交付"连了起来。

### 新增

- **随包的实现契约**（`contract/`，约 45 KB）：风险分级 L0–L3、六道 Gate、证据卡、独立审查。写开发文档前会询问是否把它复制到项目根 `ai-contract/`，并可选地往 `AGENTS.md` 追加一节入口，让之后任何 AI 进项目都先读它。
- **子 agent 模型可选**：宿主配置了子 agent 模型策略时，派活可指定 `provider` / `model` / `reasoning_effort`，复核这种活可以用便宜模型跑。
- **上下文压缩**：补上压缩、`/compact` 命令和工具结果修剪。之前这个模式不会压缩，长讨论会一路涨到装不下。
- **项目指令加载**：补上 `agent-instructions`，需求确认会话现在能读到项目根到当前目录的 `AGENTS.md` / `CLAUDE.md`。
- **时间上下文**：补上 `time-context`，文档里的日期和时效判断不再靠猜。

### 变更

- **智能体团队不再需要关闭**。DSH 0.2.1 起，团队插件改为禁用基座那四行、插入自己的团队工具；而 preset 作用域内的工具注册会覆盖全局同名工具，两套可以共存。`agent_id` 是本模式的 `send_message`，`target` 是团队版。团队工具在本模式里仍然用不了（发给队友会失败），委派仍走调查员和复核者。
- 版本要求提高为 **DSH ≥ 0.2.1-rc.2**，`package.json` 增加 `engines.dsh`。
- `package.json` 补上 `repository` / `homepage` / `bugs`，修好插件面板安装时的来源识别。

### 修复

- **技能目录解析**：`customSkillDirs` 原本只认规范包名，而本地 profile 装的是 `@local/...` 别名，导致包内技能一个都没加载（会话里看到的是 `~/.dsh/skills` 的旧副本）。现在按候选名依次解析。
- **花名册补丁**：DSH 的 preset 注册表没有"隐藏"概念，两个子级 preset 会像普通模式一样出现在选择器里。新增 `plugin/hide-internal-presets.js`，只包装 Web 花名册方法，注册表本身不动。

### 文档

- 中文 README 重写为散文结构，英文 README 同步。
- 新增本更新日志。

## [2.0.0] — 2026-10-17

适配 DSH 0.2.1 的 `agentPreset` 模型。**破坏性**：0.2.0 及更早的 DSH 装不上。

### 新增

- 三个 agent preset：模式本体 `requirements`，以及两个子级 preset `requirements-explore` / `requirements-review`。
- 七个技能：讨论、问题清单、提问台账、文档骨架、交付清单、复核清单、子 agent 协议。
- `scripts/check-composition.cjs`：重启前检查 preset 引用、已删除字段、技能目录与资产。

### 变更

- 子 agent 的人格与工具面从委派工具配置搬到独立 preset，用 `agentPreset` 指过去（`persona` / `toolFilter` / `backgroundMode` / `enableRunInBackground` 已被 DSH 删除）。
- 不再自己挂子 agent 运行时和 shell 执行器，改用宿主平面提供的实现。
- 委派调用改为立即返回 `started subagent <childId>`，结果作为完成通知异步到达。

### 修复

- 子级 preset 从模式选择器泄漏（花名册补丁）。
- 技能目录解析依赖规范包名，别名安装时失败。

## [1.0.0] — 2026-10-04

### 新增

- 两个子 agent 放开全套权限（含 shell 与 write/edit）。
- 子 agent 协议从 persona 拆成技能，persona 瘦身到约 2800 字。
- 复核轮数上限从 2 提到 4。

### 修复

- `bash` 不再无条件写进工具白名单（Windows 上没有这个工具）。
- shell 执行器改放进 isolate 组，避免与宿主同名服务冲突。
- 移除工具白名单里的 MCP 资源工具名（DSH 升级后子 agent 创建失败）。

## [0.1.0] — 2026-09-28

首个可用版本：一个只讨论、不写代码的 agent preset，含常驻工作流与技能，结束时产出一份交给其他 AI 的开发文档。
