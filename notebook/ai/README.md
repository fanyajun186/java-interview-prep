# AI 应用开发 · 笔记索引

> 来源：豆包会话《Java AI 应用后端面试准备》（2026-10-13）导出 md，已按主题分类归纳。
> 分类整理时对原笔记中的错误知识点做了修正（正文已改），文末附勘误清单。

## 文件清单

| 文件 | 内容 | 原会话轮次 |
| --- | --- | --- |
| `ai-01-interview-outline.md` | 求职定位 / 1 分钟自我介绍 / 七大模块题目大纲 / 弱化话术 / 准备清单 / 避雷 | 第 1、2 轮 |
| `ai-02-llm-rag-basics.md` | LLM 基础概念（Token / Prompt / CoT / SSE / 模型选型）+ RAG 完整链路 | 第 1、2 轮 |
| `ai-03-agent-tool-calling.md` | Agent / Tool Calling 与 Function Calling / 常见工具类型 / 代码脚本工具场景 / ReAct 自由循环 | 第 3、7、8、9、14 轮 |
| `ai-04-skills-mechanism.md` | Skills 与 SKILL.md 工作机制 / 与 Prompt 对比 / 端到端流程图 / Mermaid 语法坑 / LangChain4j 是否支持 skill 文件 | 第 4、5、6、13 轮 |
| `ai-05-java-engineering.md` | Java 工程落地：SSE / 并发 / 熔断限流 / 成本 / Prompt 注入防护 / 监控 + 无框架自研工具调用运行时（含完整代码） | 第 1、2、9、10、11 轮 |
| `ai-06-project-experience.md` | RAG 知识库项目 STAR 故事 + autocava-ai 项目提炼口径 + 预判追问 | 第 1、2、12、14 轮 |
| `ai-07-agent-paradigms.md` | Agent 定义与本质、核心组件、设计范式清单、Agent vs Workflow、Tools/Workflow/Agent 三者辨析、ReAct 实现细节、三大范式对比（对应 Q1~Q6） | 2026-10-14 新增 |
| `ai-08-rag-and-vector-db.md` | RAG 双链路 10 步工作流与失败点、进阶范式（混合检索/HyDE/Agentic RAG/GraphRAG）、评估指标、向量数据库原理（HNSW/IVF/PQ）与选型（对应 Q7~Q8） | 2026-10-14 新增 |
| `ai-project-interview.md` | autocava-ai `ChatController#chatMessagesStream` 全链路节点表 + 流程图 + 三个实际例子（先于此批文件成稿，内容不在此重复） | 第 15 轮 |

## 高频面试题速查（15 题 → 详细答案所在文件）

| # | 题目 | 答案位置 |
| --- | --- | --- |
| 1 | 什么是 RAG？为什么不用微调？ | ai-02 |
| 2 | RAG 完整链路？ | ai-02 |
| 3 | Chunk 大小和 overlap 怎么定？ | ai-02 |
| 4 | 向量检索原理？ | ai-02 |
| 5 | Embedding 模型和生成模型区别？ | ai-02 |
| 6 | SSE 是什么？Java 怎么实现流式输出？ | ai-05 |
| 7 | LLM 调用是 IO 密集，Java 并发怎么处理？ | ai-05 |
| 8 | LLM 调用稳定性怎么做？ | ai-05 |
| 9 | 怎么控制 token 成本？ | ai-05 |
| 10 | 什么是 Prompt 注入？怎么防护？ | ai-05 |
| 11 | Agent 和 RAG 区别？ | ai-03 |
| 12 | LangChain4j 了解吗？ | ai-05 |
| 13 | 多轮上下文怎么管理？token 超限怎么办？ | ai-05 |
| 14 | 向量库和业务库怎么同步？ | ai-02 / ai-05 |
| 15 | LLM 业务监控哪些指标？ | ai-05 |
| 16 | Agent 与大模型的本质不同？核心组件有哪些？ | ai-07 |
| 17 | Agent 和 Workflow 的区别？Tools/Workflow/Agent 三者关系？ | ai-07 |
| 18 | ReAct 是什么？怎么实现的？三大推理范式区别？ | ai-07 / ai-03 |
| 19 | RAG 工作流程？向量数据库是什么、怎么选？ | ai-08 / ai-02 |
| 20 | Function Calling 是什么？怎么实现？ | ai-03 |

## 勘误清单（原笔记错误，正文已修正）

1. **ProcessBuilder「命令注入」示例误标**（原第 9 轮）：原文把 `new ProcessBuilder("python3", "analysis.py", userInput)` 同时标为「危险写法」和「安全写法」，自相矛盾。事实：**ProcessBuilder 参数列表方式不经过 shell，正是防注入的正确姿势**；真正危险的是字符串拼接后经 shell 执行（`Runtime.exec("python3 a.py " + input)` 或 `new ProcessBuilder("sh", "-c", cmd)`）。已重写该节（见 ai-05）。
2. **中文 token 估算口径**（原第 1、2 轮）：原文统一写「中文约 1 token ≈ 1.5~2 汉字」。事实：**token/汉字比例完全取决于模型的分词器**——老分词器（如 cl100k_base）约 0.5~0.7 汉字/token，GPT-4o、Qwen、DeepSeek 等新分词器可达 1~1.8 汉字/token。已改为「因模型而异，粗估 1~2 汉字，成本测算以目标模型 tokenizer 实测为准」（见 ai-02）。
3. **SSE 服务端实现缺失**（原第 1、2 轮）：原文只讲了 WebClient 做 SSE 客户端。已补齐：服务端 Spring MVC 用 `SseEmitter`、WebFlux 用 `Flux<ServerSentEvent>`；SSE 本质是 HTTP 响应 `Content-Type: text/event-stream` 的单向长连接推送（见 ai-05）。
4. **ToolRegistry 示例代码不可编译**（原第 11 轮）：构造器注入 `List<AiToolHandler>` 但 `handlers` 字段未声明，且扫描目标类型不一致。已重写为完整自洽版本（见 ai-05）。
5. **「LLM 读取 SKILL.md」的主体认知偏差**（原第 4、5 轮）：模型没有文件系统访问能力，**「加载 md 进上下文」这个动作由宿主/框架完成**，模型只是看到被注入的文本。原流程图「LLM → 读取 SKILL.md」是简化画法，已在 ai-04 澄清。
6. **ReAct 出处补充**（原第 14 轮）：补充 ReAct 出自 2022 年 Yao 等人论文《ReAct: Synergizing Reasoning and Acting in Language Models》，面试提一句出处是加分项（见 ai-03）。
7. **Tool Calling 术语演进补充**（原第 3、7 轮）：补充 OpenAI 已在 Chat Completions API 中废弃 `functions` 参数、统一为 `tools` 参数，印证「Function Calling 是 Tool Calling 的特例」（见 ai-03）。

## 建议学习顺序

1. `ai-01` 建立面试全局 → 2. `ai-02` 吃透 RAG（最高频）→ 3. `ai-03` 吃透 Tool Calling / ReAct（次高频）→ 4. `ai-04` Skills 机制（区分你和只会 CRUD 候选人的话题）→ 5. `ai-05` 工程落地（你的主场，答题往这里靠）→ 6. `ai-06` + `ai-project-interview.md` 项目深挖弹药 → 7. `ai-07` Agent 范式与 Workflow 边界（拉开区分度）→ 8. `ai-08` RAG 进阶与向量库（深度追问的弹药）
