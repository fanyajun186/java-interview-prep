# 学习进度跟踪

> 更新规则：每次完成一个主题的学习或模拟面试后更新本文件。  
> 掌握度等级：`0 未开始` / `1 见过` / `2 能讲清原理` / `3 能扛追问` / `4 能讲实战与取舍`

## 总览

| 主题 | 掌握度 | 模拟面试最高分 | 最近练习日期 | 下一步动作 |
| --- | --- | --- | --- | --- |
| JVM | 2（待验证） | - | 2026-10-11 | 收集器主线已闭合（含调优），不再新增讲义；下一步做模拟面试或跑 GC 日志实验 |
| Java 设计模式 | 1 | - | 2026-10-16 | GoF 23 种全量讲义已就位（`notebook/java-design-patterns/`，24 份 / 约 5,700 行），下一步先吃透 5 星 + 4 星共 11 个，再按 README 的「易混模式辨析速查」做两两对比自测 |
| Java 底层与并发 | 0 | - | - | 从 02-java-core.md 第 2 节开始 |
| MySQL | 2（待验证） | - | 2026-10-13 | 十大主题 + 事务加锁实战已讲完，下一步做模拟面试或跑锁 / EXPLAIN 实验 |
| 消息中间件 | 1 | - | 2026-10-13 | RabbitMQ / RocketMQ / Kafka 三件套已各出一份讲义（架构 / 原理 / 确认 / 延迟 / 死信 / 量级），下一步做 MQ 模拟面试 |
| Spring 与分布式架构 | 1 | - | 2026-10-14 | 分布式事务首讲已就位（XA/2PC、TCC、Saga、可靠消息、TCC 幂等/防悬挂/防空回滚），下一步做分布式事务模拟面试或补注册中心/网关/锁 |
| XXL-JOB | 1 | - | 2026-10-13 | 使用 / 表结构 / 调用链 / 时间轮 / 超时已首讲，下一步补分片实战与幂等设计 |
| Redis | 2（待验证） | - | 2026-10-15 | 类型/持久化/主从哨兵集群/单线程/编码实现层/淘汰策略六块已讲（redis-01~06，含 7 张结构图），下一步做 Redis 模拟面试或跑大 Key / 内存淘汰实验 |
| AI 应用开发 | 2（待验证） | - | 2026-10-14 | 8 份讲义 + 全链路成稿已齐（大纲/LLM+RAG/工具调用/Agent 范式/Skills/工程落地/项目/向量库），下一步做 AI 模拟面试或跑最小 RAG demo |
| 算法与手写代码 | 1 | - | 2026-10-13 | 4 份讲义 + 必刷 20 题清单已就位（`notebook/algorithm/`），下一步按清单动手刷题并自问追问链 |
| 场景题（系统设计） | 1 | - | 2026-10-15 | `notebook/scenario-design/` 已 6 讲（红包 / 秒杀 / 短链 / 点赞计数 / 附近的人 / 签到打卡），下一步做一次场景题模拟面试 |

## 明细记录

