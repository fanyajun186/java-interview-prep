# JVM · G1 的 RSet

> 定位：G1 的核心数据结构，面试官用它区分「背过 G1」和「真的懂 G1」的人。追问通常从 RSet 一路下探到卡表、写屏障、SATB，最后落到「停顿为什么能可控」。
> 版本前提：JDK 8u 之后的 G1，重点描述 JDK 11 / 17（G1 是这两版的默认收集器）。JDK 19 起 RSet 内部实现重构为 `G1CardSet`，概念不变但类名不同。
> 生成日期：2026-10-08

## 1. 是什么

RSet（Remembered Set）是**每个 Region 一个**的辅助结构，记录「**谁引用了我**」（pointing-into），以「引用方 Region 索引 + 该 Region 内的卡位置」的形式存储。

它解决的问题是：G1 回收某个 Region 时（该 Region 在 Collection Set 中），需要知道「堆里还有谁指向我」，否则这些引用指向的对象会被错误回收。

## 2. 为什么这样设计

**没有 RSet 会怎样**：回收 Region A 之前，必须扫描整个堆找出所有指向 A 的引用。这就是「全堆扫描」，停顿不可控，与 G1「可预测停顿」的目标直接冲突。

**为什么不能照搬传统分代 GC 的卡表方案**：

| 方案 | 做法 | 为什么 G1 不能直接用 |
| --- | --- | --- |
| 传统分代（CMS/Parallel） | 一张**全局卡表**，记录「老年代 → 年轻代」的跨代引用；代际边界固定 | G1 中 Region 的角色（Eden/Survivor/Old）是动态的，没有固定的代际边界，无法预先划定「哪片区域需要被记录」 |
| G1 的 RSet | **per-Region** 的记忆集，任意 Region 之间都可以互相记录 | 内存代价更高，换来 Region 角色自由 |

一句话：**RSet 是把「全局卡表」打散成「每个 Region 一张的入边索引」**，这是 Region 化堆的必然代价。

**代价**（面试必答）：

1. **内存**：RSet 自身占堆空间。官方调优文档给出的经验区间是堆的 **5%-20%**，实际生产中通常低于 5%，但引用关系密集时会显著膨胀。
2. **写屏障开销**：每次引用赋值都要执行写屏障判断，是吞吐的固定税。
3. **Refinement CPU 开销**：后台线程持续消费脏卡并更新 RSet。
4. **扫描代价**：GC 时 RSet 中的引用要作为根的一部分被扫描，RSet 越粗（coarsening 越多）扫描越慢。

## 3. 底层怎么实现

### 3.1 三个容易混淆的结构

| 结构 | 方向 | 粒度 | 使用者 |
| --- | --- | --- | --- |
| **Card Table（卡表）** | 「我引用了谁」 | 卡（通常 512 字节，即 1 << 9） | G1 用 post-write barrier 维护 |
| **RSet** | 「谁引用了我」 | Region + 卡 | GC 根扫描时使用 |
| **SATB 队列** | 并发标记期间被覆盖的旧引用 | 对象 | pre-write barrier 写入，解决漏标 |

**关键**：卡表只是「粗略的线索」，RSet 才是「结构化的答案」。卡表通过写屏障标脏，RSet 通过后台线程从脏卡中提炼出真正的跨 Region 引用。

### 3.2 更新链路（核心）

```
应用线程: obj.f = other
   ↓
post-write barrier（g1_write_barrier_post）
   ↓ 判断：跨 Region？目标是 Old（需要记录）？
card_table()->mark_card()  →  该卡标脏
   ↓
卡入队 DirtyCardQueue
   ↓
Refinement 线程（G1ConcurrentRefineThread）消费队列
   ↓
G1RemSet::refine_card_concurrently → 解析卡内对象
   ↓
发现跨 Region 引用 → G1HeapRegionRemSet::add_reference
   ↓
更新【目标 Region】的 RSet
```

