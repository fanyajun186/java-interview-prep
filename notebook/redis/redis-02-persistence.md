# Redis 持久化：RDB 与 AOF

> 面试主线一句话：RDB 是某一时刻的全量快照，省空间、恢复快，但丢数据多；AOF 是每条写命令的追加日志，丢数据少，代价是文件大、恢复慢。到了 Redis 7，**标准答案是「AOF 多部分 + 混合持久化」**。

---

## 〇、全景：一条写命令从内存到磁盘

```
客户端 SET k v
   │
   ▼ ① 命令执行，修改内存数据集
   │
   ├──────────────► RDB 方向：不记录这条命令
   │                只在「触发条件满足/fork 时」由子进程全量快照
   │
   └──────────────► AOF 方向：
        ② 追加到 aof_buf（用户态内存缓冲）
        ③ beforeSleep → flushAppendOnlyFile()
              ├─ write(2)  → 内核 page cache   ← 断电仍会丢
              └─ 按 appendfsync 策略 fsync(2) → 落盘
```

这一层必须分清：`write` 只是写进内核页缓存，**不等于落盘**；只有 `fsync` 才算真正持久化。很多人把「写进 AOF 文件」当成「已落盘」，<span style="color:red">AOF 相关问题最容易在这里答穿</span>。

---

## 一、RDB（Redis Database，快照持久化）

### 1. 是什么

某一时刻全部数据的二进制紧凑快照，落盘为 `dump.rdb`。**它不记录写命令**，只在触发条件满足时由子进程全量导出。

### 2. 触发方式：三类，不是两种

| 类别 | 触发 | 说明 |
| --- | --- | --- |
| 手动（阻塞） | `SAVE` | 主进程亲自写盘，**全程阻塞**，线上禁用 |
| 手动（后台） | `BGSAVE` | fork 子进程写盘，主进程继续服务 |
| 自动 | `save <seconds> <changes>` | 由 `serverCron`（每 100ms）比对 `dirty` 计数与 `lastsave` 时间戳触发 bgsave |
| 顺带 | 主从全量复制 | 主节点 bgsave 生成 RDB 发给从节点（7.x 可开无盘复制 `repl-diskless-sync`，直接走 socket 不落盘） |
| 顺带 | `SHUTDOWN` | 存在 save point 时先做一次 SAVE 再关；`SHUTDOWN NOSAVE` 跳过 |
| 顺带 | `FLUSHALL` / `DEBUG RELOAD` | 会生成一个空 RDB 文件 |

<span style="color:red">「RDB 只有 save 和 bgsave 两种触发」这个说法不对</span>，因为「save 配置自动触发」本身就是第三种。正确口径是**手动命令 / 自动配置 / 顺带触发**三类。

### 3. 底层机制：fork + 写时复制（COW）

```
主进程 ──── fork() ────► 子进程
   │                        │
   │ ① fork 只复制「页表」，   │ 遍历内存数据 → 生成 RDB
   │    数据页仍共享          │
   │                        │
   │ ② 主进程要写某个页时      │
   ▼                        ▼
内核把该页标记为只读，写操作触发缺页异常
   → 内核复制出「新页」给主进程去写
   → 「原页」留给子进程（= fork 那一刻的快照）
```

这里有三个细节容易答错：

1. <span style="color:red">fork 复制的是页表，不是数据</span>。所以 fork 本身很快，但大内存实例页表项多，仍会有毫秒到秒级阻塞，监控项是 `latest_fork_usec`。
2. <span style="color:red">COW 的方向不要说反：新页给主进程、原页留给子进程</span>，而不是「复制一份给子进程」。
3. <span style="color:red">粒度是页不是字节</span>：4KB 页改 1 个字节也要复制整页。所以风险不取决于「改了多少 GB」，而取决于**改得有多散**。随机写打散到所有 key 时，几乎所有页都被复制，内存峰值逼近 **2 倍**。

> 生产环境要关闭 THP（Transparent Huge Page）。THP 会把 COW 粒度从 4KB 放大到 **2MB**，改几个字节就复制 2MB，内存瞬间炸掉。

#### 补漏：页表（Page Table）到底是什么？

上面反复提到「fork 只复制页表」「COW 粒度是页」，页表是操作系统的概念，这里补一个能讲满 3 分钟的版本。

① 是什么

页表是操作系统为每个进程维护的一张「虚拟地址 → 物理地址」映射表。

- 进程看到的地址都是虚拟地址（64 位 Linux 上用户空间 128TB，是一段连续、私有的假象）；真实数据放在物理内存的页框（Page Frame）里，物理上可能是散的，甚至暂时在磁盘上。
- 内存被切成固定大小的块：虚拟侧叫页（Page），物理侧叫页框，Linux x86-64 默认 4KB 一块。
- 页表里的每一行叫一个页表项（PTE, Page Table Entry），x86-64 上 8 字节，记录：这个虚拟页在不在内存（Present 位）、映射到哪个物理页框、读写权限（R/W）、用户态可否访问（U/S）、是否脏（Dirty）、是否被访问过（Accessed）等。

