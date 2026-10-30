# 需求确认模式

![](https://img.shields.io/badge/dsh-%E2%89%A5%200.2.1--rc.2-4D6BFE?style=flat-square)
![](https://img.shields.io/badge/license-MIT-green?style=flat-square)

**中文** · [English](README.md)

一个给 DSH（DeepSeek Harness）用的模式：只讨论、只澄清，最后产出一份能直接交给别的 AI 的开发文档，不进入实现。

## 为什么写这个

让 AI 写代码最常出的问题不是写得慢，是写得太快。你说"我想做个桌面待办应用"，它立刻开始建目录、装依赖、写代码——而你其实还没想清楚这东西长什么样、你每天会怎么用它。

这个模式把顺序倒过来：先问清楚，再汇总，等你点头，最后只写一份文档。写代码是下一段的事。

## 它做什么

选中「需求确认」之后，行为会变：

- 默认不写代码，只讨论目标、范围和你每天的使用方式
- 整场对话只产出一份开发文档，不散落文件
- 多两个角色：一个去真机上查事实，一个挑文档的毛病
- 文档写完就停，不自动进入实现

工具能力没有被削减——你手上有什么它也有什么。真正的约束是工作流：讨论阶段不落文件、有副作用的命令不跑、确实需要时把命令给你。

## 装了什么

一个组合包，包含：

**一个模式**（agent preset）——常驻的工作流说明，加上常用工具和两个委派工具。工作流大约 2800 字，每个请求都带着。

**两个子 agent**，各自是一个 preset：调查员和复核者。它们不出现在模式列表里，由主 agent 调用。

**七个技能**，用到才加载：讨论与方案比较、按项目类型的问题清单、提问与台账、文档骨架、交付清单、复核清单、子 agent 协议。

**一套实现契约**（可选，见下文）。

## 安装

需要 DSH **0.2.1-rc.2 或更新**。0.2.0 及更早装不上——那些版本还要求把 `persona` 写在委派工具里，而 0.2.1 把这个字段删了。

三种装法，任选一种。

### 插件面板（最省事）

侧边栏 →「插件」→「添加插件」→「安装第三方插件」，在输入框里填：

```
https://github.com/Mashiro-Neri/dsh-requirements-mode
```

面板支持 npm 包名、Git 仓库地址和本地目录三种来源。Git 来源安装前会先 `git ls-remote` 探一次仓库（默认 5 秒超时，用 profile 目录下的 git 和代理配置）；探不通会直接提示"无法访问 GitHub"或"连接 GitHub 超时"，这时候换网络环境或先配好 git 代理。

装完完全重启 DSH。打开 设置 →「模式」，应该能看到一张叫「需求确认」的卡片。

### 让 DSH 自己装

新开一个会话（标准模式就行），发这段：

```
把 https://github.com/Mashiro-Neri/dsh-requirements-mode 作为插件组合包安装到当前 profile，
装完告诉我它装了哪些 preset 和技能。
```

### 命令行

```bash
dsh plugin --profile desktop add github:Mashiro-Neri/dsh-requirements-mode
```

`desktop` 换成你自己的 profile 名。

> 已经用开发用的 `link:` 方式装过这个包的话，先卸载再装，否则同一个 patch 会被应用两次。

## 怎么用

新建会话，模式选「需求确认」，然后正常说你想做什么。

它会一轮问几个问题，你答，它继续问。方向定下来之后给你一份汇总，问要不要改；你确认之后才写文档。

想让它查真机上的东西，直接说就行，比如"你看看我这台机器上装的是哪个版本"。它会派调查员去跑命令，带着原始输出回来，而不是猜一个。

## 两个子 agent

**调查员**有 shell，能自己跑只读命令：查版本、看进程、读日志、比文件差异。它的规矩是把原始证据带回来——读了哪个文件、跑了哪条命令、输出是什么——并且把"看到的"和"推断的"分开写。

**复核者**读你即将交付的文档，专门找"看着像已确认、其实是推测"的地方。它看不到你和主 agent 的对话，所以拿不准的会列成"待澄清"，而不是自己拍板。

调用只返回子会话 id，不等待结果；答案晚一点作为完成通知回来。之后可以用 `send_message` 继续同一个子 agent。修订过文档要**重新开一个复核者**——同一个复核者看过上一版，会倾向于确认自己的意见被采纳了，而不是重新证伪。

子 agent 的模型可以在派活时单独指定。宿主里配了子 agent 模型策略时，工具会多出 `provider` / `model` / `reasoning_effort` 三个参数，复核这种不需要深度推理的活可以用便宜模型跑。

## 随包的实现契约

写代码那一段最容易出的问题不是写不出来，是没人能证明它真的做完了。

包里带了一套实现阶段的交付契约：风险分级（L0 到 L3）、六道 Gate、证据卡、独立审查。核心只有一句——**证据才算完成**。接口返回 200、单测全绿、日志出现 started，都不算。

写开发文档之前它会问一句：要不要把契约一起放进项目。你同意的话，整个目录会复制到项目根 `ai-contract/`，并在文档开头加一行指向它；再问一次要不要写进 `AGENTS.md`——写了之后，以后任何 AI 一进这个项目就会先读它，不需要你每次提醒。

不需要就什么都不做，文档里也不会提。

## 后续衔接

文档交付不会自动往下走：

1. 需求确认（这个模式）→ 开发文档，你确认方向
2. 计划（plan 模式）→ 实施方案，你批准
3. 实现（标准模式的新会话）→ 代码，你说开始

三段之间每一步都等你点头。

## 注意事项

**「智能体团队」插件可以开着。** 早期版本里它和这个模式抢同一个工具名，现在不会了：preset 作用域里注册的 `send_message` 会覆盖全局的同名工具，而团队插件在 0.2.1 之后只是禁用基座那几行、插入自己的团队工具，不会碰 preset 里的行。

判断自己拿到的是哪一个，看参数名就行：`agent_id` 是这个模式的（发给调查员/复核者），`target` 是团队版（发给队友）。

不过团队工具**在这个模式里用不上**：`spawn_teammate` 之类仍然是全局可见的，但模式的 `send_message` 只认子 agent 的 id，发给队友会失败。要委派就用调查员和复核者。

**版本。** 升级 DSH 之后如果模式卡片变红，先跑：

```bash
node scripts/check-composition.cjs
```

它会检查 preset 引用、被删除的旧字段、技能目录和随包资产，大部分升级问题能在重启前拦住。

## 已知的不足

**"讨论阶段不落文件"是规则，不是物理限制。** 子 agent 有写权限，约束它们"只查不改"的是人格设定。要更强的保证，用 `/permission read-only` 切只读。

**子 agent 看不到你和主 agent 的对话。** 每次派活都要把背景重新讲一遍。好处是它不会瞎猜上下文。

**子级 preset 是靠一个小补丁藏起来的。** DSH 的 preset 注册表没有"隐藏"这个概念，所以包里包装了它的花名册方法，把两个子级 preset 从模式选择器里过滤掉。如果将来 DSH 改了这个方法名，补丁会静默失效，两张卡重新出现——模式本身不受影响。

## 遇到问题

**模式列表里没有「需求确认」。** 去 设置 →「模式」看那张卡是不是红色的"加载失败"，鼠标悬停能看到原因。最常见的是 DSH 版本不对，或者 preset 用了新版本已经删掉的字段。

**子 agent 建不出来。** 跑 `node scripts/check-composition.cjs`；还不行就看会话日志里的原始报错。

**安装时报 git 或 SSL 错误。** 这个仓库是安装时从 GitHub 拉的，本机 git 得能访问 GitHub。SSH 主机密钥过期就用 HTTPS：

```bash
git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"
```

证书问题改用系统证书库：

```bash
git config --global http.sslBackend schannel
```

## 卸载

让 DSH 调用 `plugin_manager`，`action: remove_bundle`，`target` 填 `@dsh-community/dsh-requirements-mode`。

七个技能和两个子级 preset 会一起移除，不用另外清理。

## 目录结构

```
.
├── package.json              声明这是个 DSH 组合包
├── cordis.patch.yml          三条 preset 声明 + 花名册补丁
├── plugin/
│   └── hide-internal-presets.js   把两个子级 preset 从模式列表里过滤掉
├── skills/                   七个技能
├── contract/                 实现契约（主文档、附录、模板、配置示例）
├── scripts/
│   ├── build-package.ps1     打成 dist/*.tgz
│   ├── check-composition.cjs 重启前的结构检查
│   └── release.ps1           打 tag、推送、用更新日志生成 Release
├── assets/
│   ├── icon.svg
│   └── icon-512.png
├── CHANGELOG.md              更新日志
├── RELEASING.md              发布流程
├── LICENSE
├── README.md                 英文
└── README.zh.md              中文（本文件）
```

## 自己改和打包

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-package.ps1
```

在 `dist/` 下生成 tgz 和对应的 SHA256。

改过 preset 之后跑一遍检查：

```bash
node scripts/check-composition.cjs
```

它检查五类事：委派工具指向的 `agentPreset` 是否存在、有没有残留已删除的字段、子级 preset 有没有挂委派工具、技能目录与 frontmatter 是否一致且不超过 8 KB、人格里提到技能却没挂技能工具链。

preset 和技能目录结构的变化需要重启 DSH 才生效；技能正文改完是热加载的。

## 更新日志与发布

每个版本都会在 GitHub 上有一个 Release，正文取自 [CHANGELOG.md](CHANGELOG.md) 里对应的版本段落。

发版的流程写在 [RELEASING.md](RELEASING.md)，一句话概括：改更新日志 → 改版本号 → 跑 `scripts/release.ps1`。脚本会校验、打包、打 tag、推送，并用日志段落生成 Release。

## License

MIT，见 [LICENSE](LICENSE)。

---

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
