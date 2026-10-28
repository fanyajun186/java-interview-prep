> 2026-10-20 成稿，Java 底层与并发主题
> 素材来自一段关于「key 弱引用 / value 强引用」的对话。核对后修正 3 处说法，补齐 Hash 冲突、扩容、线程池传递、ScopedValue 四块空缺。
> 版本前提：JDK 8 到 25，`ThreadLocalMap` 的结构自 JDK 8 未变；JDK 25 起 `ScopedValue` 转正（JEP 506），作为并存的新选择。

# ThreadLocal：引用链、ThreadLocalMap 与泄漏的真实因果

## 一句话主线

ThreadLocal 把「每个线程一份的值」挂在线程自己的 `ThreadLocalMap` 上，**key 弱引用**是为了让 ThreadLocal 对象本身不被线程拖住，**value 强引用**是为了让 set 进去的数据在语义有效期内稳定可读；这套设计只解决了 key 的回收，没解决 value 的回收，所以**线程池里漏的永远是 value**，唯一的正解是 `finally` 里 `remove()`。

## 一、是什么

### 1.1 四条引用链

```java
// Thread
ThreadLocal.ThreadLocalMap threadLocals;              // 普通 ThreadLocal 用这个
ThreadLocal.ThreadLocalMap inheritableThreadLocals;   // InheritableThreadLocal 用这个
```

```java
// ThreadLocalMap.Entry
static class Entry extends WeakReference<ThreadLocal<?>> {
    Object value;
    Entry(ThreadLocal<?> k, Object v) {
        super(k);    // k 进入 WeakReference 的 referent 字段，是弱引用
        value = v;   // 普通字段，强引用
    }
}
```

完整链条：

```
Thread（GC Root，活着的线程）
  │  强引用
  ▼
ThreadLocalMap
  │  强引用
  ▼
Entry[] table
  │  强引用
  ▼
Entry ──┬── referent（弱）──▶ ThreadLocal 对象
        └── value（强）────▶ 业务对象
```

读这张图只要记住一句：**弱引用断的是 Entry 到 ThreadLocal 对象这条边**，不是 table 到 Entry 这条边。

### 1.2 Entry 到底「弱」在哪

`Entry extends WeakReference<ThreadLocal<?>>`，所以 **Entry 实例本身就是一个 WeakReference 对象**，它携带的 referent 指向 key。

但「Entry 是弱引用类型」不等于「Entry 会被当成弱引用来回收」：`table[i]` 对 Entry 是**强引用**，Entry 不会因为弱引用语义消失。真正弱的只有 referent 那一条边。

所以描述要分清三个对象：

| 对象 | 谁引用它 | 引用强度 | 什么时候没了 |
| --- | --- | --- | --- |
| ThreadLocal 对象（key） | Entry 的 referent | 弱 | 业务侧没有强引用后，下一次 GC |
| Entry 对象 | `table[i]` | 强 | 被 `expungeStaleEntry` 清掉，或线程结束 |
| value 对象 | `Entry.value` | 强 | Entry 被清掉，或显式 remove |

## 二、为什么 key 弱、value 强

### 2.1 key 若是强引用会怎样

```
Thread → ThreadLocalMap → table → Entry → ThreadLocal 对象
```

这条链全强。线程池里线程活十年，你用过的每一个 ThreadLocal 对象就被钉十年，即使业务早已把它置 null。**key 用弱引用，本质是把 ThreadLocal 对象的生命周期交还给业务代码**：业务还强引用着它，它就在；业务不要了，GC 随时能收。

### 2.2 value 若是弱引用会怎样

```java
ThreadLocal<byte[]> tl = new ThreadLocal<>();
tl.set(new byte[100 << 20]);   // 这个数组没有别的强引用
```

如果 value 是弱引用，`new byte[100MB]` 除了 Entry 的弱引用之外没人持有，下一次 GC 就被清掉，`tl.get()` 返回 null。**set 进去的数据会莫名其妙消失，语义直接崩了。**