一句话：页表就是进程的「地址翻译字典 + 权限清单」，进程隔离、按需分配、COW 全部建立在它之上。**页表里没有任何数据**，只有映射关系。

```
进程视角（连续虚拟地址）              物理内存（散落）
┌──────────────┐                   ┌──────────────┐
│ 0x0000~0x0fff │──┐          ┌───►│ 页框 0x1A3   │
│ 0x1000~0x1fff │──┼──┐       │    ├──────────────┤
│ 0x2000~0x2fff │──┼──┼───────┼───►│ 页框 0x07C   │
│ 0x3000~0x3fff │──┘  │       │    ├──────────────┤
│      ...      │     └───────┴───►│ 页框 0x2F1   │
└──────────────┘   页表（PTE）      └──────────────┘
                   翻译 + 权限
```

② 为什么这样设计

| 目的 | 说明 |
| --- | --- |
| 地址空间隔离 | 每个进程一套页表。A 进程的 `0x400000` 和 B 进程的 `0x400000` 翻译成两块不同的物理页框，互相看不见、改不了。这是「进程内存隔离」的硬件基础，不是软件约定 |
| 按需分配 / 内存超售 | `malloc` 只改页表标记，第一次真正访问时触发缺页异常才分配物理页；配合 swap，进程看到的内存可以大于物理内存 |
| 支撑 COW | fork 时把父子双方 PTE 都置为只读 + COW 标记，谁先写谁触发缺页异常，内核才复制物理页。这就是 Redis `bgsave` 快、且几乎不额外占内存的根本原因 |

③ 底层怎么实现

(1) 必须是多级页表

单级页表存不下：4KB 页 + 8 字节 PTE，一个 48 位地址空间需要 2³⁶ 项 × 8B = **512GB**，一个进程就吃掉 512GB，不可能，所以拆成多级。

x86-64 四级页表（48 位虚拟地址，9+9+9+9+12）：

```
虚拟地址 64 bit（实际用低 48 位）
┌────────┬────────┬────────┬────────┬────────────┐
│ PML4   │  PDPT  │   PD   │   PT   │ 页内偏移    │
│ 9 bit  │ 9 bit  │ 9 bit  │ 9 bit  │  12 bit    │
└───┬────┴───┬────┴───┬────┴───┬────┴────────────┘
    │        │        │        │
    ▼        ▼        ▼        ▼
  PML4表 → PDPT表 → PD表 → PT表 → 物理页框 + 偏移 = 物理地址
（每级 512 项 × 8B = 4KB，正好一页）

CR3 寄存器 = 当前进程 PML4 的物理地址
进程切换 = 换 CR3 = 换一整套地址空间
```

- 每级 512 项 × 8 字节 = 4KB，正好一页，方便内核用页框来存页表本身。
- 多级页表的妙处是稀疏：某段中间层没用到，整块页表就不分配。所以一个 100GB 堆的进程，页表也就几百 MB 量级，而不是 512GB。
- 5 级页表（Intel Ice Lake+ / AMD Zen4+，57 位虚拟地址）在 PML4 之上再加一级 PML5，原理完全相同。

(2) TLB（快表）：没有它多级页表没法用

每次访存都要先走 4 次内存查页表，等于访存放大 5 倍。CPU 里内置 TLB 缓存最近用过的「虚拟页 → 物理页框」映射，命中就不查表。代价是页表改动要失效 TLB（`invlpg`；进程切换换 CR3 会导致整个 TLB 失效）。这也是大页能提效的原因：**2MB 页一条 TLB 项覆盖的面积是 4KB 页的 512 倍**，TLB miss 大幅下降。

(3) fork 到底复制了什么

```
fork() 内核动作：
  ① 新建子进程的 mm_struct、新页表（深拷贝页表结构本身）
  ② 把所有 PTE 复制过来 —— 复制的是 8 字节的「映射条目」，不是页框里的数据
  ③ 把父子双方所有「可写页」的 PTE 改成 只读 + COW 标记
  ④ 子进程从 fork 返回，与父进程共享全部物理页
```

所以「复制页表」实际是复制一堆 **8 字节的条目**，而不是复制 GB 级的数据，这就是 fork 能做到毫秒级的原因。

(4) COW 触发的完整路径

