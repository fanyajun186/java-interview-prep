# JVM 新生代划分与 GC 事件对照（Minor GC / Full GC / STW）

> 主题：Eden:S0:S1 = 8:1:1 的含义、新生代与老年代各由谁回收、Minor GC 与 Full GC 的触发时机与 STW 边界
> 学习日期：2026-10-09
> 对应知识地图：`references/01-jvm.md` 第 2.6 - 2.10 节

## 一、8:1:1 的准确含义

`-XX:SurvivorRatio=8` 的定义是 **Eden : 单个 Survivor = 8 : 1**，由此推导出 Eden:S0:S1 = 8:1:1，而不是参数本身写成 8:1:1。

新生代共 10 份：Eden 8/10，S0、S1 各 1/10。

| 参数场景 | Eden | S0 | S1 | 说明 |
| --- | --- | --- | --- | --- |
| `-Xmn=100m -XX:SurvivorRatio=8` | 80m | 10m | 10m | 最常见手工配置 |
| 不设 `-Xmn`，用 `-XX:NewRatio=2` | 随堆比例推导 | — | — | NewRatio = 老年代 : 新生代 |
| Parallel Scavenge 默认（`+UseAdaptiveSizePolicy`） | 动态调整 | 动态调整 | 动态调整 | **设了 SurvivorRatio 也可能"不生效"** |
| G1 | 不使用该模型 | — | — | G1 按 Region 动态划分，`-Xmn` 意义有限 |
| ZGC | 不使用分代（JDK21 前） | — | — | JDK21 引入分代 ZGC（实验性） |

### 三个必须答对的细节

1. **任一时刻只有一个 Survivor 有数据**，另一个恒为空（From / To 角色在每次 Minor GC 后互换）。所以新生代的实际可用空间 = Eden + 一个 Survivor = **9/10 新生代**，不是 10/10。这是复制算法的前提。
2. **`-Xmn` 与 `-XX:NewRatio` 互斥**，同时设以 `-Xmn` 优先。`-Xmn` 对 G1 有副作用（会固定年轻代 Region 数量，影响 G1 自适应），G1 场景一般不设。
3. **`SurvivorRatio` 只对 Serial / ParNew / Parallel Scavenge 有意义**。Parallel Scavenge 默认开启自适应策略后，Eden 与 Survivor 比例由 JVM 动态计算，日志里看到的尺寸和参数值对不上是正常的，需要 `-XX:-UseAdaptiveSizePolicy` 才能锁死。

## 二、各区域分别由谁回收

| 区域 | 收集器 | 算法 | 是否 STW |
| --- | --- | --- | --- |
| 新生代（Eden + S0 + S1） | Serial / ParNew / Parallel Scavenge | 复制（Copying） | 全程 STW |
| 老年代 | Serial Old / Parallel Old / CMS | 标记整理 / 标记清除 | CMS 仅初始标记与重新标记 STW |
| 整个堆 + 元空间 | 上述收集器的 Full GC 路径 | 视收集器而定 | 全程 STW |

**关键结论：CMS 不回收新生代。** 所以生产上 `-XX:+UseConcMarkSweepGC` 必须搭配 ParNew（JDK 8 下会自动选择 ParNew 作为新生代收集器），GC 日志里会同时出现 `ParNew:` 和 `CMS-*` 两种记录 —— 它们是两条独立的回收链路，不是一个事件的两个阶段。

## 三、Minor GC（Young GC）

| 项目 | 内容 |
| --- | --- |
| 触发条件 | **Eden 满**（新对象分配失败）；Survivor 满不触发 GC |
| 其他触发源 | `System.gc()`（视收集器实现）、分配担保失败导致的提前回收、`jmap -dump` 等诊断命令 |
| 回收范围 | 仅新生代（Eden + From Survivor） |
| 算法 | 复制：存活对象从 Eden + From Survivor 复制到 To Survivor |
| 是否 STW | **是，全程 STW**。ParNew 是多线程并行，但并行 ≠ 并发，应用线程必须挂起 |
| 日志标志 | `ParNew:`（ParNew）、`DefNew:`（Serial）、`PSYoungGen`（Parallel Scavenge） |
| 日志样例 | `ParNew: 61440K->6784K(61440K), 0.0182324 secs` |
| 老年代变化 | 同一行日志后半段会打印老年代：`6794K->8600K(136960K)` —— 这是晋升与分配担保的结果 |
| 幂等性 | 可以只跑 Minor GC 不动老年代 → 这也是判断"晋升是否过快"的入口 |