ThreadLocal 的语义承诺是：只要这个 ThreadLocal 还有效、当前线程 set 过，get 就应该拿到。这条承诺要求 value 被**稳定持有**，所以只能强引用。

### 2.3 两个反证，比正面论证更有说服力

**反证一**：把 value 也改弱，ThreadLocal 就退化成「随时可能丢数据的 Map」。 没人会用一个不保证读到的缓存，这是设计上不可接受的。

**反证二**：如果弱引用真是为了「防泄漏」，那 `static final` 场景应该安全。 但事实上：

```java
static final ThreadLocal<User> TL = new ThreadLocal<>();
// 线程池任务里 TL.set(user) 之后不 remove
```

key 永远强可达，永远不变 null，value 照样被 Entry 强引用着死不掉。<span style="color:red">弱引用不是防泄漏的手段，只是让 key 可回收的兜底</span>。

## 三、ThreadLocalMap 的实现

### 3.1 结构与初始参数

| 项 | 值 | 说明 |
| --- | --- | --- |
| 底层结构 | `Entry[] table` | 数组，不是链表 + 红黑树 |
| 初始容量 | 16 | 懒创建，第一次 set 才建 map |
| 扩容阈值 | `len * 2 / 3` | 16 时是 10 |
| 装载因子 | 0.667 | 比 HashMap 的 0.75 低，因为开放地址法怕拥挤 |
| `size` | 实际条目数 | **包含 key 已为 null 的 stale entry** |

它**不实现 `Map` 接口**，也不是 HashMap 的简化版，是独立实现。原因有三条：每个线程一份，必须足够轻；key 需要弱引用语义，HashMap 做不到；不暴露 `Map` 接口可以避免被当成通用容器误用。

### 3.2 hash 与冲突：为什么是开放地址法

```java
private static final int HASH_INCREMENT = 0x61c88647;
private final int threadLocalHashCode = nextHashCode();

int i = key.threadLocalHashCode & (table.length - 1);
```

`0x61c88647` 是黄金分割数乘 2 的 32 次方，让连续新建的 ThreadLocal 的 hash 均匀散开，减少扎堆。

冲突处理是**开放地址法 + 线性探测**，不是链表：

```java
private static int nextIndex(int i, int len) {
    return ((i + 1 < len) ? i + 1 : 0);
}
```

为什么不学 HashMap 挂链表：

1. **表太小**。一个线程通常只有几个到几十个 ThreadLocal，链表带来的 Node 对象和指针跳转是纯开销。
2. **缓存局部性**。数组顺序探测对 CPU 缓存友好，这对「每次 get 都要走一遍」的高频路径很重要。
3. **删除有更便宜的办法**。链表删除要维护前后指针，开放地址法只需要把槽置空再 rehash 回填，`expungeStaleEntry` 一次扫描就做完了。

代价是「聚集」：连续占用的槽变长会让探测变慢。所以阈值压到 2/3，并且靠 `cleanSomeSlots` 持续清理。

### 3.3 set / get / remove 的路径

**get**：`getEntry` 先算下标，命中且 key 相等就返回；不等则 `getEntryAfterMiss` 向后探测，途中遇到 key 为 null 的槽就调 `expungeStaleEntry` 顺手清理；map 还没建时走 `setInitialValue()`，它调 `initialValue()` 并建表。

**set**：探测过程中若命中同 key 就替换 value；遇到 stale 槽用 `replaceStaleEntry` 占位（保证 key 落在它 hash 对应的位置，否则后续 get 会找不到）；插到空槽后调 `cleanSomeSlots(i, size)` 做机会性清理。

**remove**：算出下标向后探测，找到同 key 的 Entry 后 `e.clear()`（把 referent 置 null）再 `expungeStaleEntry(i)`，此时 value 和槽一起被清空。

### 3.4 清理机制：四个入口，全是机会性的

