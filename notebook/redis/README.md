# Redis · 笔记索引

> 2026-10-13 首批成稿，对应四问：基础类型与底层结构 / 持久化 / 主从哨兵集群 / 单线程模型。
> 2026-10-16 增补 redis-07（Cluster 深挖）、redis-08（并发与原子性），并回填 redis-01 的 Set 详解与选型对照表。新增 6 张结构图，放在 `images/`。

> **配图已内嵌 · 形态：行内 base64 PNG**：本目录 13 张图全部内嵌进对应 md，单文件自包含。正文里的图片就是标准行内写法 `![说明](data:image/png;base64,…)`，一张图一行，单张编码控制在 48KB 以内。
> 两条硬约束（都是踩过坑换来的，别改回去）：① **必须用 PNG** —— 不少阅读器出于 XSS 考虑过滤 SVG，内联源码和 data URI 都不显示；② **单张 base64 必须压到 48KB 以内** —— Typora 对超长 base64 有硬门槛（官方 issue #6057），超了会直接退化成显示一长串编码，图反而看不见。另外**不要改成引用式**（正文留短标签、编码放文件末尾）：Typora 能显示，但 WorkBuddy 的 md 预览解析不了那个悬空引用，图会变成一段标签文字。
> 脚本按上述约束自动选档：900px 起往下试宽度 + 16 色调色板（16 色 = PNG 的 4bpp，加到 32 色会掉进 8bpp 体积翻倍，肉眼还没区别）。
> 切形态：`node scripts/embed_images.js`（默认行内）｜`--ref`（引用式，仅 Typora 可用）｜`--vector`（base64 矢量 SVG）｜`--svg-src`（可读源码）｜`--restore`（还原成外链）。
> Typora 里若嫌光标落到图片行时那行编码横向拖得很宽，在主题 CSS 末尾加：`span.md-image-src-span.ty-focusable{max-width:calc(100% - 20px);display:inline-block;overflow:hidden !important;white-space:nowrap !important;}`
> ⚠️ 本目录的 SVG 源文件已不在磁盘上，只剩 `images/` 下的 1800px PNG 原图；要改图只能重画。

## 文件清单

| 文件 | 内容 |
| --- | --- |
| `redis-01-data-types.md` | 五大基础类型 + 扩展类型：使用场景、命令、底层编码与转换阈值（SDS / listpack / quicklist / dict / skiplist） |
| `redis-02-persistence.md` | RDB（三类触发 / fork + COW / **页表·多级页表·TLB 补漏** / 文件结构）/ AOF（aof_buf→write→fsync 完整链路 / 三种策略 / 追加阻塞 2 秒保护 / 重写四细节）/ 混合持久化 / **7.0 多部分 AOF（base+incr+manifest）** / INFO persistence 排查手册 / 加载安全与 CVE |
| `redis-03-replication-sentinel-cluster.md` | 主从复制（全量 / 增量 psync）/ 哨兵（主观下线 / Raft 选举 / 故障转移）/ Cluster（16384 槽 / Gossip /MOVED 重定向 / 从节点选举） |
| `redis-04-single-thread-model.md` | 集群下每个主节点仍是单线程执行命令？为什么单线程反而快？6.0 多线程 IO 的边界 |
| `redis-05-internal-encoding.md` | 编码实现层深度：SDS（int/embstr/raw）/ listpack 取代 ziplist（级联更新）/ quicklist / dict 渐进式 rehash / intset / ZSet 跳表+dict，附 7 张结构图（`images/`） |
| `redis-06-eviction-policies.md` | 内存满了怎么办 / 两个默认值（`maxmemory 0` + `noeviction`）/ **8 种策略总表（候选集 × 淘汰依据 × 淘汰时机）** / 近似 LRU（24 bit 时间戳 + 采样 + 16 槽候选池）/ LFU（16 bit LDT + 8 bit 对数计数器、衰减、扫描污染）/ 淘汰 vs 过期删除 / 排查与监控 |
| `redis-07-cluster-deep-dive.md` | Cluster 深挖：槽路由与客户端缓存刷新时机 / hash tag 真实规则 / **在线槽迁移全流程（IMPORTING→MIGRATING→MIGRATE→NODE）** / MOVED 与 ASK 分工 / 节点宕机时谁回 MOVED / **PFAIL→FAIL 三个条件（含「2×timeout 是 TTL 不是门槛」的纠正）** / 从节点竞选延迟公式与资格过滤 / 复制偏移量真相 / Gossip 与主从复制的区分 / **脑裂与 `cluster-require-full-coverage` 的完整推演**。附 5 张图（`images/`） |
| `redis-08-concurrency-atomicity.md` | 并发四层手段：单条命令原子 / **Lua（首选，能拿中间结果做判断）** / MULTI-EXEC（只打包不回滚，WATCH 乐观锁）/ 分布式锁（`SET NX EX` 一条命令、Lua 校验 uuid 解锁、看门狗续期）/ CPU 打满后的横向扩展与阻塞源规避。附 1 张图 |

