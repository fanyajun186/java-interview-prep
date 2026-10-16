# Redis 内存淘汰策略：LRU / LFU 与 8 种 maxmemory-policy

> 面试主线一句话：**Redis 默认不限制内存（`maxmemory 0`）、默认不淘汰数据（`noeviction`）——所以「内存满了」的默认下场是写命令直接报 OOM 错误，而不是自动清理。要让它自己腾空间，必须显式配 `maxmemory` + 一个淘汰策略。**
>
> 版本前提：**Redis 7.x**（LFU 自 4.0 起可用；`maxmemory-clients`、`maxmemory-eviction-tenacity` 自 7.0 起）

---

## 一、内存满了到底会发生什么

### 1. 两个必须一起看的默认值

| 配置 | 默认值 | 含义 |
| --- | --- | --- |
| `maxmemory` | **`0`** | 0 = **不限制**。64 位系统能吃满物理内存（32 位默认 3GB） |
| `maxmemory-policy` | **`noeviction`** | 达到上限时**不淘汰任何 key**，写命令直接报错 |

⚠️ 这两个默认值组合起来是最危险的默认：不设 `maxmemory` 时 Redis 会一直吃内存，最后要么被 OS 的 OOM Killer 杀掉，要么开始 swap 导致延迟雪崩。**生产必须显式设 `maxmemory`。**

### 2. 三种下场

```
写命令到达，内存已超限
   │
   ├─ 情况 A：maxmemory = 0（没设上限）
   │     → 不做任何限制，继续分配，直到进程被 OOM Killer kill 或系统 swap
   │
   ├─ 情况 B：设了上限 + noeviction（默认策略）
   │     → 不淘汰，写命令返回错误：
   │       (error) OOM command not allowed when used memory > 'maxmemory'
   │       读命令、DEL 仍然正常
   │
   └─ 情况 C：设了上限 + 某个淘汰策略
         → 先淘汰一批 key 腾出空间，再执行写命令
         → 如果一个都淘汰不掉（如 volatile-* 但没有 key 带 TTL），退回情况 B 报错
```

**注意情况 C 的最后一条**——这是最常见的线上事故：**配了 `volatile-lru`，但业务 key 大多没设过期时间，结果内存满了报 OOM，监控上却显示"还有几百万个 key"**。因为它只能在「带 TTL 的 key」里挑，一个都挑不出来就等同于 `noeviction`。

---

## 二、8 种淘汰策略总表

| 策略 | 候选集（能淘汰谁） | 淘汰依据（挑谁下手） | 淘汰时机 | 无 key 可淘汰时 |
| --- | --- | --- | --- | --- |
| **`noeviction`（默认）** | 无 | 不淘汰 | 从不触发 | 写命令返回 OOM 错误 |
| `allkeys-lru` | 全部 key | **近似 LRU**：空闲时间（`LRU_CLOCK() - o->lru`）最长者 | 写命令执行前，内存超 `maxmemory` | 报错（数据集为空时） |
| `volatile-lru` | **仅带 TTL 的 key** | 近似 LRU | 同上 | **报错**（无 TTL key 时等同于 noeviction） |
| `allkeys-lfu` | 全部 key | **近似 LFU**：8 bit 频率计数器最小者（含时间衰减） | 同上 | 报错 |
| `volatile-lfu` | **仅带 TTL 的 key** | 近似 LFU | 同上 | **报错** |
| `allkeys-random` | 全部 key | 随机 | 同上 | 报错 |
| `volatile-random` | **仅带 TTL 的 key** | 随机 | 同上 | **报错** |
| `volatile-ttl` | **仅带 TTL 的 key** | **剩余 TTL 最短者**（马上就要过期的先走） | 同上 | **报错** |

**记忆口诀**：
- 前缀 `allkeys-` vs `volatile-` 决定**候选范围**（全部 / 只有带 TTL 的）
- 后缀 `-lru` / `-lfu` / `-random` / `-ttl` 决定**排序依据**
- 只有 `noeviction` 没有前缀，因为它压根不淘汰

**选型速查**：

| 场景 | 推荐策略 | 理由 |
| --- | --- | --- |
| 纯缓存（所有 key 丢了都能重建） | **`allkeys-lru`** | 最通用，命中率与实现复杂度平衡最好 |
| 有稳定热点、怕被批量扫描洗掉 | **`allkeys-lfu`** | 一次性全表扫描不会挤走真热点 |
| 缓存与持久数据混部（**不推荐这种做法**） | `volatile-lru` | 只给缓存 key 设 TTL，持久 key 不带 TTL 就不会被淘汰 |
| 数据绝对不能丢 | `noeviction` + 严格监控告警 | 用拒绝写入来暴露问题，而不是静默丢数据 |
| 按过期时间自然淘汰 | `volatile-ttl` | 适合生命周期明确的缓存数据 |