| 日期 | 主题 | 范围 | 动作 | 掌握度 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 2026-10-08 | JVM | 卡表与 RSet（记忆集） | 学习 | 0 → 2 | 讲义：notebook/jvm/jvm-card-table-remembered-set.md；实验待补 |
| 2026-10-08 | JVM | CMS 运作过程与 STW 时机 | 学习 | 1 → 2 | 讲义：notebook/jvm/jvm-cms.md；实验待补 |
| 2026-10-09 | JVM | 新生代 8:1:1、Minor GC / Full GC 触发与 STW | 学习 | 1 → 2（待验证） | 讲义：notebook/jvm/jvm-young-old-gen-gc-events.md |
| 2026-10-10 | JVM | 三色标记、增量更新 vs SATB、CMS / G1 阶段对照 | 学习 | 1 → 2（待验证） | 讲义：notebook/jvm/jvm-tricolor-satb-incremental-update.md |
| 2026-10-10 | JVM | 写前屏障 / 写后屏障、与内存屏障的区别 | 学习 | 1 → 2（待验证） | 讲义：notebook/jvm/jvm-write-barrier.md；含 HotSpot 插入点与 UseCondCardMark |
| 2026-10-11 | JVM | 分代比例调优：ParNew + CMS 静态划分 vs G1 目标驱动 | 学习 | 1 → 2（待验证） | 讲义：notebook/jvm/jvm-young-old-gen-ratio-tuning.md；含两套配置模板 |
| 2026-10-12 | MySQL | 连表查询「小表驱动大表」（NLJ / INLJ / BNL / Hash Join） | 学习 | 0 → 1 | 讲义：notebook/mysql/mysql-join-small-table-drives-big.md |
| 2026-10-12 | MySQL | 十大主题全景：架构与叶子节点 / B+树与分表阈值 / 事务隔离 / 锁体系 / 三日志 / MVCC / 当前读 / 索引失效 / 慢SQL / 死锁 | 学习 | 1 → 2（待验证） | 讲义：notebook/mysql/mysql-core-ten-topics.md |
| 2026-10-13 | MySQL | 事务与加锁实战：加 / 不加 @Transactional 的加锁对比 | 学习 | 2 → 2（待验证） | 讲义：notebook/mysql/mysql-lock-with-without-transactional.md |
| 2026-10-13 | - | 学习工作区目录重构：notebook 按主题分子目录 | 整理 | - | 讲义路径统一为 notebook/<主题>/<主题>-<小节>.md |
| 2026-10-16 | MySQL | 十大主题讲义拆分扩写：1 份浓缩版 → 6 份详细讲义 + 12 张配图（架构 / B+树分表 / 事务MVCC / 三日志 / 锁与死锁 / 索引优化），原文件改为总纲索引 | 整理学习 | 2（待验证） | notebook/mysql/ 下 6 份子讲义 + images/；面试问法 / 追问链 / 误区全部自带答案 |
| 2026-10-13 | XXL-JOB | 使用介绍 + 8 张表结构 + 完整调用链 + 时间轮实现 + 三套超时机制辨析 | 学习 | 0 → 1 | 讲义：notebook/xxl-job/xxl-job-usage-and-internals.md |
| 2026-10-13 | 算法与手写代码 | 手写基础 / 排序查找 / 数据结构 / 力扣高频，共 4 份讲义 + 必刷 20 题清单 | 学习 | 0 → 1 | notebook/algorithm/（README + 4 份，约 2420 行）；skill 新增 references/09-algorithm.md 并把 algorithm 纳入目录约定 |
| 2026-10-13 | 消息中间件 | RabbitMQ / RocketMQ / Kafka 三件套：架构、底层原理、确认机制、延迟队列、死信队列、量级 | 学习 | 0 → 1 | notebook/mq/（README + 3 份）；含 4 张架构 / 能力图 |
| 2026-10-13 | AI 应用开发 | 豆包会话笔记分类归纳：面试大纲 / LLM+RAG / Agent+Tool Calling / Skills 机制 / Java 工程落地 / 项目经验，共 6 份讲义 + README 索引与勘误清单 | 整理学习 | 0 → 1 | notebook/ai/（含既有 ai-project-interview.md 共 8 份）；修正 ProcessBuilder 注入误标、token 中文估算、SSE 服务端实现、ToolRegistry 代码缺陷、SKILL.md 加载主体认知偏差 5 处错误 |
| 2026-10-13 | Redis | 数据类型与底层结构 / RDB+AOF 持久化 / 主从+哨兵+Cluster / 单线程模型与 6.0 IO 多线程 | 学习 | 0 → 1 | notebook/redis/（README + 4 份）；覆盖五大类型编码转换、fork+COW、psync 增量同步、哨兵两级下线与 Raft 选举、16384 槽与 Gossip、MOVED/ASK、单线程五大论据 |
| 2026-10-14 | AI 应用开发 | Agent 范式进阶（定义/组件/设计范式/Agent vs Workflow/三者辨析/ReAct 实现/三大范式对比）+ RAG 进阶与向量库（双链路 10 步/进阶范式/评估指标/HNSW·IVF·PQ/选型），另补 Function Calling 深入 | 学习 | 1 → 2 | notebook/ai/ 新增 ai-07、ai-08，ai-03 增第六节；九问全部落到文件 |
| 2026-10-14 | Spring 与分布式架构 | 分布式事务：CAP/BASE 定调、XA+2PC 四缺陷、TCC/Saga/可靠消息三方案对比、TCC 幂等+防空回滚+防悬挂的事务控制表完整实现（含 Java 代码与 Seata fence 对照） | 学习 | 0 → 1 | 讲义：notebook/spring-distributed/spring-distributed-transactions.md |
| 2026-10-15 | Redis | 编码实现层深度：SDS（int/embstr/raw，44 字节推导）/ listpack 取代 ziplist（级联更新）/ quicklist（PLAIN、LZF）/ dict 渐进式 rehash（负载因子 1/5/0.1、读写路由）/ intset 升级 / ZSet 跳表+dict（span 算排名，纠偏「并发友好」误传） | 学习 | 1 → 2（待验证） | 讲义：notebook/redis/redis-05-internal-encoding.md；含 7 张自绘结构图（notebook/redis/images/），README 速查表新增 11-13 |
| 2026-10-15 | 场景题（系统设计） | 微信红包：二倍均值拆包 / 分单位精度 / 预分配 vs 实时计算 / Redis 原子分配份额 + 领取去重 / MQ 异步落库 / 24h 延迟退回（RocketMQ 4.x 延迟级别最长 2h 的边界）/ 超发少发对账兜底 | 学习 | 0 → 1 | 新建目录 notebook/scenario-design/（README + scenario-red-packet.md）；同步更新 scripts/gen_notebook_index.py 主题表，总目录刷新为 10 主题 / 45 份 |
| 2026-10-15 | Redis | 内存淘汰策略：两个默认值（`maxmemory 0` + `noeviction`）→ 内存满报 OOM；8 种策略总表（候选集 × 淘汰依据 × 淘汰时机 × 无 key 可淘汰时的行为）；近似 LRU（24 bit 时间戳 + 采样 5 + 16 槽 eviction pool + 为什么不用真 LRU）；LFU（16 bit LDT + 8 bit 对数计数器、`p=1/(c×10+1)`、衰减、扫描污染）；淘汰 vs 过期删除的区别；7.0 `maxmemory-clients`；maxmemory 留 30~40% 余量给 COW | 学习 | 2（待验证） | 讲义：notebook/redis/redis-06-eviction-policies.md（约 350 行，含追问链 15 条 + 误区 10 条）；redis/README.md 速查表新增 18-23；总目录刷新为 10 主题 / 51 份 / 约 14,420 行 |
| 2026-10-15 | 全主题 | **「零悬空问题」专项**：扫描 notebook 全部 50 份讲义，把 19 份「追问链自测」（纯问题清单，约 196 题零答案）统一改为 `追问链 · 参考答案` 三列表格（层级/问题/参考答案要点，60-120 字可朗读答案）；把 13 份 `误区` 改为 `误区 · 正解` 两列表格（❌ 命题 / ✅ 完整正解）。覆盖 ai×7、java-core×7、redis×4、spring-distributed×1；另把 mysql-core-ten-topics 第 12 节「面试问法（场景化）」10 条关键词提示扩写成完整答案 | 修订 | — | 现共 26 份讲义带标准答案表格；同步加固 skill（SKILL.md 新增「硬性约束：零悬空问题」六条 + lecture-template.md 新增第 7/8 节），杜绝后续再生成只问不答的讲义 |
| 2026-10-16 | Java 设计模式 | **GoF 23 种全量首讲**：创建型 5（单例 / 工厂方法 / 抽象工厂 / 建造者 / 原型）+ 结构型 7（适配器 / 桥接 / 组合 / 装饰器 / 外观 / 享元 / 代理）+ 行为型 11（责任链 / 命令 / 解释器 / 迭代器 / 中介者 / 备忘录 / 观察者 / 状态 / 策略 / 模板方法 / 访问者）。每份含 Mermaid 类图（部分加时序图 / 状态图）、可运行 Java 示例、JDK/Spring/MyBatis/Dubbo/Netty 真实类名案例、60 秒口述版、追问链 8-10 条带答案、误区 6-8 条带正解 | 学习 | 0 → 1 | 新建目录 `notebook/java-design-patterns/`（README + 23 份，约 5,700 行）；README 含分类表、**易混模式辨析速查（14 组对比）**、框架源码速查、28 条高频题速查。架构图按用户选择统一用 Mermaid 内嵌，不生成图片文件。同步更新 SKILL.md（十大主题 + 设计模式目录约定）、lecture-template.md、gen_notebook_index.py；总目录刷新为 **11 主题 / 75 份 / 约 20,256 行** |
| 2026-10-15 | Redis | 持久化纠错与扩写（基于用户 docx 自查笔记）：纠「默认不持久化」「RDB 只两种触发」「COW 复制给子进程」「改 2GB 占 2GB」；补 aof_buf→write→fsync 链路、写后日志 vs WAL、everysec 2 秒追加阻塞保护、重写四细节（不读旧文件 / 过期键不写 / 64 元素拆分 / 与 BGSAVE 互斥）、**7.0 多部分 AOF 真实文件名**（appendonly.aof.N.base.rdb / .incr.aof / .manifest）、INFO persistence 排查手册、RDB 加载安全（CVE-2026-62356 已核实） | 学习 | 2（待验证） | 重写 notebook/redis/redis-02-persistence.md（124 行 → 约 400 行）；redis/README.md 速查表新增 14-17；总目录刷新为 10 主题 / 50 份 / 约 14,086 行 |

