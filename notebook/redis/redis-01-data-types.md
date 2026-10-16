# Redis 基础类型：使用场景与底层数据结构

> 面试第一层必考。答题框架：**先说类型和场景，再主动报底层编码，最后点一句「编码会按数据规模自动切换」**——一句话就能和只会背命令的候选人拉开差距。
> 注：Redis 7.0 起 listpack 全面取代 ziplist（ziplist 已废弃），以下按 7.x 口径讲，同时保留 ziplist 说法供对照老资料。

## 一、总览表（先背这张）

| 类型 | 底层编码（小数据） | 底层编码（大数据） | 转换阈值（默认） |
| --- | --- | --- | --- |
| String | int（纯数字 ≤ 2^63-1）| embstr（≤ 44 字节） | raw（> 44 字节） |
| List | listpack | quicklist（quicklist 节点内是 listpack） | `list-max-listpack-size`（默认单节点 -2 即 8KB） |
| Hash | listpack | hashtable（dict） | 128 个 entry 或单值 > 64 字节 |
| Set | intset（全整数） | listpack（7.2+，少量短字符串）→ hashtable | 128 个元素或单值 > 64 字节 |
| ZSet | listpack | skiplist（跳表 + dict 组合） | 128 个成员或单成员 > 64 字节 |

用 `OBJECT ENCODING key` 可查看实际编码；阈值由 `list-max-listpack-entries` / `hash-max-listpack-entries`、`set-max-intset-entries`、`zset-max-listpack-entries` 等配置控制。

## 二、逐类型详解

### 1. String（字符串）

**命令**：SET / GET / INCR / DECR / SETNX / SETEX / MSET / MGET

**使用场景**：
- 缓存对象（JSON 序列化整存整取）
- 计数器：`INCR pv:20261013`（原子自增，天然适合阅读量、点赞数）
- 分布式锁：`SET key value NX EX 30`
- 全局唯一 ID：`INCRBY order:id 1000`（号段模式）
- 限流计数：`INCR` + `EXPIRE` 组合

**底层结构**：
- **int**：值是 long 范围内的整数，直接存整型，零额外开销
- **embstr**：≤ 44 字节， SDS 结构和 redisObject **一次分配**成连续内存（适合短字符串，缓存友好）
- **raw**：> 44 字节，redisObject 和 SDS 分开分配
- **SDS（简单动态字符串）** 相对 C 字符串的优势（必考）：
  1. `len` 字段 O(1) 取长度（C 要 strlen 遍历）
  2. 空间预分配 + 惰性释放，减少 realloc
  3. 二进制安全（靠 len 而不是 `\0` 判断结尾，能存图片/序列化字节）
  4. 自动扩容检查，杜绝缓冲区溢出

### 2. List（列表）

**命令**：LPUSH / RPUSH / LPOP / RPOP / LRANGE / BLPOP / BRPOP（阻塞版）

**使用场景**：
- 消息队列（简单版）：LPUSH 生产 + BRPOP 阻塞消费（缺点：无 ack、无持久消费进度，和生产 MQ 对比讲）
- 最新列表：朋友圈最新动态、最新登录用户（LPUSH + LTRIM 定长）
- 时间线 / Stack / Queue 语义的数据结构

**底层结构**：quicklist（双向链表），**每个链表节点是一个 listpack**：
- 单纯双向链表：每个元素前后指针太费内存，且内存碎片化，缓存不友好
- 单纯 listpack：大数据量下插入删除 O(n)
- quicklist 折中：链表保证两端 O(1) 操作，节点内 listpack 保证内存紧凑，兼顾两边

### 3. Hash（哈希）

**命令**：HSET / HGET / HGETALL / HINCRBY / HDEL

**使用场景**：
- 存对象（字段级读写，比 String 整存整取省网络和反序列化）：用户信息、商品详情
- 购物车：`HSET cart:uid 商品id 数量`
- 需要单字段修改/计数的场景（不用整个对象重写）

**底层结构**：
- **listpack**（小哈希）：entry 依序存 field、value，省内存，但查找 O(n)——数据小所以可接受
- **hashtable**（dict，大哈希）：渐进式 rehash（两个哈希表 + rehashidx，把一次性迁移摊到每次操作 + 定时任务，避免一次性 rehash 阻塞主线程）——渐进式 rehash 是高频追问点

### 4. Set（集合）

**命令**：SADD / SREM / SISMEMBER / SADD / SINTER / SUNION / SDIFF / SRANDMEMBER / SPOP

**使用场景**：
- 去重：标签、签到去重（`SADD sign:uid:20261013`）
- 抽奖：`SPOP` 随机弹出 / `SRANDMEMBER` 随机查看不弹出
- 共同关注 / 好友推荐：`SINTER` 交集、`SDIFF` 差集
- 黑白名单：`SISMEMBER` O(1) 判断

