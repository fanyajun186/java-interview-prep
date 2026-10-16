# HashMap 深度讲义（JDK 8）

> 来源：Java 面试教练 · Java 底层与并发主题 ｜ 成稿时间：2026-10-14 ｜ 适用：12 年经验 Java 工程师 · 中大厂 P6-P7 面试

## 一句话主线

**HashMap 的本质是「用 `hash ^ (h >>> 16)` 做扰动、用 `(n-1) & hash` 做取模、以数组为骨架，冲突时先拉链表、链表过长且表够大才树化，容量永远保持 2 的幂以便用位运算和「高低位拆分」完成 O(1) 均摊的增删查」。**

把这条主线背下来，下面所有细节都是它的展开。

## 目录

1. 底层架构：数组 + 链表 + 红黑树
2. put 完整流程
3. 为什么初始容量必须是 2 的 n 次幂
4. 为什么扩容是 2 倍
5. 纠错：首次容量是 16，64 是树化门槛
6. 为什么用红黑树而不用 AVL
7. 负载因子 0.75 与泊松分布
8. JDK 7 头插死循环 vs JDK 8 尾插修复
9. 其他必考点
10. 追问链自测 L1-L5
11. 误区清单
12. 面试口径快查

## 1. 底层架构：数组 + 链表 + 红黑树

### 1.1 三层结构

| 层级 | 数据结构 | 作用 | 退化/升级条件 |
| --- | --- | --- | --- |
| 骨架 | `Node<K,V>[] table` | O(1) 定位桶 | 长度恒为 2 的幂，初始 16 |
| 冲突解决（轻） | 单链表 | 桶内少量冲突 | 长度 > 8 且 table.length ≥ 64 → 树化 |
| 冲突解决（重） | 红黑树 `TreeNode` | 桶内大量冲突/哈希攻击 | 元素 ≤ 6 → 退化回链表 |

### 1.2 Node 与 TreeNode

```java
// JDK 8 java.util.HashMap.Node
static class Node<K,V> implements Map.Entry<K,V> {
    final int hash;     // 扰动后的 hash，final
    final K key;        // final
    V value;
    Node<K,V> next;     // 链表后继
}

// JDK 8 java.util.HashMap.TreeNode
// 继承链：TreeNode -> LinkedHashMap.Entry -> HashMap.Node
// 所以 TreeNode 依然持有 next（以及 prev），树里同时还藏着一条链表
static final class TreeNode<K,V> extends LinkedHashMap.Entry<K,V> {
    TreeNode<K,V> parent;  // 红黑树父节点
    TreeNode<K,V> left;
    TreeNode<K,V> right;
    TreeNode<K,V> prev;    // 链表前驱（删除时用）
    boolean red;
}
```

**为什么 TreeNode 还要保留 `next` 链表结构？** 三个原因：

1. **退化需要**：`UNTREEIFY_THRESHOLD = 6` 触发退化时，直接按 `next` 顺序把树拆回链表，不需要重新组装顺序。
2. **遍历需要**：`split()` 扩容拆分树时先按 `next` 顺序拆成两条链，再各自决定是否树化/退化。
3. **删除需要**：`prev` 让红黑树删除节点时能在 O(1) 内把它从链表结构上摘掉，避免整树重排。

### 1.3 结构图

```mermaid
flowchart TB
    subgraph TB1["table: Node array, length n = 2^k"]
        B0["bucket 0"]
        B2["bucket 2"]
        Bi["bucket i"]
        Bn["bucket n-1"]
    end
    Bi --> N1["Node hash/key/value/next"]
    N1 --> N2["Node"]
    N2 --> N3["Node"]
    N3 --> N4["Node"]
    B0 --> T1["TreeNode root (red-black tree)"]
    T1 --> T2["left child"]
    T1 --> T3["right child"]
    T2 --> T4["left-left"]
    B2 --> EMPTY["null (empty bucket)"]
    Bn --> LN["single Node"]
    subgraph NOTE["TreeNode keeps next"]
        D1["TreeNode A"] -.->|"next"| D2["TreeNode B"]
        D2 -.->|"next"| D3["TreeNode C"]
        D1 -->|"parent/left/right"| D2
    end
```

> **面试口径**：HashMap 是「数组 + 链表 + 红黑树」，数组负责 O(1) 定位，链表解决轻冲突，红黑树解决重冲突；TreeNode 虽然变成了树，但它仍然继承 Node 的 `next`，所以树里还藏着一条链表，扩容和退化都靠这条链。

## 2. put 完整流程

### 2.1 五步走

