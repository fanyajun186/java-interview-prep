# notebook

讲义存放处。**按主题分目录，不要直接堆在根下。**

> 本文件由 `scripts/gen_notebook_index.py` 自动生成，最后更新于 2026-10-28。
> 新增 / 重命名讲义后重跑脚本即可刷新清单：
>
> ```bash
> python scripts/gen_notebook_index.py
> ```

## 总览

- **11** 个主题目录，**103** 份讲义，累计约 **28,141** 行
- 每个主题目录内可含一份 `README.md` 作为该主题的索引与高频题速查表

## 目录约定

主题目录名与 skill 知识地图文件一一对应：

| 子目录 | 对应知识地图 | 内容 | 讲义数 |
| --- | --- | --- | --- |
| [`jvm/`](#jvm) | `01-jvm.md` | JVM 内存结构、GC、类加载、调优与排查 | 8 份 |
| [`java-core/`](#java-core) | `02-java-core.md` | Java 底层：集合、并发/JMM、锁、类加载 | 12 份 |
| [`java-design-patterns/`](#java-design-patterns) | `10-java-design-patterns.md` | GoF 23 种设计模式：定义、实现、源码案例、辨析与坑 | 24 份 |
| [`mysql/`](#mysql) | `03-mysql.md` | 索引、事务与锁、MVCC、执行计划、主从复制 | 11 份 |
| [`mq/`](#mq) | `04-mq.md` | RabbitMQ / RocketMQ / Kafka | 4 份 |
| [`spring-distributed/`](#spring-distributed) | `05-spring-distributed.md` | 分布式事务、分布式 ID、注册配置中心、服务调用、限流熔断、CAP | 11 份 |
| [`xxl-job/`](#xxl-job) | `06-xxl-job.md` | 调度架构、分片、幂等、高可用 | 1 份 |
| [`redis/`](#redis) | `07-redis.md` | 数据类型与编码、持久化、集群、缓存问题与分布式锁 | 10 份 |
| [`ai/`](#ai) | `08-ai.md` | LLM / Prompt / RAG / Agent / Java 侧 AI 工程化 | 10 份 |
| [`algorithm/`](#algorithm) | `09-algorithm.md` | 复杂度分析、套路模板、手撕题、海量数据处理 | 5 份 |
| [`scenario-design/`](#scenario-design) | `11-scenario-design.md` | 系统设计场景题：红包 / 秒杀 / 短链 / 点赞 等 | 7 份 |

## 讲义清单

### jvm

| 文件 | 标题 | 行数 |
| --- | --- | --- |
| [`jvm-card-table-remembered-set.md`](jvm/jvm-card-table-remembered-set.md) | JVM · 卡表与 RSet（记忆集） | 532 |
| [`jvm-class-loading.md`](jvm/jvm-class-loading.md) | JVM · 类加载机制与双亲委派 | 432 |
| [`jvm-cms.md`](jvm/jvm-cms.md) | JVM · CMS 收集器 | 165 |
| [`jvm-g1-collector.md`](jvm/jvm-g1-collector.md) | JVM · G1 收集器：Region 布局与 GC 时序 | 1422 |
| [`jvm-tricolor-satb-incremental-update.md`](jvm/jvm-tricolor-satb-incremental-update.md) | 三色标记法、增量更新与 SATB 完整对比 | 183 |
| [`jvm-write-barrier.md`](jvm/jvm-write-barrier.md) | 写前屏障与写后屏障（Write Barrier）详解 | 198 |
| [`jvm-young-old-gen-gc-events.md`](jvm/jvm-young-old-gen-gc-events.md) | JVM 新生代划分与 GC 事件对照（Minor GC / Full GC / STW） | 182 |
| [`jvm-young-old-gen-ratio-tuning.md`](jvm/jvm-young-old-gen-ratio-tuning.md) | 新生代 / 老年代比例的业务化设置：ParNew + CMS vs G1 | 303 |

配图 / 附件：`jvm/images/class-loading-jit.png`、`jvm/images/class-loading-lifecycle.png`、`jvm/images/class-loading-steps.png`、`jvm/images/classloader-breaks.png`


### java-core

| 文件 | 标题 | 行数 |
| --- | --- | --- |
| [`java-core-aqs.md`](java-core/java-core-aqs.md) | AQS 原理 + Semaphore / CountDownLatch / CyclicBarrier | 721 |
| [`java-core-cas.md`](java-core/java-core-cas.md) | CAS 特性 + 公平性问题 + ABA 问题 | 561 |
| [`java-core-classloader-parent-delegation.md`](java-core/java-core-classloader-parent-delegation.md) | 类加载机制与双亲委派模型 | 438 |
| [`java-core-concurrenthashmap.md`](java-core/java-core-concurrenthashmap.md) | ConcurrentHashMap 深度讲义（JDK 7 → JDK 8） | 551 |
| [`java-core-hashmap.md`](java-core/java-core-hashmap.md) | HashMap 深度讲义（JDK 8） | 496 |
| [`java-core-lock-support.md`](java-core/java-core-lock-support.md) | LockSupport 原理与用法 | 351 |
| [`java-core-synchronized-lock-upgrade.md`](java-core/java-core-synchronized-lock-upgrade.md) | synchronized 与锁升级：从字节码到 ObjectMonitor | 544 |
| [`java-core-threadlocal.md`](java-core/java-core-threadlocal.md) | ThreadLocal：引用链、ThreadLocalMap 与泄漏的真实因果 | 512 |
| [`java-core-threadpool.md`](java-core/java-core-threadpool.md) | 线程池 ThreadPoolExecutor：参数、流转、拒绝策略与三个线上坑 | 408 |
| [`java-core-try-catch-finally.md`](java-core/java-core-try-catch-finally.md) | try-catch-finally 执行顺序：return 遇上 finally 谁说了算 | 264 |
| [`java-core-unsafe.md`](java-core/java-core-unsafe.md) | Unsafe 是什么？JUC 的地基 | 322 |
| [`java-core-volatile-memory.md`](java-core/java-core-volatile-memory.md) | volatile：可见性原理、MESI 协议与内存屏障 | 561 |


### java-design-patterns

| 文件 | 标题 | 行数 |
| --- | --- | --- |
| [`README.md`](java-design-patterns/README.md) | Java 设计模式 · 笔记索引 | 148 |
| [`pattern-01-singleton.md`](java-design-patterns/pattern-01-singleton.md) | 单例模式（Singleton） | 275 |
| [`pattern-02-factory-method.md`](java-design-patterns/pattern-02-factory-method.md) | 工厂方法（Factory Method） | 269 |
| [`pattern-03-abstract-factory.md`](java-design-patterns/pattern-03-abstract-factory.md) | 抽象工厂（Abstract Factory） | 256 |
| [`pattern-04-builder.md`](java-design-patterns/pattern-04-builder.md) | 建造者（Builder） | 253 |
| [`pattern-05-prototype.md`](java-design-patterns/pattern-05-prototype.md) | 原型（Prototype） | 221 |
| [`pattern-06-adapter.md`](java-design-patterns/pattern-06-adapter.md) | 适配器模式（Adapter） | 243 |
| [`pattern-07-bridge.md`](java-design-patterns/pattern-07-bridge.md) | 桥接模式（Bridge） | 221 |
| [`pattern-08-composite.md`](java-design-patterns/pattern-08-composite.md) | 组合模式（Composite） | 243 |
| [`pattern-09-decorator.md`](java-design-patterns/pattern-09-decorator.md) | 装饰器模式（Decorator） | 246 |
| [`pattern-10-facade.md`](java-design-patterns/pattern-10-facade.md) | 外观模式（Facade） | 225 |
| [`pattern-11-flyweight.md`](java-design-patterns/pattern-11-flyweight.md) | 享元模式（Flyweight） | 221 |
| [`pattern-12-proxy.md`](java-design-patterns/pattern-12-proxy.md) | 代理模式（Proxy） | 246 |
| [`pattern-13-chain-of-responsibility.md`](java-design-patterns/pattern-13-chain-of-responsibility.md) | 责任链模式（Chain of Responsibility） | 253 |
| [`pattern-14-command.md`](java-design-patterns/pattern-14-command.md) | 命令模式（Command） | 259 |
| [`pattern-15-interpreter.md`](java-design-patterns/pattern-15-interpreter.md) | 解释器模式（Interpreter） | 238 |
| [`pattern-16-iterator.md`](java-design-patterns/pattern-16-iterator.md) | 迭代器模式（Iterator） | 236 |
| [`pattern-17-mediator.md`](java-design-patterns/pattern-17-mediator.md) | 中介者模式（Mediator） | 222 |
| [`pattern-18-memento.md`](java-design-patterns/pattern-18-memento.md) | 备忘录模式（Memento） | 207 |
| [`pattern-19-observer.md`](java-design-patterns/pattern-19-observer.md) | 观察者模式（Observer） | 218 |
| [`pattern-20-state.md`](java-design-patterns/pattern-20-state.md) | 状态模式（State） | 237 |
| [`pattern-21-strategy.md`](java-design-patterns/pattern-21-strategy.md) | 策略模式（Strategy） | 230 |
| [`pattern-22-template-method.md`](java-design-patterns/pattern-22-template-method.md) | 模板方法模式（Template Method） | 210 |
| [`pattern-23-visitor.md`](java-design-patterns/pattern-23-visitor.md) | 访问者模式（Visitor） | 228 |


### mysql

| 文件 | 标题 | 行数 |
| --- | --- | --- |
| [`mysql-architecture.md`](mysql/mysql-architecture.md) | MySQL 主题一：InnoDB 从 Server 层到引擎层的架构 | 129 |
| [`mysql-btree-and-sharding.md`](mysql/mysql-btree-and-sharding.md) | MySQL 主题 2：为什么选 B+ 树、三层容量手算与 2000 万分表阈值 | 332 |
| [`mysql-core-ten-topics.md`](mysql/mysql-core-ten-topics.md) | MySQL 核心十大主题 · 总纲索引（InnoDB） | 49 |
| [`mysql-index-optimization.md`](mysql/mysql-index-optimization.md) | MySQL 索引失效与慢 SQL 分析优化（合并讲义） | 227 |
| [`mysql-join-small-table-drives-big.md`](mysql/mysql-join-small-table-drives-big.md) | MySQL InnoDB 连表查询：为什么「小表驱动大表」 | 287 |
| [`mysql-lock-with-without-transactional.md`](mysql/mysql-lock-with-without-transactional.md) | InnoDB + RR：加与不加 @Transactional 时的加锁行为全解 | 320 |
| [`mysql-locks-deadlock.md`](mysql/mysql-locks-deadlock.md) | MySQL 锁体系与死锁：一条线讲透 | 271 |
| [`mysql-logs.md`](mysql/mysql-logs.md) | MySQL 三大日志：undo log / redo log / binlog | 260 |
| [`mysql-range-query-division.md`](mysql/mysql-range-query-division.md) | 范围查询的引擎层与 Server 层分工 | 137 |
| [`mysql-replication.md`](mysql/mysql-replication.md) | MySQL 主从复制（Replication） | 92 |
| [`mysql-transaction-mvcc.md`](mysql/mysql-transaction-mvcc.md) | MySQL 事务隔离、MVCC 与当前读：一条线讲透 | 216 |


### mq

| 文件 | 标题 | 行数 |
| --- | --- | --- |
| [`README.md`](mq/README.md) | 消息中间件 | 36 |
| [`mq-kafka.md`](mq/mq-kafka.md) | 消息中间件 · Kafka | 365 |
| [`mq-rabbitmq.md`](mq/mq-rabbitmq.md) | 消息中间件 · RabbitMQ | 395 |
| [`mq-rocketmq.md`](mq/mq-rocketmq.md) | 消息中间件 · RocketMQ | 389 |


### spring-distributed

| 文件 | 标题 | 行数 |
| --- | --- | --- |
| [`README.md`](spring-distributed/README.md) | Spring 与分布式 · 笔记索引 | 37 |
| [`spring-distributed-boot-vs-cloud.md`](spring-distributed/spring-distributed-boot-vs-cloud.md) | Spring Boot 与 Spring Cloud · 区别与生态 | 143 |
| [`spring-distributed-cap.md`](spring-distributed/spring-distributed-cap.md) | 分布式理论 · CAP 为什么只能满足两个 | 115 |
| [`spring-distributed-eureka.md`](spring-distributed/spring-distributed-eureka.md) | Spring Cloud Netflix · Eureka 注册中心 | 113 |
| [`spring-distributed-id-snowflake.md`](spring-distributed/spring-distributed-id-snowflake.md) | 分布式 ID 与雪花算法（Snowflake）：原理、时钟回拨与工程实践 | 189 |
| [`spring-distributed-nacos.md`](spring-distributed/spring-distributed-nacos.md) | Spring Cloud Alibaba · Nacos 注册中心与配置中心 | 128 |
| [`spring-distributed-openfeign.md`](spring-distributed/spring-distributed-openfeign.md) | Spring Cloud OpenFeign · 声明式服务调用 | 212 |
| [`spring-distributed-resilience4j.md`](spring-distributed/spring-distributed-resilience4j.md) | Resilience4j · 轻量级容错库 | 243 |
| [`spring-distributed-sentinel.md`](spring-distributed/spring-distributed-sentinel.md) | Spring Cloud Alibaba · Sentinel 流控与熔断降级 | 130 |
| [`spring-distributed-springboot-startup.md`](spring-distributed/spring-distributed-springboot-startup.md) | Spring Boot · 启动流程 | 137 |
| [`spring-distributed-transactions.md`](spring-distributed/spring-distributed-transactions.md) | 分布式事务：强一致 XA/2PC、最终一致 TCC/Saga/可靠消息与 TCC 三大防御 | 284 |


### xxl-job

| 文件 | 标题 | 行数 |
| --- | --- | --- |
| [`xxl-job-usage-and-internals.md`](xxl-job/xxl-job-usage-and-internals.md) | XXL-JOB · 使用介绍、表结构与底层实现原理 | 632 |


### redis

| 文件 | 标题 | 行数 |
| --- | --- | --- |
| [`README.md`](redis/README.md) | Redis · 笔记索引 | 76 |
| [`redis-01-data-types.md`](redis/redis-01-data-types.md) | Redis 基础类型：使用场景与底层数据结构 | 216 |
| [`redis-02-persistence.md`](redis/redis-02-persistence.md) | Redis 持久化：RDB 与 AOF | 534 |
| [`redis-03-replication-sentinel-cluster.md`](redis/redis-03-replication-sentinel-cluster.md) | Redis 主从复制、哨兵与集群：通信与选举 | 181 |
| [`redis-04-single-thread-model.md`](redis/redis-04-single-thread-model.md) | Redis 单线程模型与 6.0 多线程 IO | 115 |
| [`redis-05-internal-encoding.md`](redis/redis-05-internal-encoding.md) | Redis 底层数据结构深度：SDS / listpack / quicklist / dict / intset / skiplist | 178 |
| [`redis-06-eviction-policies.md`](redis/redis-06-eviction-policies.md) | Redis 内存淘汰策略：LRU / LFU 与 8 种 maxmemory-policy | 474 |
| [`redis-07-cluster-deep-dive.md`](redis/redis-07-cluster-deep-dive.md) | Redis Cluster 深入：槽路由、在线迁移、故障转移、Gossip、脑裂 | 356 |
| [`redis-08-concurrency-atomicity.md`](redis/redis-08-concurrency-atomicity.md) | Redis 并发安全：单线程下多条命令的原子性怎么保证 | 204 |
| [`redis-09-cache-db-consistency.md`](redis/redis-09-cache-db-consistency.md) | Redis 缓存与数据库一致性：先删缓存还是先改库 | 148 |


### ai

| 文件 | 标题 | 行数 |
| --- | --- | --- |
| [`README.md`](ai/README.md) | AI 应用开发 · 笔记索引 | 61 |
| [`ai-01-interview-outline.md`](ai/ai-01-interview-outline.md) | AI 应用方向面试大纲与背诵框架 | 101 |
| [`ai-02-llm-rag-basics.md`](ai/ai-02-llm-rag-basics.md) | LLM 基础概念与 RAG 完整链路 | 140 |
| [`ai-03-agent-tool-calling.md`](ai/ai-03-agent-tool-calling.md) | Agent、Tool Calling 与 ReAct | 238 |
| [`ai-04-skills-mechanism.md`](ai/ai-04-skills-mechanism.md) | Skills 机制：SKILL.md 如何工作 | 127 |
| [`ai-05-java-engineering.md`](ai/ai-05-java-engineering.md) | Java 工程落地：从 SSE 到自研工具调用运行时 | 264 |
| [`ai-06-project-experience.md`](ai/ai-06-project-experience.md) | 项目经验：RAG 知识库 STAR 故事与 autocava-ai 提炼 | 81 |
| [`ai-07-agent-paradigms.md`](ai/ai-07-agent-paradigms.md) | Agent 范式：定义、组件、推理模式与 Workflow 的边界 | 282 |
| [`ai-08-rag-and-vector-db.md`](ai/ai-08-rag-and-vector-db.md) | RAG 工作流程进阶与向量数据库 | 155 |
| [`ai-project-interview.md`](ai/ai-project-interview.md) | ChatController\#chatMessagesStream 提问全链路梳理 | 95 |


### algorithm

| 文件 | 标题 | 行数 |
| --- | --- | --- |
| [`README.md`](algorithm/README.md) | 算法与手写代码 | 50 |
| [`algorithm-01-handwritten-basics.md`](algorithm/algorithm-01-handwritten-basics.md) | 算法 · 手写基础题与并发小题 | 546 |
| [`algorithm-02-sorting-search.md`](algorithm/algorithm-02-sorting-search.md) | 算法 · 排序与查找 | 629 |
| [`algorithm-03-data-structure.md`](algorithm/algorithm-03-data-structure.md) | 算法 · 数据结构手写题 | 610 |
| [`algorithm-04-leetcode-hot.md`](algorithm/algorithm-04-leetcode-hot.md) | 算法 · 力扣高频题 | 635 |


### scenario-design

| 文件 | 标题 | 行数 |
| --- | --- | --- |
| [`README.md`](scenario-design/README.md) | 场景题（系统设计）· 笔记索引 | 48 |
| [`scenario-01-red-packet.md`](scenario-design/scenario-01-red-packet.md) | 场景题：设计一个微信红包系统 | 228 |
| [`scenario-02-seckill.md`](scenario-design/scenario-02-seckill.md) | 场景题：设计一个秒杀系统 | 172 |
| [`scenario-03-short-url.md`](scenario-design/scenario-03-short-url.md) | 场景题：设计一个短链系统 | 149 |
| [`scenario-04-like-counter.md`](scenario-design/scenario-04-like-counter.md) | 场景题：点赞 / 计数系统 | 149 |
| [`scenario-05-nearby-geo.md`](scenario-design/scenario-05-nearby-geo.md) | 场景题：附近的人 / 附近的门店 | 128 |
| [`scenario-06-checkin-bitmap.md`](scenario-design/scenario-06-checkin-bitmap.md) | 场景题：签到打卡与缺卡查询（Redis Bitmap） | 152 |

## 文件命名

- `jvm/jvm-cms.md`
- `mysql/mysql-core-ten-topics.md`
- `redis/redis-05-internal-encoding.md`

主题前缀保留（便于单独打开文件时辨认来源），分类靠目录表达。

## 写作要求

只记录自己的话、源码要点、踩过的坑，不要复制整段资料。
结构参考 skill 的 `assets/lecture-template.md`。
