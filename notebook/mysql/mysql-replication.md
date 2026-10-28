# MySQL 主从复制（Replication）

> 面向 12 年经验工程师，目标中大厂 P6-P7。版本前提：MySQL 5.7 / 8.0 / 8.4，基于 binlog 的主从复制。
>
> 参考文章链接：<https://mp.weixin.qq.com/s/4wxIAQ5vQb7E9_2-AarWZQ>
>
> 说明：原文是一篇偏实操的入门配置文，三步流程与搭建步骤正确，但缺 binlog 格式、半同步等待点、GTID、并行复制、主从延迟、双 1 等面试必考点。本文在原文骨架之上补全，并修正三处软问题（8.0 术语废弃分界、read_only 挡不住 SUPER、binlog-do-db 过滤坑）。

## 面试问法

**Q1：为什么要做主从复制？**

- 60 秒版本：三个目的。① 高可用与故障转移：主库宕机可切从库，避免单点；② 读写分离扩展读能力：从库承担读流量，主库专心写，读多写少场景吞吐翻倍；③ 从库备份与异地容灾：备份在从库做不堵主库，跨机房部署抵御单机房故障。
- 补充点：原文只提了容错一条，面试答全三点更稳。注意主从是「主库单点写、从库追平」，不是双写；写只在主库，从库通过复制追上。

**Q2：主从复制的整体流程是怎样的？**

- 60 秒版本：三步走，但有两个线程细节容易漏。① 主库事务提交写 binlog，并为每个连进来的从库起一个 **binlog dump 线程**推送；② 从库的 **IO 线程**连接主库拉取 binlog，写入本地 **relay log（中继日志）**；③ 从库的 **SQL 线程**读取 relay log 重放，把变更应用到从库数据。主库 dump、从库 IO/SQL 是三段式，不是「从库一个线程搞定」。
- 补充点：默认是**异步**的，主库提交即返回客户端、不等其他从库，所以才有后面的延迟与半同步话题。relay log 相当于从库侧的 binlog 缓存，重放完会被 purge 清理。

**Q3：binlog 有哪几种格式？为什么推荐 ROW？**

- 60 秒版本：三种。STATEMENT 记 SQL 原文（省空间，但 UUID()/NOW()/存储函数等不确定函数主从结果可能不一致）；ROW 记每行实际变更（一致性最强，但日志体积大，大事务尤其明显）；MIXED 由 MySQL 自己判断，大部分用 STATEMENT、遇到不确定函数自动切 ROW。生产推荐 ROW，一致性优先。
- 补充点：ROW 格式下主从看到的是同一行的前后像，彻底规避 statement 的不确定性坑；代价是 binlog 更大、网络与磁盘压力更高，配合 `binlog_row_image=MINIMAL` 可只记变更列减负。binlog 三种格式的完整细节见 mysql-logs.md。

**Q4：默认异步复制有什么隐患？半同步、全同步是什么？**

- 60 秒版本：默认异步，主库一提交就返回，binlog 还没发到从库就宕机，failover 到从库会**丢已提交数据**。半同步（semi-sync）让主库提交前至少等一个从库收到 binlog 并 ACK 才返回，丢数据概率大幅降低；全同步要求所有从库都收到才返回，最安全但性能最差，一般用 Group Replication 实现。
- 补充点：半同步还要分两种等待点。`AFTER_COMMIT`（5.6 默认）主库先提交再等 ACK，若提交后崩溃前 ACK 没回来，客户端已拿到成功、从库却没收到，仍可能丢；`AFTER_SYNC`（5.7 起默认）主库先等 ACK 再提交，崩溃时两边都没提交、客户端也没收到成功，**无损**。所以「半同步就不丢」是错的，要看等待点。

**Q5：什么是主从延迟？怎么产生、怎么解决？**