1. **算 hash**：`hash(key) = (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16)` —— 高 16 位与低 16 位异或，把高位特征"掺"进低位。
2. **算下标**：`i = (n - 1) & hash`。
3. **空桶**：`tab[i] == null` → 直接 `newNode` 放进去。
4. **非空桶**：
   - 桶头就是目标 key → 记录 `e = p`；
   - 桶头是 `TreeNode` → 走 `putTreeVal` 红黑树插入；
   - 否则遍历链表：找到相同 key 就 `break`（`e` 指向它）；到尾也没找到就**尾插**新节点，插完若 `binCount >= 7`（即链表长度达到 8）调用 `treeifyBin`。
5. **收尾**：`e != null` 说明是覆盖 → 写新值、返回 `oldValue`；否则 `++modCount`，`++size > threshold` 则 `resize()`。

### 2.2 为什么要 `h ^ (h >>> 16)` 扰动

`int` 是 32 位，`(n-1) & hash` 在 n 很小（如 16）时只有低 4 位参与运算，高 28 位完全不起作用。如果 key 的 hashCode 只在高位有差异（很常见，比如 `Integer` 之外的自定义对象、连续的自增 ID），就会大量撞桶。

把高 16 位右移后与低 16 位异或，等价于**把高位的信息折叠进低位**，让低位同时携带高位特征，从而显著降低碰撞概率。这是一个"低成本、高收益"的折中——只多了一次异或和一次移位。

### 2.3 put 流程图

```mermaid
flowchart TD
    S["putVal(hash, key, value)"] --> C1{"table == null<br/>or length == 0 ?"}
    C1 -->|"yes"| R["resize() init table to 16"]
    R --> IDX
    C1 -->|"no"| IDX["i = (n - 1) & hash"]
    IDX --> C2{"tab[i] == null ?"}
    C2 -->|"yes, empty bin"| NEW["tab[i] = newNode(hash, key, value, null)"]
    C2 -->|"no"| C3{"bucket head matches key ?"}
    C3 -->|"yes"| E["e = p (found)"]
    C3 -->|"no"| C4{"p instanceof TreeNode ?"}
    C4 -->|"yes"| TREE["e = putTreeVal(...)"]
    C4 -->|"no"| LOOP["walk linked list"]
    LOOP --> C5{"found same key ?"}
    C5 -->|"yes"| E
    C5 -->|"no, reached tail"| TAIL["tail insert newNode"]
    TAIL --> C6{"binCount >= 7 ?"}
    C6 -->|"yes, len >= 8"| TB["treeifyBin(tab, hash)"]
    C6 -->|"no"| MOD
    TB --> MOD
    TREE --> MOD
    E --> OV["overwrite e.value, return oldValue"]
    NEW --> MOD["++modCount"]
    MOD --> C7{"++size > threshold ?"}
    C7 -->|"yes"| RS["resize() double capacity"]
    C7 -->|"no"| RET["return null"]
    RS --> RET
```

### 2.4 关键源码：putVal

```java
final V putVal(int hash, K key, V value, boolean onlyIfAbsent, boolean evict) {
    Node<K,V>[] tab; Node<K,V> p; int n, i;
    // 1) 懒加载：第一次 put 才初始化 table（默认 16）
    if ((tab = table) == null || (n = tab.length) == 0)
        n = (tab = resize()).length;
    // 2) 空桶：直接放
    if ((p = tab[i = (n - 1) & hash]) == null)
        tab[i] = newNode(hash, key, value, null);
    else {
        Node<K,V> e; K k;
        // 3) 桶头命中
        if (p.hash == hash && ((k = p.key) == key || (key != null && key.equals(k))))
            e = p;
        // 4) 红黑树
        else if (p instanceof TreeNode)
            e = ((TreeNode<K,V>)p).putTreeVal(this, tab, hash, key, value);
        // 5) 链表遍历 + 尾插
        else {
            for (int binCount = 0; ; ++binCount) {
                if ((e = p.next) == null) {
                    p.next = newNode(hash, key, value, null);
                    if (binCount >= TREEIFY_THRESHOLD - 1) // -1 for 1st，即链表长度达到 8
                        treeifyBin(tab, hash);
                    break;
                }
                if (e.hash == hash && ((k = e.key) == key || (key != null && key.equals(k))))
                    break;
                p = e;
            }
        }
        // 6) 覆盖旧值
        if (e != null) {
            V oldValue = e.value;
            if (!onlyIfAbsent || oldValue == null)
                e.value = value;
            afterNodeAccess(e);
            return oldValue;
        }
    }
    ++modCount;
    // 7) JDK 8：先插入，后判断是否扩容
    if (++size > threshold)
        resize();
    afterNodeInsertion(evict);
    return null;
}
```

> **面试口径**：put 的流程是「扰动 hash → `(n-1)&hash` 定位 → 空桶直放 / 桶头命中 / 树插 / 链表尾插 → 命中则覆盖返回旧值，未命中则 modCount++、size++ 后再看是否扩容」。

## 3. 为什么初始容量必须是 2 的 n 次幂