两个必须说清的点：

1. **写入是异步的**。应用线程只做「标脏 + 入队」，真正的 RSet 更新由 Refinement 线程完成。所以存在「引用已建立但 RSet 尚未更新」的窗口期 —— 这个窗口期由**写屏障 + 已入队的脏卡**兜底：GC 开始时会先处理队列中剩余的脏卡（STW 阶段 refine），保证不漏。
2. **写屏障 ≠ 内存屏障**。写屏障是 GC 层面在字段赋值处插入的钩子（维护卡表/RSet/SATB）；内存屏障是 JMM/CPU 层面的指令（LoadLoad、StoreLoad 等）。把两者混为一谈是典型减分点。另外 G1 **同时有写前屏障和写后屏障**：写前屏障用于 SATB，写后屏障用于卡表；CMS 用写后屏障做增量更新，两者不对称。

### 3.3 RSet 的粒度分级

| 粒度 | 存储内容 | 优点 | 缺点 |
| --- | --- | --- | --- |
| **Coarse（粗）** | `_coarse_map` 位图，1 bit / 引用方 Region | 内存极省 | 扫描时整个引用方 Region 都要过一遍 |
| **Fine（细）** | 按引用方 Region 维护一张表，内部随密度自适应：稀疏时用数组存卡索引，稠密时用位图（1 bit / 卡） | 扫描精确 | 内存占用高 |
| Coarsening | 细粒度表太满时整表升级为粗粒度 | 控制内存 | 丧失精度 |

补充（加分点）：不少中文资料讲「粗粒度、细粒度、详细粒度」三种。这是早期文档的说法；现代实现中主要是 coarse + fine 两档，fine 内部按密度自适应切换结构，另外 Code Root（JIT 编译代码中的引用）有独立集合处理。能指出这一点，说明你看的是源码而不是二手资料。

### 3.4 关键参数

| 参数 | 作用 |
| --- | --- |
| `-XX:G1RSetUpdatingPauseTimePercent` | 默认 10，控制 RSet 更新在 GC 暂停中允许占用的时间百分比上限 |
| `-XX:G1ConcRefinementThreads` | 并发 refine 线程数（默认由 ParallelGCThreads 推导） |
| `-XX:G1ConcRefinementServiceIntervalMillis` | refine 线程的调度周期 |
| `-XX:G1HeapRegionSize` | Region 大小（1-32MB，2 的幂）。Region 越小 → 跨 Region 引用越多 → RSet 压力越大 |
| `-XX:G1RSetRegionEntries` / `-XX:G1RSetSparseRegionEntries` | RSet 表的规模参数，调优/开发向，生产基本不动 |
| `-XX:+UnlockDiagnosticVMOptions -XX:+G1SummarizeRSetStats` | JDK 8 下的 RSet 统计输出 |
| `-Xlog:gc+remset*=debug` | JDK 9+ 统一日志观察 RSet 行为 |

## 4. 生产中的问题与排查

| 现象 | 可能原因 | 排查动作 |
| --- | --- | --- |
| GC 暂停时间持续增长，且随老年代增长而恶化 | RSet 膨胀 → 根扫描变慢；coarsening 增多导致扫描变粗 | `-Xlog:gc+remset*=debug` 看 refine 耗时与 RSet 规模；检查是否大量对象跨 Region 互相引用 |
| 暂停中出现大量脏卡处理 | Refinement 线程跟不上，脏卡积压到 STW 阶段处理 | 看 refine 线程数与队列长度；适当增加 `G1ConcRefinementThreads` |
| `to-space exhausted` / Evacuation Failure | 根扫描与转移耗时超预算、回收不及预期 | 结合 RSet 规模、`MaxGCPauseMillis`、IHOP 一起看 |
| 堆内存「莫名」偏高 | 部分被 RSet 占用 | 用 `jcmd <pid> GC.heap_info`、NMT（`-XX:NativeMemoryTracking`）观察 |