```
主进程写某个页
   → PTE 是只读 → CPU 触发 缺页异常（#PF, page fault）
   → 内核 do_wp_page() 发现：是 COW 页 且 引用计数 > 1
   → 分配新页框、复制 4KB 内容
   → 把「主进程」的 PTE 指向新页框、改回可写
   → 返回用户态，重新执行那条写指令（这次成功）
   → 「子进程」的 PTE 仍指向原页框 → 它看到的就是 fork 那一刻的快照
```

(5) THP 为什么必须关

THP 把 4KB 换成 2MB 页，**COW 粒度直接放大 512 倍**：改 8 个字节就复制 2MB。BGSAVE 期间主进程有写流量时，内存可能瞬间翻倍甚至 OOM。

④ 生产关联

| 现实现象 | 与页表的关系 | 怎么做 |
| --- | --- | --- |
| `latest_fork_usec` 大 | fork 耗时要深拷贝页表，开销与页表项数量成正比，也就是与实例内存大小成正比，与「存了多少个 key」无关 | 控制单实例内存（官方建议 ≤ 10~20GB）；拆实例而不是堆大实例 |
| fork 失败：`Can't save in background: fork: Cannot allocate memory` | 内核要按「COW 最坏情况 = 全量复制」预留地址空间，50GB 实例理论上要预留 100GB；`vm.overcommit_memory=0` 且 swap 不足时直接拒绝 | `echo 1 > /proc/sys/vm/overcommit_memory` |
| BGSAVE 期间内存暴涨 / OOM | COW 粒度是 4KB 页；开 THP 后是 2MB | `echo never > /sys/kernel/mm/transparent_hugepage/enabled` |
| 虚拟机 / 容器上 fork 明显更慢 | 虚拟化还有一层影子页表（EPT/NPT）也要复制 | 单独压测基线，别拿物理机经验值套 |
| 想看页表本身占多少内存 | `PageTables` 项 | `grep -i pagetables /proc/meminfo`；单进程：`grep -i 'VmPTE\|VmRSS' /proc/<redis-pid>/status` |

> 术语别混：这里的「页」是内存管理单元（4KB），和 AOF 链路里说的「OS page cache（磁盘数据在内存中的缓存）」不是同一个东西，只是都叫「页」。

### 4. 关键配置

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `save` | **7.x：`3600 1 300 100 60 10000`**<br>**6.x：`900 1 300 10 60 10000`** | 「N 秒内至少 M 次修改」。**7.0 起把自动快照频率调低了**，能说出版本差异是加分项 |
| `dbfilename` | `dump.rdb` | RDB 文件名 |
| `dir` | `./` | 工作目录，RDB/AOF 都写在这 |
| `rdbcompression` | `yes` | LZF 压缩；字符串长度超过 20 字节才尝试压缩 |
| `rdbchecksum` | `yes` | 尾部写 CRC64，加载时校验；关闭可提升约 **10%** 读写性能，但失去完整性保护 |
| `stop-writes-on-bgsave-error` | `yes` | 最后一次 BGSAVE 失败后，<span style="color:red">Redis 会拒绝所有写请求</span> |
| `rdb-del-sync-files` | `no` | 无从节点且无持久化时自动删除 RDB |
| `rdb-save-incremental-fsync` | `yes` | 生成 RDB 时增量 fsync，避免一次性刷盘造成长尾延迟 |

`stop-writes-on-bgsave-error` 是「Redis 突然变成只读」的经典根因：多数人第一反应是内存满了，实际往往是**磁盘满、权限问题或目录不存在**导致 bgsave 失败，Redis 主动拒绝写入以暴露问题。

### 5. 优缺点

| 优点 | 缺点 |
| --- | --- |
| 二进制紧凑，文件小 | 两次快照之间宕机即丢（**分钟到小时级**） |
| 恢复速度快 | fork + COW 有瞬时内存/CPU 开销 |
| 适合备份、灾备、主从全量同步 | 快照不是实时的 |
| 数据集大时重启比 AOF 快得多 | fork 阻塞在主线程上 |

---

## 二、AOF（Append Only File，命令日志）

### 1. 完整写入链路

```
① 执行写命令 → 修改内存数据集
② 把命令（RESP 格式）追加到 server.aof_buf
③ 事件循环返回前（beforeSleep）调 flushAppendOnlyFile()
     ├─ aofWrite()：write(2) 写入 OS page cache
     └─ 根据 appendfsync：
          always   → 同步 redis_fsync()（主线程阻塞）
          everysec → 交给 bio 后台线程，每秒一次
          no       → 不主动 fsync，交给 OS
```

### 2. 写后日志（与 MySQL WAL 相反）

Redis 是先执行命令、成功后再写日志（**write-after log**），MySQL 的 WAL 正好相反，<span style="color:red">是先写日志再改数据</span>。

| | 好处 | 代价 |
| --- | --- | --- |
| 写后日志 | 不用预先做语法检查（命令执行成功才记录，日志一定是合法的）；不阻塞当前这条写命令 | 一是命令执行了但日志没 fsync，这条会丢；二是写 AOF 虽不阻塞当前命令，但**会阻塞下一条命令** |