这是 HashMap 最经典的追问点，至少能答出三条理由。

### 理由一：只有 n = 2^k 时 `(n-1) & hash` 才等价于 `hash % n`

- `n = 2^k` 时，`n - 1` 的二进制是**末 k 位全 1**，例如 `16 - 1 = 15 = 0b1111`。
- 一个末 k 位全 1 的数做 `&` 运算，效果就是**掩码（mask）**，恰好保留 hash 的低 k 位，而 `hash % 2^k` 的数学定义也是"取低 k 位"。二者等价。
- 若 `n` 不是 2 的幂，比如 `n = 10`，`n - 1 = 9 = 0b1001`，中间两位是 0，做 `&` 会把这两位**永久抹成 0**，导致下标 2、3、6、7 等永远不可能被选中 —— 桶分布严重不均，甚至有桶永远空着。
- 另外 `&` 是 CPU 单周期指令，`%` 在大多数 CPU 上需要除法指令，慢一个数量级。HashMap 是极致追求性能的容器，必须用位运算。

```text
hash = 0b...1011_0110_1101
n = 16, n - 1 = 0b1111  -> & 结果 = 0b1101 = 13 == hash % 16   ✔ 等价
n = 10, n - 1 = 0b1001  -> & 结果 = 0b1001 = 9  != hash % 10    ✘ 不等价且分布残缺
```

### 理由二：扩容时新下标只可能是「原位」或「原位 + oldCap」，可以 O(1) 拆分

这是 JDK 8 的核心优化（`resize()` 里的高低位拆分）：

- 容量从 `oldCap` 扩到 `2 * oldCap`，参与掩码的位数从 k 位变成 k+1 位，**新增的只有最高那 1 位**。
- 对任意节点，判断 `e.hash & oldCap`：
  - 结果 `== 0` → 新增的那一位是 0 → **新下标 = 原下标 j**；
  - 结果 `!= 0` → 新增的那一位是 1 → **新下标 = j + oldCap**。
- 于是 resize 不需要对每个 key 重新 `hash()` 和重新取模，只需一次 `&` 判断，并且**天然把一个长链表均匀拆成两条短链表**（这正是树化的替代方案之一）。

> 注意 `e.hash & oldCap` 与 `e.hash & (oldCap - 1)` 不同：前者是"新增的那一位"，后者是"原来的 k 位"。

**关键源码：resize() 高低位拆分**

```java
// 遍历旧桶 j 上的链表，拆成 lo / hi 两条链（保持原顺序，尾插法）
Node<K,V> loHead = null, loTail = null;
Node<K,V> hiHead = null, hiTail = null;
Node<K,V> next;
do {
    next = e.next;
    if ((e.hash & oldCap) == 0) {   // 新增参与运算的那一位是 0 -> 原位
        if (loTail == null) loHead = e;
        else                loTail.next = e;
        loTail = e;
    } else {                         // 新增参与运算的那一位是 1 -> 原位 + oldCap
        if (hiTail == null) hiHead = e;
        else                hiTail.next = e;
        hiTail = e;
    }
} while ((e = next) != null);

if (loTail != null) { loTail.next = null; newTab[j] = loHead; }
if (hiTail != null) { hiTail.next = null; newTab[j + oldCap] = hiHead; }
```

### 理由三：保持 2 的幂，扩容后才能继续用同一套位运算

扩容必须保持 `n = 2^k` 这个不变量（invariant），`(n-1) & hash` 才始终成立。如果扩容后幂次性质被破坏，理由一和理由二同时失效，整个实现要被迫退回 `%` 取模 + 全量 rehash，性能大幅退化。

### 理由四（加分项）：构造函数传入非 2 的幂会被自动向上取整

`tableSizeFor(cap)` 用五次 `|=` 无符号右移把最高位之后全部填成 1，再加 1 得到 2 的幂：

```java
static final int tableSizeFor(int cap) {
    int n = cap - 1;
    n |= n >>> 1;  n |= n >>> 2;  n |= n >>> 4;  n |= n >>> 8;  n |= n >>> 16;
    return (n < 0) ? 1 : (n >= MAXIMUM_CAPACITY) ? MAXIMUM_CAPACITY : n + 1;
}
// new HashMap<>(10) -> 16；new HashMap<>(17) -> 32
```

所以 `new HashMap<>(10)` 的真实容量是 **16**，不是 10。这也是面试高频陷阱。

### 扩容高低位拆分示意图

```mermaid
flowchart LR
    subgraph OLD["oldCap = 16, mask = 0b1111"]
        OJ["bucket j = 6"]
        OL["linked list:<br/>A, B, C, D, E"]
        OJ --> OL
    end
    OL --> TEST{"e.hash & oldCap<br/>i.e. & 0b10000"}
    TEST -->|"== 0, new bit is 0"| LO["loHead chain:<br/>A, C, E"]
    TEST -->|"!= 0, new bit is 1"| HI["hiHead chain:<br/>B, D"]
    LO --> N1["newTab[j] = newTab[6]"]
    HI --> N2["newTab[j + oldCap] = newTab[22]"]
    subgraph NEW["newCap = 32, mask = 0b11111"]
        N1
        N2
    end
```