### 执行五步

1. Eden 满，触发回收请求
2. **STW**，枚举 GC Roots（安全点），标记 Eden 与 From Survivor 中的存活对象
3. 把存活对象复制到 To Survivor，被复制对象的年龄 +1
4. 晋升判定：满足条件（年龄阈值 / 动态年龄判定 / 大对象 / 分配担保）的对象直接进老年代
5. 清空 Eden 与 From Survivor，S0 / S1 角色互换，应用线程恢复

对第 2 步的常见追问：为什么必须 STW？因为并发标记过程中对象引用关系会变，复制算法要求在一个"引用图冻结"的快照上搬运对象，否则会漏搬或搬错。

### 对象进入老年代的 4 条途径

| # | 途径 | 参数 / 条件 |
| --- | --- | --- |
| 1 | 年龄达到阈值 | `-XX:MaxTenuringThreshold`，默认 15；CMS 下默认 6 |
| 2 | 动态年龄判定 | Survivor 中**同年龄**对象大小总和 > Survivor 空间一半 → 该年龄及以上的对象全部晋升 |
| 3 | 大对象直接进老年代 | `-XX:PretenureSizeThreshold`（仅 Serial / ParNew 有效，**G1 无效**） |
| 4 | 空间分配担保 | To Survivor 放不下 → 直接进老年代；Minor GC 前检查老年代最大连续空间 < 新生代对象总大小 → 提前 Full GC |

第 2 条是最容易被漏答的：由于动态年龄判定，对象**很少真的活到 15 岁**，Survivor 里的对象实际停留时间远短于参数值。

## 四、Minor GC 与 Full GC 的术语辨析

这是最容易答混的一组概念，先把「范围」和「收集器」两件事拆开。

| 术语 | 严格含义 | 回收范围 | 收集器 | STW |
| --- | --- | --- | --- | --- |
| Minor GC / Young GC | 新生代收集 | 新生代 | ParNew / Serial / PS | 全程 STW |
| Major GC / Old GC | 老年代收集 | **仅老年代** | CMS 并发周期 | 只有初始标记、重新标记 STW |
| Mixed GC | G1 特有 | 全部新生代 + **部分**老年代 | G1 | 全程 STW |
| Full GC | 整堆 + 元空间收集 | 新生代 + 老年代 + 元空间 | 视收集器 | 全程 STW，代价最高 |

**「Major GC = Full GC」是错的。** CMS 的并发周期只清理老年代，不动新生代（它按并发标记开始时的快照清除），所以它是 Major GC 但不是 Full GC。日志上也能区分：

- **CMS 并发周期**：`CMS-initial-mark` → `CMS-concurrent-mark` → `CMS-remark` → `CMS-concurrent-sweep` → `CMS-concurrent-reset`
- **真 Full GC**：`Full GC (System.gc())`、`Full GC (concurrent mode failure)`、`Full GC (Allocation Failure)`、`Full GC (Metadata GC Threshold)`

## 五、Full GC 触发条件清单

| # | 触发条件 | 日志标志 / 备注 |
| --- | --- | --- |
| 1 | 老年代空间不足（对象晋升时无空间可放） | `Full GC (Allocation Failure)` |
| 2 | 空间分配担保失败 | Minor GC 前的预检查未通过（JDK 6u24 后 `HandlePromotionFailure` 逻辑默认允许担保） |
| 3 | CMS 并发模式失败 | `Full GC (concurrent mode failure)`，退化为 Serial Old 单线程整理 |
| 4 | Promotion Failed（晋升失败） | 晋升那一刻空间 / 碎片不够，同样退化为 Serial Old |
| 5 | 元空间 / 永久代容量不足 | `Full GC (Metadata GC Threshold)`，JDK 8+ 看 `-XX:MetaspaceSize` |
| 6 | 显式调用 `System.gc()` | `Full GC (System.gc())`，可用 `-XX:+DisableExplicitGC` 屏蔽 |
| 7 | 触发 JVM 诊断命令 | `jmap -dump:live`、`jcmd GC.run` 等 |

注意区分 1 和 3：`Promotion Failed` 发生在 Minor GC 晋升那一刻，`Concurrent Mode Failure` 发生在 CMS 并发周期进行中（预留空间被新晋升对象填满）。两者都退化成 Serial Old。

## 六、STW 全景表