### 3. 三种刷盘策略（`appendfsync`）

| 策略 | 行为 | 最多丢 | 性能 |
| --- | --- | --- | --- |
| `always` | 每次事件循环 write + 同步 fsync | **1 条**（严格说是一批） | 最差 |
| **`everysec`（默认）** | 主线程只 write，fsync 由 bio 后台线程每秒一次 | **1 秒** | 折中，生产标配 |
| `no` | 只 write，fsync 完全交给 OS | **约 30 秒**（Linux 默认 `vm.dirty_expire_centisecs=3000`，或 dirty_ratio 达 20% 触发） | 最好 |

如果被追问「everysec 时主线程在干嘛、fsync 慢了怎么办」，答案是 AOF 追加阻塞保护：

1. 主线程在 `flushAppendOnlyFile` 里先检查：后台是否还有未完成的 fsync。
2. 若有，且距上次 fsync **不足 2 秒**，直接返回，本次不 write（推迟）。
3. 若已**超过 2 秒**，主线程自己执行 write 并阻塞等待，不再无限推迟。

目的是磁盘慢时不让 page cache 无限堆积。监控项 `aof_delayed_fsync` 就是这个计数器，**持续增长说明磁盘 I/O 已经跟不上写入**。

### 4. AOF 重写（bgrewriteaof）

先想清楚要解决的问题：`INCR visits` 执行 10 万次，日志就有 10 万行，但最终状态只是一个数字。

经典流程（4.0 ~ 6.x 单文件 AOF）：

```
① 主进程 fork 子进程
② 子进程【直接遍历内存数据】生成「最小命令集」写入临时新 AOF
      （不读旧 AOF 文件，省掉解析开销，顺带丢掉历史垃圾）
③ fork 之后的新写命令：同时写 aof_buf（→ 旧 AOF）+ aof_rewrite_buf
④ 子进程写完 → 通知主进程
⑤ 主进程把 aof_rewrite_buf 的增量追加到新文件
⑥ rename() 原子替换旧文件（POSIX 保证原子）
```

所以**重写期间数据不丢**：新文件 = 重写时刻快照 + 重写期间增量。

<span style="color:red">重写是「读内存生成新文件」，不是「解析压缩旧文件」</span>，这个理解错一步整个流程就说不通了。

这套经典方案有三个代价，也正是 7.0 要解决的：

- 重写期间**每条命令写两遍盘**
- 增量常驻 `aof_rewrite_buf`，**内存占用翻倍**
- 结束时主进程要把缓冲灌进新文件，有短暂停顿

重写时有四个实现细节值得记住：

1. **不解析旧 AOF**，直接读内存「翻译」成命令。
2. **过期 key、已删除 key 不写入**，这是能瘦身的根因。
3. 元素数超过 **64**（`AOF_REWRITE_ITEMS_PER_CMD`）的集合类命令会拆成多条，避免单条命令过长撑爆客户端输入缓冲区。比如 100 个元素的 `SADD` 会拆成多条。
4. `BGSAVE` 与 `BGREWRITEAOF` **互斥**，不会同时 fork 两个子进程；同时发起时后者排队（`aof_rewrite_scheduled:1`）。

触发方式：

- 手动：`BGREWRITEAOF`
- 自动：`auto-aof-rewrite-percentage 100`（当前体积比上次重写后增长 **100%**）且 `auto-aof-rewrite-min-size 64mb`（文件至少 **64MB**），**两个条件是与关系**。

### 5. 文件格式

AOF 是纯文本，命令用 RESP 协议存储，人类可读：

```
*3\r\n$3\r\nSET\r\n$5\r\nmykey\r\n$7\r\nmyvalue\r\n
```

可直接 `tail -f appendonly.aof` 排查；甚至能手工删掉误执行的 `FLUSHALL` 后重启救回数据（前提：还没触发过重写）。

### 6. 启动加载顺序

```
① appendonly = yes ? ──► 加载 AOF
      先加载 base（RDB 格式走 RDB 加载器）
      再按 manifest 顺序重放所有 incr
② 否则 ──────────────► 加载 dump.rdb
③ 都没有 ────────────► 空数据集启动
```

重放用的是「伪客户端」（fake client）：Redis 从 AOF 逐条读出命令，喂给命令执行器，不经过网络连接。

如果 AOF 尾部不完整（断电时写了一半），启动会报 `Bad file format reading the append only file`，用 `redis-check-aof --fix` 截断到最后一个完整命令。7.x 起 `redis-check-aof` 会自动识别文件是 RDB 还是 AOF 格式，可直接对整个 `appendonly.aof.manifest` 做整体校验：