**`volatile-ttl` 单独说清**：它挑的是**剩余 TTL 最短**的 key，即"最接近过期的先淘汰"。适合**生命周期本身有明确优先级**的数据——短信验证码、临时票据、登录态 token、限时优惠券。这类数据的特点是：

- 到点自动失效，内存里放着也不会脏
- 生命周期短（秒级~分钟级），"让它快点到期"比"按热度排序"更合理
- 天然都带 TTL，`volatile-*` 的候选集不会是空的（前提是真的设了 TTL）

⚠️ 反例：**用户画像、首页推荐位这类需要长期缓存的数据不要用 `volatile-ttl`**，它们 TTL 本来就长（甚至永久），用 TTL 策略淘汰等于放弃缓存命中率。而且同样地，只要有一个 TTL 策略在用，就必须确保**所有该淘汰的数据都设了 TTL**，否则会掉回"无 key 可淘汰 → 报 OOM"的坑。

---

## 三、LRU：Redis 的「近似 LRU」

### 1. 为什么不用真 LRU

真 LRU 需要维护一条全局访问链表，**每次读 key 都要把节点挪到链头**——这对 Redis 这种单线程、每秒几十万次访问的系统是致命的：每次读都要一次写操作，还要额外内存存链表指针。

Redis 的做法是：**只在对象头里花 24 bit 记一个时间戳，淘汰时随机采样比一比**。代价几乎为零。

### 2. 24 bit 的 `lru` 字段

每个 `redisObject` 里有 `unsigned lru:LRU_BITS`（`LRU_BITS = 24`）。LRU 模式下它存的是**全局 `lru_clock` 的低 24 位**（秒级）：

```
robj.lru (24 bit) —— LRU 模式
┌──────────────────────────────────────────┐
│      lru_clock 低 24 位（秒级时间戳）       │
└──────────────────────────────────────────┘
   空闲时间 idle = LRU_CLOCK() - o->lru
```

- `lru_clock` 由 `serverCron` **每 100ms 更新一次**（精度 100ms，够用了）
- 24 bit 秒级 → 约 **194 天**回绕一次，源码里做了回绕处理
- **每次 `lookupKey` 命中都会刷新这个字段**（所以读也会更新 LRU）

### 3. 采样 + 候选池（eviction pool）

不是全局扫描找最旧的，而是：

1. 从 dict 里**随机采样** `maxmemory-samples`（**默认 5**）个 key
2. 把候选放进一个大小为 **16** 的 `evictionPool`，按 `idle` **升序**排（越空闲越靠后）
3. 淘汰时从**池尾**取最久未用的那个
4. 一次不够就循环再来，直到内存降到 `maxmemory` 以下

采样数越大越接近真 LRU，但 CPU 开销越高。官方注释：**调到 10 已经非常接近真实 LRU**，代价是更多 CPU。

```conf
maxmemory-samples 10        # 默认 5；10 ≈ 真 LRU 精度
maxmemory-eviction-tenacity 10   # 7.0+：单次淘汰循环的"执着度"，默认 10
```

---

## 四、LFU：为什么要有它，以及怎么实现

### 1. LRU 的致命弱点：扫描污染

LRU 只看「最后一次访问时间」，不看「访问了多少次」。于是一次**批量扫描 / 全表导出 / 爬虫遍历**：

```
热点 A（每秒访问 100 次）      ← 真热点
...
扫描进来 10 万个冷 key        ← 每个只访问 1 次，但"最后一次访问"都是刚刚
```

LRU 会认为这 10 万个冷 key "刚刚用过"，**把真正的热点全挤出去**，命中率断崖式下跌。这就是 LRU 污染。

LFU 按**频率**计数，这 10 万个冷 key 的计数器只有个位数，淘汰时优先走的是它们，热点保住了。

### 2. 24 bit 的另一种切法

LFU 模式把同一个 24 bit 拆成两段复用：

```
robj.lru (24 bit) —— LFU 模式
┌────────────────────────────┬──────────────────┐
│  LDT 高 16 bit（分钟）       │  counter 低 8 bit │
│  最后一次「衰减」的时间       │  0 ~ 255 频率计数  │
└────────────────────────────┴──────────────────┘
```

只有 8 bit（0~255）存频率，所以**增长必须是对数的**，否则访问 256 次就爆了。

### 3. 对数增长 + 时间衰减（两个关键设计）

**增长**：不是访问一次 +1，而是**概率性**递增，当前计数越高越难涨：

```c
// LFULogIncr：counter 越大，递增概率越低
double p = 1.0 / (counter * lfu_log_factor + 1);   // lfu_log_factor 默认 10
if ((double)rand()/RAND_MAX < p) counter++;
```