| 入口 | 触发时机 | 做了什么 |
| --- | --- | --- |
| `expungeStaleEntry(i)` | get / set / remove 途中 | 清 value、置空槽，并把**后面整段探测链重新 hash 回填**，返回下一个空槽下标 |
| `cleanSomeSlots(i, n)` | set 插入后、replaceStaleEntry 收尾 | 连续走 `log₂(n)` 步抽样；命中后预算重置为整表 |
| `replaceStaleEntry` | set 探测先撞到 stale 槽 | 向前找更早的脏 Entry、向后找同 key，命中则交换位置，最后统一清理 |
| `resize` 前的 `rehash` | 扩容判断时 | 先 `expungeStaleEntries()` 全表清一遍，再判断要不要翻倍 |

关键点：**没有后台线程，没有定时任务**。清理完全搭在业务线程对这张 map 的访问上，而且 `cleanSomeSlots` 是**采样**，不是全扫。所以「stale entry 会被自动回收」只是一句理想化的话。

三个方法的分工，看源码最清楚。

#### `expungeStaleEntry(int staleSlot)`：唯一真正干清理的地方

```java
private int expungeStaleEntry(int staleSlot) {
    Entry[] tab = table;
    int len = tab.length;

    tab[staleSlot].value = null;   // 先断 Entry 到业务对象的强引用
    tab[staleSlot] = null;         // 再断 table 到 Entry 的引用
    size--;

    Entry e; int i;
    for (i = nextIndex(staleSlot, len); (e = tab[i]) != null; i = nextIndex(i, len)) {
        ThreadLocal<?> k = e.get();
        if (k == null) {                       // 半路又遇到脏 Entry，一起清
            e.value = null; tab[i] = null; size--;
        } else {
            int h = k.threadLocalHashCode & (len - 1);
            if (h != i) {                      // 不在理想槽，才需要搬
                tab[i] = null;
                while (tab[h] != null) h = nextIndex(h, len);  // 从理想槽往后找空位
                tab[h] = e;
            }
        }
    }
    return i;                                  // 停在第一个空槽，交还调用方
}
```

三个细节值得单独记：

1. **先置 value、再置槽**。两步都是为了尽快让对象不可达，顺序本身不影响正确性，但先断 value 那条强引用语义更清楚。
2. **只有 `h != i` 才搬**。已经坐在理想槽上的 Entry 不做无谓搬动。
3. **找空位要一直往后扫，不能只看理想位置**。源码注释专门解释了这一点：不能用 Knuth 6.4 的算法 R（只看理想槽是否为空），因为这一段 run 里可能已经积累了好几个 stale 槽。

「回填」常被忽略的地方在于：它不是只把当前槽置空，而是**继续向后遍历整段 run**，把每个非空 Entry 按 `threadLocalHashCode` 重新算下标、搬到正确位置，直到遇到第一个空槽。没有这一步，探测链中间出现空洞后，后面的 Entry 就再也找不到了。

它的返回值是「停下时那个空槽的下标」，调用方拿它接着清理，三个方法才能串成一条链。

#### `cleanSomeSlots(int i, int n)`：不是跳着扫，是只走 log₂(n) 步

```java
private boolean cleanSomeSlots(int i, int n) {
    boolean removed = false;
    Entry[] tab = table;
    int len = tab.length;
    do {
        i = nextIndex(i, len);            // 一步一步走，没有跨步
        Entry e = tab[i];
        if (e != null && e.get() == null) {
            n = len;                      // 命中就地把预算加满
            removed = true;
            i = expungeStaleEntry(i);     // 交给真干活的，并跳到它停下的位置
        }
    } while ((n >>>= 1) != 0);
    return removed;
}
```

两个常见误读：

- <span style="color:red">它不是跳着扫，而是连续走下一个槽</span>，只是总步数被 `n >>>= 1` 限制在 log₂(n) 步。「采样」说的是覆盖范围（不保证扫全表），不是步长。
- <span style="color:red">**一旦命中脏 Entry，`n` 会被重置回 `len`**</span>，等于「发现这段有货，就把预算加满接着清」。所以一次调用的实际清理量可能远超 log₂(n)，只是探测次数仍受控。

还有一个容易漏的点：**它的返回值被 `set` 用来决定要不要扩容**。