```bash
redis-check-aof --fix /var/lib/redis/appendonlydir/appendonly.aof.manifest
```

---

## 三、混合持久化（4.0+）

`aof-use-rdb-preamble yes`（4.0 引入，5.0 起默认 yes）：

- 只影响「重写产生的 base 部分」的格式，日常写入仍然是 AOF 命令格式
- 重写时 base 写成 RDB 二进制，之后的增量仍是 AOF 命令
- 恢复时先快速加载 RDB，再重放少量增量命令

效果是恢复速度接近 RDB，数据安全性接近 AOF（1 秒）。

> 常见说法「AOF 文件前半段 RDB、后半段增量」是 4.0~6.x 的单文件形态；7.0 起已经是目录 + 三件套，见下一节。

线上判断口径：看 `appendonlydir/` 里的 base 文件后缀，`*.base.rdb` 说明开了混合，`*.base.aof` 说明没开。

---

## 四、Redis 7.0 多部分 AOF（Multi-Part AOF）

7.0 把「一个 AOF 文件」拆成一组文件，统一放在 `appenddirname`（默认 `appendonlydir`）目录：

```
appendonlydir/
├── appendonly.aof.1.base.rdb      ← base：某次重写时刻的全量快照
├── appendonly.aof.2.incr.aof      ← incr：base 之后新追加的写命令
├── appendonly.aof.3.incr.aof      ← 可以有多个 incr，按 seq 顺序重放
└── appendonly.aof.manifest        ← 清单：声明当前有效的文件集合与顺序
```

**文件名是 7.0 的高频考点**，三个后缀分别对应 base / incr / 清单，缺一个就会答错。

manifest 大致长这样（`b` = base，`i` = incr）：

```
file appendonly.aof.1.base.rdb seq 1 type b
file appendonly.aof.3.incr.aof seq 3 type i
```

重写的新流程（关键差异：不再需要重写缓冲区）：

```
① 触发重写 → 主进程立刻新建一个 incr 文件（seq+1），之后的写命令直接写它
② fork 子进程，后台生成新 base 文件（seq+1）
③ 子进程完成 → 原子更新 manifest 指向「新 base + 新 incr」
④ 旧 base / 旧 incr 不再被引用 → 删除
```

收益对比：

| 经典（≤6.x） | 7.0 多部分 |
| --- | --- |
| 重写期间每条命令写两遍盘 | 只写一遍（直接写新 incr） |
| 增量存 `aof_rewrite_buf`，内存翻倍 | 没有重写缓冲区，内存不翻倍 |
| 结束时要灌缓冲，主线程短暂停顿 | manifest 原子更新，无停顿 |
| 单文件，重写失败风险集中 | base/incr 分离，重写失败不影响当前 incr |

注意：`appendfilename` 在 7.0 中**只作为文件名前缀**，实际文件名会带 seq 和类型后缀。<span style="color:red">7.0+ 只要开了 AOF 就一定用多部分格式，没有开关</span>。

---

## 五、对比与选型总表

| 维度 | RDB | AOF | 混合（7.x 多部分） |
| --- | --- | --- | --- |
| 内容 | 某刻全量二进制快照 | 写命令日志（RESP） | base(RDB) + incr(命令) |
| 文件大小 | **小** | **大**（重写可压缩） | 适中，重写后明显变小 |
| 恢复速度 | **快** | 慢（逐条重放） | 较快 |
| 数据安全 | 丢分钟到小时级 | everysec 丢 **1 秒** | 丢 **1 秒** |
| 写性能开销 | fork 瞬时开销 | 每秒 fsync | 每秒 fsync + 偶发重写 |
| 重写/快照代价 | fork + COW | fork + 双写 + 缓冲 | fork 生成 base，无双写 |
| 适用 | 备份、容灾、全量同步 | 核心业务 | 生产首选 |

选型速答：

- 纯缓存（丢了能重建）：只开 RDB，甚至 `save ""` 全关，追求极致性能
- 数据重要、写入量不大：AOF + `appendfsync everysec`
- 数据重要、写入量大：混合持久化 + everysec，这是生产上的默认答案
- 极致安全：`always`，但要接受吞吐骤降，通常配合主从分摊

面试口径：

> 我们线上开 AOF（everysec）+ 混合持久化，RDB 只做定期异地备份（凌晨低峰 bgsave 后拉走）。日常丢数据窗口 1 秒，恢复又快；纯 RDB 丢分钟级数据，纯 AOF 恢复慢，混合是当前生产的事实标准。

---

## 六、生产排查手册

### 1. `INFO persistence` 关键字段速查

