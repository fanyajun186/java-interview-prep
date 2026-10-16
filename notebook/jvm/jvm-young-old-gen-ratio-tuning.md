# 新生代 / 老年代比例的业务化设置：ParNew + CMS vs G1

> 主题：分代比例的调优方法论 | 面试权重：高（JVM 调优轮必问，且是「背过」与「真调过」的分水岭）
> 一句话定位：ParNew + CMS 下比例是**你填的输入**，G1 下比例是**JVM 算的输出**。

---

## 0. 这题在面试里考什么

- 出现频率：JVM 调优题中约 70% 会问到，常在「你们线上 JVM 参数怎么配的」后面作为追问出现。
- 三种问法：
  1. 直接问参数含义（`-Xmn` / `-XX:NewRatio` / `-XX:SurvivorRatio` 的区别）—— 筛选级。
  2. 给业务场景问怎么配（「订单系统 QPS 3000，堆 8G，参数怎么给」）—— 主力考法。
  3. 给现象问归因（「Full GC 日志里有 concurrent mode failure，新生代会不会给大了」）—— 区分度高。
- 失分集中区：不知道 `NewRatio` 的方向、不知道 CMS 的 `MaxTenuringThreshold` 默认是 6、不知道 G1 与 `-Xmn` 互斥。
- 备考建议：先把两套参数体系背成「映射关系」而不是「清单」，重点记三条铁律（见第 5 节）。

---

## 1. 考点清单

### 必考
- [ ] `-Xmn` 与 `-XX:NewRatio` 的定义方向（NewRatio 是**老:新**）与优先级
- [ ] `-XX:SurvivorRatio` 的定义（Eden : **单个** Survivor）与「实际可用 9/10」
- [ ] 新生代大小与 Minor GC 频率 / 单次停顿的权衡关系
- [ ] CMS 的 `CMSInitiatingOccupancyFraction` 与 `UseCMSInitiatingOccupancyOnly` 的配合
- [ ] `Concurrent Mode Failure` 与 `Promotion Failed` 的触发点差异与归因
- [ ] G1 的比例由停顿预测模型动态决定，`G1NewSizePercent` / `G1MaxNewSizePercent` 是上下限
- [ ] `-Xmn` 与 `-XX:MaxGCPauseMillis` 互斥的原因与后果

### 应当掌握
- [ ] `-XX:MaxTenuringThreshold` 在 CMS 下的默认值（6）及原因
- [ ] `-XX:PretenureSizeThreshold` 只对 Serial / ParNew 生效
- [ ] 动态年龄判定（Survivor 中同龄对象总和 > Survivor/2 时提前晋升）
- [ ] `-XX:+CMSScavengeBeforeRemark` 缩短 Remark 的原理
- [ ] `-XX:ConcGCThreads` 的经验值（约 (核数+3)/4）与和业务线程抢 CPU 的问题
- [ ] G1 的 `G1HeapRegionSize` 与 Humongous 分配的关系
- [ ] IHOP 与 `G1UseAdaptiveIHOP`（JDK 9+ 默认开启）
- [ ] `to-space exhausted` / `Evacuation Failure` 的归因与处置
- [ ] 怎么用 `jstat -gc` 的数据反推该调大还是调小新生代
- [ ] GC 日志中 `Pause Young` / `Pause Remark` / `Pause Full` 的解读

### 了解即可
- [ ] `-XX:G1MixedGCLiveThresholdPercent`、`-XX:G1HeapWastePercent`
- [ ] `-XX:G1MixedGCCountTarget` 对单次 Mixed GC 时长的影响
- [ ] `-XX:MaxRAMPercentage` 在容器化环境下的用法
- [ ] ZGC / Shenandoah 在停顿 < 10ms 场景下的替代性

---

## 2. 核心原理

### 2.1 为什么这题的答案在两代收集器下完全不同

ParNew + CMS 是**静态分代**：堆在启动时就被切成固定比例的 Eden / Survivor / Old，运行期不再改变。你必须在启动参数里把比例算好，算错的代价是运行期无法纠正。