- 60 秒版本：从库 SQL 线程把 relay log 串行重放，而主库是并发写的，单线程追不上就会滞后（Seconds_Behind_Source，8.0.22 前叫 Seconds_Behind_Master）。放大因素：大事务（一次删几百万行）、从库机器配置弱于主库、从库上有慢查询或锁竞争、DDL。解决：开启**并行复制 MTS**（多线程重放）、拆小事务、提升从库配置、把大操作避开高峰期。
- 补充点：MTS 由 `slave_parallel_workers` 控制 worker 数，`slave_parallel_type` 选 `LOGICAL_CLOCK`（5.7+，按事务并行，同一提交组内的事务可同时重放）而非老的 `DATABASE`（按库分发的粒度太粗）；8.0 配合 `binlog_transaction_dependency_tracking=WRITESET` 可进一步放大多并行度。

**Q6：怎么从零搭建一套主从？**

- 60 秒版本：主库开 binlog、设唯一 `server-id`、定 `binlog-format`；建复制专用账号 `GRANT REPLICATION SLAVE`；`SHOW MASTER STATUS` 记 `File`/`Position`。从库设不同 `server-id`、`relay-log`、`read_only=ON`；`CHANGE MASTER TO`（8.0.23+ 改用 `CHANGE REPLICATION SOURCE TO`）指主库地址、账号、位点；`START SLAVE`（8.0.22+ 改 `START REPLICA`）；`SHOW SLAVE STATUS` 看 `Slave_IO_Running`/`Slave_SQL_Running` 双 Yes 即成功。
- 补充点：原文配置步骤正确，三处要补刀。① 8.0.22 起 `SHOW SLAVE STATUS` 与 `START SLAVE` 改用 REPLICA 新名，8.0.23 起 `CHANGE MASTER TO` 改用 `CHANGE REPLICATION SOURCE TO`，旧名仍可用但已废弃；② `read_only=ON` 挡不住 SUPER 用户和复制线程，要彻底防写用 `super_read_only=ON`；③ `binlog-do-db` 这类过滤基于「当前默认库」判断，跨库语句容易踩坑，生产慎用。

**Q7：GTID 复制是什么？和位点复制有什么区别？**

- 60 秒版本：GTID 给每个事务一个全局唯一 ID（`server_uuid:事务序号`），主从都用它定位进度，不再手填 `MASTER_LOG_FILE`/`MASTER_LOG_POS`。建链用 `CHANGE MASTER TO MASTER_AUTO_POSITION=1`，failover 时从库自动从缺失的 GTID 接着拉，不用人工算位点。
- 补充点：开启需 `gtid_mode=ON` + `enforce_gtid_consistency=ON`。GTID 最大的价值是**故障切换省心**：传统位点复制切换后要人肉对齐 binlog 位点，GTID 自动对齐，配合 Orchestrator/MGR 做自动 failover 几乎必选。

**Q8：双 1 参数是什么？和主从一致性什么关系？**

- 60 秒版本：双 1 指 `sync_binlog=1`（每次提交都 fsync binlog）和 `innodb_flush_log_at_trx_commit=1`（每次提交都 fsync redo）。两者保证主库崩溃后已提交事务不丢、binlog 与 redo 一致。主从不丢数据要主库双 1 加半同步（AFTER_SYNC）组合：主库自己不丢，再至少一个从库收到。
- 补充点：双 1 牺牲一点写吞吐换崩溃安全，是金融等强一致场景的底线；只开半同步不 double-1，主库宕机仍可能丢已提交事务，且 binlog 与 redo 可能不一致导致恢复异常。

## 主从复制链路（异步 + 半同步 ACK 回路）

```mermaid
flowchart LR
    subgraph MASTER["主库 Master"]
        T1[事务提交] --> B1[写 binlog]
        B1 --> D1[binlog dump 线程<br/>推送 binlog]
    end
    subgraph SLAVE["从库 Slave"]
        I1[IO 线程<br/>拉取 binlog] --> R1[写 relay log]
        R1 --> S1[SQL 线程<br/>重放 relay log]
        S1 --> D2[从库数据]
    end
    D1 -->|binlog 事件| I1
    S1 -.->|半同步: 收到 ACK 才提交(主库)| D1
```

## 追问链

