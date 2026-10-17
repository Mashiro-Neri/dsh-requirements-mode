# 需求确认模式

<img src="assets/icon-512.png" width="88" align="right" alt="需求确认模式图标">

[English](README.md) · **中文**

给 DSH（DeepSeek Harness）加一个只讨论、不写代码的模式。

<br clear="right">

## 为什么写这个

平时用 AI 聊需求，最常见的毛病是它太急着动手。你说"我想做个桌面待办"，它转头就去建目录、装依赖、写代码，而你其实只想先把这东西到底长什么样、每天怎么用聊清楚。

这个模式就是把那一步单独摘出来：先聊透，再落成一份文档，然后停下。

说一下出处：需求确认这套流程不是我想出来的，是参考 **Oh My OpenCode** 插件的需求确认模式做的。我觉得那个思路对，就把它搬到了 DSH 上，并根据 DSH 能提供的东西做了些调整。

## 它做什么

普通模式下，Agent 有完整的工具集，默认行为是尽快交付可运行的东西。

选了这个模式之后：

- 行为从"尽快给代码"变成"先问清楚，再汇总，等你确认，然后写文档"
- 讨论期间不落任何文件。整场对话只在最后产出一份开发文档
- 多两个环节：一个负责实地调查的子 Agent，一个负责挑毛病的子 Agent

**但工具集其实没有被削减**，这点得说清楚——这个 README 早先的版本写的是"没有 shell"，那是错的。DSH 把 shell 工具挂在宿主平面上，`pwsh` 本来就在，preset 并没有拿走它。真正在守边界的是工作流规则：你没确认之前不落文件、有副作用的命令一律不跑、需要跑就交给你。

所以"它不写代码"是**它遵守的规则**，不是**它没有的能力**。想要结构上的保证，就把会话切成只读（`/permission read-only`），由文件沙箱来挡。

它不是一个提示词片段，而是一个完整的模式。身份、工具集、子 Agent 都在会话创建时定好，不依赖模型每次自觉。

## 针对 DSH 深度定制

这不是一段能搬去别处的提示词。它吃的是 DSH 的内部机制，很多东西换个工具就不成立了。

- **整个模式是一个真正的 agent preset**，由组合包的补丁（`cordis.patch.yml`）声明。身份、工具集、子 Agent 都在会话创建时组装好，不是运行时临时挂上去的。
- **两个子 Agent 各自是一个 agent preset。** 从 DSH 0.2.1 起，`dsh-tool-subagent` 不再接受 `persona` 和 `toolFilter`，子 Agent 的人格与工具面必须写成独立 preset，再用 `agentPreset` 指过去。所以这个包一共三个 preset：模式本体，加上 `requirements-explore` 和 `requirements-review`。
- **宿主已经提供的东西不再自己挂。** shell 执行器和子 Agent 运行时都在宿主平面上；在 preset 里再挂一份会和宿主的服务撞名，整份 preset 坏掉。所以这里只挂工具，不挂执行器和运行时。
- **七个技能随包分发**，通过 `skill-filesystem` 的 `customSkillDirs` 发现，路径在加载时从本包位置解析出来——所以装一个包就够了，不用另外往系统目录里放技能。

上面每一条都对应 DSH 平台上的一个具体能力，每一条当时都费了不少功夫。走过的弯路都留在提交历史里；`scripts/check-composition.cjs` 之所以存在，是因为这些错误**全都只在重启后才现形**，表现为模式从选择器里悄悄消失。

## 安装

需要 DSH（DeepSeek Harness）。安装时要 Full access 权限，或者允许审批。

**版本：** 在 **0.2.1-rc.2** 上测试通过。**0.2.0 及更早版本装不上**——那些版本仍要求把 `persona` 写在委派工具里，而 0.2.1 恰好把这个字段删了。由于宿主平面提供 shell，会话里会有 `pwsh`（非 Windows 上是 `bash`）。

以后再升级 DSH 又把它撞坏时，报错会以 `persona is no longer supported` 或 `service "..." has been registered` 出现在模式卡片上。先跑 `node scripts/check-composition.cjs`，这两类错它都能在重启前拦住。

另外：**要先关掉「智能体团队」插件**，原因写在下面「注意事项」里。

### 让 DSH 自己装

新开一个会话（标准模式就行），把这段话发给它：

```
把 https://github.com/Mashiro-Neri/dsh-requirements-mode 作为插件组合包安装到当前 profile，
装完告诉我它装了哪些 preset 和技能。
```

装完完全重启一次 DSH。

### 命令行装

```bash
dsh plugin --profile desktop add github:Mashiro-Neri/dsh-requirements-mode
```

`desktop` 换成你自己的 profile 名。

### 手动指定

在 DSH 里让它调用：

```
plugin_manager
  action: install_bundle
  target: github:Mashiro-Neri/dsh-requirements-mode
```

### 装好之后怎么确认

打开 设置 →「模式」，应该能看到一张叫「需求确认」的卡片。

如果没看到，看那张卡是不是红色的"加载失败"，怎么查写在「遇到问题」里。