G1 是**目标驱动**：堆被切成等大 Region，Eden / Survivor / Old 只是 Region 的临时角色。每次 Young GC 都重新决定「这一轮要圈多少 Region 当 Eden」。所以比例不是输入，而是 JVM 优化一个目标函数（停顿预算）后的输出。

这条差异决定了面试答法：**CMS 的答案是一组数字，G1 的答案是一个目标加两条边界。**

### 2.2 CMS 侧参数体系（三段式）

```
总堆 (-Xms = -Xmx)
 └── 新生代 (-Xmn 或 -XX:NewRatio)
      └── Eden : 单个 Survivor (-XX:SurvivorRatio)
 └── 老年代 = 总堆 - 新生代  ← 不能直接指定，只能被间接约束
```

| 参数 | 默认 | 含义 | 生产建议 |
| --- | --- | --- | --- |
| `-Xms` / `-Xmx` | 物理内存 1/64 与 1/4 | 堆初始 / 上限 | 必须设成相同值 |
| `-Xmn` | — | 新生代大小 | 与 `NewRatio` 二选一，`-Xmn` 优先级更高 |
| `-XX:NewRatio` | 2 | **老年代 : 新生代 = N : 1** | 2 表示新生代占堆的 1/3 |
| `-XX:SurvivorRatio` | 8 | Eden : 单个 Survivor | 一般不动 |
| `-XX:MaxTenuringThreshold` | **CMS 为 6**，Serial/ParNew 为 15 | 晋升年龄阈值 | 想减少老年代压力可保持默认 |
| `-XX:PretenureSizeThreshold` | 0 | 大对象直接入老年代 | 仅 Serial / ParNew 生效 |
| `-XX:CMSInitiatingOccupancyFraction` | -1（实际按 CMSTriggerRatio 算出约 92%） | 老年代占比触发并发周期 | 显式设 70-75 |
| `-XX:+UseCMSInitiatingOccupancyOnly` | 关 | 禁止 JVM 自适应覆盖上面的阈值 | 设阈值时必须同时加 |
| `-XX:+CMSScavengeBeforeRemark` | 关 | Remark 前先做一次 YGC | 建议开，Remark 可显著缩短 |
| `-XX:ParallelGCThreads` | 按核数 | 并行 GC 线程数 | 容器内交给 UseContainerSupport |
| `-XX:ConcGCThreads` | 约 (核数+3)/4 | CMS 并发线程数 | 别设满核数，会给业务抢 CPU |

**`NewRatio` 的方向是最容易答反的地方。** `-XX:NewRatio=2` 表示老年代是新生代的 2 倍，即新生代占堆的 1/3；`-XX:NewRatio=8` 是新生代只占 1/9，而不是 1/8。

**`CMSInitiatingOccupancyFraction` 的隐性陷阱**：不设 `UseCMSInitiatingOccupancyOnly` 时，JVM 用 `((100 - MinHeapFreeRatio) + CMSTriggerRatio * MinHeapFreeRatio / 100)` ≈ 92% 作为首次触发阈值，并根据历史并发周期耗时自适应调整。92% 才启动并发标记，留给浮动垃圾的空间极小 → 高频 CMF。这条阈值在生产上几乎必须手工压到 70-75 并锁死。

### 2.3 怎么定新生代大小：三类业务三种打法

判断依据只有一个问题：**这批业务的对象，有多少能活过一轮 Minor GC。**

| 业务特征 | 识别信号 | 新生代策略 | 老年代侧配合 | 风险 |
| --- | --- | --- | --- | --- |
| 短命对象为主（API 网关、序列化、DTO） | YGC 频繁但单次极短、晋升量小 | 加大到堆 1/3 - 1/2 | CMS 阈值可放宽到 75 | 低 |
| 本地缓存 / 长生命周期对象 | S0/S1 长期饱和、晋升量大 | 保持 1/4 - 1/3，**不要加大** | 阈值压到 60-70 | 设 1/2 会 CMF |
| 大对象多（大 JSON、批量导出） | 日志出现 Humongous / 大幅晋升 | 配 `PretenureSizeThreshold` | 老年代要够大 | Promotion Failed |
| 老年代持续高位不降 | Old 区使用率单调上升 | 先查泄漏，不是调参能解决的 | — | 频繁 CMS + CMF |