**底层结构**：
- **intset**：全部是整数且数量少——紧凑有序整型数组，省内存
- **listpack**（7.2+）：少量短字符串时使用
- **hashtable**：元素多后，value 为 null 的 dict，O(1) 增删查

### 5. ZSet（有序集合，重点）

**命令**：ZADD / ZSCORE / ZRANGE / ZREVRANGE / ZRANGEBYSCORE / ZRANK / ZINCRBY

**使用场景**：
- 排行榜（最高频）：`ZINCRBY rank:game 1 uid`，`ZREVRANGE rank:game 0 9 WITHSCORES` 取 Top10
- 延迟队列：score 存执行时间戳，`ZRANGEBYSCORE` + 定时轮询到点任务
- 滑动窗口限流：score 存请求时间戳，`ZREMRANGEBYSCORE` 清理窗口外 + `ZCARD` 计数
- 优先级队列 / 时间线按权重排序

**底层结构**（组合拳，必考）：
- **listpack**：成员少且短——连续内存按序存 member+score，省内存
- **skiplist + dict**：成员多时，**跳表负责按 score 范围/排名查询（ZRANGE O(logN)），dict 负责 O(1) 查成员分值（ZSCORE）**。两套结构通过指针共享元素，不存两份数据

**跳表原理**：多层有序链表，每个节点随机决定层高（每层晋升概率 1/4），高层是低层的「快速通道」。查找从最高层往右走、走不通就下降，期望 O(logN)。插入删除只改前后指针，比平衡树简单得多。

**为什么用跳表不用红黑树（高频追问）**：
1. **实现简单**：插入删除不用旋转变色，代码量小、不容易写错
2. **范围查询更友好**：ZRANGE 找到起点后沿底层链表顺序遍历即可；红黑树要中序遍历
3. **内存可控**：平均每节点 1.33 个指针（概率 1/4），可调
4. 跳表并发/调试也更直观
- 加分项：作者 antirez 本人的说法——内存可调 + 实现简单 + 范围操作天然契合

### 6. Set 补充：完整命令表与集合运算（面试常单拎出来问）

Set 的底层编码见上一节（intset / listpack / hashtable 三态），这里补齐**命令语义 + 复杂度 + 集合运算**，因为「Set 有哪些命令」经常被追问细节。

**常用命令（带真实复杂度）**

| 命令 | 说明 | 复杂度 |
| --- | --- | --- |
| `SADD key m1 [m2 ...]` | 添加元素，重复自动忽略 | O(N)，N 为**新增**元素个数 |
| `SREM key m1 [m2 ...]` | 删除元素 | O(N)，N 为**删除**元素个数 |
| `SISMEMBER key member` | 判断是否存在 | O(1) |
| `SMISMEMBER key m1 m2 ...` | 批量判断（7.0+） | O(N) |
| `SCARD key` | 元素总数 | O(1) |
| `SMEMBERS key` | 返回全部元素 | O(N)，**大集合禁用** |
| `SSCAN key cursor [MATCH] [COUNT]` | 游标渐进遍历 | 每次 O(1)，总量 O(N) |
| `SPOP key [count]` | 随机弹出并删除；`count` 会给足数量，集合不够则全弹出 | O(1) / O(count) |
| `SRANDMEMBER key [count]` | 随机取不删除。**count 为正数返回不重复的至多 count 个；为负数则允许重复，返回 `|count|` 个** | O(count) |
| `SMOVE src dst member` | 元素从 src 原子移到 dst | O(1) |

**集合运算**

| 命令 | 说明 | 复杂度 |
| --- | --- | --- |
| `SINTER k1 k2 ...` | 交集 | **O(N×M)**，最小集合元素数 × 集合个数 |
| `SINTERCARD numkeys k1 k2 ... [LIMIT n]` | 只求交集**基数**，7.0+ 新增，带 LIMIT 可提前退出 | 明显优于 `SINTER` |
| `SUNION k1 k2 ...` | 并集 | O(N)，N 为全部元素数 |
| `SDIFF k1 k2 ...` | 差集（在 k1 不在其后集合） | O(N) |
| `SINTERSTORE / SUNIONSTORE / SDIFFSTORE dest k1 k2 ...` | 结果写入 dest，**返回结果为基数而非元素** | 同左 |

> <span style="color:red">`SRANDMEMBER key -3` 和 `SRANDMEMBER key 3` 的区别是高频道错点</span>：正数不重复、可能少于 count（集合不够时）；负数**一定返回 `|count|` 个且允许重复**，适合「抽奖允许重复」的场景。

**五个典型场景的正确姿势**