| GC 事件 | 停顿点 | 停顿特点 | 停顿长短的驱动因素 |
| --- | --- | --- | --- |
| Minor GC（ParNew） | 全程 | 短、可预测 | 存活对象总量（要复制的量），**不是堆大小** |
| CMS 初始标记 | 仅此阶段 | 极短 | GC Roots 直接引用的对象数量 |
| CMS 重新标记 | 仅此阶段 | **不可控**，常比初始标记长 | 并发期间引用变动量 |
| CMS 并发标记 / 并发清除 | 不 STW | 无停顿，但与用户线程抢 CPU | — |
| Full GC（Serial Old / Parallel Old） | 全程 | 长，最坏到秒级 | 堆大小 + 对象图复杂度 |
| G1 Young GC / Mixed GC | 全程 | 由 `-XX:MaxGCPauseMillis` 目标控制 | 选中的回收集合大小 |

## 七、高频追问链

**主问题：Minor GC 的触发条件是什么？**
- 追问 1：是新生代满了还是 Eden 满了？→ 答题落点：Eden 满。Survivor 满不触发 GC，Survivor 装不下直接走分配担保进老年代。
- 追问 2：那我把新生代调大点，GC 频率不就降了？→ 答题落点：频率降了但单次停顿变长（复制量增加），且存活对象更容易被"养大"导致晋升压力上升；`-Xmn` 在 G1 下还有副作用，不是纯收益。
- 追问 3：ParNew 是多线程的，为什么还是 STW？→ 答题落点：并行（多个 GC 线程同时工作，用户线程停）≠ 并发（GC 线程与用户线程同时工作）。ParNew 属于前者。

**主问题：CMS 的并发周期算 Full GC 吗？**
- 追问 1：不算。那 Full GC 到底什么时候真发生？→ 答题落点：并发模式失败、晋升失败、元空间不足、`System.gc()`、分配担保失败。
- 追问 2：为什么 CMF 之后要退化成 Serial Old？→ 答题落点：CMS 是标记清除不移动对象，降到 Serial Old 是因为它是**标记整理**，只有整理才能消除碎片——退化本质是"停下来做一次压缩"。
- 追问 3：为什么 CMS 会有碎片？→ 答题落点：不移动对象 + 浮动垃圾；可用 `-XX:CMSFullGCsBeforeCompaction` 缓解但已废弃，正解是换 G1（整体标记整理 + 局部复制）。
- 追问 4：JDK 9 之后还能用 CMS 吗？→ 答题落点：JDK 9 标记废弃（JEP 291），JDK 14 正式移除（JEP 363），`-XX:+UseConcMarkSweepGC` 直接启动失败。

**主问题：Minor GC 的时候老年代的对象会被回收吗？**
- 追问 1：不会。那为什么日志里老年代的数字在变？→ 答题落点：新对象晋升 + 分配担保直接进老年代，日志里的老年代占用只增（本次回收内）不经过 CMS 周期不会降。
- 追问 2：那老年代什么时候降？→ 答题落点：只有 CMS 并发周期（或 Full GC）完成后才回落，所以观察 `jstat -gc` 要看 OU 而不是 EU 来判断老年代是否泄漏。

**主问题：STW 具体发生在哪些时刻，怎么减少？**
- 追问 1：列一下。→ 答题落点：Minor GC 全程、CMS 的初始标记与重新标记、Full GC 全程、G1 的 Young/Mixed GC。
- 追问 2：怎么减少？→ 答题落点：控制晋升速率（避免大对象、调 `SurvivorRatio`、控 `MaxTenuringThreshold`）、减少跨代引用（CMS 的卡表扫描量）、调 `-XX:ParallelGCThreads`、`-XX:CMSInitiatingOccupancyFraction` 让并发周期提前启动、换 G1/ZGC 把停顿变成可预算的。
- 追问 3：减少停顿和降低 GC 频率冲突吗？→ 答题落点：冲突。这是分代大小调参的核心矛盾——新生代越大，GC 越少但单次越久；面试时能主动说出这个 trade-off 是加分项。

## 八、面试问法（附答题骨架）

1. 「新生代的 Eden 和两个 Survivor 是怎么划分的？为什么要有两个 Survivor？」
   → 骨架：SurvivorRatio 定义 → 8:1:1 → 一个恒空是为了复制算法有落脚地（to-space）→ 两个是为了避免碎片。
2. 「Minor GC 前 JVM 做了哪些检查？」
   → 骨架：分配担保预检查（老年代最大连续空间 vs 新生代对象总大小 / 历次平均晋升大小）→ 不满足则提前 Full GC。
