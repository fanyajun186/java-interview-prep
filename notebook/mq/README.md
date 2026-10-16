# 消息中间件

本目录收录 RabbitMQ / RocketMQ / Kafka 三件套的独立讲义。对应 skill 知识地图 `references/04-mq.md`。

## 文件清单

| 文件 | 覆盖内容 | 侧重 |
| --- | --- | --- |
| `mq-rabbitmq.md` | AMQP 模型与四种 Exchange、连接/信道/队列的 Erlang 进程模型、confirm + return + ack/prefetch、TTL+DLX 与延迟插件、DLX 三个触发条件、流控与 blocked 排查 | **确认机制最细**、路由模型、延迟队列的坑 |
| `mq-rocketmq.md` | NameServer/Broker/MessageQueue、CommitLog+ConsumeQueue+IndexFile 存储推导、mmap/PageCache、刷盘与复制四组合、事务消息、顺序消息、Rebalance、SendResult 四状态、`%RETRY%`/`%DLX%` | **存储设计与事务消息**、延迟消息原生能力 |
| `mq-kafka.md` | 分区/副本/ISR/HW/LEO、日志分段与稀疏索引、sendfile 零拷贝、攒批与压缩、Rebalance 与分配策略、acks × min.insync.replicas、幂等生产者与事务、KRaft、延迟/死信的替代方案 | **吞吐架构与副本一致性**，以及「它做不了什么」 |

每份文件统一结构：定位与选型 → 架构图 → 使用（Java 客户端 + Spring 集成 + 运维命令）→ 底层原理 → **确认机制** → **延迟队列支持情况** → **死信队列支持情况** → **量级** → 高频追问与常见误区。

## 三个高频判断（先记住这三条，再进文件）

| 问题 | RabbitMQ | RocketMQ | Kafka |
| --- | --- | --- | --- |
| 延迟队列 | 不原生（TTL+DLX 有队头阻塞 / 插件不可靠） | **原生**（4.x 18 级 / 5.x 任意时间） | **不原生**（模型冲突） |
| 死信队列 | **原生**（DLX） | **原生**（`%DLX%` + 重试队列） | 不原生（Spring Kafka / Connect 自建） |
| 确认机制 | 生产者 confirm + 消费者**逐条 ack**（可重回队列） | SendResult 状态 + 监听器返回值（**按位点**） | acks + **位点批量提交**，且必须配 `min.insync.replicas` |

## 选型一句话

- 低延迟、中小量、路由灵活、要死信重试 → **RabbitMQ**
- 交易域、要顺序 / 事务消息 / 延迟消息 / 海量堆积 → **RocketMQ**
- 日志与流式、超大规模吞吐、要消息重放 → **Kafka**

## 面试前 3 天复习清单

1. 每份文件的「确认机制」与「量级」两节（这两节最容易答成背概念）。
2. 每份文件末尾的「常见误区」表。
3. 三条能一句话定生死的结论：
   - RabbitMQ 的 `requeue=true` 会放回**队头**，必然失败的消息会造成 redelivery 风暴；
   - RocketMQ 所有 Topic 只写**一份 CommitLog 顺序追加**，ConsumeQueue 只是稀疏索引；
   - Kafka 的 `acks=all` **不等于**可靠，必须 `min.insync.replicas >= 2`。