**权衡机制**：新生代增大 → Eden 更大 → Minor GC 频率下降，但单次 Minor GC 要复制的存活对象更多，STW 变长；同时老年代被压缩，CMS 的浮动垃圾预留空间变小。两条代价曲线交叉处就是甜区，CMS 的经验值在新生代占堆 1/4 - 1/3。

### 2.4 G1 侧：比例是动态输出

G1 的决策链路：

```
MaxGCPauseMillis（停顿目标，软目标）
   ↓
停顿预测模型（基于历史停顿的衰减加权平均）
   ↓
本轮 Young GC 圈多少 Region 当 Eden
   ↓
约束在 [G1NewSizePercent, G1MaxNewSizePercent] 区间内
```

关键点：**G1 每次 YGC 都会重新算**。停顿达标就下一轮多圈一点（提高吞吐），超标就少圈一点（保停顿）。你观察到的新生代大小是一条震荡曲线，而不是固定值。

| 参数 | 默认 | 作用 |
| --- | --- | --- |
| `-XX:MaxGCPauseMillis` | 200 | 停顿软目标，第一旋钮 |
| `-XX:G1NewSizePercent` | 5 | 新生代下限（允许 G1 缩到多小） |
| `-XX:G1MaxNewSizePercent` | 60 | 新生代上限（允许 G1 涨到多大） |
| `-XX:G1HeapRegionSize` | 堆 / 2048，取 2 的幂，1-32M | Region 大小；≥ RegionSize/2 的对象按 Humongous 处理 |
| `-XX:InitiatingHeapOccupancyPercent` | 45 | 老年代占比达到此值启动并发标记周期 |
| `-XX:G1ReservePercent` | 10 | 预留空间，防 Evacuation 失败 |
| `-XX:G1MixedGCLiveThresholdPercent` | 85 | Region 存活率超过此值不加入 CSet |
| `-XX:G1HeapWastePercent` | 5 | 可容忍的垃圾占比，低于此值停止 Mixed GC |
| `-XX:G1MixedGCCountTarget` | 8 | 一个并发周期内 Mixed GC 次数目标 |
| `-XX:G1OldCSetRegionThresholdPercent` | 10 | 每次 Mixed GC 最多回收的老年代 Region 占比 |
| `-XX:+G1UseAdaptiveIHOP` | JDK 9+ 开启 | IHOP 自适应；显式设 IHOP 会关掉它 |

**调优顺序（面试可直接答）**：定 `-Xmx` → 定 `MaxGCPauseMillis` → 最后才动 IHOP 与 `G1HeapRegionSize`。原因是后两者是「补救手段」，先动它们等于在没有目标的情况下瞎调。

**`-Xmn` 与 G1 互斥的原因**：G1 的全部价值在于用停顿预测模型动态交换「新生代大小 ↔ 停顿」；钉死新生代等于把这条自适应链路切断，G1 只能退回固定分代行为。HotSpot 的实际行为是：一旦设 `-Xmn`，停顿目标被放弃。

### 2.5 两类失效场景的归因速查

| 日志现象 | 收集器 | 根因 | 处置 |
| --- | --- | --- | --- |
| `Full GC (concurrent mode failure)` | CMS | 并发周期进行中预留空间被填满 | 降 `CMSInitiatingOccupancyFraction`（提前起周期）+ 缩小 `-Xmn` |
| `Full GC (promotion failed)` | CMS | 晋升那一刻老年代空间或碎片不足 | 开 `CMSScavengeBeforeRemark`；减少碎片（`CMSFullGCsBeforeCompaction`）；查大对象 |
| `to-space exhausted` | G1 | Survivor 空间不足，Evacuation 失败 | 加 `G1ReservePercent`；降 IHOP；调超大对象 |
| `Evacuation Failure` | G1 | 转移目标空间不足 | 同上，或直接扩容 |
| `Pause Full (G1 Compaction Pause)` | G1 | 兜底的整堆压缩 | 说明分代策略已失衡，检查晋升速率与 IHOP |