3. 「你们的服务 Full GC 多久一次？为什么？」
   → 骨架：给具体数字 + 触发原因归类（晋升过快 / 碎片 / 元空间）→ 定位手段（jstat 曲线、GC 日志、dump）。
4. 「CMS 的初始标记和重新标记哪个更慢？为什么？」
   → 骨架：重新标记更慢且不可控，因为它要处理并发期间的增量更新记录 + 脏卡 + 重扫根，耗时随引用变动量走。
5. 「为什么 JDK 8 之后 Full GC 变多了？」
   → 骨架：元空间替代永久代 → `-XX:MetaspaceSize` 默认约 21MB 太小 → 启动期反复触发 Metadata GC Threshold Full GC → 生产必调。
6. 「线上观察到老年代使用率一直涨，Minor GC 次数正常，怎么判断是不是泄漏？」
   → 骨架：看 CMS 周期后 OU 是否回落；不回落 → dump 对比两次 → MAT 找支配对象。
7. 「ParNew 的停顿时间和什么成正比？」
   → 骨架：Eden + From 中存活对象的量（复制量），与堆大小无关——这也是分代回收高效的根本原因。
8. 「G1 的 Mixed GC 和 Full GC 有什么区别？」
   → 骨架：Mixed GC 只收部分老年代 Region 且 STW 可控；Full GC 是回收失败的兜底，单线程（JDK10 前）/ 并行（JDK10 后 JEP 307），日志里出现 `Pause Full` 就说明停顿预测模型已经失效。

## 九、常见误区

| # | 错误说法 | 正确理解 |
| --- | --- | --- |
| 1 | 8:1:1 表示新生代可用 10 份空间 | 任一时刻只有一个 Survivor 有数据，实际可用 9/10 |
| 2 | Major GC 就是 Full GC | CMS 的并发周期只清老年代，是 Major GC 但不是 Full GC |
| 3 | ParNew 是并行的所以不 STW | 并行 ≠ 并发，ParNew 全程 STW |
| 4 | Minor GC 只会被 Eden 满触发 | 还有 `System.gc()`、分配担保失败、诊断命令 |
| 5 | CMS 会回收新生代 | 不会，必须搭配 ParNew |
| 6 | 对象要熬到 15 岁才晋升 | 动态年龄判定会让大批对象提前晋升，实际很少到 15 |
| 7 | Full GC 频繁就加大堆 | 先区分"容量不足"与"内存泄漏"，泄漏加堆只是延后崩溃且单次 GC 更久 |
| 8 | `-Xmn` 设大就能减少 GC 影响 | 频率降但单次停顿升，且对 G1 有害 |
| 9 | `-XX:PretenureSizeThreshold` 对所有收集器有效 | 只对 Serial / ParNew 有效，G1 用 Humongous Region 机制 |
| 10 | `System.gc()` 一定触发 Full GC | 取决于收集器实现与 GC 策略，但线上应一律用 `-XX:+DisableExplicitGC` 屏蔽 |

## 十、一句话总结

**分代模型把"回收"拆成两条独立链路：新生代用 ParNew 复制，全程 STW 但停顿与存活对象量成正比所以很快；老年代用 CMS 标记清除，只有初始标记与重新标记两次停顿，其余阶段与应用并行。Minor GC 由 Eden 满触发，Full GC 是整堆加元空间的兜底回收 —— 它出现的那一刻，就说明分代策略或停顿预算已经失衡了。**

## 十一、可跑实验（建议）

实验：观察分代比例与晋升行为

- 目的：验证 Eden:S0:S1 = 8:1:1、复制算法下 Survivor 交替、动态年龄判定导致的提前晋升
- 参数：`-Xms200m -Xmx200m -Xmn100m -XX:SurvivorRatio=8 -XX:+UseParNewGC -XX:+PrintGCDetails -Xloggc:gc.log`
- 关键步骤：持续以固定速率分配短生命周期对象，同时每秒保留一小部分对象到静态集合（构造晋升压力）
- 观察工具：`jstat -gc <pid> 1000`（看 EU/S0U/S1U/OU 的交替与增长）
- 预期现象：EU 周期性回到接近 0；S0U 与 S1U 交替出现、另一侧恒为 0；OU 阶梯式上涨
- 结论：确认可用空间只有 9/10；老年代只涨不降（说明只有 CMS/Full GC 才会回落）；OU 上涨速度即晋升速率，是调参的核心观测量
