# 项目经验：RAG 知识库 STAR 故事与 autocava-ai 提炼

> 来源：豆包会话第 1、2、12、14 轮，归纳整理。
> 项目深挖是面试**最重要**的一环：STAR 结构，重点讲工程部分，少说算法。
> autocava-ai 全链路节点级细节见同目录 `ai-project-interview.md`（含流程图与三个实际例子），本文不重复。

## 一、RAG 知识库项目 STAR 故事（面试口述版）

**技术栈**：Java 17 + Spring Boot + Redis + PgVector + LangChain4j（仅原型验证，核心链路自研），对接公有大模型 API。

**S 场景**：企业内部 PDF/Word/Markdown 文档分散，传统关键词检索只能匹配字面，员工查制度经常搜不到。希望支持自然语言问答，且回答必须引用内部文档、不编造。

**T 任务**：后端负责人，主导 RAG 问答系统后端落地。不做模型训练，聚焦：文档接入管道、向量检索模块、LLM 调用封装、对话上下文管理、稳定性、安全与成本控制。

**A 行动**：
1. **文档处理链路**：解析清洗，Chunk 选 500 字符 + 100 overlap，Embedding 后写 PgVector；文档更新走增量同步不全量重建
2. **问答链路**：query 向量化 → 召回 TopN → prompt 固定系统指令，强制「只基于检索片段回答」，无相关信息拒绝回答
3. **LLM 客户端封装**：WebClient 异步 + SSE 流式；超时控制、Sentinel 熔断降级、幂等重试
4. **对话管理**：Redis 存历史，过长自动摘要压缩；用户维度 QPS 限流
5. **安全防护**：结构化模板不拼接，防 Prompt 注入
6. **可观测**：埋点 QPS、首 token 耗时、token 消耗、召回数量、失败率；单次问答成本告警

**R 结果**：语义检索显著优于关键词检索；幻觉得到抑制；token 成本下降约 30%；异常场景自动降级，服务可用性达标。

### 预判追问（准备到 L3 深度）

| 追问 | 回答要点 |
| --- | --- |
| 为什么 PgVector 不 Milvus？ | 已有 PG 库、数据量百万级够用、减少中间件运维；量大再迁 Milvus（接口层抽象隔离迁移成本） |
| Chunk 为什么 500+100？ | 做过对比实验：太小割裂语义、太大相似度被稀释；overlap 保证跨片语义不断 |
| 幻觉怎么解决？ | 三层：检索层（召回优化+阈值过滤+按需 Rerank）、prompt 层（强约束引用原文、不知道就拒答）、业务层（给来源引用可溯源） |
| LangChain4j 为什么不全用？ | 适合原型；生产熔断/重试/监控/限流要深度定制，核心链路自研 |
| LLM 超时怎么处理？ | 分级超时 + 熔断 + 友好降级话术 + 幂等重试防重复计费 |

## 二、autocava-ai 项目（真实源码经验）

**背景**：汽车垂类智能问答（墨西哥市场，中西双语），Maven 多模块（media-ai-api + media-ai-app），Java 17 + Spring Boot + LangChain4j + LangGraph4j。核心链路见 `ai-project-interview.md`。

### 1. 工具加载机制（面试提炼）

- **工具 = Spring Bean + LangChain4j `@Tool` 注解的 Java 方法**（graph/tools/ 下 15 个工具类）
- 每次 Agent 执行时 `ToolDiscovery.discover()` 反射扫描：方法签名 → `ToolSpecification`（给 LLM 的说明书）+ `TracingToolExecutor`（埋点执行器），注册进 Agent 的 tools 列表
- 工具 Bean 是 Spring 启动创建的，但「注册给 LLM」发生在**每次图执行时**；工具类显式传参注入，没有全局自动发现
- 踩过的坑：**JDK 动态代理会导致注解扫描失效**，用 `getUserClass()` 兼容 CGLIB 取真实类

### 2. 双循环模式（项目最大亮点）

| 分支 | 执行模式 | 看门狗 | 特点 |
| --- | --- | --- | --- |
| FINANCE（金融） | LangGraph4j AgentExecutor ReAct 自由循环 | MAX_ITERATIONS=50 轮 | 模型自主规划，灵活；零宽空格前缀防 MessagesState 去重 bug |
| SEARCH（搜车子图） | 自研 BoundedFunctionCallExecutor 有界循环 | CONDITION≤3 / LOOKUP≤5 / RANKING≤3 / ANALYZE≤5 轮 | 确定性任务控成本控风险；到轮强制汇总，累积 tokenUsage |

**面试口径**：

> 财务类问题答案开放、步骤不可预知，用 ReAct 自由循环配 50 轮看门狗；搜车类任务步骤可枚举，用自研有界循环（3~5 轮上限）+ 强制汇总。**循环模式跟着任务确定性走**，这是成本和效果平衡的核心设计。

### 3. 其他工程亮点（对应 ai-05 的通用方法论）

- **注入规则前置**：RULE_CHECK 正则零 LLM 拦截——安全节点前置省 token 且必拦
- **流式铁律**：整轮只有 COMPOSE（SEARCH）和 FINANCE 两个流式点，其余节点静默执行，减少 SSE 碎片
- **checkpoint**：MysqlSaver 按 threadId=sessionId 持久化，支持断点恢复；瞬态 channel 每轮重置防跨轮泄漏
- **取消语义**：节点边界协作式检查 + DB CAS 兜底，不是线程强杀
- **会话互斥**：SessionTurnLock 防同会话并发轮次；线程池拒绝 → SERVER_BUSY
- **卡片协议**：`[[Type::JSON]]` marker，正文与卡片解耦，前端正则识别渲染

### 4. 与 12 年 Java 经验的结合话术

> 这个项目里真正难的不是 AI 概念，是把老三样搬进 LLM 场景：限流从 QPS 变成 QPS+token 双维度、熔断从接口超时变成「首 token 超时」、幂等从防重复下单变成防重复计费、上下文管理本质是 Redis + 缓存淘汰策略。我的分布式经验在这里全部复用了。

## 三、项目讲述节奏建议

1. 30 秒版本：业务场景 + 我的角色 + 一个量化结果
2. 3 分钟版本：STAR 展开，A 部分只讲 3 个最有区分度的点（工具运行时、双循环看门狗、成本控制）
3. 被追问再展开：每个点都有 L3 深度弹药（本文预判追问表 + ai-project-interview.md 节点表）
4. 主动把话题引向工程：任何 AI 概念题答完都补一句「这块我们在项目里是怎么落地的」

## 误区

- ❌ 把项目讲成 AI 概念科普——面试官想听的是你负责的工程决策和取舍
- ❌ 量化结果说满——「token 成本降 30%」要能拆解来源（缓存命中率 + 摘要压缩 + 模型分级）
- ❌ 只讲成功不讲坑——JDK 代理注解失效、ReAct 死循环这类「坑 + 解法」恰恰最加分