**CMF 与 Promotion Failed 的区别是高频追问**：前者发生在并发周期**进行中**（时间维度上老年代被填满），后者发生在 Minor GC **晋升那一刻**（空间维度上放不下）。

---

## 3. 两套配置模板

### 3.1 ParNew + CMS（4G 堆，短命对象为主，停顿容忍 200ms 级）

```
-Xms4g -Xmx4g
-Xmn1500m
-XX:SurvivorRatio=8 -XX:MaxTenuringThreshold=6
-XX:PretenureSizeThreshold=1m
-XX:+UseParNewGC -XX:+UseConcMarkSweepGC
-XX:CMSInitiatingOccupancyFraction=70 -XX:+UseCMSInitiatingOccupancyOnly
-XX:+CMSScavengeBeforeRemark
-XX:ParallelGCThreads=8 -XX:ConcGCThreads=4
-XX:+DisableExplicitGC
-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/data/dump
-Xlog:gc*:file=/data/logs/gc.log:time,uptime,level,tags:filecount=10,filesize=100m
```

### 3.2 G1（8G 堆，停顿目标 150ms，存在大对象）

```
-Xms8g -Xmx8g
-XX:+UseG1GC
-XX:MaxGCPauseMillis=150
-XX:G1HeapRegionSize=8m
-XX:InitiatingHeapOccupancyPercent=40
-XX:G1ReservePercent=15
-XX:+ParallelRefProcEnabled
-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/data/dump
-Xlog:gc*:file=/data/logs/gc.log:time,uptime,level,tags:filecount=10,filesize=100m
```

注意 G1 模板里**没有 `-Xmn`、没有 `SurvivorRatio`、没有 `PretenureSizeThreshold`** —— 这三个参数在 G1 语境下要么无效要么有害。

---

## 4. 实验设计：新生代比例对 GC 行为的影响

**目的**：亲手验证「新生代大小 ↔ YGC 频率 / 单次停顿」的权衡关系，以及 CMS 下加大新生代的边界。

**环境**：JDK 8 或 11（CMS 可用），512m 堆。JDK 14+ 已移除 CMS，G1 实验可任意版本。

**步骤**：

1. 造压测程序：循环分配短命对象，模拟 Web 请求的 DTO 生命周期。

```java
public class AllocPressure {
    public static void main(String[] args) throws Exception {
        long deadline = System.currentTimeMillis() + 60_000;
        while (System.currentTimeMillis() < deadline) {
            for (int i = 0; i < 2000; i++) {
                byte[] buf = new byte[1024];
                buf[0] = 1;
            }
        }
    }
}
```

2. 三组对照，各跑 60s，记录 `jstat -gc` 的 YGC / YGCT 与 GC 日志里的 `Pause Young` 耗时：

```bash
# A: 新生代 64m
java -Xms512m -Xmx512m -Xmn64m -XX:+UseParNewGC -XX:+UseConcMarkSweepGC \
     -Xlog:gc*:file=gcA.log AllocPressure
# B: 新生代 256m
java -Xms512m -Xmx512m -Xmn256m -XX:+UseParNewGC -XX:+UseConcMarkSweepGC \
     -Xlog:gc*:file=gcB.log AllocPressure
# C: 新生代 256m 但堆升到 1g（给老年代留空间）
java -Xms1g -Xmx1g -Xmn256m -XX:+UseParNewGC -XX:+UseConcMarkSweepGC \
     -Xlog:gc*:file=gcC.log AllocPressure
```

3. 统计：`YGC` 次数、平均单次停顿（`YGCT / YGC`）、`FGC` 次数、Old 区使用率曲线。