> **面试口径**：容量取 2 的幂有三个好处 —— 一是 `(n-1)&hash` 在 n 为 2 的幂时等价于取模且位运算更快；二是扩容时新位置只可能是原位或原位加 oldCap，靠 `hash & oldCap` 一次判断就能拆分，不用重新 hash；三是保证扩容后这套位运算还能继续用。

## 4. 为什么扩容是 2 倍

### 4.1 核心原因：2 倍才能维持 2^n 不变量
- 假设用 1.5 倍：16 → 24，24 **不是 2 的幂**，`(n-1) & hash` 立即失效（24-1 = 23 = 0b10111，中间有 0 位），必须退回 `%` 取模；同时"新增一位"的前提消失，高低位拆分也无法使用，只能全量 rehash。
- 用 2 倍：16 → 32 → 64 → 128，永远是 2 的幂，所有位运算优化持续有效。
- 2 倍也是空间与冲突率的平衡：太小（1.2 倍）扩容次数多；太大（4 倍）内存浪费严重。

### 4.2 阈值与触发时机
- `threshold = capacity * loadFactor`（默认 `16 * 0.75 = 12`），触发条件是 `++size > threshold`（注意是 `>` 不是 `>=`，默认参数下 size 达到 13 才扩容）。
- **第二条扩容路径**：链表长度达到 8 但 `table.length < 64` 时也触发 `resize()`（见第 5 节）。
- `resize()` 后 `newCap = oldCap << 1`，`newThr = oldThr << 1`（阈值同步翻倍）。

### 4.3 JDK 8 是「先插入后扩容」
- **JDK 7**：`addEntry` 中先判断是否需要 `resize(2 * table.length)`，**扩容后再 `createEntry` 插入**。
- **JDK 8**：先完成插入、`++size`，再判断是否扩容。逻辑更简洁，也避免了"扩容后新桶为空"的无效扩容。

> **面试口径**：扩容必须 2 倍，因为只有乘 2 才能保持 2 的幂，从而继续用 `(n-1)&hash` 和 `hash & oldCap` 高低位拆分；1.5 倍会破坏这个性质，导致必须改用取模和全量 rehash。

## 5. 纠错：首次容量是 16，64 是树化门槛

### ⚠️ 常见误解（必须纠正）

> **错误说法**：「HashMap 第一次扩容长度是 64」。
> **正确事实**：HashMap 的 `table` **首次初始化容量是 16**，即 `DEFAULT_INITIAL_CAPACITY = 1 << 4 = 16`。
> **64 是 `MIN_TREEIFY_CAPACITY`** —— 它是**树化的最小表容量门槛**，跟"第一次扩容"毫无关系。

### 5.1 三个常量必须分清

```java
static final int DEFAULT_INITIAL_CAPACITY = 1 << 4;   // 16  首次/默认表容量
static final int TREEIFY_THRESHOLD       = 8;         // 链表 -> 树的长度阈值
static final int UNTREEIFY_THRESHOLD     = 6;         // 树 -> 链表的退化阈值
static final int MIN_TREEIFY_CAPACITY    = 64;        // 允许树化的最小表容量
```

### 5.2 树化的真实判定逻辑（treeifyBin）

链表长度 ≥ 8 时，**不是立刻树化**，而是先判断表容量：

```java
final void treeifyBin(Node<K,V>[] tab, int hash) {
    int n, index; Node<K,V> e;
    // 关键：表容量 < 64 时，优先 resize 扩容，而不是树化
    if (tab == null || (n = tab.length) < MIN_TREEIFY_CAPACITY)
        resize();
    else if ((e = tab[index = (n - 1) & hash]) != null) {
        TreeNode<K,V> hd = null, tl = null;
        do {
            TreeNode<K,V> p = replacementTreeNode(e, null); // Node -> TreeNode，保留 next
            if (tl == null) hd = p;
            else { p.prev = tl; tl.next = p; }
            tl = p;
        } while ((e = e.next) != null);
        if ((tab[index] = hd) != null)
            hd.treeify(tab);   // 真正建成红黑树
    }
}
```

**为什么小表优先扩容而不是树化？**

1. 表容量小（如 16）却出现长度 8 的链表，往往只是**哈希分布暂时不均**，扩容一倍就能把这条链拆成两条，冲突天然缓解。
2. 扩容的成本（一次 rehash，O(n)）比树化的成本低：树化要构造 TreeNode 对象（内存开销约为 Node 的 2 倍）、还要做红黑树的平衡旋转。
3. 扩容收益更大：扩容降低的是**全局**冲突率；树化只优化**单个桶**。

