# JVM · CMS 收集器

> 定位：CMS 已经死了（JDK 14 移除），但面试官依然爱问 —— 因为它把「并发收集」的所有设计代价暴露得最完整，理解了 CMS，G1 的不少设计动机自然就通了。
> 版本前提：JDK 8 是 CMS 的最后一个可用 LTS；JDK 9 弃用（JEP 291），JDK 14 移除（JEP 363）。下文参数以 JDK 8 为准。
> 生成日期：2026-10-08

## 1. 是什么

CMS（Concurrent Mark Sweep）是**以最短回收停顿为目标的老年代收集器**，基于**标记清除算法**，主要工作（并发标记、并发清除）与应用线程并发执行，只保留两次极短的 STW。

- 开启方式：`-XX:+UseConcMarkSweepGC`
- 新生代搭配：默认使用 **ParNew**（Serial 的多线程版），因为 CMS 不能与 Parallel Scavenge 搭配
- 算法：标记清除（**不移动对象**）——这是所有缺点之源

## 2. 为什么这样设计

**目标**：把停顿从「秒级」压到「几十毫秒」，服务于响应时间优先的应用（Web 服务、网关）。

**取舍**：把最耗时的两个环节（标记、清除）并发化，代价是

| 放弃的东西 | 后果 |
| --- | --- |
| 对象整理（不移动） | 内存碎片，大对象分配可能失败 |
| 全程一致性 | 并发期间引用在变 → 需要增量更新兜底，且产生浮动垃圾 |
| CPU 独占 | 并发线程与用户线程抢核，吞吐下降 |

对比 Parallel Old：Parallel Old 是「吞吐量优先」，整堆 STW + 标记整理，停顿长但内存整齐。CMS 是拿吞吐和整齐度换停顿。

## 3. 底层怎么实现

### 3.1 四个阶段（+1 个常被忽略的阶段）

| # | 阶段 | 是否 STW | 做什么 | 耗时特征 |
| --- | --- | --- | --- | --- |
| 1 | 初始标记 Initial Mark | **是** | 只标记 GC Roots **直接关联**的对象，不递归 | 极快，与根数量成正比 |
| 2 | 并发标记 Concurrent Mark | 否 | 从 GC Roots 遍历整个对象图（三色标记） | 最耗时，但与用户线程并行 |
| 3 | 重新标记 Remark | **是** | 修正并发标记期间的引用变动 | 与「并发期间的引用变动量 + 脏卡数」成正比，是停顿最不可控的一段 |
| 4 | 并发清除 Concurrent Sweep | 否 | 清除垃圾对象，**不移动** | 耗时长，不停顿 |
| 5 | 并发重置 Concurrent Reset | 否 | 重置标记状态，为下一轮准备 | 通常不计入「四阶段」的标准答法 |

**必答细节**：重新标记为什么通常比初始标记长？
因为它要处理并发期间累积的**增量更新记录**和**脏卡**，还要重扫根。注意它的耗时**不与堆大小成正比，而与并发期间的引用变动量成正比** —— 所以「堆大 = Remark 长」是错误理解。

### 3.2 漏标与增量更新

**漏标的两个条件**（同时满足才会丢对象）：

1. 黑色对象**新增**了一条指向白色对象的引用；
2. 灰色对象**删除**了这条到白色对象的引用。

**CMS 用增量更新（Incremental Update）破坏条件 1**：

- 记录「黑色对象新增的引用」，写屏障类型是**写后屏障**（post-write barrier）
- 重新标记阶段以这些被记录的黑色对象为根，重新扫描
- 对比：**G1 用 SATB 破坏条件 2**，写屏障类型是写前屏障（pre-write barrier）

记忆锚点：**CMS 记新增（增量更新、写后），G1 记删除（SATB、写前）**。

### 3.3 写屏障与卡表

CMS 的写后屏障同时承担两件事：

1. 维护**卡表**（记录跨代引用，供 Minor GC 快速定位老年代→新生代的引用）
2. 记录**增量更新**（供重新标记阶段修正）

**注意**：写屏障是 GC 在字段赋值处插入的钩子，**不是** JMM/CPU 层面的内存屏障（LoadLoad/StoreLoad 等）。混淆是典型减分点。

### 3.4 触发时机与关键参数

| 参数 | 作用 |
| --- | --- |
| `-XX:+UseConcMarkSweepGC` | 开启 CMS（老年代），新生代自动为 ParNew |
| `-XX:CMSInitiatingOccupancyFraction` | 老年代使用率达到该值触发 CMS 周期；**默认不是固定值**，而是运行时依据历史自动推算（典型落在 68% 附近，部分版本/组合下可到 92%） |
| `-XX:+UseCMSInitiatingOccupancyOnly` | 只用固定阈值，禁止运行时自适应 |
| `-XX:+CMSScavengeBeforeRemark` | 重新标记前先做一次 Young GC，显著缩短 Remark（常用调优手段） |
| `-XX:ConcGCThreads` | 并发 GC 线程数（默认约为 ParallelGCThreads 的 1/4） |
| `-XX:+CMSClassUnloadingEnabled` | 允许并发类卸载 |
| `-XX:+UseCMSCompactAtFullCollection` / `-XX:CMSFullGCsBeforeCompaction` | Full GC 时整理、每 N 次 Full GC 整理一次（**已废弃**，只是历史知识） |

### 3.5 两种致命退化

| 名称 | 发生时机 | 触发原因 | 后果 |
| --- | --- | --- | --- |
| **Concurrent Mode Failure** | CMS 并发周期**正在进行中** | 并发清除还没结束，老年代已经被填满（浮动垃圾 + 晋升对象）→ 预留空间不足 | 退化为 Serial Old，做一次真正的 Full GC，停顿从几十毫秒涨到**秒级** |
| **Promotion Failed** | **Minor GC 期间** | 要晋升的对象在 Survivor 放不下，老年代也放不下（常常是因为**碎片**） | 同样触发 Full GC（Serial Old 整理） |