**预期现象**：
- A 组 YGC 次数最多、平均停顿最短；B 组 YGC 次数显著减少但平均停顿变长。
- B 组在 512m 堆下老年代只剩 256m，可能出现 `CMS-concurrent-mark` 后紧跟 CMF 或 FGC。
- C 组与 B 组新生代相同，但因为总堆翻倍，FGC 次数应显著下降 —— 证明「加大新生代」和「加大堆」是两件事。

**结论**：新生代大小的收益是「减少 YGC 次数」，代价是「单次停顿变长 + 挤压老年代」。当老年代被挤压到无法容纳浮动垃圾时，节省下来的 YGC 时间会被一次 FGC 全部吃掉。

---

## 5. 三条铁律（背下来就能答对大半）

1. **`NewRatio` 是「老 : 新」**。`NewRatio=2` → 新生代占堆 1/3；`NewRatio=8` → 新生代占堆 1/9。
2. **CMS 的 `MaxTenuringThreshold` 默认是 6**，不是 15。这是为了减少老年代压力而故意调低的。
3. **G1 不用 `-Xmn`**。设了就等于放弃停顿目标；G1 的比例由 `MaxGCPauseMillis` 驱动，边界由 `G1NewSizePercent` / `G1MaxNewSizePercent` 限定。

---

## 6. 高频追问链

**主问题：你们线上 JVM 参数怎么配的？**（这题的真正落点在第 2、3 层）
- 追问 1：为什么新生代给这个值？→ 看对象的存活特性：短命对象为主就加大，缓存类业务就保持默认甚至更小。
- 追问 2：怎么验证这个值是对的？→ `jstat -gc` 看 YGC 频率与单次耗时、GC 日志看晋升量；调参前后对比 FGC 次数。
- 追问 3：如果给你一个从没见过的应用，你怎么定？→ 先用默认值跑，观察一周 GC 日志，按「YGC 频率 × 单次停顿」与「晋升速率」两个指标定方向。

**主问题：为什么 G1 不推荐设 `-Xmn`？**
- 追问 1：设了会怎样？→ G1 放弃停顿目标，自适应伸缩失效，退化成固定分代。
- 追问 2：那我想限制新生代上限怎么办？→ 调 `G1MaxNewSizePercent`，而不是钉死绝对值。
- 追问 3：G1 上调停顿目标有什么用？→ 它是吞吐与停顿的交换旋钮：调小 → G1 缩小新生代、YGC 更频繁、吞吐下降。

**主问题：新生代给到一半堆，会有什么问题？**
- 追问 1：CMS 下的具体后果？→ 老年代只剩一半，浮动垃圾预留不足 → `Concurrent Mode Failure` → 退化成 Serial Old 做压缩，停顿跳到秒级。
- 追问 2：日志上怎么确认？→ `Full GC (concurrent mode failure)` 紧跟 `CMS-concurrent-mark`。
- 追问 3：怎么修？→ 两个动作必须一起做：降 `CMSInitiatingOccupancyFraction` 提前启动并发周期 + 缩小 `-Xmn`。

**主问题：怎么判断该调大还是调小新生代？**
- 追问 1：调大的信号？→ YGC 频率极高（秒级多次）但单次停顿很短、晋升量小 —— 典型短命对象，加大收益最高。
- 追问 2：调小的信号？→ YGC 单次耗时长、晋升量稳定、老年代占用上涨快 —— 说明加大新生代只是推迟了晋升，没有减少晋升总量，反而挤死了老年代。
- 追问 3：拿什么数据判断？→ `jstat -gc` 的 S0/S1 使用率与 YGC/YGCT/FGC 增速，加上 GC 日志的 Eden 前后使用量与晋升量。

---

## 7. 大厂真题方向