### 5.3 完整判定链

```mermaid
flowchart TD
    A["链表插入后 binCount >= 7"] --> B{"链表长度 >= TREEIFY_THRESHOLD (8) ?"}
    B -->|"no"| Z["保持链表"]
    B -->|"yes"| C{"table.length >= MIN_TREEIFY_CAPACITY (64) ?"}
    C -->|"no, 表太小"| D["优先 resize() 扩容<br/>把长链拆成两条短链"]
    C -->|"yes"| E["treeifyBin -> treeify()<br/>链表转红黑树"]
    E --> F{"remove 或 resize 后<br/>树元素 <= UNTREEIFY_THRESHOLD (6) ?"}
    F -->|"yes"| G["untreeify -> 退化回链表"]
    F -->|"no"| H["保持红黑树"]
```

> **面试口径（纠错版）**：第一次创建 table 的容量是 16，不是 64。64 是 MIN_TREEIFY_CAPACITY。当链表长度达到 8 时，HashMap 会先看表容量够不够 64，不够就优先扩容 —— 因为小表扩容能更有效缓解冲突，而且代价比树化低。只有表已经 ≥ 64 且链表仍 ≥ 8，才真正树化。6 是退化阈值，留 2 的缓冲是为了避免在 8 附近反复树化/退化。

## 6. 为什么用红黑树而不用 AVL

| 维度 | AVL 树 | 红黑树 |
| --- | --- | --- |
| 平衡标准 | 严格平衡：任意节点左右子树高度差 ≤ 1 | 弱平衡：最长路径 ≤ 2 × 最短路径 |
| 查询 | 略快（树高约 1.44 log₂n） | 略慢（树高约 2 log₂n），仍是 O(log n) |
| 插入 | 最多 O(log n) 次旋转 | **最多 2 次旋转** |
| 删除 | 最多 O(log n) 次旋转 | **最多 3 次旋转** |
| 维护成本 | 高，每次写都要频繁回溯调整 | 低，摊还成本接近常数 |
| 适用场景 | 读远多于写（如数据库索引、字典） | **读写都频繁** |

**JDK 作者的取舍理由：** HashMap 的桶是**写多读也多**的场景，不是静态查找表；AVL 插入/删除的旋转次数是 O(log n) 量级，而红黑树把旋转压到常数级（插入 ≤ 2、删除 ≤ 3），**综合吞吐量优于 AVL**；红黑树树高最多 2 log₂n，查找只差一个很小的常数因子，在桶内元素只有 8 ~ 几十的量级下几乎感知不到；且 TreeNode 保留 `next` 链，扩容拆分与退化都很自然。

> **面试口径**：AVL 严格平衡、查询稍快但插入删除频繁旋转；红黑树弱平衡（最长路径不超过最短路径 2 倍），插入最多 2 次旋转、删除最多 3 次，综合增删查更优。HashMap 桶里读写都频繁，所以选红黑树。

## 7. 负载因子 0.75 与泊松分布

### 7.1 源码注释里的原话

JDK 8 源码在 `TREEIFY_THRESHOLD` 上方有一段注释，大意是：在理想情况下使用随机哈希码，桶中节点频率遵循**泊松分布**，负载因子 0.75 时桶内元素个数与概率为 —— 0: 0.60653066，1: 0.30326533，2: 0.07581633，3: 0.01263606，4: 0.00157952，5: 0.00015795，6: 0.00001316，7: 0.00000094，**8: 0.00000006**。

也就是说，随机 hashCode 下一个桶里有 8 个元素的概率约为 **6 × 10⁻⁸（千万分之六）** —— 几乎不可能。所以链表长度达到 8 通常意味着 hashCode 实现很差或遭遇哈希攻击，此时才需要树化兜底。

### 7.2 0.75 的取值逻辑
- **太小（如 0.5）**：桶很空就扩容，空间利用率低、扩容频繁。
- **太大（如 1.0）**：冲突率显著上升，查找从 O(1) 退化到 O(n)。
- **0.75**：时间成本（冲突/查找）与空间成本（扩容/内存）的经验最优点，且 `16 × 0.75 = 12` 是整数，阈值计算干净。

> **面试口径**：0.75 是时间与空间的折中，源码注释用泊松分布说明：在 0.75 负载因子下，桶内元素达到 8 个的概率只有千万分之六，所以树化是极端兜底，正常情况链表根本长不到 8。

## 8. JDK 7 头插死循环 vs JDK 8 尾插修复

### 8.1 JDK 7 问题成因