```java
tab[i] = new Entry(key, value);
int sz = ++size;
if (!cleanSomeSlots(i, sz) && sz >= threshold)
    rehash();
```

`set` 插入后先顺手清一次，**清到了就暂不扩容**，只有「什么都没清到，且 size 到了阈值」才走 `rehash`。这条短路让不少本该扩容的场景被一次清理消化掉了。

调用点有两个，不止 `set`：`set` 插入成功后一次，`replaceStaleEntry` 收尾时一次。

#### `replaceStaleEntry(key, value, staleSlot)`：先找、再交换、最后指挥清理

它只在一种情况下被调用：`set` 探测途中**先撞到 stale 槽，且还没找到同 key**。

```java
private void replaceStaleEntry(ThreadLocal<?> key, Object value, int staleSlot) {
    Entry[] tab = table; int len = tab.length; Entry e;
    int slotToExpunge = staleSlot;

    // ① 向前回溯：找这一段 run 里更早的脏 Entry
    for (int i = prevIndex(staleSlot, len); (e = tab[i]) != null; i = prevIndex(i, len))
        if (e.get() == null) slotToExpunge = i;

    // ② 向后找：要设的 key 是不是已经被冲突挤到了后面
    for (int i = nextIndex(staleSlot, len); (e = tab[i]) != null; i = nextIndex(i, len)) {
        ThreadLocal<?> k = e.get();
        if (k == key) {
            e.value = value;
            tab[i] = tab[staleSlot];   // 交换：stale 槽的内容挪到 i
            tab[staleSlot] = e;        // 目标 Entry 回到 staleSlot
            if (slotToExpunge == staleSlot) slotToExpunge = i;  // 脏数据已经跑到 i 了
            cleanSomeSlots(expungeStaleEntry(slotToExpunge), len);
            return;
        }
        if (k == null && slotToExpunge == staleSlot) slotToExpunge = i;
    }

    // ③ 没找到：按新增处理
    tab[staleSlot].value = null;
    tab[staleSlot] = new Entry(key, value);

    if (slotToExpunge != staleSlot)
        cleanSomeSlots(expungeStaleEntry(slotToExpunge), len);
}
```

三个非直觉的地方：

- **为什么要向前回溯**：源码注释给的理由是「一次清掉整段连续 run，避免 GC 批量回收 key 之后反复触发增量 rehash」。GC 是成批干的，脏 Entry 往往成片出现，只清当前一个会让同一段 run 被反复走很多遍。
- **找到 key 时是「交换」而不是「搬移」**：`tab[i] = tab[staleSlot]; tab[staleSlot] = e;` 把目标 Entry 放回它该在的位置，同时把 stale 槽原来的内容挤到 `i`。位置一变，脏数据就从 `staleSlot` 跑到了 `i`，所以紧跟着必须 `if (slotToExpunge == staleSlot) slotToExpunge = i;`，否则会从一块已经干净的地方开始清。
- **收尾永远是同一个组合调用**，不是二选一：`cleanSomeSlots(expungeStaleEntry(slotToExpunge), len)`。前者负责清那一段 run，后者负责从清理后的位置继续抽样。唯一的门槛是 `slotToExpunge != staleSlot`，即确实还有别的脏 Entry 才动手。

把三者串起来，就是 `set` 的完整分支：

```
set 探测
 ├─ 命中同 key      → 只更新 value，返回
 ├─ 撞到 stale 槽   → replaceStaleEntry
 │    ├─ 后面找到 key → 交换位置 + expungeStaleEntry + cleanSomeSlots
 │    └─ 没找到      → 占位 + 可能 expungeStaleEntry + cleanSomeSlots
 └─ 走到空槽        → 插入 + cleanSomeSlots（没清到且超阈值才 rehash）
```

### 3.5 扩容

```java
private void rehash() {
    expungeStaleEntries();                 // 先把全表 stale 清掉
    if (size >= threshold - threshold / 4) // 清理后仍然超过 3/4 阈值
        resize();                          // 容量翻倍
}
```