## 高频题速查

| # | 题目 | 答案位置 |
| --- | --- | --- |
| 1 | 五大类型的底层结构和适用场景？ | redis-01 |
| 2 | ZSet 底层为什么用跳表不用红黑树？ | redis-01 |
| 3 | RDB 和 AOF 各自优缺点？线上怎么选？ | redis-02 |
| 4 | bgsave 时 Redis 还能写吗？靠什么机制？ | redis-02 |
| 5 | AOF 重写是原地改写 AOF 文件吗？ | redis-02 |
| 6 | 主从复制的完整流程？断线后怎么增量同步？ | redis-03 |
| 7 | 哨兵怎么判定主节点下线？谁执行故障转移？ | redis-03 |
| 8 | Cluster 为什么是 16384 个槽？客户端怎么找到数据？ | redis-03 |
| 9 | 集群模式下每个主节点还是单线程吗？ | redis-04 |
| 10 | 单线程为什么快？6.0 的多线程改的是什么？ | redis-04 |
| 11 | embstr / raw 的边界为什么是 44 字节？ | redis-05 |
| 12 | 渐进式 rehash 的读写规则？BGSAVE 时为什么放宽到 5？ | redis-05 |
| 13 | listpack 为什么能取代 ziplist？ | redis-05 |
| 14 | 一条写命令从内存到磁盘经过了哪几层？ | redis-02 |
| 15 | AOF 的 everysec 到底丢多少数据？fsync 卡住怎么办？ | redis-02 |
| 16 | Redis 7.0 的 AOF 和 6.x 有什么不一样？ | redis-02 |
| 17 | Redis 突然变成只读，怎么排查？ | redis-02 |
| 18 | 内存满了 Redis 会怎样？默认策略是什么？ | redis-06 |
| 19 | 8 种淘汰策略怎么记？线上选哪个？ | redis-06 |
| 20 | Redis 的 LRU 是真 LRU 吗？为什么不用真的？ | redis-06 |
| 21 | 为什么要有 LFU？LRU 有什么问题？ | redis-06 |
| 22 | 淘汰什么时候触发？是后台线程做的吗？ | redis-06 |
| 23 | 内存淘汰和过期删除是一回事吗？ | redis-06 |
| 24 | 「页表」是什么？fork 复制页表为什么快？ | redis-02 |
| 25 | 为什么用多级页表？TLB 解决什么问题？ | redis-02 |
| 26 | 客户端什么时候缓存槽与节点的映射？MOVED 和 ASK 谁改缓存？ | redis-07 |
| 27 | 槽迁移过程中集群能正常处理请求吗？多 key 命令怎么办？ | redis-07 |
| 28 | 请求打到一个已经宕掉的节点，MOVED 从谁那里来？ | redis-07 |
| 29 | PFAIL 升级为 FAIL 需要满足什么条件？ | redis-07 |
| 30 | Cluster 的从节点竞选新主，谁数据最新谁先上？ | redis-07 |
| 31 | 复制偏移量是全局的还是每个节点一个？它影响什么？ | redis-07 |
| 32 | Gossip 通信是主主互 ping 还是所有节点互 ping？谁有投票权？ | redis-07 |
| 33 | Redis Cluster 会脑裂吗？`cluster-require-full-coverage` 怎么选？ | redis-07 |
| 34 | Set 有哪些命令？`SRANDMEMBER` 正负 count 有什么区别？ | redis-01 |
| 35 | Redis 单线程，那 `INCR` 还需要加锁吗？ | redis-08 |
| 36 | 为什么生产优先用 Lua 而不是 MULTI/EXEC？ | redis-08 |
| 37 | 分布式锁为什么不能 `SETNX` 之后再 `EXPIRE`？ | redis-08 |
| 38 | 单实例 CPU 打满之后怎么继续提升并发？ | redis-08 |

## 学习建议

1. redis-01 是地基（后面所有问题的答案都会回到「数据结构 + 内存 + 单线程」三要素）
2. redis-02 / redis-03 是「数据不丢、服务不挂」两条主线，面试常连着问
3. redis-04 是唯一偏原理的「为什么」题，答好区分度最高
4. redis-07 / redis-08 是**连环追问的收口**：前者把 Cluster 从「会用」讲到「说得清边界」，后者把「单线程 + 并发」这条主线一次讲透；面试里这两块最容易连着问三层以上