- JDK 7 `resize()` 的 `transfer()` 采用**头插法**：新链表的节点顺序与旧链表**完全相反**。
- 多线程并发 `resize()` 时，线程 A 执行到 `e.next = newTable[i]` 被挂起，线程 B 完成迁移，链表已反转；线程 A 恢复后沿着已被修改的 `next` 继续走，形成 `A.next = B` 且 `B.next = A` 的**环形链表**。
- 之后对该桶 `get()` 时会**无限循环**，CPU 100%。

### 8.2 JDK 8 的修复与残留风险
- **改为尾插法**：新链表保持原有相对顺序，不会反转，因此**不会因为顺序反转而产生环**。
- **高低位拆分**：`loHead/loTail` 与 `hiHead/hiTail` 两条链，迁移时保持顺序。
- ⚠️ **但 HashMap 依然不是线程安全的**：并发 put 仍会**丢数据**（两线程同时写同一空桶，后写覆盖先写）、size 计数不准。并发场景请用 `ConcurrentHashMap`。

> **面试口径**：JDK 7 头插法在并发 resize 时会反转链表，两个线程互相改 next 指针形成环，get 时死循环；JDK 8 改成尾插法并用高低位拆分保持顺序，解决了死循环，但 HashMap 仍然不是线程安全的，并发 put 会丢数据，要并发就用 ConcurrentHashMap。

## 9. 其他必考点

### 9.1 key 允许且只允许一个 null

```java
static final int hash(Object key) {
    int h;
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);  // 扰动：高 16 位折叠进低 16 位
}
```

- `null` key 的 hash 固定为 0，永远落在 `table[0]`；第二次 put null 会覆盖，所以**只有一个 null key**。
- 对比：`Hashtable` 与 `ConcurrentHashMap` 都不允许 null（见配套讲义）。

### 9.2 fail-fast 与 modCount
- `modCount` 记录**结构性修改**次数（put、remove、clear、扩容等）。
- 迭代器创建时记录 `expectedModCount = modCount`，`next()` 前检查不一致即抛 `ConcurrentModificationException`。
- 这是**尽力而为（best-effort）**机制，用于尽早暴露 bug，**不能当并发控制手段**。
- 单线程下用 `iterator.remove()` 安全（它会同步 `expectedModCount`）。

### 9.3 常用方法速览

| 方法 | 语义 | 说明 |
| --- | --- | --- |
| `putIfAbsent(k, v)` | key 不存在或值为 null 时才 put | 等价于 `putVal(..., onlyIfAbsent=true)` |
| `computeIfAbsent(k, f)` | 不存在时用函数计算并放入 | 常用于 `Map<K, List<V>>` 分组 |
| `computeIfPresent(k, f)` | 存在时重算，返回 null 则删除 | |
| `compute(k, f)` | 无论是否存在都重算 | |
| `merge(k, v, remap)` | 合并，函数返回 null 则删除 | 计数场景常用 |
| `getOrDefault(k, dv)` | 取不到返回默认值 | 默认值仍会被求值 |

注意：`computeIfAbsent` 对**同一个 bin** 递归修改可能触发 `ConcurrentModificationException`，Lambda 内再次 put 同一个 map 是未定义行为。

### 9.4 覆写 equals 必须覆写 hashCode
- 判定式是 `p.hash == hash && (key == k || key.equals(k))`，hash 不等直接跳过。
- 只覆写 `equals`：逻辑相等的对象 hash 不同 → 落不同桶 → `get` 永远取不到，且能 put 进两个"相等"的 key。
- 只覆写 `hashCode`：hash 相同但 `equals` 为 false → 同桶链表里放两个逻辑重复的 key。

## 10. 追问链 · 参考答案