- 新 key 的初始计数是 `LFU_INIT_VAL = 5`（不是 0）——**防止刚创建就被立刻淘汰**
- `lfu-log-factor` 默认 **10**：值越大越难涨，适合热点极稳定的场景

**衰减**：光涨不跌会让"曾经火过"的 key 永远赖着。每过 `lfu-decay-time` 分钟，counter 减 1：

```c
// LFUDecrAndReturn
num_periods = LFUTimeElapsed(ldt) / server.lfu_decay_time;   // lfu-decay-time 默认 1（分钟）
counter = (num_periods > counter) ? 0 : counter - num_periods;
```

- `lfu-decay-time` 默认 **1 分钟**：衰减快，对新热点敏感
- 设成 0 = 永不衰减（退化成纯累计计数）

**这个设计的直观效果**（面试时用它举例，比讲公式好懂）：

```
上线预热：一个新 key 被批量访问 100 次
  → counter 涨到高位（对数增长，前几次涨得快，之后越来越难）
  → 一周内没人碰它
  → 按 lfu-decay-time 每分钟 -1，可以一路衰减到 0
  → 突然被访问：counter 从极低值重新开始涨
  → 此时只要内存紧张，它就是第一批被淘汰的对象
```

**这正是 LFU 想要的效果**：判断"热度"看的是**近期访问频率**，而不是"最后一次访问有多久之前"。LRU 会因为"上周访问过"就保它一辈子，LFU 不会。一个上季度的热点 key，今天重新访问时在 LFU 眼里就是"新面孔"。

### 4. 查看与调参

```bash
redis-cli OBJECT FREQ mykey     # 只有 LFU 策略下才有意义
redis-cli config set lfu-log-factor 10
redis-cli config set lfu-decay-time 1
```

---

## 五、淘汰时机：这块最容易答错

### 1. 「内存淘汰」和「过期删除」是两件事

| | 内存淘汰（eviction） | 过期删除（expiration） |
| --- | --- | --- |
| 触发条件 | `used_memory` 达到 `maxmemory` | key 的 TTL 到期 |
| 策略配置 | `maxmemory-policy`（8 选 1） | **不可配置**，固定为「惰性删除 + 定期删除」 |
| 执行者 | 主线程，写命令执行前同步做 | 惰性：访问时检查；定期：`serverCron` 的 active expire cycle |
| 影响范围 | 可能删掉**没过期**的 key | 只删已过期的 key |

面试里把这两个混为一谈是必扣分点。**一个是"内存不够了腾地方"，一个是"到点了清理垃圾"。**

### 2. 触发链路

```
客户端发来写命令（SET / INCR / LPUSH ...）
   ↓
processCommand()
   ↓
if (maxmemory > 0 && 内存超限)  →  performEvictions()
   ↓
   循环：按策略采样 → 挑一个 key → 删除 → 再检查内存
   ↓
内存降到 maxmemory 以下  →  继续执行命令
   或 淘汰不掉 / 达到 tenacity 上限  →  返回 OOM 错误
```

**关键点**：淘汰是**同步阻塞**在主线程上做的，不是后台线程。所以 `evicted_keys` 暴涨时，写延迟会同步变差。

唯一能异步的是**释放内存**这一步：`lazyfree-lazy-eviction no`（默认关闭）开启后，大 key 的内存释放交给后台线程，避免删一个百万元素的集合卡住主线程。

### 3. 三个边界条件（容易被追问穿）

**① 只有写命令触发淘汰，读命令不触发**

```
SET key v  ──► processCommand() ──► 内存超 maxmemory ──► performEvictions() ──► 淘汰后再写入
GET key    ──► 内存超限也不淘汰，直接读成功
DEL key    ──► 释放内存，永远不会被 OOM 挡住
```

- `processCommand` 在**执行写命令之前**先做一次内存检查，超限就同步淘汰，降到水位以下才真正执行写操作
- **读命令永远不会触发淘汰**，即使内存已经超了它也照常返回（所以会出现"内存已经爆了但读 QPS 依然正常"的迷惑现象）
- `DEL` / `UNLINK` / `MEMORY RELEASE` 这类释放内存的命令也不受限
- ⚠️ 反过来，被淘汰的 key 是**还没过期的**——它没到 TTL 就被内存压力提前干掉了，这是「淘汰 ≠ 过期」最直观的体现

**② 从库（replica / slave）不执行淘汰**

| | Master | Replica |
| --- | --- | --- |
| `maxmemory` + 淘汰策略 | 生效 | **配置可以被读到，但完全不生效** |
| 谁决定淘汰谁 | 自己在主线程按策略挑 | 只执行主库复制过来的 `DEL` / `UNLINK` |
| 内存水位 | 稳定在 maxmemory 以下 | **可能短暂高于 maxmemory，甚至高于主库** |