**排查思路模板**（面试可直接用）：先确认是不是 RSet 问题（日志中 refine/根扫描耗时占比高）→ 再定位是什么造成跨 Region 引用密集（大集合、缓存、长生命周期对象互相持有）→ 方案优先级：业务侧减少不必要的跨区引用 > 调大暂停预算 > 调 Region 大小 > 换 ZGC。

## 5. 可跑实验

实验目录：`labs/jvm-03-rset-pressure/`（可复制 skill 的 `assets/lab-project/`）

**目的**：观察 Region 大小与跨 Region 引用密度对 RSet 与 GC 暂停的影响。

**做法**：

- 固定堆：`-Xms512m -Xmx512m -XX:+UseG1GC`
- 构造大量老年代对象互相引用（比如若干个长生命周期 List，互相填充对方的元素，制造纯 Old → Old 的跨 Region 引用）
- 对比两组：`-XX:G1HeapRegionSize=1m` 与 `-XX:G1HeapRegionSize=8m`
- 加上 `-Xlog:gc+remset*=debug -Xlog:gc*:file=gc.log`

**预期现象**：Region 小的一组跨 Region 引用更多，RSet 条目更多、refine 活动更频繁，暂停时间更长。

**实际现象**：（运行后填写）

**结论**：（运行后填写）

## 6. 面试问法

**Q1：G1 的 RSet 是什么，解决什么问题？**
- 答题要点：每个 Region 一个，记录「谁引用了我」；目的是回收某 Region 时不必扫描全堆；本质是 Region 化堆的代价。
- 加分回答：对比传统分代 GC 的全局卡表，说明为什么 G1 不能沿用（Region 角色动态、无固定代际边界）。

**Q2：RSet 和卡表是什么关系？**
- 答题要点：卡表记录「我引用了谁」（粗线索），RSet 记录「谁引用了我」（结构化答案）；写屏障标脏卡 → 异步提炼进 RSet。
- 加分回答：卡大小 512 字节（1<<9）；脏卡入 DirtyCardQueue 由 Refinement 线程消费，更新是异步的。

**Q3：RSet 是同步更新的吗？**
- 答题要点：不是。应用线程只标脏卡并入队，更新由后台 Refinement 线程完成。
- 加分回答：GC 开始时会先把剩余脏卡处理完，所以不会漏；这是「写屏障 + 队列」的组合兜底。

**Q4：RSet 有什么粒度？为什么要分级？**
- 答题要点：粗粒度（1 bit/Region，省内存但扫描粗）与细粒度（精确到卡，内存高），细粒度太满会 coarsen。
- 加分回答：指出「三粒度」是早期文档说法，现代实现是 coarse + fine 自适应，Code Root 有独立集合。

**Q5：RSet 有什么代价？**
- 答题要点：内存（经验区间堆的 5%-20%）、写屏障开销、refine 线程 CPU、扫描代价。

**Q6：G1 为什么用 SATB 而不是增量更新？**
- 答题要点：SATB 用写前屏障记录被删除的引用，重新标记阶段不用重扫整个堆，停顿更可控；代价是产生浮动垃圾。
- 加分回答：CMS 用增量更新（写后屏障）；G1 两种屏障都有，写前屏障服务 SATB，写后屏障服务卡表。

**Q7：写屏障和内存屏障是一回事吗？**
- 答题要点：不是，一个是 GC 钩子，一个是 JMM/CPU 指令。这是典型的减分筛查点。

**Q8：线上 G1 暂停越来越长，怀疑 RSet 有问题，你怎么验证？**
- 答题要点：开 `-Xlog:gc+remset*=debug` 看 refine 与根扫描耗时占比；结合 NMT 看内存；定位跨 Region 引用来源；给出降级/调优路径。

## 7. 我的薄弱点

（学完后填写，同步到 `weakness.md`）