| 层级 | 问题 | 参考答案要点 |
| --- | --- | --- |
| L1 | 说说 HashMap 的底层数据结构，以及 put 一个元素的完整流程。 | 结构是数组 + 链表 + 红黑树。put 五步：① `hash = h ^ (h>>>16)` 扰动；② `i = (n-1) & hash` 定位；③ 空桶直接放；④ 非空桶则先判桶头命中、是 `TreeNode` 走 `putTreeVal`，否则遍历链表**尾插**，长度达 8 调 `treeifyBin`；⑤ 命中则覆盖返回旧值，否则 `++modCount`、`++size > threshold` 时 `resize()`。 |
| L1 | `HashMap` 默认初始容量、默认负载因子、默认扩容阈值分别是多少？ | 初始容量 16（`DEFAULT_INITIAL_CAPACITY = 1 << 4`），负载因子 0.75，扩容阈值 16 × 0.75 = 12。注意 64 是 `MIN_TREEIFY_CAPACITY`（树化的最小表容量门槛），与首次扩容无关；且 table 懒加载，第一次 put 才创建。 |
| L2 | 为什么 HashMap 的容量必须是 2 的 n 次幂？至少说出两条理由。 | 两条：① `n = 2^k` 时 `n-1` 低 k 位全 1，`(n-1)&hash` 等价于 `hash % n`，且 `&` 是单周期指令，比 `%` 快一个数量级；② 扩容时新下标只有"原位"和"原位 + oldCap"两种，靠 `e.hash & oldCap` 一次判断即可拆分，无需重新 hash。 |
| L2 | `(n - 1) & hash` 为什么能代替 `hash % n`？如果 n 不是 2 的幂会怎样？ | 因为 `hash % 2^k` 的数学定义就是取低 k 位，而 `n-1` 末 k 位全 1 的 `&` 恰好是保留低 k 位的掩码，二者等价。n 不是 2 的幂时（如 n=10，n-1=0b1001）中间 0 位被永久抹掉，下标 2、3、6、7 恒空、分布残缺，且必须退回 `%` 取模。 |
| L3 | `resize()` 里 `e.hash & oldCap` 判断的是什么？为什么新下标只有"原位"和"原位 + oldCap"两种可能？ | 判断的是容量翻倍后**新参与掩码的那一位**（注意不是 `hash & (oldCap-1)`）。因为 oldCap 到 2×oldCap 只多出 1 位，该位为 0 则新下标 = 原下标 j，为 1 则 = j + oldCap，所以一次 `&` 就能把链表拆成 lo/hi 两条，无需 rehash。 |
| L3 | `treeifyBin` 里为什么先判断 `tab.length < MIN_TREEIFY_CAPACITY` 就 `resize()` 而不是直接树化？ | 小表出现长链往往只是 hash 分布暂时不均，扩容一倍就能把链拆成两条，收益是**全局**的；而树化只优化单个桶，还要构造 TreeNode（内存约为 Node 的 2 倍）并做红黑树平衡旋转，成本更高。所以表 < 64 时优先 `resize()`。 |
| L3 | `putVal` 中 `binCount >= TREEIFY_THRESHOLD - 1` 为什么要减 1？ | `binCount` 从 0 起算，循环里先取 `p.next` 再自增，遍历结束时它比链表已有节点数少 1。要让"加上新插入节点后长度达到 8"才树化，判定式就必须是 `binCount >= TREEIFY_THRESHOLD - 1`，即 `>= 7`。 |
| L4 | JDK 7 的 HashMap 在并发 resize 时为什么会死循环？JDK 8 怎么修的？修完之后 HashMap 线程安全了吗？ | JDK 7 `transfer()` 用**头插法**，新链表顺序与旧链表完全相反，并发 resize 时两线程互相改 `next` 形成环形链表，`get` 时无限循环、CPU 100%。JDK 8 改**尾插法**并用 lo/hi 高低位拆分保持顺序。修完仍不安全：并发 put 会丢数据、size 不准，并发场景请用 ConcurrentHashMap。 |
| L4 | 为什么用红黑树不用 AVL 树？`UNTREEIFY_THRESHOLD` 是 6 而不是 8，这 2 的差值有什么用？ | AVL 严格平衡（左右高度差 ≤ 1）查询略快，但插入删除旋转是 O(log n) 量级；红黑树弱平衡（最长路径 ≤ 2 × 最短），插入最多 2 次旋转、删除最多 3 次，读写都频繁时综合更优。6 与 8 差 2 是留缓冲，防止元素在阈值附近反复树化/退化造成震荡。 |
| L4 | JDK 7 与 JDK 8 在"扩容与插入的先后顺序"上有什么区别？ | JDK 7 在 `addEntry` 里先判断是否 `resize(2*table.length)`，**扩容后再 `createEntry` 插入**；JDK 8 则是先完成插入、`++size`，再判断是否 `resize()`，即**先插入后扩容**，逻辑更简洁，也避免了"扩容后新桶仍为空"的无效扩容。 |
| L5 | 已知要存 100 万条数据，你会怎么构造 HashMap？为什么？（考察 `initialCapacity = expectedSize / 0.75 + 1`，避免多次 resize） | 按 `initialCapacity = 1000000 / 0.75 + 1 ≈ 1333334` 构造，`tableSizeFor` 会向上取整到 2097152（2^21）。这样全程只建一次 table、零 resize，避免多次 rehash 与数组拷贝；若后续还会增长可在此基础上再放大一档。 |
| L5 | 如果某个 key 对象的 `hashCode()` 实现很差（大量返回同一个值），HashMap 会退化成什么？红黑树能救吗？上限是多少？ | 所有 key 落同一个桶，先退化成 O(n) 的长链表；表 ≥ 64 且链长 ≥ 8 后树化成红黑树，查找降到 O(log n)。但树化只能兜底救不了本：TreeNode 内存约为 Node 的 2 倍且要反复旋转，吞吐仍远低于正常分布，桶内还会无限增长。根治办法是修 `hashCode()` 或换更好的散列。 |
| L5 | 线上出现 HashMap 相关 CPU 飙高，你会从哪几个方向排查？（死循环 / 哈希攻击 / 大对象 rehash / 并发写覆盖） | 四条线索：① JDK 7 并发 resize 的环形链表，`jstack` 看线程卡在 `HashMap.get`；② 哈希攻击导致长链/退化成树，`jmap` + histo 看桶分布；③ 大表 rehash 与 Promotion 带来的 GC 压力，看 GC 日志；④ 并发写覆盖导致 size 不准。定位后换 ConcurrentHashMap、预设容量、修 `hashCode()`。 |