| 场景 | 关键命令 | 注意点 |
| --- | --- | --- |
| 点赞 / 收藏 / 关注 | `SADD` 去重、`SISMEMBER` 判存、`SCARD` 计数 | 计数是 O(1)，不要用 `SMEMBERS` 数长度 |
| 共同好友 | `SINTER user:follow:1 user:follow:2` | 大数据集必须提前离线 `SINTERSTORE` 算好 |
| 好友推荐 | `SDIFF user:all user:follow:1` | 差集第一个 key 是「全集」，顺序影响结果 |
| 抽奖 | `SRANDMEMBER`（可重复）/ `SPOP`（不可重复） | 多轮抽奖用 `SPOP`，展示候选用 `SRANDMEMBER` |
| 黑 / 白名单 | `SISMEMBER` | O(1)，注意大集合的内存占用，超大名单考虑 Bitmap |

**Set 的优缺点**

✅ 自动去重、判存 O(1)、原生支持交并差、随机取元素适合抽奖、`SCARD` 计数 O(1)

❌ <span style="color:red">无序，不能按插入顺序或分数排序（要排序用 ZSet）</span>；不能按索引范围查询（List 有 `LRANGE`、ZSet 有 `ZRANGE`，Set 没有）；`SINTER` 大数据集 CPU 开销大；只能存字符串，对象要自己序列化

**和其他类型的选型对照**

| 对比 | 结论 |
| --- | --- |
| Set vs List | Set 元素唯一、无序、判存 O(1)；List 可重复、插入有序，但**判存是 O(N) 很慢**，适合队列和历史记录 |
| Set vs ZSet | Set 无分数、省内存；需要按分数排序 / 分数范围查询就用 ZSet |
| Set vs Bitmap | 用户 ID 连续且稠密（如自增 UID）→ Bitmap 更省内存；ID 稀疏跨度过大 → Set 反而更稳（Bitmap 会按最大 offset 分配内存） |

**生产避坑**

1. 大集合**禁用** `SMEMBERS`，改用 `SSCAN` 游标遍历；
2. 大数据量求交并集不要在线实时算，离线 `SINTERSTORE` 落库；
3. intset 编码在元素变多、或出现非整数元素时会转 hashtable，内存会明显上涨，属正常现象。

## 三、扩展类型（说得出就是加分）

| 类型 | 场景 | 原理一句话 |
| --- | --- | --- |
| **Bitmap** | 签到、活跃标记、布隆过滤器 | String 按位使用，`SETBIT`/`BITCOUNT`；365 天签到只要 46 字节 |
| **HyperLogLog** | 海量 UV 统计（允许 0.81% 误差） | 基数估计概率算法，固定约 12KB；`PFADD`/`PFCOUNT` |
| **GEO** | 附近的人、门店定位 | ZSet 封装，geohash 编码成 52 位整数当 score |
| **Stream**（5.0+） | 消息队列（可消费组、ack、持久化） | Radix Tree + 消费组 pending list，想替代简易 MQ 时提它 |
| **Bloom**（需 RedisBloom 模块） | 缓存穿透防护 | 多 hash 位图，可能误判存在、绝不漏判不存在 |

### 类型选型快速对照表

| 类型 | 元素可重复 | 有序性 | 索引 / 范围查询 | 首选场景 |
| --- | --- | --- | --- | --- |
| String | value 整体替换 | - | - | 缓存对象、计数器、分布式锁、号段 ID |
| Hash | field 不重复 | 无序 | 只能按 field | 对象字段级读写、购物车 |
| List | 可重复 | 插入顺序 | `LRANGE` 按下标 | 简易队列、最新列表、时间线 |
| Set | 不可重复 | 无序 | ❌ | 去重、交并差、抽奖、黑白名单 |
| ZSet | member 不重复 | 按 score | `ZRANGE` 按排名 / `ZRANGEBYSCORE` 按分数 | 排行榜、延迟队列、滑动窗口限流 |
| Bitmap | 位 0/1 | 按 offset | ❌ | 签到、日活、布隆过滤器 |
| HyperLogLog | - | - | ❌ | UV 估算（有误差、取不出原始值） |
| GEO | member 不重复 | 按 score | 按距离范围 | 附近的人、门店搜索 |
| Stream | 消息可重复 | 按消息 ID | 按 ID / 时间范围 | 可靠消息队列（消费组 + ack） |

### 通用避坑清单

1. <span style="color:red">不要在大数据量上执行 `HGETALL` / `SMEMBERS` / `LRANGE 0 -1` / `KEYS`</span>，都是 O(N) 全量返回，会阻塞单线程；
2. ZSet 适合排行榜，但**成员数上千万时内存开销要算**：跳表 + dict 双结构，一个成员大约几十到上百字节；
3. HyperLogLog 有 0.81% 误差且**拿不到原始元素**，需要精确去重计数不能用它；
4. Bitmap 的 offset 直接决定分配内存：<span style="color:red">offset 设成 1 亿就等于立刻分配 ~12 MB</span>，用户 ID 稀疏时改用 Set；
5. Stream 适合消息队列但不是专业 MQ，消息大量堆积、需要死信 / 顺序 / 事务消息时上 RocketMQ / Kafka（详见 `../mq/`）。