| 字段 | 看什么 |
| --- | --- |
| `loading` | 是否正在加载持久化文件 |
| `rdb_changes_since_last_save` | 距上次快照累积了多少次写修改 |
| `rdb_bgsave_in_progress` / `aof_rewrite_in_progress` | 是否有子进程在跑 |
| `aof_rewrite_scheduled` | 是否因互斥而排队等待 |
| `rdb_last_bgsave_status` / `aof_last_bgrewrite_status` | `ok` 还是 `err`，非 ok 立刻查日志 |
| `aof_last_write_status` | 上次 AOF 写入是否失败（磁盘满的典型信号） |
| `rdb_last_bgsave_time_sec` / `aof_last_rewrite_time_sec` | 耗时趋势 |
| `aof_current_size` / `aof_base_size` | 是否会触发自动重写 |
| `aof_delayed_fsync` | 因 fsync 慢而推迟的次数，持续增长就是磁盘 I/O 瓶颈 |
| `latest_fork_usec` | fork 耗时（微秒），THP 或虚拟化环境下会明显变大 |
| `current_cow_size` / `aof_last_cow_size` | COW 实际复制了多少内存 |

### 2. 必配的系统参数

```bash
# ① 允许 fork 时内核 overcommit，否则大内存实例 fork 会被直接拒绝
#    报错：Can't save in background: fork: Cannot allocate memory
echo 1 > /proc/sys/vm/overcommit_memory      # 或 sysctl vm.overcommit_memory=1

# ② 关闭 THP，避免 COW 粒度从 4KB 变 2MB 导致内存暴涨
echo never > /sys/kernel/mm/transparent_hugepage/enabled

# ③ AOF 目录与 RDB 目录所在磁盘留足余量，并确认 redis 用户有写权限
```

### 3. 危险命令收敛

```conf
# 6.x 及以前：重命名危险命令
rename-command FLUSHALL ""
rename-command KEYS ""
# 7.x 推荐：用 ACL 给应用账号收敛权限
#   ACL SETUSER appuser on >pwd ~cache:* +@read +@write -@dangerous
```

### 4. 加载安全（含近期 CVE）

RDB/AOF 加载时数据会直接进内存，解析不可信文件有内存破坏风险。近期真实案例：

- CVE-2026-62356（High）：RedisBloom 反序列化 Count-Min Sketch 时未校验 `width × depth` 乘积是否溢出 `size_t`，精心构造的维度会让分配大小计算回绕成一个极小值，对象却保留巨大的逻辑维度，后续 `CMS.INCRBY` 会堆越界写。入口是 `RESTORE` 命令或恶意构造的 RDB 文件。影响 Redis 8.0.x–8.10.0 / RedisBloom 2.0.0–2.8.23，修复版本 8.2.9 / 8.4.6 / 8.6.6 / 8.8.2 / 10.1（RedisBloom 2.8.24）。
- 同批还修了 `SLOT_INFO` 越界 slot id（可致 RCE）、`GEORADIUS` 的 ACL key-pattern 绕过等。

应对方式：只从可信来源拷贝 `dump.rdb`，不要把来路不明的 RDB 丢进 `dir` 目录启动；开启 `sanitize-dump-payload`（7.0+）做加载期深度校验；及时升级到修复版本。

> 面试提示：讲 CVE 时不要背编号，说「RDB 加载路径历史上出现过堆越界/RCE 类漏洞，所以只加载可信文件并及时升级」就够了。若一定要举编号，先确认官方公告。

### 5. 恢复演练清单

```bash
# 备份
redis-cli BGSAVE; redis-cli INFO persistence | grep rdb_last_bgsave_status
cp dump.rdb /backup/redis-$(date +%F).rdb && sha256sum ...

# 演练（测试环境）
#   停服 → 拷入 dump.rdb / appendonlydir → 启动 → DBSIZE 校验 → 抽样比对 key
# 关键：定期做，备份了 ≠ 能恢复
```

---

## 七、面试问法

### 60 秒版本

> Redis 持久化两种方式。RDB 是定时全量快照，通过 `bgsave` fork 子进程，利用操作系统写时复制机制，子进程看到的是 fork 那一刻的内存快照，主进程全程不阻塞，文件小、恢复快，但两次快照之间宕机会丢分钟级数据。AOF 是记录每条写命令，命令先写进 `aof_buf`，再 `write` 进内核缓冲，由 `appendfsync` 决定 fsync 时机，默认 everysec 最多丢 1 秒。AOF 文件会膨胀，所以有重写机制：fork 子进程直接读内存数据生成最小命令集，重写期间的增量走重写缓冲，最后 rename 原子替换。生产上我们用混合持久化，AOF 重写时 base 部分写成 RDB 格式，恢复又快又只丢 1 秒。7.0 之后 AOF 改成了 base + incr + manifest 的多文件结构，去掉了重写缓冲区，内存和磁盘开销都更小。

### 5 分钟版本补充点