注意「**先清后扩**」：很多看起来要扩容的场景，清完 stale 之后其实不用扩。这也是 ThreadLocalMap 比 HashMap 更「能扛」的原因之一。

## 四、内存泄漏的真实因果

### 4.1 漏的是 value，不是 key

```java
ThreadLocal<byte[]> tl = new ThreadLocal<>();
tl.set(new byte[100 << 20]);
tl = null;          // 业务侧强引用消失
```

之后的状态：

```
Thread → ThreadLocalMap → table[i] → Entry（还在）
Entry.referent = null      （key 被 GC 清了，Entry 变 stale）
Entry.value = 100MB 数组    （仍然强可达）
```

<span style="color:red">线程活着，这 100MB 就一直活着</span>。 线程池 8 个核心线程各命中一次，就是 800MB 挂在老年代上，Full GC 也收不掉，因为它在 GC Root 的强引用链上。

### 4.2 为什么弱引用不等于自动清理

这里有一个容易被忽略的逻辑缺口：<span style="color:red">`tl = null` 之后，你已经没有办法调用 `tl.remove()` 了</span>。所以那句常见的「等 ThreadLocalMap 后续操作触发清理，或者你显式 remove」在这个场景里后半句不成立。

剩下真正能清掉它的只有两条路：

1. 后续用**同一张 map**（同一个线程）的**其他** ThreadLocal 做 get / set，`expungeStaleEntry` 顺路扫到它；
2. 线程结束，整个 ThreadLocalMap 跟着被回收。

线程池两条都指望不上：任务结束后线程不会结束，而其他任务未必会访问到那个槽位。

### 4.3 一个根因，两种表象

根因不是弱引用，也不是 ThreadLocal 本身，而是**线程的生命周期远长于业务数据的生命周期**，而 value 被绑在了线程的 map 上。换句话说，ThreadLocal 把「请求级状态」塞进了「进程级容器」。

两种表象：

| 场景 | key 会不会变 null | value 怎么漏 |
| --- | --- | --- |
| `static final ThreadLocal` | 不会 | 线程复用 + 忘了 remove，每个线程各留一份 |
| 方法内 `new ThreadLocal` | 会，Entry 变 stale | stale entry 的 value 没人清，直到被别人顺路扫到 |

第一种更常见也更隐蔽，因为「key 还在」会让人误以为没有泄漏。

## 五、跨线程传递

### 5.1 InheritableThreadLocal 为什么在线程池里失效

```java
// Thread 构造方法里
if (parent.inheritableThreadLocals != null)
    this.inheritableThreadLocals =
        ThreadLocal.createInheritedMap(parent.inheritableThreadLocals);
```

<span style="color:red">拷贝发生在线程创建的那一刻，只有一次</span>。线程池的线程是复用的，任务第二次提交时不会重新继承，于是：

- 子线程拿到的是「创建这个池化线程的那个线程」当时的快照，通常是 null 或者上一个任务留下的脏值；
- 父子之间此后**双向不互通**，子线程改值不影响父线程。

所以「线程池 + InheritableThreadLocal」基本等于随机值。

### 5.2 TTL 怎么修

`TransmittableThreadLocal`（阿里 TTL）把语义从「创建时拷贝」换成「**提交时捕获、执行时回放**」：

1. 提交任务时，`TtlRunnable` 捕获提交线程当前的 TTL 快照；
2. 工作线程执行前，把快照 replay 进自己的 map；
3. 执行结束后 restore 回原状，避免污染下一个任务。

两种接入方式：手动包 `TtlRunnable.get(task)` / `TtlCallable.get(task)`，或者挂 `-javaagent` 自动增强 `ExecutorService`。前者明确但容易漏，后者覆盖全但有字节码增强的运维成本。

### 5.3 ScopedValue：JDK 25 的新选择

JDK 25 起 `ScopedValue` 转正（JEP 506，此前在 JDK 20 到 24 预览了五轮）。它不是「更好的 ThreadLocal」，而是把场景收窄到「**只读上下文向下传递**」：