## 11. 误区 · 正解

| ❌ 误区 | ✅ 正解 |
| --- | --- |
| 「HashMap 第一次扩容后长度是 64」 | 首次初始化容量是 **16**（`DEFAULT_INITIAL_CAPACITY = 1 << 4`）。64 是 `MIN_TREEIFY_CAPACITY`，即允许树化的最小表容量门槛，与"第一次扩容"毫无关系。16 装到 13 个元素时扩容到 32，再下一次才到 64。 |
| 「链表长度超过 8 就立刻转成红黑树」 | 链长 ≥ 8 只是必要条件，还须 `table.length >= 64`。小表时 `treeifyBin` 优先 `resize()`：扩容能把长链拆成两条、降低**全局**冲突率，且比构造 TreeNode（内存约为 Node 的 2 倍）加红黑树旋转更便宜；只有表已 ≥ 64 才真正 `treeify()`。 |
| 「扩容是 size >= threshold 时触发」 | 源码是 `++size > threshold`，注意是 `>` 而非 `>=`。默认容量 16、负载因子 0.75 时 threshold = 12，但 size 要达到 **13** 才触发 `resize()` 扩到 32。另有第二条路径：链长达到 8 而表 < 64 时也走 `resize()`。 |
| 「`new HashMap<>(10)` 的容量是 10」 | 构造时经 `tableSizeFor(10)` 向上取整为 **16**（传 17 得到 32）。该函数用五次 `|=` 无符号右移把最高位之后全部填 1 再加 1，保证容量恒为 2 的幂 —— 这正是 `(n-1)&hash` 成立的前提。 |
| 「JDK 8 改成尾插法之后 HashMap 就线程安全了」 | 尾插法只消除了并发 resize 的环形链表死循环。HashMap 仍然不是线程安全的：两线程同时写同一空桶会丢数据、`++size` 非原子导致计数不准、并发 put 还可能读到不一致状态。并发场景请用 `ConcurrentHashMap`。 |
| 「HashMap 不允许 null key」 | HashMap **允许且只允许一个** null key：`hash(null)` 固定返回 0，永远落在 `table[0]`，第二次 put null 会覆盖。不允许 null 的是 `Hashtable` 与 `ConcurrentHashMap`（并发下 get 返回 null 的二义性无法消除）。 |
| 「负载因子越小越好」 | 太小（如 0.5）桶还很空就扩容，空间利用率低、扩容与 rehash 频繁；太大（如 1.0）冲突率显著上升、查找退化到 O(n)。0.75 是时间与空间的经验最优点，且 `16 × 0.75 = 12` 是整数，阈值计算干净。 |
| 「红黑树一定比 AVL 快」 | 不准确。红黑树树高约 2log₂n，查询比 AVL（约 1.44log₂n）**略慢**；它赢在插入最多 2 次旋转、删除最多 3 次，综合增删查更优，适合读写都频繁的桶。若场景是纯静态查询，AVL 反而更快。 |
| 「TreeNode 变成树之后链表结构就没了」 | 链表还在。`TreeNode extends LinkedHashMap.Entry extends HashMap.Node`，`next`/`prev` 依然存在且不可少：退化时按 `next` 顺序拆回链表，`split()` 扩容时先拆成 lo/hi 两条链，删除时靠 `prev` 在 O(1) 内从链上摘除。 |

## 12. 面试口径快查
| 问题 | 一句话口径 |
| --- | --- |
| 定位下标 | `(n - 1) & hash`，n 为 2 的幂时等价于取模且更快 |
| 容量 2 的幂 | ① 掩码等价取模 ② 扩容可高低位拆分 ③ 保持位运算不变量 |
| 扩容 2 倍 | 只有 ×2 才能维持 2^n，1.5 倍会破坏所有位运算优化 |
| 树化条件 | 链表 ≥ 8 **且** table ≥ 64；否则优先 resize；退化阈值 6 |
| 红黑树 vs AVL | 弱平衡，插入 ≤ 2 旋转、删除 ≤ 3 旋转，综合性能更优 |
| 0.75 | 泊松分布下桶内 8 个元素概率千万分之六，时空折中 |
| JDK 7 vs 8 | 头插死循环 → 尾插 + 高低位拆分；先扩容后插入 → 先插入后扩容 |
