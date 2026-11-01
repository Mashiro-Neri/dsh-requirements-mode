---
name: requirements-large-project
description: 大型项目的九阶段需求规划流程——意图、现实核查、概念与不变量、自我推翻与八视角红队、状态语义、拆分、决策冻结、验收。当项目跨多系统或多角色、要复用旧系统、返工成本高，或用户明确要求走大型项目路线时加载。
---

# 大型项目路线

本包在 `playbooks/large-project-planning.md` 带了一份完整的大型项目规划模板，是在真实项目上沉淀下来的。本技能只讲三件事：什么时候走、怎么把九个阶段压到现有的两个子 agent 上、最后交付什么。

## 什么时候走

出现**任意两条**，就值得问用户一句；默认不走，用户犹豫就按常规路线。

- 跨多个系统、设备或角色
- 已有旧系统，重点是复用而不是重写
- 做错返工成本高：数据、权限、安全、迁移
- 用户只有一个方向，没有完整规格
- 预计要分多个阶段、跨多次会话

不适用：单文件修复、目标与验收都明确的小功能、纯局部改动。

问法要具体，不要抽象："这个需求看起来会横跨 X 和 Y，还涉及 Z 的迁移，我建议走大型项目路线：先做能力盘点和红队，再拆阶段冻结决策。要走吗？不走的话我按常规流程，出一份开发文档。"

## 先读 playbook

`<base>/../../playbooks/large-project-planning.md`

九阶段的产物与闸门、17 节文档骨架、反方案台账格式、收敛标准、交付前检查清单都在里面。**开始前先读它**；本技能不复述，只规定怎么映射到本模式。

## 九阶段怎么跑

**阶段 1 · 意图**：用 `requirements-questioning-ledger` 的四类信息分离（已确认 / 偏好 / 建议 / 待确认）。不派子 agent。

**阶段 2 · 现实核查**：派 `subagent_explore`，把 playbook 里「审计 Agent 提示词模板」整段作为 prompt，要求按 P0/P1/P2 输出、每条带文件路径与行号证据。报告到达后**你逐条处理**：接受 / 驳回 / 交用户裁决，不允许整份照抄。

**阶段 3–4 · 概念与不变量**：自己做。术语表要有「比喻 / 定义 / 反例」，不变量每条都要能写成验收项。

**阶段 5 · 红队**，分两轮：

- 第一轮自己按八个视角切换（视角不是代理，不要为了凑数开八个子 agent），产出多视角报告和**反方案台账**。
- 第二轮把「安全」「混沌工程」两个高风险视角交给 `subagent_review` 独立复核；输入含方案、台账、证据，**不含你的结论**。
- 收敛标准照 playbook §7.4。同一问题最多三轮，之后降级为 known risk、或交用户裁决，不要用无限循环伪装确定性。

**阶段 6 · 状态语义**：用 playbook 的七字段结构；副作用另加五个字段。这一节最容易漏，别跳。

**阶段 7 · 拆分**：先写 kill list（现在明确不做什么），再写阶段计划，最后做依赖顺序检查。

**阶段 8 · 决策冻结**：每个难回头的决定一条 ADR，一条只做一个决定；不改旧 ADR，写 supersede；记录用户哪次确认。

**阶段 9 · 验收**：按 `acceptance/ACCEPTANCE_PLAN.md` 填验收计划，取证与判定规则见 `acceptance/README.md`。

## 交付物

用户确认后，在 `requirements/<项目名>-需求规划/` 下产出：

```
README.md                 交付说明、文件索引、版本与 SHA256
00-需求规划文档.md         playbook §12 的 17 节骨架
01-反方案台账.md
02-决策台账.md             ADR + 重审触发器
03-验收/
  README.md                acceptance/README.md 的副本（流程与判定）
  验收计划.md               按 acceptance/ACCEPTANCE_PLAN.md 填
  证据卡.md                 contract/templates/EVIDENCE.md 的副本
  实现契约/                 整个 contract/ 复制过来，默认带
04-风险与重审触发器.md
```

实现契约**默认随包**——上一版的验收方式（风险分级、Gate、证据卡、独立审查）就是靠它落地的，不再当可选项。只有用户明确说不要时才去掉 `03-验收/实现契约/`。

**初始化目录（交付时执行，不要提前建空壳）**

用户确认交付之后、开始写内容之前，一次把目录铺好。`<base>` 是本技能注入的 Base directory；主 agent 有 shell。

```bash
P="requirements/<项目名>-需求规划"
mkdir -p "$P/03-验收"
cp "<base>/../../acceptance/README.md"           "$P/03-验收/README.md"
cp "<base>/../../acceptance/ACCEPTANCE_PLAN.md"  "$P/03-验收/验收计划.md"
cp "<base>/../../contract/templates/EVIDENCE.md" "$P/03-验收/证据卡.md"
cp -r "<base>/../../contract"                    "$P/03-验收/实现契约"
```

Windows 上用 `New-Item -ItemType Directory -Force` 和 `Copy-Item`（目录加 `-Recurse`）做同样四件事。铺完核一遍文件数，再开始写内容；`00/01/02/04` 按阶段写，`README.md` 最后写，因为要放各文件的 SHA256。

**不要在讨论阶段做这一步**——用户可能最后不走大路线，提前建只会留下空壳。

**打 zip 之前**：

1. 目录里不留临时文件、草稿、`dist` 之类。
2. 在 `README.md` 里列出每个文件的用途、字节数与 SHA256。
3. 打包（PowerShell，主 agent 有 shell）：

```powershell
Compress-Archive -Path "requirements/<项目名>-需求规划" -DestinationPath "requirements/<项目名>-需求规划-<YYYYMMDD>.zip" -Force
Get-FileHash "requirements/<项目名>-需求规划-<YYYYMMDD>.zip" -Algorithm SHA256
```

4. 解压一遍核对文件数与 README 一致，再向用户报告：zip 路径、大小、SHA256。

**不要**把原始草稿和过程记录塞进包；用户要的是可交付的边界、契约、阶段和验收。

## 和小项目路线的关系

| | 小项目（默认） | 大项目（本路线） |
|---|---|---|
| 流程 | 四阶段 | 九阶段 |
| 产物 | 一份 8 节开发文档；内容确实写不下才拆第二份 | 17 节规划文档 + 台账 + 验收目录 |
| 交付 | 直接落 md 文件，不打包 | 目录 + zip |

**不要预设份数**：常规路线默认一份文档，模型写到一半发现确实塞不下（比如验收矩阵太长、附录太多），再自己拆第二份。拆出来的第二份优先是验收计划，其次是附录。

两条路线**最后都走 `requirements-delivery-checklist` 的自检、复核与三段闸门**。不要因为走了大路线就跳过对抗式复核——大项目更需要。