1. 触发方式三类：手动命令 / save 自动配置 / 主从复制与 SHUTDOWN 顺带触发
2. COW 粒度是页（4KB），THP 会放大到 2MB → 必须关
3. `vm.overcommit_memory=1` 与 `latest_fork_usec` 监控
4. 写后日志 vs WAL 的对比
5. AOF 追加阻塞保护（2 秒上限）+ `aof_delayed_fsync` 监控
6. 重写四细节：不读旧文件 / 过期键不写 / 64 元素拆分 / 与 BGSAVE 互斥
7. 7.0 多部分 AOF 的结构与收益
8. `stop-writes-on-bgsave-error` 导致「Redis 变只读」
9. 启动加载优先级：AOF > RDB > 空
10. 加载不可信 RDB 的安全风险
11. 页表 / 多级页表 / TLB：fork 复制的是 PTE 而非数据 → 为什么快、为什么大实例仍会阻塞

---

## 追问链 · 参考答案

| 层级 | 问题 | 参考答案要点 |
| --- | --- | --- |
| L1 | RDB 和 AOF 各自是什么？ | RDB = 某时刻全量二进制快照（`dump.rdb`），恢复快、丢数据多；AOF = 逐条写命令日志（RESP 文本），丢数据少（everysec 1 秒）、文件大恢复慢 |
| L1 | 默认配置是什么？ | `appendonly no`（AOF 默认关）；RDB 默认**开启**：7.x `save 3600 1 300 100 60 10000`，6.x `save 900 1 300 10 60 10000`；`appendfsync everysec` |
| L2 | `bgsave` 期间还能写入吗？靠什么机制？ | 能。fork 子进程 + 写时复制：fork 只复制页表，数据页共享；主进程写某页时内核才复制该页，新页给主进程、原页留给子进程 |
| L2 | fork 到底阻塞多久？ | 只阻塞 `fork()` 调用本身（复制页表），与**数据量/页表项数**成正比；几十 GB 实例约几十~几百毫秒，虚拟化 + THP 开启会更慢。监控 `latest_fork_usec` |
| L2 | 「页表」到底是什么？fork 为什么能做到毫秒级？ | 页表是进程的「虚拟地址 → 物理地址」映射表，每行一个 PTE（x86-64 上 8 字节，记录物理页框 + 读写权限）。fork 深拷贝的是这堆 8 字节的**映射条目**，不是 GB 级数据，所以快；开销与页表项数量（≈ 实例内存大小）成正比 |
| L3 | 为什么用多级页表，单级不行吗？ | 单级要 2³⁶ × 8B = **512GB**，存不下。拆成 PML4 → PDPT → PD → PT 四级，每级 512 项 × 8B = 4KB 恰好一页，且未用到的中间层整块不分配（稀疏）。CPU 再用 **TLB** 缓存近期映射，避免每次访存查 4 次表 |
| L3 | COW 的完整触发路径是怎样的？ | 主进程写某个只读 PTE 的页 → CPU 触发**缺页异常（#PF）** → 内核 `do_wp_page()` 判定是 COW 页且引用 > 1 → 分配新页框、复制 4KB → 主进程 PTE 指向新页并改回可写 → 返回重执行指令；子进程 PTE 仍指向原页 |
| L3 | COW 为什么会让内存暴涨？ | 粒度是 4KB 页，改 1 字节复制整页；**改得越散**，被复制的页越多，极端情况逼近 2 倍。开 THP 时粒度 2MB，加剧 |
| L2 | 「页」和 AOF 里的「page cache」是同一个东西吗？ | 不是。前者是**内存管理单元**（4KB 页/页框，页表管的是它）；后者是**磁盘数据在内存中的缓存**。AOF 的 `write(2)` 只是写进 page cache，`fsync(2)` 才落盘 |
| L3 | AOF 重写是「改写旧文件」还是「读内存生成新文件」？ | **读内存生成新文件**，完全不解析旧 AOF。好处是省解析开销，且天然丢掉过期/已删 key |
| L3 | 重写期间的新写入会不会丢？ | 不会。经典方案靠 `aof_rewrite_buf` 缓存增量，子进程完成后追加，再 rename 原子替换；7.0 直接开新 incr 文件接着写 |
| L4 | `everysec` 为什么最多丢 1 秒？fsync 慢时 Redis 怎么自保？ | 主线程只 write，fsync 由 bio 后台线程每秒一次，所以最多丢上一秒未 fsync 的数据。fsync 未完成时主线程推迟 write，**超过 2 秒就不再等，自己 write 并阻塞**，防止无限堆积 |
| L4 | `always` 就绝对不丢吗？ | 语义上每次写都 fsync，最多丢「最后一次未完成 fsync 的批」。但吞吐大幅下降，需要靠主从分摊 |
| L4 | 7.0 持久化有什么改进？ | 多部分 AOF：`appendonlydir/` 下 base + incr + manifest。重写时新建 incr 接着写，去掉 `aof_rewrite_buf`（内存不翻倍）、去掉双写磁盘、去掉结束时的主线程停顿 |
| L5 | 主从复制用的是 RDB 还是 AOF？ | 全量同步用 **RDB 作载体**（主节点 bgsave 或 7.x 无盘复制 `repl-diskless-sync` 直接走 socket）；增量同步走 replication buffer/backlog，与 AOF 无关 |
| L5 | 主从 + 持久化怎么配合？ | 常见组合：主节点关持久化（减少 fork 开销）、从节点开 AOF。但注意，主节点重启后是空数据集，会把从节点一起同步清空，所以主节点重启前必须先备份或从从节点提升 |
| L5 | Redis 突然变只读，怎么排查？ | 先看 `INFO persistence` 的 `rdb_last_bgsave_status` / `aof_last_write_status`，若非 ok 多半是磁盘满、权限不足或目录不存在导致持久化失败，触发了 `stop-writes-on-bgsave-error` |
| L5 | 怎么判断线上开没开混合持久化？ | `appendonlydir/` 下 base 文件后缀：`*.base.rdb` = 已开，`*.base.aof` = 未开；或看 `INFO persistence` 的 `aof_base_size` |