- 主库淘汰掉 key 后，会把这个删除作为一条写命令复制给从库执行，所以从库不需要（也无法）自己判断
- **推论（面试可讲）**：从库内存短时超过主库是正常现象，不该为此告警；反倒是从库延迟滞后导致复制缓冲堆积，才是真正的风险
- ⚠️ 运维红线：**不要给从库单独调大 `maxmemory` 来"兜底"**，淘汰权只在主库

**③ 副本读请求不受限（`replica-read-only` 相关）**

从库默认只读，但**淘汰命令仍然可以在从库上产生内存压力**：主库大规模删除 + 从库执行过期删除时，从库同样会出现内存水位波动。判断从库健康要看 `master_repl_offset` 差值和 `sync_partial_ok` 之类指标，而不是看它有没有淘汰。

### 4. 内存口径（面试加分项）

`maxmemory` 比较的不是简单的 `used_memory`，源码 `getMaxmemoryState()` 会做几项剔除：

- **减去** AOF buffer（持久化期间）
- **减去** 主从复制的输出缓冲区（replica output buffer）
- 客户端输出缓冲区是否计入，取决于 7.0 新增的 `maxmemory-clients`（默认 0 = 不计入，单独用 client eviction 处理）

> 7.0 的 **`maxmemory-clients`**：可以把客户端输出缓冲区也算进内存账，超限时**踢掉最占内存的客户端连接**而不是淘汰 key。这对防止"一个大 pipeline / 慢消费者拖垮整个实例"很有用，监控项是 `evicted_clients`。

---

## 六、生产配置与排查

### 1. 怎么判断“正在频繁淘汰”

`evicted_keys` 是**累计计数器，只增不减**——所以不能看绝对值，要看**增速**：

```bash
redis-cli info stats | grep evicted_keys
# 间隔 60s 采两次，差值 / 60 就是每秒淘汰数
redis-cli info stats | grep -E "evicted_keys|expired_keys|keyspace_hits|keyspace_misses"
```

判据（按严重度递增）：

| 现象 | 含义 | 动作 |
| --- | --- | --- |
| `evicted_keys` 增速 ≈ 0 | 健康 | 无 |
| 每秒个位数 | 偶发淘汰 | 观察，通常是流量波动 |
| 持续上涨且 `keyspace_hits/(hits+misses)` 命中率同时下跌 | **热数据正在被误淘汰** | 立即扩容或切 LFU |
| 淘汰速度 > 写入速度，内存仍降不下来 | 有大 key / 碎片 | `--bigkeys` + `activedefrag` |

配合 `INFO memory` 看水位：

```bash
redis-cli info memory | grep -E "used_memory_human|maxmemory_human|maxmemory_policy|mem_fragmentation_ratio"
```

- `used_memory / maxmemory` **长期 > 80%** → 该扩容了
- 淘汰本身有成本：每次写入前都要先淘汰，**写延迟会明显抖动**（`latency doctor` 的 `eviction-cycle` 就是这条链路）
- 结论一句话：**淘汰是兜底，不是常态**。长期贴着上限跑，说明容量模型错了，应该扩内存或拆实例，而不是指望淘汰兜住

### 2. 配置模板与 maxmemory 设定

```conf
# ===== 纯缓存实例 =====
maxmemory 6gb                    # 物理内存的 60~70%，留余量给 fork COW 与碎片
maxmemory-policy allkeys-lru
maxmemory-samples 10             # 命中率敏感场景，代价是少量 CPU
lazyfree-lazy-eviction yes       # 大 key 淘汰走后台释放，避免主线程卡顿

# ===== 有稳定热点、怕扫描污染 =====
maxmemory-policy allkeys-lfu
lfu-log-factor 10
lfu-decay-time 1

# ===== 数据不能丢 =====
maxmemory-policy noeviction      # 配合 used_memory 告警，宁可拒绝写也不静默丢
```

**`maxmemory` 该设多大：为什么必须留余量**

`maxmemory` 只管「key 数据」，除此之外还要吃内存的还有：

| 开销项 | 说明 |
| --- | --- |
| fork 写时复制（COW） | `bgsave` / AOF rewrite 时 fork 子进程，父进程后续写入会额外复制被改的页，**峰值最坏接近 2 倍** |
| 客户端输出缓冲 | 大 pipeline、大 value、慢消费者时堆积（7.0 可用 `maxmemory-clients` 单独管） |
| AOF buffer | AOF `everysec` 时最多积攒 1 秒的写入 |
| 复制缓冲区 | 主从全量同步 / 复制积压时的临时缓冲 |
| 内存碎片 | jemalloc 分配器碎片，`mem_fragmentation_ratio > 1.5` 即严重 |