## 怎么用

新建会话，在欢迎页的模式选择那里选「需求确认」。

注意这一步必须在发第一条消息之前做完，会话的模式是创建时确定的，中途改不了。

然后正常说你的想法就行，比如：

```
我想做一个跨端书签同步工具，先聊方案，别写代码。
```

接下来它会复述一遍对你的理解，比较几种做法的可行性，问几个关键问题（一次不会问太多），把你可能没考虑到的细节补上，最后汇总一遍问你要不要改。

等你说"可以整理开发文档"之后，它会先写个草稿，交给另一个 Agent 挑毛病，把意见报给你，改到没问题了才写文件。

文档写完它就停下了，会提醒你下一步是进 plan 模式做实施方案。

想让它变成新会话的默认模式，在 设置 →「模式」里设成默认。不过如果平时主要是写代码，建议还是留在标准模式。

## 装了些什么

三个 agent preset：

- **`requirements`**：模式本体。常驻的工作流说明（核心原则、权限边界、讨论流程、复核环节、三段闸门）、平常那套工具、七个技能，以及两个委派工具。
- **`requirements-explore`**：调查员的人格与工具面（文件、搜索、联网、shell）。
- **`requirements-review`**：复核者的人格与工具面（同样这一套）。

后两个是内部零件，不是拿来开聊的模式；它们会出现在模式列表里，因为 preset 就是 preset。别选它们。

模式本身不挂子 Agent 运行时，也不挂 shell 执行器——宿主平面已经提供这两样，再挂一份会和它撞名。

七个技能，按阶段需要才加载：

- `requirements-refinement`：讨论前期怎么比较方案、怎么实地调查、改了一处怎么保持文档一致
- `requirements-clarification-checklist`：按项目类型列出容易漏掉的问题
- `requirements-questioning-ledger`：怎么提问、怎么记录"已经确认过什么"
- `requirements-doc-template`：开发文档的八节骨架与开头固定段落
- `requirements-delivery-checklist`：交付前的自检清单、落盘位置与三段闸门
- `requirements-review-rubric`：复核者的十项检查清单
- `requirements-subagent-protocol`：怎么派活和续聊两个子 Agent，以及每种报错到底是什么意思

这个拆分是刻意的：常驻说明只保留原则和流程骨架，凡是机械性的东西都放进技能，真正用到时才加载。复核者的人格也不例外——它现在只留"证伪、给判据、四档严重度"，十项清单在 `requirements-review-rubric` 里按需加载。

## 两个子 Agent

每个角色就是一个 preset，工具面也因此天然分开——调查员和复核者只是插件列表不同。

**调查员**可以自己跑只读命令（查版本、进程、端口、环境、git 状态），write / edit 作为备用。它的规矩是把原始证据带回来——读了哪个文件、跑了哪条命令、原始输出是什么——并且把"亲眼看到的"和"自己的推断"分开写。

**复核者**读草稿，专门找"看着像已确认、其实是推测"的地方。它看不到你和主 Agent 的对话，所以拿不准的列成"待澄清"而不是瞎判；也不能替你做决定，这类事写进报告让主 Agent 转达。

两个都拿到了完整工具（含 shell 和 write / edit），所以约束它们"只查不改"的是人格设定。要更强的保证就用 `/permission read-only`。

调用只返回 `started subagent <childId>`，不等待；结果稍后作为完成通知到达，`send_message(agent_id: …)` 可以继续同一个子 Agent。主 Agent 觉得某条意见不对就解释理由，复核者要么明确撤回，要么说明缺哪一环。同一条最多来回两轮。

## 后续衔接

文档交付后不会自动往下走，中间还有两道关：

1. 需求确认（就是这个模式）→ 产出开发文档，你确认方向
2. 计划（plan 模式）→ 产出实施方案，你批准
3. 实现（标准模式的新会话）→ 写代码，你提出开发请求

每一段做完都停下等你，不会自己往下走。

## 注意事项

**必须先关掉「智能体团队」插件**（`@deepseek-ai/dsh-experimental-agent-team-profile`）。

原因是这样：这个模式靠 `send_message` 跟子 Agent 对话，而 DSH 自带的那份 `send_message` 参数是 `agent_id`。「智能体团队」插件会把同名的工具覆盖成它自己的版本，参数变成 `target`，只能给队友发消息。覆盖之后，调查员和复核者就没法接着聊了，只能一问一答各起一个新的。

关掉的办法：设置 → 插件 → 关掉「智能体团队」的开关 → 重启 DSH。

代价是会失去 `spawn_teammate`、团队任务板和团队面板。想恢复的话把开关打开再重启就行。

怎么判断自己踩到了这个问题：如果你手上的 `send_message` 参数是 `target`，报错里出现 `active teammate "<id>" not found`，那就是被覆盖了。

## 已知的不足

**"讨论阶段不产出文件"是约定，不是物理保证。** 这个 preset 没有拿走任何工具——`write`、`edit`、`pwsh` 都在，主 Agent 和两个子 Agent 都有。拦住文件的只是工作流规则。最后落盘的开发文档，仍然只有主 Agent 写的那一份。

