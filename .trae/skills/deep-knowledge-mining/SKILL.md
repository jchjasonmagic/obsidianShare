---
name: "deep-knowledge-mining"
description: "Mines candidate notes into evergreen knowledge points and batches promotions into the vault. Invoke when user asks to continue digging, deepen a domain, or extract many formal points."
---

# Deep Knowledge Mining / 深度知识挖掘

This skill is for continuing large-batch knowledge mining inside the O-DataMap vault.  
这个 skill 用于在 O-DataMap 仓库里继续进行大批量知识点挖掘与正式点提纯。

Use it when the user asks things like:  
当用户出现以下意图时调用：

- "继续挖"
- "继续深挖"
- "再挖一批"
- "把第一阶段和第二阶段继续挖下去"
- "从候选层继续提纯正式点"
- "尽量多挖，不要停"

Do not use it for:  
以下情况不要调用：

- simple code edits unrelated to knowledge mining  
  与知识挖掘无关的普通代码编辑
- graph UI tuning without content mining  
  只做图谱前端或 UI 调整、不涉及内容提纯
- one-off explanation questions that do not require promoting new points  
  只问解释、不需要新增正式点的一次性问题

## Goal / 目标

Turn high-density candidate material into formal evergreen knowledge points that:  
把高密度候选材料提纯为正式 evergreen 知识点，并满足：

- are non-duplicative with the current formal layer  
  不与现有正式层重复
- sit at the right abstraction level  
  抽象层级合适，不太虚也不太碎
- connect to an existing trunk or form a clear new branch  
  能接回现有主干，或形成清晰的新分支
- are written in concise, reusable language  
  语言简洁、可复用
- can be safely batch-added without overwriting unrelated user changes  
  能安全批量落地，不覆盖无关用户改动

## Default Mining Scope / 默认深挖范围

Prioritize these lines unless the user narrows or changes scope:  
除非用户明确缩窄或切换方向，默认优先这几条线：

1. Quant execution and risk / 量化执行与风控
2. Psychology boundaries and repair / 心理边界与修复
3. Medical intervention and follow-up / 医学干预与随访闭环
4. Expression and content structure / 表达与内容结构
5. Life Systems / Human 3.0 / 人生系统与 Human 3.0
6. Applied Systems / AI engineering boundaries / 应用系统与 AI 工程边界

## Mining Workflow / 挖掘流程

### 1. Confirm scope from current conversation / 从当前对话确认范围

Infer the active directions from the latest user request and nearby context.  
从用户最新请求和上下文推断当前活跃方向。

If the user says "继续挖第一阶段和第二阶段", default to:  
如果用户说“继续挖第一阶段和第二阶段”，默认切到：

- quant-risk
- psychology
- medicine
- expression
- life-systems
- applied-systems

### 2. Scan candidate quarry / 扫描候选矿层

Search candidate notes first, especially in directories like:  
优先扫描候选笔记，尤其是这类目录：

- `content/vault/Knowledge Points/Gemini/Full Coverage`

Look for repeated mechanism clusters, operational advice, edge cases, guardrails, and workflow fragments that are rich enough to become standalone points.  
重点寻找那些反复出现的机制簇、操作建议、边界条件、失败场景、护栏规则和流程碎片，判断它们是否足够独立，能升成正式点。

### 3. Dedupe against the formal layer / 与正式层排重

Always compare against existing formal notes in directories such as:  
始终要和现有正式层对照排重，例如：

- `Core Quant Risk`
- `Core Psychology`
- `Core Life Science`
- `Core Expression`
- `Core Life Systems`
- `Core Applied Systems`

Reject candidates that are:  
以下候选应淘汰：

- already materially present  
  已经在正式层里实质存在
- only a wording variant of an existing point  
  只是已有点的换皮表述
- too dependent on the source conversation  
  过度依赖某段原始对话语境
- too situational or too slogan-like  
  太场景化，或太像口号

Prefer candidates that deepen an existing trunk by adding:  
优先选择那些能为现有主干补“第二层结构”的候选，例如补上：

- a clearer boundary / 更清晰的边界
- a missing operational interface / 缺失的操作接口
- a failure mode / 失效方式
- a time dimension / 时间维度
- a verification rule / 验证规则

### 4. Promote in batches / 批量提升为正式点

Batch selected points into formal notes.  
把入选候选批量改写成正式笔记。

Default metadata pattern:  
默认元数据模板：