---

## 误区 · 正解

| 误区 | 正解 |
| --- | --- |
| 「默认配置下 Redis 不持久化」 | <span style="color:red">RDB 默认是开的</span>（7.x `save 3600 1 300 100 60 10000`），**AOF 默认关**。真正"完全不持久化"是配置里写了 `save ""` 或注释掉所有 save 点（Docker 镜像/K8s ConfigMap 常见）。结论"上线前确认"对，但理由要说准 |
| 「bgsave 会阻塞服务」 | 只阻塞 `fork()` 一瞬间（毫秒到秒级），之后全程无感。代价是 COW 带来的内存峰值 |
| 「fork 复制了整个内存」 | fork 复制的是**页表**，数据页共享，靠 COW 按需复制 |
| 「页表就是数据的一份小副本」 | 页表只有映射关系（每项 **8 字节的 PTE**），不含任何数据。fork 复制页表 ≠ 复制数据 |
| 「fork 耗时和 key 的数量有关」 | 与**页表项数量（即实例占用内存）**成正比，与 key 个数无直接关系 |
| 「COW 是复制一份给子进程」 | 方向反了：<span style="color:red">新页给主进程去写，原页留给子进程</span>，子进程看到的就是快照 |
| 「主进程改 2GB 就多占 2GB」 | 粒度是**页不是字节**。风险取决于"改得有多散"，随机写打散时可能逼近 **2 倍** |
| 「RDB 触发只有 save 和 bgsave 两种」 | 三类：手动命令 / save 自动配置 / 主从复制、SHUTDOWN、FLUSHALL 等顺带触发 |
| 「命令写进 AOF 文件就等于落盘了」 | 完整链路是 `aof_buf` → `write(2)` 进内核页缓存 → **`fsync(2)` 才落盘**。write 后宕机照样丢 |
| 「AOF 和 MySQL 一样是先写日志」 | Redis 是**写后日志**（先执行再记），与 WAL 相反。好处是不做语法校验、不阻塞当前命令 |
| 「AOF 重写会丢重写期间的数据」 | 有重写缓冲（≤6.x）或新 incr 文件（7.x）兜底 |
| 「AOF 重写是分析压缩旧文件」 | 是**遍历内存数据**生成最小命令集，不读旧文件 |
| 「开了 AOF 就不需要 RDB」 | RDB 仍是备份、容灾、重建、主从全量同步的最快载体。官方也不建议纯 AOF |
| 「`appendfsync no` 只丢几秒」 | 完全交给 OS，<span style="color:red">Linux 默认 30 秒才回写</span>（`vm.dirty_expire_centisecs=3000`） |
| 「混合持久化后整个 AOF 都是 RDB 格式」 | 只有重写产生的 **base 部分**是 RDB，之后增量仍是 AOF 命令 |
| 「dump.rdb 可以随便拷来恢复」 | RDB 加载路径出现过**堆越界写/RCE 类漏洞**（如 CVE-2026-62356），只加载可信文件，并及时升级版本 |

---

## 相关文件

- `redis-01-data-types.md`：数据类型与应用场景
- `redis-05-internal-encoding.md`：底层编码实现层（SDS / listpack / quicklist / dict / skiplist）
- `redis-03-replication-sentinel-cluster.md`：主从复制、哨兵、集群
- `redis-04-single-thread-model.md`：单线程模型与持久化 fork 的关系
- `../scenario-design/`：场景设计题