**经验值：物理内存的 60% ~ 70% 给 `maxmemory`，剩下 30% ~ 40% 给上面这些。**

**单机跑多个 Redis 实例时更严格**：各实例 `maxmemory` 之和别超过物理内存的 **70%**，否则每个实例单看都"很安全"，合起来照样把机器推到 OOM——这是 OOM 最常见的触发方式之一。

**`maxmemory` 调大调小的权衡**：

- 调小 → 淘汰更频繁，命中率下降，写延迟抖动加剧
- 调大 → 挤占同机其他进程（Java 应用、ES 等），且 fork 时更危险
- 所以必须结合**实例规格 + 部署方式**（独占整机 vs 与业务混部）来定，不能拍脑袋

**关于 `noeviction` 的现实提醒**：选了 `noeviction` 又不想写入报错，就必须靠**外部监控在内存到阈值前扩容或主动清理**——一旦等到写命令开始报错，往往已经晚了（应用侧批量超时、缓存雪崩）。这就是为什么生产更推荐直接用 `allkeys-lru` 兜底：内存不够时**丢缓存**比**写失败**便宜得多。

### 3. 排查命令

```bash
# 看配置
redis-cli config get maxmemory maxmemory-policy maxmemory-samples
# 看内存与策略
redis-cli info memory | grep -E "used_memory_human|maxmemory_human|maxmemory_policy|mem_fragmentation_ratio"
# 看淘汰情况（核心指标）
redis-cli info stats | grep -E "evicted_keys|evicted_clients|keyspace_hits|keyspace_misses"
# 采样看看谁是大 key
redis-cli --bigkeys
redis-cli memory usage <key>
# LFU 下看某个 key 的频率计数
redis-cli object freq <key>
```

### 4. 监控指标

| 指标 | 含义 | 告警判据 |
| --- | --- | --- |
| `evicted_keys` | 累计淘汰的 key 数（单调增） | **持续增长** = 内存不够或策略不合适，需要扩容/改策略 |
| `keyspace_hits / (hits + misses)` | 缓存命中率 | 命中率跌 + `evicted_keys` 涨 = 典型的热数据被淘汰 |
| `used_memory` / `maxmemory` | 内存水位 | > 80% 预警 |
| `mem_fragmentation_ratio` | 碎片率 | > 1.5 说明碎片严重（可考虑重启或开 activedefrag） |
| `evicted_clients`（7.0+） | 被踢掉的客户端数 | 增长说明有大 pipeline / 慢消费者 |

---

## 七、面试问法

### 60 秒版本

> 默认两个值：`maxmemory` 是 0 表示不限制，`maxmemory-policy` 是 `noeviction` 表示不淘汰。所以默认配置下内存满了写命令会直接报 OOM 错误。生产要显式设 `maxmemory`（一般是物理内存的 60~70%）并选策略。策略有 8 种，分两类前缀：`allkeys-` 在全部 key 里挑，`volatile-` 只在带 TTL 的 key 里挑；后缀 `-lru`/`-lfu`/`-random`/`-ttl` 决定排序依据。最常用的纯缓存选 `allkeys-lru`。
>
> Redis 的 LRU 是**近似**的：每个对象只用 24 bit 存一个访问时间戳，淘汰时随机采样 `maxmemory-samples` 个（默认 5）放进 16 大小的候选池，挑最久未用的。不用真 LRU 是因为维护全局链表每次读都要写，代价太高。
>
> LFU 解决的是 LRU 的扫描污染问题——一次性批量扫描会把真热点全挤掉。LFU 把 24 bit 拆成 16 bit 衰减时间 + 8 bit 频率计数，计数按对数概率增长、按 `lfu-decay-time` 分钟衰减。

### 5 分钟版本补充点

1. `volatile-*` 在没有 key 带 TTL 时**等同于 noeviction**，会报 OOM——经典线上事故
2. 淘汰是**主线程同步做**的，不是后台线程；只有释放内存可以走 lazyfree
3. **内存淘汰 ≠ 过期删除**，后者是惰性 + 定期扫描，不可配置
4. `maxmemory` 比较时剔除了 AOF buffer 和复制输出缓冲
5. 7.0 新增 `maxmemory-clients`：超限时踢客户端而不是淘汰 key
6. 淘汰不是"内存接近上限就开始"，而是**写命令执行前**检查超限才触发
7. 新 key 的 LFU 初始计数是 5，防止刚创建就被淘汰
8. **读命令不触发淘汰**，从库（replica）**完全不执行淘汰**，只执行主库复制过来的 `DEL`

---

## 追问链 · 参考答案