```yaml
---
type: knowledge-point
topic: <topic>
status: evergreen
map: o-map
map_layer: point
map_scope: <scope>
map_stage: applied
map_kind: <kind>
source_note: <source layer>
---
```

Then write:  
正文默认按这个结构写：

1. a sharp title in the established repo style  
   用仓库既有风格写一个锐利标题
2. paragraph one: identify the mistake, illusion, or missing distinction  
   第一段指出常见误判、幻觉或缺失区分
3. paragraph two: state the operating rule, boundary, or workflow consequence  
   第二段给出操作规则、边界或流程后果

Keep each note compact and reusable.  
每个点保持紧凑、独立、可复用。

### 5. Verify immediately / 立即校验

After each small batch:  
每一小批落地后都要立刻校验：

- verify files exist  
  确认文件真实存在
- read back representative files  
  回读代表文件
- check diagnostics if the edit was substantive  
  如果编辑较多，跑一次 diagnostics

If terminal-based batch writing shows encoding corruption, switch to a safer path and verify each batch before continuing.  
如果终端批量写入出现编码污染或内容打碎，立刻切换到更安全的写法，并且每批都先验再继续。

### 6. Preserve workspace safety / 保持工作区安全

Never overwrite unrelated user edits.  
绝不覆盖无关用户改动。

Never revert user changes.  
绝不回滚用户已有修改。

If unexpected edits appear that you did not make, stop and ask the user how to proceed.  
如果发现不是自己造成的异常改动，立刻停下并询问用户怎么处理。

## Quality Bar / 入选标准

A candidate is strong enough to promote when it has most of these properties:  
一个候选点足够强，可以提升为正式点时，通常具备以下大多数特征：

- reusable beyond the original conversation  
  能脱离原始对话独立成立
- names a real mechanism, boundary, or workflow  
  命中了真实机制、边界或流程
- can stand alone as a note title  
  可以独立成为一个标题
- adds a new branch or meaningful child node  
  能长出新分支或有意义的子节点
- helps future decisions, not just future recall  
  帮助未来决策，而不只是帮助回忆

Reject points that are mainly:  
以下类型通常不值得升正式点：

- emotional restatements  
  情绪性重述
- overfitted to one anecdote  
  过拟合单一案例
- vague high-level values without an interface  
  只有大价值观，没有可执行接口
- duplicates of existing mother points  
  与现有母点重复

## Anti-Overmining / 防过度挖掘

Do not confuse candidate abundance with formal-layer quality.  
不要把候选层很多，误判成正式层也应该同步膨胀。

The rule is: candidates can be abundant; formal points must stay selective.  
基本原则是：候选可以很多，正式必须克制。

### Core Principle / 核心原则

- keep the candidate layer wide, keep the formal layer strict  
  候选层可以铺开，正式层一定要严
- promote only points that add structural gain, not wording gain  
  只提升带来结构增益的点，不提升只是措辞增益的点
- prefer leaving good-but-not-yet-mature ideas in candidate form  
  宁可把“还不错但没长熟”的内容留在候选层

### Promotion Gates / 正式点晋升闸门

Before promoting a candidate, check these five gates:  
候选点升正式前，至少检查这五道闸：

1. Non-duplication / 非重复  
   Is it materially different from current formal points?  
   它和现有正式点相比，是否有实质增量？
2. Independence / 独立性  
   Can the title and note stand alone without the original chat?  
   脱离原始对话后，这个标题和正文还能独立成立吗？
3. Mechanism / 机制性  
   Does it name a mechanism, boundary, workflow, failure mode, or verification rule?  
   它是否明确命中了机制、边界、流程、失效方式或验证规则？
4. Decision Value / 决策价值  
   Will it improve future judgment or action?  
   它是否能改善未来判断或行动，而不只是让人“更有感觉”？
5. Trunk Connection / 主干连接  
   Can it clearly connect to an existing parent point or branch?  
   它是否能明确接到现有母点或分支上？

If a candidate fails multiple gates, keep it in the candidate layer.  
如果一个候选同时卡在多道闸上，就留在候选层，不要急着升正式。

### Fast Scoring Rule / 快速打分规则

Use a simple 5-point score before promotion:  
升正式前可以用一个简单的 5 分打分：

- stand-alone title / 可独立标题
- non-duplicative / 不重复
- mechanism or boundary / 有机制或边界
- decision-useful / 能指导决策
- trunk-connectable / 能接主干

Interpretation:  
解释方式：