```java
static final ScopedValue<RequestContext> CTX = ScopedValue.newInstance();

ScopedValue.where(CTX, ctx).run(() -> {
    handle();          // 作用域内任何位置都能 CTX.get()
});                    // 出了 run 自动解绑，没有 remove 要写
```

三个差异点：**不可变**（作用域内谁都不能改，只能读）、**结构化继承**（`StructuredTaskScope.fork()` 出的子任务自动可见，不用拷贝）、**自动解绑**（作用域结束即失效，不存在泄漏）。

限制也很明确：必须在绑定作用域内读，没有 `set`，因此不适合「同一个 ThreadLocal 在不同方法里各写各的」那种用法；存量框架要改造成本不低。所以现阶段的主流答案仍是 ThreadLocal + `finally remove()`，新项目在新代码上可以考虑 ScopedValue。

## 六、生产问题与排查

| 现象 | 可能原因 | 排查动作 |
| --- | --- | --- |
| 老年代缓慢上涨，Full GC 后不回落 | 池化线程的 map 里挂着 stale entry 的 value | `jcmd <pid> GC.class_histogram` 看 `ThreadLocal$ThreadLocalMap$Entry` 数量；dump 后用 MAT 看 value 的 retained size |
| 堆 dump 里同一个业务对象被大量 Entry 持有 | 每个任务都 `new ThreadLocal` 且不 remove | 搜 `ThreadLocalMap$Entry`，按 value 类型聚合 |
| 换了线程池、并发一上来就 OOM | 单条 value 很大（缓存、byte[]、大集合） | 先看 value 类型，再看线程数 × 单条大小 |
| 异步分支拿到的上下文是 null 或上一个请求的 | InheritableThreadLocal 在池里失效 | 确认是否用了 `InheritableThreadLocal`；改用 TTL 或显式传参 |

规范化做法（比调 JVM 参数有效得多）：

1. **`try { set } finally { remove }`**，不要只在正常路径 remove。
2. **统一入口清理**：在 Filter / Interceptor 里记录本次请求 set 过的 key，出口统一 remove，避免每个业务方法自己写。
3. **不要在线程池任务里 `new ThreadLocal`**，key 一多必然堆 stale entry；用 `static final` 常量 key。
4. **大对象不要进 ThreadLocal**，尤其是缓存和 byte[]。

顺带一个对照：Netty 的 `FastThreadLocal` 放弃了 hash 探测，改用「每个线程一个数组 + 全局自增下标」实现 O(1) 读写，代价是必须在线程销毁时 `removeAll()`，且只对 Netty 自己的 `FastThreadLocalThread` 生效。

## 七、可跑实验

**实验一：stale entry 泄漏**

```java
ExecutorService pool = Executors.newFixedThreadPool(4);
for (int i = 0; i < 2000; i++) {
    pool.execute(() -> {
        ThreadLocal<byte[]> tl = new ThreadLocal<>();  // 每次新 key
        tl.set(new byte[4 << 20]);                     // 4MB
        // 不 remove，tl 出栈后 key 变弱可达
    });
}
```

跑完 `jcmd <pid> GC.class_histogram | grep ThreadLocalMap`，能看到 Entry 数量随任务数增长；`-Xmx256m` 下通常几百个任务就 OOM。

**实验二：加 remove 的对照**

同一段代码在 `finally` 里加 `tl.remove()`，Entry 数量稳定在个位数，老年代不涨。

**实验三：InheritableThreadLocal 在池里失效**

```java
InheritableThreadLocal<String> itl = new InheritableThreadLocal<>();
ExecutorService pool = Executors.newFixedThreadPool(1);
itl.set("main-1");
pool.execute(() -> System.out.println("first=" + itl.get()));   // main-1（池线程此时才创建）
itl.set("main-2");
pool.execute(() -> System.out.println("second=" + itl.get()));  // 仍是 main-1
```

第二次输出不是 `main-2`，就是「创建时拷贝」的直接证据。

## 八、面试问法

