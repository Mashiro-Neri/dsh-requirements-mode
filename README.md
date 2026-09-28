# 需求确认模式 · Requirements Mode

<img src="assets/icon-512.png" width="88" align="right" alt="Requirements Mode icon">

> 给 DSH（DeepSeek Harness）加一个**只讨论、不写代码**的模式：把模糊想法逐步澄清成一份可交付的开发文档，然后**主动停下**，不擅自进入实现。

[![DSH](https://img.shields.io/badge/DSH-0.1.7--rc.2-blue)](https://github.com/deepseek-ai/deepseek-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Type](https://img.shields.io/badge/type-dsh%20bundle-purple)](#)

<br clear="right">

---

## 这是什么

在 DSH 里跟 AI 聊需求，最常出的问题是：**它太急着动手了**。

你说"我想做个桌面待办"，它立刻开始建目录、装依赖、写代码——而你其实只想先把"这东西到底长什么样、每天怎么用"聊清楚。

这个插件在 DSH 里加了一个叫 **「需求确认」** 的模式：

| | 标准模式 | 需求确认模式 |
|---|---|---|
| Shell | ✅ | ❌ **拿掉了**（物理上装不了依赖、起不了服务） |
| 写文件 | ✅ | 只在用户确认后写**一份**开发文档 |
| 默认行为 | 尽快产出代码 | 持续澄清 → 汇总 → 确认 → 出文档 → **停下** |
| 额外环节 | — | 真机调查员 · 对抗式复核 · 三段闸门 |

**它不是一段提示词，是一等公民模式。** 身份、工具面、子 agent 都在会话创建时定型，不靠模型自觉。

## 它解决什么

| 常见毛病 | 这个模式的做法 |
|---|---|
| 把 AI 自己的假设写成"用户确认的需求" | 每条已确认项必须能追溯到一次**结构化的用户答复**，追溯不到的降级为"技术建议" |
| 一次抛一大堆问题 | 每轮只问 1–3 个最影响决策的 |
| 模糊词混过去 | "简单 / 实时 / 好看 / 轻量 / 自动" 必须换成可验收的定义 |
| 改一处、别处自相矛盾 | 台账带"影响面"字段；改一处要扫所有引用 |
| 凭空加用户没提的功能 | 复核者专门查这条，命中即**阻断** |
| 聊完就自己开始写代码 | 文档交付后**停下**，提示你走"计划 → 实现"两道闸门 |

---

## 安装

### 前置

- DSH（DeepSeek Harness）**`0.1.7-rc.2`** 实测通过
- 安装需要 **Full access**，或允许审批提示
- ⚠️ **必须关闭「智能体团队」插件** —— 原因见[环境前提](#环境前提重要)

### 方式一：一句话丢给 DSH（最省事）

**新建一个会话（标准模式即可），把下面这句话直接发给它：**

```
把 https://github.com/Mashiro-Neri/dsh-requirements-mode 作为插件组合包安装到当前 profile，
装完告诉我它装了哪些 preset 和技能。
```

DSH 会自己完成：拉取仓库 → 安装依赖 → 加进 `dsh.profile.bundles` → 热加载补丁。
**装完完全重启一次 DSH。**

### 方式二：gh 一键安装

需要 Node.js ≥ 20、pnpm，以及 DSH 的 `dsh` CLI：

```bash
dsh plugin --profile desktop add github:Mashiro-Neri/dsh-requirements-mode
```

把 `desktop` 换成你自己的 profile 名。

### 方式三：指定仓库（`plugin_manager`）

在 DSH 里让 agent 调用：

```
plugin_manager
  action: install_bundle
  target: github:Mashiro-Neri/dsh-requirements-mode
```

也可以指向打好的 tgz：

```
plugin_manager
  action: install_bundle
  target: <...>/dist/dsh-community-dsh-requirements-mode-1.0.0.tgz
```

### 验证装好了没

**设置 →「模式」**，应能看到一张名为 **「需求确认」** 的卡片。

看不到？**看那张卡是不是红色的「加载失败」** —— 见[排错](#排错)。

---

## 快速上手

1. **新建会话** → 在欢迎页的模式座标上选 **「需求确认」**
   > ⚠️ 会话的模式在**创建时定型，中途改不了**。必须在发第一条消息**之前**选好。
2. 直接说出想法，例如：

   ```
   我想做一个跨端书签同步工具，先聊方案，别写代码。
   ```

3. 它会：复述理解 → 比较可行路径 → 问少量关键问题 → 主动补齐你没想到的细节 → 汇总 → 问你要不要改。
4. 你说"可以整理开发文档"之后，它会**先写草稿 → 交给复核者对抗式审查 → 把意见报给你 → 通过后才落盘**。
5. 文档产出后它**停下**，提示你下一步是进入 plan 模式做实施计划。

想让它成为新会话默认：**设置 →「模式」→ 设为默认**。（日常写代码建议保持标准模式。）

---

## 装了什么

### 模式（一个 agent preset）

| 组件 | 作用 |
|---|---|
| **工作流常驻策略** | 核心原则、权限边界、讨论流程、复核环节、三段闸门（约 3300 字，每轮生效） |
| **只读工具面** | `read` / `glob` / `grep` / `web_search` / `web_fetch` / `ask_user_question` / `skill` / `todo_write` |
| **唯一的写能力** | 写最终开发文档（其余时间不产出任何文件） |
| **❌ 没有 shell** | 装依赖、起服务、改环境的能力在工具面上**不存在** |
| **调查员** `subagent_explore` | 真机事实调查：只直读文件，带回原文证据，严格区分"事实／推断／未能确认" |
| **复核者** `subagent_review` | 对抗式证伪草稿，四档严重度（阻断／重要／次要／**待澄清**），**无 shell、无写权限** |

### 四个技能（随包分发，按需加载）

| 技能 | 何时用 |
|---|---|
| `requirements-refinement` | 阶段 A/B、真机调查、一致性维护 |
| `requirements-clarification-checklist` | 阶段 C：按项目类型挑容易遗漏的检查维度 |
| `requirements-questioning-ledger` | 提问方式、确认台账、阶段 D 汇总 |
| `requirements-doc-template` | 文档骨架、"开发 AI 使用说明"原文、交付前自检 |

---

## 三个设计要点

### 1. 不写代码，是**物理**保证而不是口头承诺

这个模式的主 agent **工具集里没有 shell**。不是"提示它别装依赖"，而是它**根本没有那个工具**。

### 2. 有独立复核者，且刻意与产出者对立

出文档前，草稿会交给一个**独立、只读、被要求证伪**的子 agent：

- 它**看不到你的对话**，所以拿不准的会列成"待澄清"而不是瞎判
- 它的意见必须给"位置 + 问题 + 判据"
- 它的工具面被收窄到只读：**读得到，写不了，跑不了命令**
- **它不能替你决策** —— 发现"这该用户定"只能写进报告，由主 agent 转达

### 3. 三段闸门，每段都要你点头

```
① 需求确认（本模式）    →  开发文档           →  你确认方向
② 计划（plan 模式）     →  经批准的实施方案   →  你批准计划
③ 实现（标准模式会话）  →  可运行的代码       →  你提出开发请求
```

任何一段完成后都**不会自动进入下一段**。

---

## 环境前提（重要）

**必须关闭「智能体团队」插件**（`@deepseek-ai/dsh-experimental-agent-team-profile`）。

**为什么**：本模式依赖 `send_message` 的参数是 **`agent_id`**（DSH 自带的通用子 agent 控件）。
而「智能体团队」会把这个控件**覆盖成队友版**（参数 `target`），导致调查员和复核者**无法续聊**——只能一问一答各起一个新 agent。

**怎么做**：**设置 → 插件 → 关闭「智能体团队」→ 完全重启 DSH**。

- **代价**：失去 `spawn_teammate`、团队任务板、团队面板。
- **随时可恢复**：打开那个开关并重启即可。
- **怎么确认踩到了**：若 `send_message` 参数是 `target`、报错含 `active teammate "<id>" not found`，就是被覆盖了。

---

## 已知限制

| 限制 | 说明 |
|---|---|
| **模式内没有 shell** | 刻意的取舍（见上）。需要"本机装了哪个版本""某端口在不在"这类**必须跑命令**的事实时，调查员会如实标注"未能确认"并给出**建议命令**，由你代跑后贴回 |
| **子 agent 看不到你的对话** | 每次派活都要自带背景；也因此它不会替你脑补上下文 |
| **`send_message` 有投递时序** | 调查员**正在跑时不可投递**，会返回 `subagent "<id>" is unavailable`——这不是故障，等它这一轮结束再发。节奏是"派活 → 等回报 → 再派一条" |
| **策略常驻是有成本的** | 约 3300 字，每个请求都付费。取舍理由：硬约束与流程骨架必须每轮在场，细则才按需加载 |

---

## 排错

### 模式选择器里没有「需求确认」

**模式选择器只显示"健康"的 preset —— 挂载失败时它会静默消失。**

**去 设置 →「模式」页看那张卡片**：红色的「加载失败」徽标，鼠标悬停即显示真实原因。
**这是唯一能看到错误文本的地方。**

常见原因：

| 错误原文 | 原因 |
|---|---|
| `service "subagents" has been registered at <SubagentRuntime>` | 提供 service 的行挂在了 preset 顶层，与宿主根撞名 |
| `tools.restrict() names unknown global tools "..."` | 子 agent 的工具过滤写了**本作用域不存在**的工具名 |
| `skill "xxx" is unknown or no longer available` | 缺 `skill-filesystem` provider |
| `active teammate "<id>" not found` | 调到了「智能体团队」的 `send_message`（参数 `target`）→ 关掉它 |

### 调查员或复核者行为异常

先确认会话确实是**「需求确认」模式**（座标显示），再看它手上的 `send_message` 参数是
`agent_id`（正确）还是 `target`（被覆盖了）。

---

## 卸载

```
plugin_manager
  action: remove_bundle
  target: @dsh-community/dsh-requirements-mode
```

四个技能随包移除，不用手工清理。

---

## 目录结构

```
.
├── package.json            声明 dsh.bundle.patch
├── cordis.patch.yml        唯一补丁层：一条 insert，声明 preset「需求确认」
├── skills/                 4 个技能，随包分发、自动发现
│   ├── requirements-refinement/
│   ├── requirements-clarification-checklist/
│   ├── requirements-questioning-ledger/
│   └── requirements-doc-template/
├── scripts/
│   └── build-package.ps1   打成 dist/*.tgz + SHA256
├── assets/
│   ├── icon.svg            原创图标（MIT，随本仓库授权）
│   └── icon-512.png        同上，512×512
└── LICENSE
```

> 图标为原创作品，随本仓库以 MIT 授权，不含任何第三方素材。

## 开发与打包

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-package.ps1
```

产出 `dist/<name>-<version>.tgz` 与同名 `.sha256`。

脚本保持 **ASCII-only**：Windows PowerShell 5.1 会按系统代码页读取无 BOM 文件，中文会被读坏。

**改动如何生效**：preset 与技能的**目录结构**改动需要**重启 DSH**；技能正文是热读取的。
验证方式：新建会话，看模式座标与工具列表。

## 设计依据

本插件在 DSH 上的机制事实（preset 作用域、`isolate` 规则、工具名匹配、技能发现、
两套同名 `send_message` 的区别）与踩过的坑，记录在
[DSH融合与优化设计_需求确认工作流.md](docs/DSH融合与优化设计_需求确认工作流.md)。

## License

[MIT](LICENSE)