- `4-5`: promote to formal  
  `4-5 分`：可以升正式
- `3`: keep as candidate and watch  
  `3 分`：先留候选，再观察
- `0-2`: reject for formal promotion  
  `0-2 分`：不升正式

### Warning Signs / 质量下滑预警

Stop deepening a line temporarily if several of these appear in a row:  
如果某一条线连续出现下面这些情况，就应暂时停挖：

- new titles feel like paraphrases of existing formal points  
  新标题越来越像已有正式点的同义改写
- notes depend heavily on one source anecdote  
  正文越来越依赖单个原始案例
- boundaries between nearby points become blurry  
  相邻点之间边界越来越模糊
- each new point only adds half a step of extra meaning  
  每个新点只比上一个点多半步意思
- you can write it, but cannot explain what decision it improves  
  虽然写得出来，但说不清它到底改善了什么判断

### Stop Rule / 停挖规则

Pause a line when one of these happens:  
出现以下任一情况，就应暂停该条线：

- 3 consecutive candidates are near-duplicates  
  连续 3 个候选都高度接近已有点
- 3 consecutive candidates need the original context to make sense  
  连续 3 个候选都离不开原始语境
- 3 consecutive candidates are too thin to support a full formal note  
  连续 3 个候选都太薄，撑不起完整正式点

When this happens, switch to another domain or move one level up in abstraction.  
一旦触发，就切到别的领域，或者回到更高一层抽象继续挖。

### Batch Hygiene / 批次卫生

To prevent quality drift during long mining runs:  
为了避免长批次挖掘时质量持续走低：

- review every 10 promoted points as a batch  
  每新增 10 个正式点，就做一次整批复审
- merge near-duplicates instead of forcing them into separate notes  
  能合并的近重复点就合并，不要硬拆成两个正式点
- prefer missing interfaces over finer paraphrases  
  优先补缺失接口，不要继续细拆已有意思的不同说法
- allow many candidates to remain forever unpromoted  
  允许大量候选永远停留在候选层

### Good Deepening vs Bad Deepening / 好的深挖与坏的深挖

Good deepening usually adds:  
好的深挖通常是在补：

- a time dimension / 时间维度
- a failure condition / 失效条件
- a verification interface / 验证接口
- a role or responsibility boundary / 责任边界
- an entry or exit condition / 进入或退出条件

Bad deepening usually adds only:  
坏的深挖通常只是在补：

- a new wording style / 新措辞
- a new emotional flavor / 新情绪语气
- a narrower anecdotal slice / 更窄的案例切片
- a slogan-like restatement / 口号式重述

## Preferred Point Shapes / 偏好的点形状

Favor point types like:  
优先偏好这些点型：

- guardrail
- workflow
- principle
- model
- practice

Common high-value templates:  
高价值标题常见模板：

- `X：先分清 A 和 B`
- `X：出现 Y 时先做 Z`
- `X：不要把 M 误判成 N`
- `X：先验证，再放大`
- `X：让顺序服务理解`

## Output Style / 输出风格

When reporting back to the user:  
向用户汇报时：

- lead with how many points were added  
  先说新增了多少点
- summarize by domain  
  按领域分组概括
- mention whether files were safely verified  
  说明是否已安全验文件
- keep rebuild status separate from content-mining status  
  把图谱重建状态和内容挖掘状态分开汇报

If the user asks for ongoing mining, continue in the highest-yield domains first rather than stopping after a token small batch.  
如果用户要求继续挖，不要只做象征性一小批就停，应优先沿高产出方向持续推进。

## Default Next-Step Heuristic / 默认继续顺序

If the user simply says "继续", continue in this order:  
如果用户只说“继续”，默认按这个顺序往下挖：

1. quant-risk
2. psychology
3. medicine
4. applied-systems
5. life-systems
6. expression

Rationale:  
原因：

- quant, psychology, and medicine usually yield the densest second-layer mechanisms  
  量化、心理、医学通常最容易继续长出高密度第二层机制点
- applied-systems often produces clean operational guardrails  
  applied-systems 很容易产出干净的操作护栏
- life-systems and expression are strong follow-on layers once the first three are expanded  
  当前三条线拓开后，life-systems 和 expression 更容易继续成系统

## Example Invocation / 调用示例

Use this skill when the user says:  
当用户这样说时调用：

- "继续挖第一阶段和第二阶段"
- "量化和心理再深挖一轮"
- "从候选层再提纯 30 个正式点"
- "把这些方向继续批量落地"