**这两者的区别是高频追问点**，答不清就暴露了只会背名词。

## 4. 生产中的问题与排查

| 现象 | 原因 | 对策 |
| --- | --- | --- |
| 日志出现 `concurrent mode failure` | 阈值设得过高、晋升速度过快、浮动垃圾太多 | 调低 `CMSInitiatingOccupancyFraction`、增大堆或新生代、排查大对象/缓存膨胀 |
| 日志出现 `promotion failed` | 新生代过小、老年代碎片严重 | 调大新生代与 Survivor、检查是否有大对象直接进老年代 |
| 频繁退化到 Full GC | 碎片累积 | 提高回收频率（代价是更频繁的并发周期）；根本上应迁到 G1 |
| 停顿毛刺（偶发长停顿） | Remark 过长 | 加 `-XX:+CMSScavengeBeforeRemark`，减少存活对象与脏卡 |
| 应用吞吐下降、CPU 飙高 | 并发线程抢占 CPU | 减少 `ConcGCThreads`；核数少（<4）的机器不适合 CMS |

**JDK 8 日志关键行**：

```
[GC (CMS Initial Mark) ...]        初始标记，STW
[GC (CMS Final Remark) ...]        重新标记，STW
[GC (CMS Concurrent Mark) ...]     并发标记
[Full GC (Allocation Failure) ...] 退化成 Serial Old 的信号
```

排查顺序：先确认是 CMF 还是 promotion failed → 再看 GC 前后老年代占用曲线（`jstat -gc <pid> 1000`）→ 判断是「预留不足」还是「晋升过快」→ 分别调阈值或调新生代。

## 5. 可跑实验

实验目录：`labs/jvm-04-cms-cmf/`（复制 skill 的 `assets/lab-project/` 骨架）

**目的**：亲手复现 Concurrent Mode Failure，并验证阈值调整的效果。

**做法**：

- 堆固定：`-Xms256m -Xmx256m -XX:+UseConcMarkSweepGC -XX:+PrintGCDetails -XX:+PrintGCDateStamps -Xloggc:gc.log`
- 对比两组阈值：
  - A 组：`-XX:CMSInitiatingOccupancyFraction=90 -XX:+UseCMSInitiatingOccupancyOnly`
  - B 组：`-XX:CMSInitiatingOccupancyFraction=70 -XX:+UseCMSInitiatingOccupancyOnly`
- 业务模拟：持续分配中等大小对象，并保留其中一部分（模拟缓存/长生命周期对象），让老年代稳步增长

**预期现象**：A 组在并发周期中途老年代被填满，日志出现 `concurrent mode failure`，随后是一次 Serial Old 的 Full GC，停顿显著变长；B 组更早启动并发周期，退化概率明显下降（但并发周期次数增多，吞吐略降）。

**实际现象**：（运行后填写）

**结论**：（运行后填写）

## 6. 面试问法

**Q1：CMS 的四个阶段，哪些 STW？**
- 答题要点：初始标记（STW，短）、并发标记（不 STW）、重新标记（STW）、并发清除（不 STW）。
- 加分回答：补上并发重置阶段，并说明重新标记的耗时与引用变动量成正比而非堆大小。

**Q2：重新标记为什么比初始标记长？**
- 答题要点：要处理增量更新记录 + 脏卡 + 重扫根。
- 加分回答：用 `-XX:+CMSScavengeBeforeRemark` 可以先缩短这段。

**Q3：CMS 为什么用增量更新而不是 SATB？**
- 答题要点：CMS 破坏「黑色对象新增引用」这个条件，用写后屏障记录新增引用，重新标记时以这些对象为根重扫。
- 加分回答：G1 反过来用 SATB（写前屏障、记删除），代价是浮动垃圾；CMS 的增量更新代价是重新标记阶段的扫描量不可预测。

**Q4：CMS 有什么缺点？**
- 答题要点：内存碎片、并发模式失败、浮动垃圾、CPU 敏感。
- 加分回答：说明「浮动垃圾 → 必须预留空间 → 预留不足就 CMF」这条因果链，并指出根因是标记清除不移动对象。

**Q5：Concurrent Mode Failure 和 Promotion Failed 有什么区别？**
- 答题要点：前者发生在 CMS 并发周期中（预留空间不足），后者发生在 Minor GC 晋升时（碎片或空间不足）；两者都会退化为 Serial Old。
- 加分回答：给出各自的排查方向（调阈值 vs 调新生代/碎片）。

**Q6：CMS 为什么被淘汰？**
- 答题要点：碎片无法根治、停顿不可预测（Remark）、维护成本高（参数多）。
- 加分回答：G1 用「整体标记整理 + 局部复制」解决碎片，用 SATB + 可预测停顿模型解决停顿不可控，所以 JDK 9 直接默认切到 G1。

**Q7：CMS 用什么算法，为什么不整理？**
- 答题要点：标记清除；整理需要移动对象并更新所有引用，停顿长，与低停顿目标冲突。

**Q8：CMS 和 G1 的本质差别？**
- 答题要点：CMS 是纯老年代收集器、分代边界固定、标记清除；G1 是整堆收集器、Region 化、整体标记整理 + 局部复制、可预测停顿。
- 加分回答：CMS 靠全局卡表 + 增量更新；G1 靠 per-Region RSet + SATB。

## 7. 我的薄弱点

（学完后填写，同步到 `weakness.md`）
