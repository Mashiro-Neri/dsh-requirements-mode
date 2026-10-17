---
name: requirements-subagent-protocol
description: 需求确认模式下两个子 Agent（subagent_explore / subagent_review）的操作协议——怎么派活、怎么续聊、时序与报错处置，以及各自该返回什么。当需要委派调查或复核、或子 Agent 报错时加载。
---

# 子 Agent 操作协议

本技能是操作手册。原则与流程骨架在常驻说明里，这里只讲"具体怎么调"。

## 一、调用形态（DSH 0.2.1 起）

两个子 Agent 都是 `dsh-tool-subagent` 的实例，行为已经固定，**没有 `run_in_background` 这类开关**：

- 每次调用**立即返回** `started subagent <childId>`，**不等待结果**。
- 结果稍后作为**完成通知**出现在对话里（带子 agent 最终回答的文本）。
- 两个角色的人格与工具面写死在预设里（`requirements-explore` / `requirements-review`），
  调用时**不能**再传 persona 或工具列表。

可用参数只有：`description`（3–5 个词的显示名）、`prompt`（必填）、可选 `cwd`。
`prompt` 要写成**自包含**的：子 agent 看不到你和用户的对话。

## 二、续聊：`send_message`

```
send_message(agent_id: <childId>, message: ...)
```

- **正在工作**的子 agent：消息在它最近一个步骤边界以 Steer 方式送达。
- **空闲**的子 agent：这条消息会让它开始新一轮。
- 只有**直接子级**可以冷恢复（结束之后仍然能续）；外部后端（Codex / Claude Code / ACP / SDK）不接受后续消息。

如果参数名是 `target` 而不是 `agent_id`，那是**另一个工具**（Agent Teams 插件的），发不到这里的子 agent——把这条报给用户让他关掉那个插件，同时改用 `agent_id` 重试。

## 三、调查员 `subagent_explore`

职责：回答"这台机器 / 这个代码库实际是什么样"。它有 shell，也有 write / edit（备用）。

派活前先自己判断：**一句话能问清的，自己跑只读命令就行，别绕子 agent**。要翻很多文件、要多步骤、或需要独立视角时再委派。

它回来之后：核对**原文证据**（读了哪个文件的哪一段，或跑了哪条命令及其原始输出），不要只看结论。它标注为"推断"或"未能确认"的内容要降级处理——**它标为推断的东西，你要么自己核实，要么留给用户核实，不要直接当事实用。**

## 四、复核者 `subagent_review`

职责：对开发文档草稿做对抗式证伪。它看不到讨论过程，所以拿不准的会列成"待澄清"而不是瞎判。

调用时一次把四样东西交全：

- 草稿全文（不贴等于没给它材料）
- 用户的原话要点（尤其是每条"已确认项"对应哪次答复）
- 你的确认台账
- 调查员带回的真机事实

拿到报告后，先对话再回报用户：用 `send_message` 把你能给的具体依据（用户原话、当时的选择、现场约束）告诉它，它必须逐条回"撤回（理由成立）"或"维持（缺的是 X）"。**给它理由，不要只坚持结论**。同一条意见最多来回两轮。

**修订后要新建复核者**，不要复用：看过上一版的复核者会倾向于确认"我的意见被采纳了"，而不是重新证伪。

## 五、报错对照

| 报错原文 | 含义 | 怎么办 |
|---|---|---|
| `tool-subagent: persona is no longer supported` / `toolFilter is no longer supported` | 配置里还留着旧字段 | 改 `cordis.patch.yml`：人格与工具面搬到子级 preset，用 `agentPreset` 指过去 |
| `service "..." has been registered at ...` | preset 里重复挂了宿主已有的服务（如 `shell`、`subagents`） | 删掉那几行；只挂工具，不挂执行器/运行时 |
| `active teammate "<id>" not found` | 调到了 Agent Teams 的同名工具（参数 `target`） | 改用 `agent_id`；提醒用户关掉那个插件 |
| `agent "<id>" is not a resident continuable child and cannot send to parent` | **子 agent 想主动推给父级**，而它已不在活跃表里 | 这是方向限制，不是故障；结果会通过完成通知送达，**不要修** |
| 创建直接失败且没有明确报错 | preset 可能整体挂了 | 让用户去 设置 →「模式」看那张卡片上的"加载失败"原因——那是唯一能看到错误文本的地方 |

改完配置后跑 `node scripts/check-composition.cjs`，它会在重启前拦住"引用了未声明的 preset"和"残留旧字段"这两类错。