| 层级 | 问题 | 参考答案要点 |
| -- | -- | -- |
| L1 | 主库没开 binlog，从库还能复制吗？ | 不能。binlog 是复制的数据源，没开 `log-bin` 主库不产生 binlog，dump 线程无内容可推，复制无从谈起。 |
| L2 | 从库为什么会有延迟，根因是什么？ | 主库并发写，从库默认单 SQL 线程串行重放 relay log，消费速度跟不上生产速度。大事务、从库弱、锁竞争、DDL 都会放大。开 MTS 并行复制才治本。 |
| L2 | STATEMENT 格式有什么坑？ | 含 UUID()/NOW()/RAND()/存储函数等不确定元素时，主从执行结果可能不一致；ROW 记行前后像彻底规避，但日志更大。不确定语句在 ROW 下也安全。 |
| L3 | 并行复制有哪几种粒度？ | `slave_parallel_type`：DATABASE（按库分发，粒度粗、单库无效）和 LOGICAL_CLOCK（5.7+，按事务依赖并行，同提交组内可同时重放）；8.0 用 WRITESET 依赖跟踪进一步放开并行度。 |
| L1 | 半同步复制就一定不丢数据吗？ | 不一定，看等待点。AFTER_COMMIT（旧）主库先提交再等 ACK，提交后崩溃前 ACK 未到则客户端已成功、从库没收到，仍丢；AFTER_SYNC（5.7 默认）先等 ACK 再提交，无损。 |
| L2 | read_only=ON 能完全防写吗？ | 不能。它只挡普通连接，SUPER 权限用户和复制 SQL 线程仍可写；要彻底防误写用 `super_read_only=ON`。从库只读还应配合账号权限收敛。 |
| L2 | 从库怎么知道从哪个位点开始拉？ | 位点复制靠 `CHANGE MASTER TO` 指定 MASTER_LOG_FILE/MASTER_LOG_POS（即 SHOW MASTER STATUS 的 File/Position）；GTID 复制用 MASTER_AUTO_POSITION=1 自动对齐，无需手填。 |
| L3 | relay log 会一直涨吗？ | 不会。SQL 线程重放完的 relay log 会被 purge（受 `relay_log_purge` 控制，默认 ON），只保留未重放部分，类似 binlog 的清理机制。 |

## 常见误区

| ❌ 误区 | ✅ 正解 |
| -- | -- |
| 主从复制是同步的，主库写完成从库也一定完成 | 默认是异步复制，主库提交即返回客户端，不等从库；所以才有延迟和半同步话题。 |
| 开了半同步就绝对不丢数据 | 看等待点。AFTER_COMMIT 在提交后等 ACK，崩溃窗口仍可能丢；只有 AFTER_SYNC（先 ACK 再提交）才无损。半同步还要和双 1 配合。 |
| 主库宕机切从库，数据肯定不丢 | 异步下主库提交后 binlog 没发到从库就宕机，failover 会丢已提交事务；需半同步（AFTER_SYNC）加主库双 1 才把风险压到极低。 |
| 从库只有一个线程在干活 | 从库是两段：IO 线程负责拉 binlog 写 relay log，SQL 线程负责重放；主库侧还有 binlog dump 线程。三者职责不同。 |
| read_only=ON 就能保证从库不被写坏 | 挡不住 SUPER 用户和复制线程，运维账号用超级权限仍能写；应上 super_read_only=ON 并收敛账号。 |
| STATEMENT 格式更省空间所以更好 | 省空间但有不确定性函数导致主从不一致的风险；一致性强于省空间时选 ROW，配合 binlog_row_image=MINIMAL 减负。 |
| 主库的 binlog 是复制线程自己去读的 | 是主库为每个连入的从库起一个 binlog dump 线程主动推送；从库 IO 线程是接收方，dump 才是发送方。 |
| 主从延迟只能靠换更快的机器 | 机器只是因素之一，根因常是单 SQL 线程串行重放；开 MTS 并行复制、拆小事务、避开大 DDL 往往比加机器更对症。 |