1. 「你们线上 JVM 参数是什么？为什么这么配？」—— 要点：收集器选型理由 + 堆划分理由 + 一条踩过的坑。
2. 「订单服务 QPS 3000，堆 8G，让你给一套 JVM 参数。」—— 要点：先问停顿要求与对象特征，再给方案，给出验证方式。
3. 「GC 日志里有 `concurrent mode failure`，你怎么排查？」—— 要点：区分 CMF / Promotion Failed，看老年代增长率与 CMS 触发阈值。
4. 「新生代是不是越大越好？」—— 要点：两条代价曲线 + 老年代挤压 + 具体归因。
5. 「G1 为什么不需要设置新生代大小？」—— 要点：停顿预测模型 + 动态 Region 角色。
6. 「`-XX:NewRatio` 和 `-Xmn` 有什么区别？」—— 要点：比例 vs 绝对值，优先级，方向容易答反。
7. 「`-XX:SurvivorRatio=8` 是什么含义？」—— 要点：Eden : 单个 Survivor，实际可用 9/10。
8. 「CMS 的 `MaxTenuringThreshold` 默认多少？为什么？」—— 要点：6，为了减少老年代压力。
9. 「老年代增长太快，你会调什么？」—— 要点：先查泄漏，再谈参数；参数侧看是否晋升过快。
10. 「`-XX:PretenureSizeThreshold` 在 G1 下有效吗？」—— 要点：无效，G1 用 Humongous 机制。
11. 「G1 出现 `to-space exhausted`，怎么处理？」—— 要点：Survivor 不足 / 回收不及预期，调 ReservePercent、IHOP、RegionSize。
12. 「停顿要求 10ms 以内，你会选什么收集器？」—— 要点：G1 达不到，上 ZGC / Shenandoah。
13. 「怎么用数据证明你的调参是有效的？」—— 要点：调参前后 YGC 频率、单次停顿 P99、FGC 次数、吞吐压测对比。

---

## 8. 常见误区

| # | 错误说法 | 正确理解 |
| --- | --- | --- |
| 1 | 新生代越大越好，GC 次数少 | 停顿与老年代压力同步上升，CMS 下过大直接 CMF |
| 2 | `NewRatio=8` 表示新生代占 1/8 | 是「老 : 新 = 8 : 1」，新生代占堆的 1/9 |
| 3 | `SurvivorRatio=8` 就是 Eden:S0:S1 = 8:1:1 的推导 | 定义是 Eden : **单个** Survivor = 8:1，结果比例相同但推导不同；且任一时刻只有一个 Survivor 有数据 |
| 4 | CMS 的 `MaxTenuringThreshold` 默认 15 | CMS 默认 6 |
| 5 | 设了 `CMSInitiatingOccupancyFraction` 就生效 | 必须加 `UseCMSInitiatingOccupancyOnly`，否则被自适应覆盖 |
| 6 | G1 里 `PretenureSizeThreshold` 照样管用 | G1 忽略该参数，用 Humongous Region |
| 7 | G1 设 `-Xmn` 更稳 | 等于放弃停顿目标，G1 退化为固定分代 |
| 8 | `MaxGCPauseMillis` 是硬保证 | 是软目标，极端值会被 G1 主动放弃 |
| 9 | CMF 和 Promotion Failed 是同一回事 | CMF 发生在并发周期进行中，Promotion Failed 发生在晋升那一刻 |
| 10 | 加大新生代能减少晋升总量 | 只是推迟晋升时间；如果对象生命周期本来就长，晋升总量不变，反而更集中 |

---

## 9. 面试收尾句

> ParNew + CMS 的比例是**人工静态划分**：输入是 `-Xmn`，判断依据是「对象能活多久」，老年代空间靠 CMS 触发阈值间接保命；G1 的比例是**目标驱动的动态结果**：输入只有 `MaxGCPauseMillis`，新生代由停顿预测模型在 5% - 60% 的区间里自己算。所以「CMS 调到多少」的答案是一组数字，「G1 调到多少」的答案是一个目标加两条边界 —— 如果有人在 G1 上报 `-Xmn`、`SurvivorRatio`，基本可以判定他没真正理解 G1。