| 层级 | 问题 | 参考答案要点 |
| --- | --- | --- |
| L1 | Redis 内存满了会怎么样？默认是什么策略？ | 默认 `maxmemory 0`（不限制）+ `maxmemory-policy noeviction`（不淘汰）。设了上限后内存满时写命令直接返回 `OOM command not allowed when used memory > 'maxmemory'`，读和 DEL 正常。生产必须显式设 `maxmemory` 与策略 |
| L1 | 8 种淘汰策略怎么记？ | 前缀定范围：`allkeys-` 全部 key、`volatile-` 仅带 TTL 的 key；后缀定依据：`-lru` 最久未用、`-lfu` 频率最低、`-random` 随机、`-ttl` 剩余 TTL 最短。外加不淘汰的 `noeviction`。默认是 `noeviction` |
| L2 | 纯缓存选哪个？ | `allkeys-lru`。所有 key 丢了都能重建，不需要区分候选集；LRU 在通用访问模式下命中率与开销平衡最好。访问热点稳定、担心批量扫描污染时换成 `allkeys-lfu` |
| L2 | `volatile-ttl` 什么时候用？ | 数据**生命周期本身有明确优先级**时用：短信验证码、临时票据、限时 token、session。到点自动失效，不怕被提前淘汰，"让它快点过期"比按热度排序更合理。前提是这些 key 真的都设了 TTL，否则同样掉进"无 key 可淘汰 → OOM"的坑。反过来，用户画像这类需要长期缓存的数据不适合用 `volatile-ttl` |
| L2 | `volatile-lru` 有什么坑？ | 只能在**带 TTL 的 key** 里挑。如果业务大多没设过期时间，内存满时一个都淘汰不掉，**行为等同于 `noeviction`**，写命令全部报 OOM，而监控上 key 数量还很充足，极易误判 |
| L2 | 淘汰什么时候触发？ | 在**写命令执行前**由 `processCommand` 检查：若 `maxmemory > 0` 且当前内存超限，就同步执行 `performEvictions` 循环淘汰，直到降到上限以下才继续执行命令；淘汰不掉则报错。不是"接近上限就后台慢慢清" |
| L2 | 读命令会触发淘汰吗？ | **不会**。淘汰只在 `processCommand` 的写命令路径上检查，所以会出现"内存已经超限但 GET 照常返回"的迷惑现象。`DEL` / `UNLINK` 也不受 OOM 限制（它们是释放内存的）。另外被淘汰的 key 是**还没过期**的——没到 TTL 就因内存压力被提前删掉，这是"淘汰 ≠ 过期"最直观的体现 |
| L2 | 主从部署时从库会自己淘汰吗？ | **不会**。replica 上 `maxmemory` 和淘汰策略配置存在但完全不生效——它只执行主库复制过来的 `DEL` / `UNLINK`。所以**从库内存可能短暂高于主库**，这是正常现象不该为此告警。从库真正的风险是复制延迟导致复制积压（复制缓冲区）堆积。推论：不要为了"给从库兜底"而单独调大从库 `maxmemory`，淘汰权只在主库 |
| L3 | Redis 的 LRU 是真 LRU 吗？为什么不用真的？ | 不是，是**近似 LRU**。真 LRU 要维护全局访问链表，每次读都要把节点移到链头——对单线程高频访问的 Redis 是不可接受的写放大和内存开销。近似方案只在对象头用 24 bit 存时间戳，淘汰时采样比较，代价近乎为零 |
| L3 | 近似 LRU 具体怎么实现的？ | 每个 `robj` 有 `lru:24`，LRU 模式存全局 `lru_clock`（秒级，serverCron 每 100ms 更新）的低 24 位，空闲时间 = `LRU_CLOCK() - o->lru`。淘汰时随机采样 `maxmemory-samples`（默认 5）个 key 放进大小 16 的 evictionPool，按 idle 升序排，从池尾取最久未用的。调到 10 就很接近真 LRU，代价是每次淘汰多算几次 |
| L3 | 24 bit 够吗？会不会溢出？ | 秒级时间戳 24 bit 约 194 天回绕一次，源码做了回绕处理（比较时按无符号差值算）。`lru_clock` 精度是 100ms，对淘汰决策完全够用 |
| L4 | 为什么要有 LFU？LRU 有什么问题？ | LRU 只看"最后一次访问时间"，一次批量扫描 / 全表导出会带进大量只访问一次的冷 key，它们"最后访问时间"都是刚刚，于是把真热点全挤出去，命中率断崖下跌（LRU 污染）。LFU 按**频率**计数，冷 key 计数是个位数，优先被淘汰，热点保住 |
| L4 | LFU 怎么用 24 bit 存频率？ | 拆成两段：高 16 bit 存 LDT（最后一次衰减的分钟时间），低 8 bit 存 counter（0~255）。只有 8 bit，所以增长是**对数概率式**的：`p = 1/(counter × lfu_log_factor + 1)`，默认 `lfu-log-factor 10`，计数越高越难涨。新 key 初值 5，防止刚建就被淘汰 |
| L4 | LFU 的计数只涨不跌会怎样？ | "曾经火过"的 key 会永远赖着不走。所以有时间衰减：每过 `lfu-decay-time`（默认 1 分钟）counter 减 1，可一路衰减到 0。`LFUDecrAndReturn` 按 `已过分钟数 / lfu_decay_time` 计算衰减量。设 0 表示永不衰减 |
| L4 | LFU 的衰减在实际中什么效果？举 个例子 | 一个 key 上线时被批量预热访问 100 次，counter 很快涨到高位（对数增长，前几次涨得快）。一周没人碰它，按 `lfu-decay-time` 每分钟 -1，counter 衰减到接近 0。此时再被访问，counter 从极低值重新开始涨，内存一紧张它就是第一批被淘汰的——**这正是 LFU 想要的效果**：判断热度看"近期访问频率"而不是"上次访问多久之前"。一个上季度的老热点，今天重新访问时在 LFU 眼里就是新面孔，而 LRU 会因为"上周访问过"一直保它 |
| L5 | `maxmemory` 应该设多大？ | 物理内存的 **60~70%**。要留 30~40% 给：`bgsave`/AOF 重写 fork 后的 COW 峰值（最坏接近 2 倍）、客户端输入输出缓冲、AOF buffer、复制缓冲区、内存碎片。设太满会在持久化期间把机器推到 swap 或被 OOM Killer 杀掉 |
| L5 | 一台机器跑多个 Redis 实例，maxmemory 怎么定？ | 各实例 `maxmemory` 之和不超过物理内存的 **70%**。每个实例单看都"安全"，合起来照样把机器推到 OOM——这是最常见的 OOM 触发方式之一。另外调大 `maxmemory` 会挤占同机其他进程（Java 应用、ES），调小则淘汰更频繁、写延迟抖动，所以要结合实例规格与部署方式（独占整机 vs 混部）权衡 |
| L5 | 选了 `noeviction` 又不想写入报错怎么办？ | 只能靠**外部监控在内存到阈值前扩容或主动清理**。但等写命令开始报错往往已经晚了——应用侧批量超时、缓存雪崩。所以生产更推荐直接用 `allkeys-lru` 兜底：内存不够时**丢缓存**比**写失败**便宜得多 |
| L5 | 线上怎么发现淘汰有问题？ | `INFO stats` 的 `evicted_keys` 是**累计值只增不减**，所以要看**增速**：间隔 60s 采两次算每秒淘汰数。持续上涨且 `keyspace_hits/(hits+misses)` 命中率同时下跌 = 热数据正在被误淘汰，立即扩容或切 LFU；淘汰速度 > 写入速度且内存降不下来 = 有大 key / 碎片，用 `--bigkeys` + `activedefrag`。`INFO memory` 看 `used_memory / maxmemory`，长期 > 80% 就该扩容。7.0+ 还要看 `evicted_clients` |
| L5 | 淘汰的成本是什么？ | 淘汰**同步在主线程**做，每次写入前都要先淘汰一轮，所以内存长期打满的实例写延迟会明显抖动（`LATENCY DOCTOR` 里的 `eviction-cycle`）。**淘汰是兜底不是常态**——长期贴着上限跑说明容量模型错了，该扩容或拆实例，而不是指望淘汰兜住 |
| L5 | 内存淘汰和过期删除是一回事吗？ | 不是。淘汰由 `maxmemory-policy` 控制，触发条件是内存达 `maxmemory`，可能删掉**没过期**的 key，同步在主线程做。过期删除是 key 到 TTL 后的清理，**不可配置**，固定为「访问时惰性检查 + serverCron 定期扫描」两条路径，只删已过期的 key |
| L5 | 7.0 在内存这块有什么新东西？ | 新增 `maxmemory-clients`：把客户端输出缓冲区计入内存账（默认 0 = 不计入），超限时**踢掉最占内存的客户端连接**而不是淘汰 key，防止一个大 pipeline 或慢消费者拖垮整个实例，监控项 `evicted_clients`。另外新增 `maxmemory-eviction-tenacity`（默认 10）控制单次淘汰循环的力度 |

