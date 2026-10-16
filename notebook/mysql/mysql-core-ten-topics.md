# MySQL 核心十大主题 · 总纲索引（InnoDB）

> 面向中大厂高级工程师面试（对标阿里 P6-P7 / 腾讯 T9-T10）。版本前提：MySQL 5.7 / 8.0；InnoDB。
> 本文只作总纲与学习路线，详细内容已拆分为 6 份子讲义（每份含配图、面试问法、追问链、误区，全部自带答案）。

> **配图已内嵌**：子讲义里的 12 张图全部以 **base64 PNG** 内嵌进对应 md，**每张图只占一行**，不打断正文阅读，单文件自包含。选 PNG 而非 SVG 是因为不少 Markdown 阅读器会过滤 SVG（内联源码、data URI 都不显示），PNG 兼容性最好。`images/` 下的 PNG 与 `images/svg-src/` 下的源仍保留；改图流程：改 `svg-src/*.svg` → `cd images && node svg2png.js` → `node scripts/embed_images.js`（`--vector` 切矢量 SVG、`--restore` 还原外链、`--svg-src` 切成可读源码）。

## 拆分方案与对应关系

| # | 原主题 | 归入子讲义 | 分组理由 |
| --- | --- | --- | --- |
| 1 | InnoDB 从 Server 层到引擎层的架构 | [mysql-architecture.md](mysql-architecture.md) | 独立成篇，是其它一切的地基 |
| 2 | 为什么选 B+ 树与 2000 万分表阈值 | [mysql-btree-and-sharding.md](mysql-btree-and-sharding.md) | 独立成篇 |
| 3+6+7 | 事务隔离 / MVCC / 当前读 | [mysql-transaction-mvcc.md](mysql-transaction-mvcc.md) | 同一套机制：MVCC 管快照读、锁管当前读、隔离级别决定 ReadView 生成时机 |
| 5 | undo log / redo log / binlog | [mysql-logs.md](mysql-logs.md) | 独立成篇 |
| 4+10 | 锁体系 / 死锁 | [mysql-locks-deadlock.md](mysql-locks-deadlock.md) | 死锁是锁规则的直接推论 |
| 8+9 | 索引失效 / 慢 SQL 分析优化 | [mysql-index-optimization.md](mysql-index-optimization.md) | 失效是「为什么慢」，EXPLAIN 闭环是「怎么查怎么治」 |

## 建议学习顺序

1. **[mysql-architecture.md](mysql-architecture.md)** — 两段式分层、Buffer Pool（LRU 变体 / free / flush list）、Change Buffer、16KB 页结构与 Compact 行格式、行溢出。配图：分层架构图、数据页结构图。
2. **[mysql-btree-and-sharding.md](mysql-btree-and-sharding.md)** — B+ 树选型推演、三层容量手算、页分裂与 15/16 规则、回表成本、分表决策顺序与代价。配图：B+ 树结构图、容量手算图。
3. **[mysql-transaction-mvcc.md](mysql-transaction-mvcc.md)** — ACID 实现手段、隔离级别矩阵、ReadView 四字段与可见性推演、RC/RR 唯一差异、快照读与当前读打架。配图：undo 版本链图、可见性判断流程图。
4. **[mysql-logs.md](mysql-logs.md)** — WAL 为什么快、redo 循环写与 checkpoint、doublewrite、两阶段提交、组提交、purge、双 1 参数、崩溃恢复流程。配图：update 链路时序图、三日志对比图。
5. **[mysql-locks-deadlock.md](mysql-locks-deadlock.md)** — 锁全景、加锁规则两原则两优化一个 bug、四类推演案例、死锁两类高频场景、等待图检测与 victim 选择、治理优先级。配图：next-key lock 区间图、死锁等待环图。
6. **[mysql-index-optimization.md](mysql-index-optimization.md)** — 最左前缀的物理有序性、索引失效清单、ICP/MRR、EXPLAIN 逐列判读、key_len 反推、深分页三方案、选错索引与统计信息。配图：最左前缀原理图、EXPLAIN 判读图。

## 跨讲义主线（面试串场用）

- **「一条 update 怎么执行」**：架构篇（分层路径）→ 日志篇（undo→脏页→redo prepare→binlog→redo commit）→ 锁篇（加什么锁）→ MVCC 篇（别人怎么读你）。
- **「为什么慢」**：索引篇（失效与执行计划）→ 锁篇（被阻塞）→ MVCC 篇（长事务版本链变长）→ 架构篇（Buffer Pool 命中率）。
- **「会不会丢数据」**：日志篇（双 1 + 两阶段提交 + doublewrite）→ 复制（主从延迟与半同步，见面试问法）。

## 可跑实验清单（labs/，尚未落地）

| 实验 | 对应讲义 | 验证点 |
| --- | --- | --- |
| 实验 1：B+ 树层高与分表阈值 | btree-and-sharding | 不同行宽的 .ibd 大小，验证 2000 万前提 |
| 实验 2：RR 下 next-key lock 复现 | locks-deadlock | `(5,10]` + `(10,15)` 加锁区间 |
| 实验 3：快照读 vs 当前读 | transaction-mvcc | 同一事务两次读结果不同 |
| 实验 4：索引失效与 key_len 反推 | index-optimization | 函数/隐式转换对执行计划的影响 |
| 实验 5：复现经典死锁 | locks-deadlock | SHOW ENGINE INNODB STATUS 死锁段解读 |
| 实验 6：深度分页优化对比 | index-optimization | 游标法/延迟关联的 EXPLAIN ANALYZE 对比 |