## 当前学习阶段

- 当前轮次：第一轮（建骨架）
- 已完成：JVM 收集器主线（6 讲）；MySQL 3 讲；XXL-JOB 1 讲；算法 1 次（4 份讲义 + 20 题清单）；消息中间件 1 次（3 份讲义）；AI 应用开发 2 次（豆包笔记分类归纳 6 份 + Agent/RAG 进阶 2 份，共 8 份讲义）；Redis 2 次（5 份讲义）；Spring 与分布式架构 1 讲（分布式事务）；场景题 1 次（6 份讲义：红包 / 秒杀 / 短链 / 点赞 / 附近的人 / 打卡）；**Java 设计模式 1 次（GoF 23 份 + README）**
- 目录约定：讲义按主题存放在 `notebook/<主题目录>/`，11 个主题目录与 skill 知识地图 `references/01-` ~ `11-` 一一对应（jvm / java-core / **java-design-patterns** / mysql / mq / spring-distributed / xxl-job / redis / ai / algorithm / scenario-design）
- 阻塞点：
  - `labs/` 依旧为空，累计十余讲零实验、零模拟面试；除 JVM 两个主题外掌握度多为「待验证」或「1 见过」
  - 算法与 MQ 均为「一次性铺满」式输入，讲义体量大但没有任何做题或面试校验
  - 强烈建议：下一轮停止新增讲义，任选一项动手 —— ① 按 `notebook/algorithm/README.md` 的必刷 20 题动手写 3 道并自问追问链；② 做一次 MQ 或 MySQL 模拟面试；③ 跑一个锁 / EXPLAIN / GC 日志实验
