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
- **凡是"提供 service"的行都必须放进自己的隔离 realm**，而它的消费方工具必须留在顶层——否则工具根本进不了会话工具面。子 Agent 运行时（`isolate: {subagents: true}`）和 shell 执行器都是这个套路。两半只要有一半放错位置，整份 preset 就坏。
- **子 Agent 运行时还得自己挂一份 `send_message`**，否则子 Agent 建得出来、却再也说不上话。
- **四个技能随包分发**，通过 `skill-filesystem` 的 `customSkillDirs` 发现，路径在加载时从本包位置解析出来——所以装一个包就够了，不用另外往系统目录里放技能。
- **子 Agent 的权限面由 `toolFilter` 控制**，会对照该作用域实际注册的工具做校验。写错名字不是"少几个工具"，而是子 Agent 直接创建不出来。

上面每一条都对应 DSH 平台上的一个具体能力，每一条当时都费了不少功夫。走过的弯路都留在提交历史里；`scripts/check-tool-filter.cjs` 之所以存在，是因为在它之前已经有三个写错的名字溜过去过。

## 安装

需要 DSH（DeepSeek Harness）。安装时要 Full access 权限，或者允许审批。

关于版本：这套东西在 **0.1.7-rc.2** 上完整跑通过。**0.2.0-rc.1** 我核对过它用到的所有接口，没有发现变化（见下面的说明），但**没有在那一版上实际运行过**——如果你在 0.2.0-rc.1 上遇到问题，开个 issue 告诉我。

<details>
<summary>0.2.0-rc.1 都核对了什么</summary>

逐项对着两版的包源码比过：

- `dsh-tool-subagent-control` 的 `send_message` 参数仍是 `agent_id` + `message`（整个模式的子 Agent 通信靠它）
- `dsh-tool-subagent` 的配置字段一致：`provider` / `toolName` / `backgroundMode` / `enableRunInBackground` / `persona` / `toolFilter` / `maxDepth` / `agentOptions`
- `dsh-skill-filesystem` 仍有 `customSkillDirs` / `includeDefaultRoots` / `bundledSkillDir`
- 用到的 13 个 `@deepseek-ai/dsh-*` 包在 0.2.0-rc.1 下都存在

没验证的部分：preset 挂载、`isolate` 作用域、工具过滤这些**运行时行为**。这些只有真跑起来才知道。

顺带一提，这些包的 peer 依赖写的是**精确版本**（比如 `@deepseek-ai/dsh-subagent: 0.2.0-rc.1`），所以 preset 里的插件行必须和运行时同版本。正常安装时 pnpm 会解析成同一版，不用你操心。

</details>

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

一个模式，包含：

- 一份常驻的工作流说明（核心原则、权限边界、讨论流程、复核环节、后续衔接），大约 3300 字，每个请求都会带上
- 平常那套工具：读文件、找文件、搜内容、联网搜索、联网取页、向你提问、加载技能、记录待确认清单，加上宿主平面提供的 `pwsh`。**没有削减任何能力。**
- 实际上的唯一写权限：写完那份开发文档
- 两个子 Agent（下面单独讲），它们的运行时由这个 preset 自己挂载

另外附带四个技能，安装时一起装好，用到才会加载：

- `requirements-refinement`：讨论前期怎么比较方案、怎么实地调查、改了一处怎么保持文档一致
- `requirements-clarification-checklist`：按项目类型列出容易漏掉的问题
- `requirements-questioning-ledger`：怎么提问、怎么记录"已经确认过什么"
- `requirements-doc-template`：文档的固定结构和交付前的自查清单

## 两个子 Agent

第一个负责调查。需要知道"这台机器实际是什么情况""这个代码库现在长什么样"的时候，主 Agent 会派它去查。它**可以自己跑只读命令**（查版本、进程、端口、环境、git 状态），也有 write / edit 作为备用手段。

它有个规矩我觉得挺有用：必须把原始证据带回来——读了哪个文件、跑了哪条命令、原始输出是什么——并且把"亲眼看到的"和"自己的推断"分开写。

第二个负责挑毛病。文档草稿写完后交给它，它的任务是找出"看着像已确认、其实是推测"的地方。草稿里如果有能核实的事实声明，它可以自己去查证。

它有几个刻意的设定：看不到你和主 Agent 的对话，所以拿不准的会列成"待澄清"问你，而不是自己瞎判；不能替你做决定，发现"这该你定"只能写进报告让主 Agent 转达。

两个子 Agent 都拿到了完整工具（含 shell 和 write / edit），所以约束它们"只查不改"的是人格设定，不是工具面。要更强的保证就用 `/permission read-only`。

如果主 Agent 觉得某条意见不对，可以给它解释。它要么明确撤回并说明理由成立，要么说明你缺了哪一环所以不能撤回。来回最多两轮，还有分歧就交给你判断。

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

如果子 Agent 是**根本创建不出来**，第一个要怀疑的就是那个工具白名单，而真正的报错只在会话日志里。升级 DSH 之后这是最容易出问题的地方：已注册的工具集合会变，以前合法的名字可能就抛错了。跑一下 `node scripts/check-tool-filter.cjs` 能在用之前就发现。

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

四个技能会跟着一起移除，不用另外清理。

## 目录结构

```
.
├── package.json            声明这是个 DSH 组合包
├── cordis.patch.yml        插件的实际内容，就一条声明
├── skills/                 四个技能
├── scripts/
│   └── build-package.ps1   打成 dist/*.tgz
├── assets/
│   ├── icon.svg            图标，原创，随本仓库 MIT 授权
│   └── icon-512.png
├── LICENSE
├── README.md               英文
└── README.zh.md            中文（本文件）
```

## 自己改和打包

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-package.ps1
```

会在 `dist/` 下生成 tgz 和对应的 SHA256。

改过 preset 之后还建议跑一个检查：

```bash
node scripts/check-tool-filter.cjs
```

它检查子 Agent 的 `toolFilter.allow` 里每个名字，是不是这个 preset 真能看到的工具。写错一个，`tools.restrict()` 就会抛错，子 Agent 根本创建不出来，而你看到的只是"这个模式不好使"——真正的报错只落在会话日志里。已经有三批名字踩过这个坑了，所以它现在是个脚本，不再是注释里的一句提醒。

两个脚本都特意只用 ASCII 字符：Windows PowerShell 5.1 读取没有 BOM 的文件时会按系统代码页解码，写中文会直接报语法错误。

改完之后，预设和技能的目录结构变化需要重启 DSH 才生效；技能正文是改完就热加载的。验证方法是新建一个会话，看模式标识和工具列表对不对。

## License

MIT