---

## 误区 · 正解

| ❌ 误区 | ✅ 正解 |
| --- | --- |
| 「Redis 内存满了会自动清理旧数据」 | 默认**不会**。`maxmemory-policy` 默认是 **`noeviction`**，内存满后写命令直接报 OOM 错误。要自动清理必须显式配 `maxmemory` + 一个淘汰策略，缺一不可 |
| 「不配 `maxmemory` 就没事，Redis 会自己管理」 | 恰恰相反。`maxmemory` 默认 **0 = 不限制**，Redis 会一直吃内存直到被 OS 的 OOM Killer 杀掉，或开始 swap 导致延迟雪崩。这是生产最危险的一个默认值 |
| 「配了 `volatile-lru` 就等于开启了淘汰」 | 只在**带 TTL 的 key** 里挑。业务 key 大多没设过期时，一个都淘汰不掉，**行为等同于 `noeviction`**，写命令全部报 OOM，而监控上 key 数量还很充足 |
| 「内存超了读命令也会被挡住 / 触发清理」 | 淘汰只在**写命令**路径上检查，读命令超限也照常返回。所以会出现"内存已经爆了但 GET 依然正常"的假象。`DEL`/`UNLINK` 更是永远不受 OOM 限制 |
| 「主从部署时每个实例各自按策略淘汰」 | **从库不执行淘汰**。replica 上`maxmemory` 与策略配置存在但不生效，它只执行主库复制过来的 `DEL`。因此**从库内存可能短暂高于主库**，属正常现象。淘汰决策权只在主库 |
| 「从库内存高就得赶紧扩容」 | 从库高于主库是淘汰机制本身造成的正常现象，不该据此告警。从库真正要盯的是复制延迟与复制积压缓冲区 |
| 「Redis 的 LRU 是标准 LRU 算法」 | 是**近似 LRU**。随机采样 `maxmemory-samples`（默认 5）个 key 比时间戳，不是全局找最旧的。这样做是为了避免维护全局链表的读时写放大。调到 10 精度明显提升 |
| 「LRU 一定够用，LFU 是多余的」 | LRU 有**扫描污染**问题：一次批量扫描带进的冷 key "最后访问时间"都是刚刚，会把真热点全挤掉，命中率断崖下跌。热点稳定且存在批量遍历的场景必须用 LFU |
| 「LFU 的计数就是访问一次加一」 | 8 bit 只有 0~255，直接加会瞬间爆表。实际是**对数概率增长**：`p = 1/(counter × lfu_log_factor + 1)`，计数越高越难涨；同时按 `lfu-decay-time`（默认 1 分钟）衰减。新 key 初值是 5 不是 0 |
| 「LFU 只会保护老热点」 | 反了。衰减机制让 LFU 判断的是**近期**频率：一个上周还很热的 key，一周无人访问后 counter 已衰减到极低，今天重新访问时仍会被优先淘汰。LRU 才会一直保它 |
| 「淘汰是后台线程慢慢做的，不影响主线程」 | 淘汰**同步发生在主线程**，在写命令执行前完成，`evicted_keys` 暴涨时写延迟会同步变差。只有**释放内存**这一步可以通过 `lazyfree-lazy-eviction yes` 交给后台线程 |
| 「内存淘汰就是过期删除」 | 两回事。淘汰由 `maxmemory-policy` 控制，触发条件是内存达上限，可能删**未过期**的 key；过期删除是 TTL 到期后的清理，**不可配置**，固定为惰性检查 + 定期扫描 |
| 「`maxmemory` 设成物理内存的 90% 比较划算」 | 要留 30~40% 余量。`bgsave`/AOF 重写 fork 后的 COW 峰值最坏接近 2 倍，加上客户端缓冲、AOF/复制缓冲与碎片，设太满会在持久化期间触发 swap 或 OOM Killer。推荐 **60~70%**，单机多实例时总和别超70% |
| 「`noeviction` 更安全，不会丢数据」 | 安全但代价高：内存满后**写命令直接失败**，应用侧批量超时甚至缓存雪崩。若不愿承担这个风险，就必须有可靠的外部监控在阈值前扩容/清理，否则不如直接用 `allkeys-lru` 兜底 |
| 「淘汰的时候 Redis 会挑最老的那个 key」 | 不是全局挑，是**采样**挑：`maxmemory-samples` 个随机 key 进 16 大小的候选池，取池中最优的一个。所以存在"该淘汰的没被采样到"的情况，这是近似算法的固有代价 |
| 「`volatile-ttl` 是最精确的淘汰策略」 | 它只按**剩余 TTL 最短**淘汰，适合验证码、临时票据、限时 token 这类生命周期本身就是优先级的数据。拿它管用户画像这类需长期缓存的数据，等于放弃命中率 |

---

## 相关文件

- `redis-01-data-types.md` —— 数据类型与底层编码（淘汰时不同编码的内存释放代价不同）
- `redis-02-persistence.md` —— 持久化的 fork + COW，与 `maxmemory` 余量直接相关
- `redis-04-single-thread-model.md` —— 为什么淘汰必须同步在主线程做
- `redis-05-internal-encoding.md` —— `redisObject` 结构，`lru:24` 字段的来源
- `../scenario-design/` —— 缓存与 DB 一致性等场景题