**Q1：ThreadLocal 的原理是什么？**
- 60 秒版本：每个 Thread 内部有一个 `ThreadLocalMap`，key 是 ThreadLocal 对象、value 是业务值。ThreadLocal 本身不存数据，只是提供存取入口，所以「线程隔离」是靠「每个线程一张表」实现的，不是靠加锁。
- 补充点：`Thread` 里有两个字段，`threadLocals` 和 `inheritableThreadLocals`，后者专供 InheritableThreadLocal。

**Q2：为什么 key 用弱引用、value 用强引用？**
- 60 秒版本：key 弱引用是为了让 ThreadLocal 对象在业务不再引用它时能被回收，不被长命线程拖住；value 强引用是为了让 set 进去的数据在语义有效期内稳定读到，否则下一次 GC 就可能变 null。
- 补充点：弱引用只解决 key 的回收，不解决 value 的回收，所以泄漏的永远是 value。

**Q3：Entry 是弱引用，那 Entry 会被回收吗？**
- 60 秒版本：不会。Entry 是 `WeakReference` 的子类实例，但它被 `table[i]` 强引用，弱的是它内部指向 key 的那条 referent 边。
- 补充点：所以三个对象要分开说，key 会被回收，Entry 和 value 都还在，Entry 变成 stale entry。

**Q4：ThreadLocal 为什么会内存泄漏？**
- 60 秒版本：线程池的线程长期存活，map 和 table 就长期存活；key 被回收后 Entry 仍被 table 强引用，value 又被 Entry 强引用，于是 value 一直挂在 GC Root 链上。
- 补充点：根因是「线程生命周期远长于业务数据」，表现为「请求级状态存进了进程级容器」。

**Q5：既然有弱引用，为什么还会泄漏？**
- 60 秒版本：弱引用只让 key 可回收，value 仍是强引用；而清理 stale entry 是机会性的，只在 get/set/remove/扩容时发生，`cleanSomeSlots` 还只是 `log2(n)` 采样。
- 补充点：`tl = null` 之后根本没法再调用 `tl.remove()`，所以「显式 remove」这个兜底在 key 已经失效的场景里是做不到的。

**Q6：ThreadLocalMap 用什么解决 Hash 冲突？为什么不用链表？**
- 60 秒版本：开放地址法加线性探测，`nextIndex` 就是下标加一取模。因为每个线程的表很小，链表带来的 Node 开销和指针跳转不划算，数组顺序探测对缓存更友好。
- 补充点：`HASH_INCREMENT = 0x61c88647` 是黄金分割数，让连续分配的 hash 均匀散开；删除靠 `expungeStaleEntry` 置空加 rehash 回填，不需要维护指针。

**Q7：ThreadLocalMap 什么时候扩容，扩到多大？**
- 60 秒版本：容量翻倍，阈值是 `len * 2 / 3`；但 `rehash()` 会先 `expungeStaleEntries()` 全表清一遍，清完如果 `size` 仍超过阈值的 3/4 才真正 `resize()`。
- 补充点：初始容量 16，装载因子 0.667，比 HashMap 低，因为开放地址法拥挤后探测代价上升很快。

**Q8：InheritableThreadLocal 有什么问题？**
- 60 秒版本：拷贝发生在线程创建时，只拷一次；线程池的线程是复用的，后续任务不会重新继承，于是拿到的是创建时的旧快照，通常是 null 或脏值。
- 补充点：父子之间此后不互通，子线程改值不影响父线程；要跨池传递得用 TTL 或 ScopedValue。

**Q9：TTL 是怎么做到的？**
- 60 秒版本：把「创建时拷贝」换成「提交时捕获、执行时回放」，`TtlRunnable` 在 submit 时抓快照，工作线程执行前 replay、执行后 restore。
- 补充点：可以用包装类手动接入，也可以用 `-javaagent` 自动增强线程池；后者覆盖全但有字节码增强的运维成本。

**Q10：ScopedValue 会取代 ThreadLocal 吗？**
- 60 秒版本：不会全取代。ScopedValue 针对「只读上下文向下传递」，不可变、结构化继承、作用域结束自动解绑，天然没有泄漏；但它在作用域内不能 set，替代不了「同一 key 在不同方法里各写各的」这类用法。
- 补充点：JDK 25 转正（JEP 506，此前五轮预览），和虚拟线程、结构化并发是一套设计；存量框架改造代价不小，短期内 ThreadLocal 仍是主流。