## 追问链 · 参考答案

| 层级 | 问题 | 参考答案要点 |
| --- | --- | --- |
| L1 | 五种基本类型分别用在什么场景？各举一个代表命令。 | String 存缓存对象、计数器、分布式锁（`INCR` / `SET key val NX EX 30`）；Hash 存对象做字段级读写（`HSET`）；List 做简易队列与时间线（`LPUSH` + `BRPOP`）；Set 做去重、交集、抽奖（`SADD` / `SPOP`）；ZSet 做排行榜、延迟队列、滑动窗口限流（`ZINCRBY` / `ZREVRANGE`）。 |
| L2 | ZSet 底层为什么是「跳表 + dict」两个结构？ | 因为要同时满足两条查询路径：skiplist 按 score 有序，`ZRANGE` / `ZRANK` 是 O(logN)；dict 做 member → score 映射，`ZSCORE` / `ZADD` 判重是 O(1)。只留跳表则 ZSCORE 退化成 O(logN)，只留 dict 则范围查询要全排序。两者共享同一份 sds，不存两份数据。 |
| L3 | SDS 比 C 字符串好在哪？embstr 和 raw 的边界为什么是 44 字节？ | SDS 头部存 `len` → O(1) 取长度、按 len 判尾故二进制安全、修改前校验容量防溢出、空间预分配 + 惰性释放。embstr 让 robj 与 SDS 一次分配成连续内存，上限 44 = 64（分配粒度）− 16（robj）− 3（sdshdr8）− 1（`\0`）；超过则 raw 两次分配。embstr 只读，改一次即转 raw 且不可逆。 |
| L4 | listpack 为什么能取代 ziplist？ | ziplist 的 entry 用 `prevlen` 记前一个 entry 长度，形成跨条目依赖：前项跨过 254 字节时后项 prevlen 要 1 字节扩成 5 字节，自己变长再波及下一项，即 cascade update，最坏 O(n²)。listpack 改成 `encoding + data + backlen`，backlen 只记自身长度供反向遍历，条目间彻底解耦；7.0 起全面取代 ziplist。 |
| L5 | 排行榜用 ZSet 还是「MySQL order by + 索引」？ | 高频实时排名选 ZSet：`ZINCRBY` O(logN) 更新、`ZREVRANGE key 0 9` 取 Top10，全内存无扫表，百万成员也稳定；MySQL 每次排序要扫索引或落临时表，写入放大、深翻页成本线性上升。需要复杂条件筛选或离线全量榜单时再回 MySQL，并可双写做兜底。 |

## 误区 · 正解

| ❌ 误区 | ✅ 正解 |
| --- | --- |
| 「Hash 底层永远是哈希表」 | 小 Hash 走 listpack 紧凑编码，省内存优先；超过 `hash-max-listpack-entries`（默认 128）或单个 value > 64 字节才转 hashtable。用 `OBJECT ENCODING` 可验证，转换单向不可逆。别盲目把阈值调大，否则 `HGETALL` 会退化成 O(n) 全量遍历，成为 bigkey 慢命令的来源。 |
| 「跳表是 ZSet 唯一的底层结构」 | 成员少且短时是 listpack，压根不走跳表；成员多时是 **skiplist + dict 组合**：dict 提供 member → score 的 O(1) 查询（`ZSCORE` / `ZADD` 判重），跳表负责按 score 的范围与排名查询，两者共享同一份 sds，不存两份数据。只答跳表会被追问「那 ZSCORE 怎么做到的」。 |
| 「String 只能存字符串」 | String 有 int / embstr / raw 三种编码：值是 long 范围内的整数时走 int 编码，直接把指针位当整型用，零 SDS 开销，`INCR` / `INCRBY` 天然适合做计数器和号段 ID。注意 `SETRANGE` / `APPEND` 过一次就退化成 raw 且不可逆，写入前先确认值形态。 |
| 「用 List 就能当可靠消息队列」 | List 只有 `LPUSH` + `BRPOP`，没有 ack、没有消费进度、没有重试，消费者崩溃即丢消息，也不支持多订阅与广播。生产要么上 Stream（5.0+，消费组 + pending list + ack），要么直接用 RabbitMQ / RocketMQ / Kafka；若坚持用 List，至少用 `RPOPLPUSH` 做备份队列兜底（详见 `../mq/`）。 |