如果你需要更强的保证：会话里用 `/permission read-only` 切只读，沙箱会从文件操作层面挡住写入。

**子 Agent 看不到你和主 Agent 的对话**，所以每次派活都要把背景重新讲一遍。好处是它不会瞎猜你的上下文。

**`send_message` 有个时序限制**：调查员正在跑的时候投递不过去，会报 `subagent "<id>" is unavailable`。这不是出错了，等它这一轮结束再发就行。所以节奏是派活、等回报、再派下一条。

**那份常驻的工作流说明每个请求都要带**，大约 3300 字，是有成本的。取舍的理由是硬约束和流程骨架必须一直在场，细节才按需加载。

## 遇到问题

### 模式列表里没有「需求确认」

模式列表只显示能正常加载的模式，如果加载失败它会直接不显示，不会有任何提示。

去 设置 →「模式」页面看那张卡片。如果卡片是红的、带"加载失败"标记，鼠标悬停上去就能看到真正的原因。**这是唯一能看到错误信息的地方。**

几种常见的原因：

- `service "subagents" has been registered at <SubagentRuntime>`：有个提供服务的插件行挂错了位置，和系统里已有的撞名了
- `tools.restrict() names unknown global tools "..."`：给子 Agent 设的工具白名单里写了不存在的工具名
- `skill "xxx" is unknown or no longer available`：技能加载器没挂上
- `active teammate "<id>" not found`：调到了「智能体团队」的 `send_message`，关掉那个插件

### 子 Agent 行为不对

先确认当前会话确实是「需求确认」模式（看会话上方的模式标识）。然后看它手上的 `send_message` 参数是 `agent_id` 还是 `target`，后者说明被覆盖了。

如果子 Agent 是**根本创建不出来**，跑一下 `node scripts/check-composition.cjs`：它能查出"委派工具指向了未声明的 preset"和"还留着已删除的字段"。这两类错都会让整份 preset 加载失败，而真正的报错只在模式卡片上。

**七个技能一个都看不到**：说明 `customSkillDirs` 没解析到本包。最常见的原因是安装别名和包名不一致（比如 profile 里写的是 `@local/dsh-requirements-mode`，而包里声明的是 `@dsh-community/dsh-requirements-mode`）。当前版本已按候选名兼容这两种写法；如果你的别名是第三种，把它加进 `cordis.patch.yml` 里那个 `names` 数组。另外检查 `~/.dsh/skills` 里有没有同名的旧副本——有的话它们会盖住包内的版本（同 rank 时先发现的赢），删掉旧副本更保险。

### 安装时报 git 或 SSL 错误

这个仓库是安装时按需从 GitHub 拉的，所以本机 git 得能访问 GitHub。两个常见情况：

如果报 `Host key for github.com has changed` 之类的，是 SSH 的主机密钥过期了，可以改成走 HTTPS：

```bash
git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
```

如果报 `SSL certificate problem: unable to get local issuer certificate`，是 Git 自带的证书包太旧了，改用系统的证书库：

```bash
git config --global http.sslBackend schannel
```

## 卸载

```
plugin_manager
  action: remove_bundle
  target: @dsh-community/dsh-requirements-mode
```

七个技能和两个子级 preset 会跟着一起移除，不用另外清理。

## 目录结构

```
.
├── package.json              声明这是个 DSH 组合包
├── cordis.patch.yml          插件的实际内容，三条 preset 声明
├── skills/                   七个技能
├── scripts/
│   ├── build-package.ps1     打成 dist/*.tgz
│   └── check-composition.cjs 重启前的结构检查
├── assets/
│   ├── icon.svg              图标，原创，随本仓库 MIT 授权
│   └── icon-512.png
├── LICENSE
├── README.md                 英文
└── README.zh.md              中文（本文件）
```

## 自己改和打包

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-package.ps1
```

会在 `dist/` 下生成 tgz 和对应的 SHA256。

改过 preset 之后还建议跑一个检查：

```bash
node scripts/check-composition.cjs
```

它检查五类事：委派工具指向的 `agentPreset` 是否在同一份文件里声明；有没有还留着已删除的字段（`persona` / `toolFilter` / `backgroundMode` / `enableRunInBackground`）；子级 preset 有没有挂委派工具（挂上就能无限递归）；每个技能目录的 frontmatter 名字是否与目录一致、体积是否低于 8 KB 上限；以及"人格里提到某个技能、却没挂 `tool-skill` + `skill-filesystem`"这种死路。前三类各自都上线过一次，每次都要重启加一轮猜谜，因为坏掉的 preset 会直接从模式选择器里消失。

打包脚本特意只用 ASCII 字符：Windows PowerShell 5.1 读取没有 BOM 的文件时会按系统代码页解码，写中文会直接报语法错误。

改完之后，预设和技能的目录结构变化需要重启 DSH 才生效；技能正文是改完就热加载的。验证方法是新建一个会话，看模式标识和工具列表对不对。

## License

MIT