**Q11：三个清理方法各管什么？**
- 60 秒版本：只有 `expungeStaleEntry` 真正干活，它清一个槽并把后面整段探测链回填；`cleanSomeSlots` 是抽样调度器，连续走 `log₂(n)` 步去找脏 Entry，找到就交给 `expungeStaleEntry`，并把预算重置回整表长度；`replaceStaleEntry` 处理「set 先撞到 stale 槽」这种特殊情况，先向前找更早的脏 Entry、再向后找同 key，命中就交换位置，最后统一交给前两者清理。
- 补充点：`cleanSomeSlots` 的返回值被 `set` 用来短路扩容，清到了就暂时不扩容；`replaceStaleEntry` 不是「用新值覆盖 stale 槽」这么简单，向前回溯是因为 GC 回收 key 是成批的，只清一个会让同一段 run 被反复遍历。

## 九、误区 · 正解

| 误区 | 正解 |
| --- | --- |
| Entry 是弱引用对象，所以 Entry 会被回收 | Entry 是 `WeakReference` 子类，但被 `table[i]` 强引用；弱的是 referent 那条边 |
| key 用弱引用是为了防止内存泄漏 | 是为了让 ThreadLocal 对象本身能被回收；value 的泄漏它管不了，`static final` 场景就是反例 |
| 弱引用一回收，Entry 就自动从表里消失 | Entry 仍在 table 里，只是 referent 变 null，成为 stale entry，等清理入口扫到 |
| ThreadLocalMap 继承 HashMap，或者用链表解决冲突 | 独立实现，不实现 `Map` 接口；开放地址法加线性探测 |
| 只要 set 过，线程结束前一定能 get 到 | 只有 key 还在、且没被 `remove` 时才成立；key 失效后 Entry 是 stale，get 会走回退逻辑 |
| InheritableThreadLocal 能把值传给线程池里的线程 | 只在 Thread 构造时拷贝一次，池化线程复用后不会重新继承 |
| ThreadLocal 一定会泄漏 | 只有「长命线程 + 未 remove + value 较大」才显著泄漏；线程随用随销毁时影响很小 |
| `cleanSomeSlots` 是「跳着扫」若干槽 | 是连续走下一个槽，只是总步数被 `n >>>= 1` 限制在 `log2(n)`；命中后 `n` 重置为 `len` |
| `replaceStaleEntry` 找到同 key 就把它搬过来 | 是交换：stale 槽内容挪到后面，目标 Entry 回到 stale 槽，脏数据位置也随之变 |
| JDK 25 之后 ThreadLocal 被废弃了 | 没有废弃。ScopedValue 是并存的新 API，面向只读上下文传递场景 |

## 十、速查卡

- 结构：`Thread.threadLocals` → `ThreadLocalMap` → `Entry[] table`（初始 16，阈值 2/3）
- Entry：`extends WeakReference<ThreadLocal<?>>`，referent 弱、`value` 强
- 冲突：开放地址法加线性探测，`i = threadLocalHashCode & (len - 1)`，`HASH_INCREMENT = 0x61c88647`
- 清理：`expungeStaleEntry`（置空加回填，唯一真干活）、`cleanSomeSlots`（连续走 `log2(n)` 步，命中后预算重置为整表）、`replaceStaleEntry`（向前找脏、向后找 key、命中则交换）、`rehash` 前全清
- 扩容：`rehash` 先清 stale，超阈值 3/4 才翻倍
- 泄漏：漏 value 不漏 key；`tl = null` 后无法再 remove，只能等其他访问顺路清或线程结束
- 传递：InheritableThreadLocal 创建时拷贝一次 → 池内失效；TTL 提交时捕获、执行时回放；ScopedValue 结构性继承且自动解绑
- 规范：`try { set } finally { remove }`，key 用 `static final`，大对象不进 ThreadLocal
