# 算法 · 数据结构手写题

> 一句话定位：手写数据结构考的是「现场把设计意图翻译成指针操作」的能力——面试官盯着的是你的边界处理，而不是算法本身。
> 版本前提：JDK 17

## 1. 题目清单

| 编号 | 题目 | 对应 LC 题号 | 难度 | 考察点 | 面试频率 |
| --- | --- | --- | --- | --- | --- |
| 1 | LRU 缓存 | LC 146 | 中等 | HashMap+双向链表、LinkedHashMap 回调、并发方案 | 极高 |
| 2 | LFU 缓存 | LC 460 | 困难 | 频次分层 + 同频次 LRU、O(1) 淘汰 | 高 |
| 3 | 栈与队列互转 | 155/232/225/622 | 简单~中等 | 辅助栈、双栈摊还、循环数组 | 极高 |
| 4 | 手写阻塞队列 | — | 中等 | wait/notifyAll、Condition 精准唤醒 | 高 |
| 5 | 链表反转系列 | 206/24/25 | 中等 | 迭代/递归、组内翻转 | 极高 |
| 6 | 快慢指针系列 | 141/142/160/21 | 简单~中等 | 环判定与入口、交点、归并 | 极高 |
| 7 | 二叉树遍历与判定 | 144/94/145/102/236 | 中等 | 递归/迭代、BST 上下界、LCA | 极高 |

> LC 146（LRU）是本节综合题：LinkedHashMap 版是"及格线"，手写版才是区分度所在。

## 2. 数据结构手写总表（先看这个）

| 题 | 核心结构 | 关键不变量 | 目标复杂度 | 白板最易错 |
| --- | --- | --- | --- | --- |
| LRU | HashMap + 双向链表（哨兵） | head 侧最新、tail 侧最旧 | get/put O(1) | 淘汰时用 `node.key` 删 map，不是 value |
| LFU | key→freq + freq→LinkedHashSet | minFreq 指向最小频次桶 | get/put O(1) | minFreq 只在最小桶空了才自增 |
| 最小栈 | 数据栈 + 最小值栈 | min 栈顶始终是当前最小值 | 全部 O(1) | 判等用 `<=`，重复最小值要入栈 |
| 栈实现队列 | 输入栈 + 输出栈 | 输出栈空才倒腾 | 摊还 O(1) | 只在 `out` 空时搬迁 |
| 循环队列 | 定长数组 + head/tail/size | `size` 区分空与满 | 全部 O(1) | 满/空判定必须看 size |
| 阻塞队列 | 数组 + 锁/Condition | put 满则等、take 空则等 | O(1) 均摊 | 等待必须用 `while` 而非 `if` |
| 链表反转 | 三指针 prev/cur/next | 反转段与未反转段的连接 | O(n)/O(1) | 先存 `next` 再改 `cur.next` |

## 3. 逐题详解

### 3.1 LRU 缓存

- **考察点**：O(1) 的 get/put 如何同时做到「查找 + 维护访问顺序」；LinkedHashMap 的 `accessOrder` 与三个回调；并发场景怎么改造。
- **思路**：① **面试官为什么问这个**：LRU 是「两个数据结构组合才能达标」的经典——单用链表查找 O(n)，单用 HashMap 无法维护顺序，必须 `HashMap + 双向链表`。② **LinkedHashMap 版**：构造时传 `accessOrder = true`，它内部就是「数组 + 双向链表」，被访问的节点自动移到链表尾；再覆写 `removeEldestEntry` 返回 `size() > capacity` 即可自动淘汰。③ **手写版**：用**双向链表 + 两个哨兵**（head、tail）消除所有 null 判断；`map` 存 key→Node，链表维护顺序。④ 淘汰时**必须用 `node.key` 去删 map**——这是白板第一高频错。
- **Java 代码**：

```java
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

public class LRUCache {
    // 方案一：LinkedHashMap(accessOrder=true) + 覆写 removeEldestEntry
    static class ByLinkedHashMap<K, V> extends LinkedHashMap<K, V> {
        private final int capacity;
        ByLinkedHashMap(int capacity) { super(capacity, 0.75f, true); this.capacity = capacity; }
        @Override
        protected boolean removeEldestEntry(Map.Entry<K, V> eldest) { return size() > capacity; }
    }
    // 方案二：HashMap + 哨兵双向链表
    static class ByHand {
        static final class Node { int key, value; Node prev, next; Node(int k, int v) { key = k; value = v; } }
        private final int capacity;
        private final Map<Integer, Node> map = new HashMap<>();
        private final Node head = new Node(0, 0), tail = new Node(0, 0);   // head.next 最新，tail.prev 最旧
        ByHand(int capacity) { this.capacity = capacity; head.next = tail; tail.prev = head; }
        public int get(int key) {
            Node n = map.get(key);
            if (n == null) return -1;
            moveToHead(n);
            return n.value;
        }
        public void put(int key, int value) {
            Node n = map.get(key);
            if (n != null) { n.value = value; moveToHead(n); return; }
            Node fresh = new Node(key, value);
            map.put(key, fresh); addFirst(fresh);
            if (map.size() > capacity) map.remove(removeLast().key);       // 关键：用 key 删 map
        }
        private void addFirst(Node n) { n.prev = head; n.next = head.next; head.next.prev = n; head.next = n; }
        private void removeNode(Node n) { n.prev.next = n.next; n.next.prev = n.prev; }
        private void moveToHead(Node n) { removeNode(n); addFirst(n); }
        private Node removeLast() { Node e = tail.prev; removeNode(e); return e; }
    }
    public static void main(String[] args) { ByLinkedHashMap<Integer, Integer> a = new ByLinkedHashMap<>(2); a.put(1, 1); a.put(2, 2); System.out.print(a.get(1) + " "); a.put(3, 3); System.out.println(a.get(2)); ByHand b = new ByHand(2); b.put(1, 1); b.put(2, 2); b.get(1); b.put(3, 3); System.out.println(b.get(1) + " " + b.get(2)); } // 1 null | 1 -1（LinkedHashMap 版 miss 返回 null，手写版返回 -1）
}
```

- **复杂度**：get/put 均 O(1)（HashMap 查找 O(1) + 链表增删 O(1)）；空间 O(capacity)。
- **LinkedHashMap 三个回调**：`afterNodeAccess(Node e)`（命中时把 e 移到尾，仅 `accessOrder=true` 时动）、`afterNodeInsertion(boolean evict)`（插入后调 `removeEldestEntry` 决定是否淘汰头节点）、`afterNodeRemoval(Node e)`（删除时同步摘链）。这三点是把 LinkedHashMap 讲透的标志。
- **白板最容易写错哪一行**：`map.remove(removeLast().key)` —— 淘汰必须用被删节点的 **key** 去 map 里删，写成 value 会删错键。
- **追问链**：
  - L1 概念：LRU 为什么必须 HashMap + 双向链表？→ HashMap 提供 O(1) 定位，双向链表提供 O(1) 移动/删除并维护顺序；单链表删尾 O(n)。
  - L2 机制：为什么加两个哨兵？→ 消除头尾的 null 判断，`removeNode`/`addFirst` 对所有节点统一，白板少一半 if。
  - L3 源码/参数：`accessOrder` 默认值？→ false（插入顺序）；传 true 才是访问顺序，构造签名 `LinkedHashMap(int, float, boolean)`。
  - L4 场景取舍：并发下直接加 `synchronized` 行吗？→ 能用但锁粒度大、吞吐差；生产用 **Caffeine**：分段锁 + W-TinyLFU 淘汰，读写 O(1) 且命中率更高（Guava Cache 已停更）。
  - L5 反例边界：用 `getOrDefault` 从 LinkedHashMap 取值会怎样？→ 陷阱：`HashMap.getOrDefault` 内部走 `getNode` 而不走 `get`，**不触发 `afterNodeAccess`**，访问顺序不更新，LRU 语义被破坏。要用 `super.get`。
- **常见错误 / 面试陷阱**：
  - 「LinkedHashMap 默认就是 LRU」→ 只有 `accessOrder=true` 且覆写 `removeEldestEntry` 才是。
  - 「淘汰时删 map 用 value」→ 必须用 key；key 与 value 可能不同，用 value 是错的。
  - 「单链表也能做 LRU」→ 移尾/删尾会 O(n)，必须双向 + 哨兵。
- **变体**：LC 460 LFU；带 TTL 的 LRU（惰性删除）；Caffeine 的 Window TinyLFU。

### 3.2 LFU 缓存

- **考察点**：频次分层 + 同频次 LRU 的双层结构；为什么 O(1) 淘汰需要维护 minFreq；为什么生产少用。
- **思路**：① **面试官为什么问这个**：LFU 是「多一层维度」的题——LRU 只按时间淘汰，LFU 要按频次优先淘汰，两个维度就得两层结构。② **双层结构**：`key→value`、`key→freq`、`freq→LinkedHashSet<key>`（同频次内按插入顺序，等价 LRU）。③ **淘汰**：找到 `minFreq` 桶，取其最早插入的 key（`LinkedHashSet` 的第一个）。④ **为什么 O(1)**：频次是整数，用 map 索引桶；`minFreq` 随时维护，不用扫描。⑤ **为什么比 LRU 复杂**：要在 `get`/`put` 时同步更新三张表和一个 minFreq，任何一处不更新就出 bug。
- **Java 代码**：

```java
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;

public class LFUCache {
    private final int capacity;
    private int minFreq;                                                    // 当前最小频次
    private final Map<Integer, Integer> val = new HashMap<>();
    private final Map<Integer, Integer> freq = new HashMap<>();
    private final Map<Integer, LinkedHashSet<Integer>> buckets = new HashMap<>();  // 频次 → 同频次 LRU
    public LFUCache(int capacity) { this.capacity = capacity; }
    public int get(int key) {
        Integer v = val.get(key);
        if (v == null) return -1;
        increase(key);                                                      // 访问即提频
        return v;
    }
    public void put(int key, int value) {
        if (capacity == 0) return;
        if (val.containsKey(key)) { val.put(key, value); increase(key); return; }
        if (val.size() >= capacity) evict();                                // 满了先淘汰
        val.put(key, value); freq.put(key, 1);
        buckets.computeIfAbsent(1, k -> new LinkedHashSet<>()).add(key);
        minFreq = 1;
    }
    private void increase(int key) {
        int f = freq.get(key);
        freq.put(key, f + 1);
        LinkedHashSet<Integer> set = buckets.get(f);
        set.remove(key);
        if (set.isEmpty()) { buckets.remove(f); if (minFreq == f) minFreq = f + 1; }  // 最小桶空了才升
        buckets.computeIfAbsent(f + 1, k -> new LinkedHashSet<>()).add(key);
    }
    private void evict() {
        LinkedHashSet<Integer> set = buckets.get(minFreq);
        Integer victim = set.iterator().next();                             // 同频次最早插入
        set.remove(victim);
        if (set.isEmpty()) buckets.remove(minFreq);
        val.remove(victim); freq.remove(victim);
    }
    public static void main(String[] args) { LFUCache c = new LFUCache(2); c.put(1, 1); c.put(2, 2); c.get(1); c.put(3, 3); System.out.println(c.get(2) + " " + c.get(3)); c.put(4, 4); System.out.println(c.get(1)); } // -1 3 | -1
}
```

- **复杂度**：get/put 均 O(1)；空间 O(capacity)。
- **白板最容易写错哪一行**：`if (minFreq == f) minFreq = f + 1;` —— minFreq 只在**被清空的桶就是最小桶**时才升，无条件自增是错的（其他低频桶可能还在）。
- **追问链**：
  - L1 概念：LFU 淘汰谁？→ 频次最低的；频次相同淘汰最久未使用的（LRU 兜底）。
  - L2 机制：为什么用 `LinkedHashSet` 存同频次的 key？→ 它既去重又保持插入顺序，`iterator().next()` 即最久未用，O(1)。
  - L3 源码/参数：`minFreq` 会跳变吗？→ 只会 +1 或重置为 1（新元素），不会直接跳到很大值，这是它能 O(1) 维护的原因。
  - L4 场景取舍：为什么生产少用 LFU？→ ① 内存开销大（三张表 + 每元素频次）；② **缓存污染**：老热点频次太高，新热点进不来；③ 并发成本高。生产多用 Caffeine 的 **W-TinyLFU**（频次用 Count-Min Sketch 近似，加窗口抗污染）。
  - L5 反例边界：capacity=0 时 `put` 会怎样？→ 必须直接 return，否则 `evict` 面对空 buckets 会 NPE。
- **常见错误 / 面试陷阱**：
  - 「LFU 就是给每个元素记频次」→ 不够，还要在同频次内做 LRU，否则无法确定淘汰哪个。
  - 「minFreq 每次都 +1」→ 错，只有最小桶清空才能升。
  - 「LFU 比 LRU 好」→ 不一定；LFU 有缓存污染问题，命中率不一定更高。
- **变体**：LC 146 LRU；带衰减的 LFU（TinyLFU 用频次估算 + 定期衰减）；2Q、ARC 等等价淘汰策略。

### 3.3 栈与队列互转

- **考察点**：最小栈的辅助栈、双栈队列的摊还 O(1)、循环队列的空满判定。
- **思路**：① **最小栈（LC 155）**：数据栈 + 最小值栈，`push` 时若 `v <= min.peek()` 也压入最小栈（`<=` 处理重复最小值），`pop` 时若栈顶等于最小值栈顶则一起弹。② **栈实现队列（LC 232）**：输入栈 `in` 收新元素，输出栈 `out` 出队；**只在 `out` 空时**把 `in` 全部倒入 `out`。每个元素最多被倒一次，所以 `pop`/`peek` 是**摊还 O(1)**。③ **队列实现栈（LC 225）**：单队列，`push` 后把前面的元素依次转到队尾，队头恒为栈顶。④ **循环队列（LC 622）**：定长数组 + `head/tail/size`，用 `size` 区分空/满（避免 `head==tail` 的歧义）。
- **Java 代码**：

```java
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedList;
import java.util.Queue;

public class StackQueue {
    static class MinStack {                                              // LC 155
        private final Deque<Integer> data = new ArrayDeque<>(), min = new ArrayDeque<>();
        public void push(int v) { data.push(v); if (min.isEmpty() || v <= min.peek()) min.push(v); }
        public void pop() { if (data.pop().equals(min.peek())) min.pop(); }
        public int top() { return data.peek(); }
        public int getMin() { return min.peek(); }
    }
    static class MyQueue {                                               // LC 232：双栈，摊还 O(1)
        private final Deque<Integer> in = new ArrayDeque<>(), out = new ArrayDeque<>();
        public void push(int x) { in.push(x); }
        public int pop() { move(); return out.pop(); }
        public int peek() { move(); return out.peek(); }
        public boolean empty() { return in.isEmpty() && out.isEmpty(); }
        private void move() { if (out.isEmpty()) while (!in.isEmpty()) out.push(in.pop()); }
    }
    static class MyStack {                                               // LC 225：单队列
        private final Queue<Integer> q = new LinkedList<>();
        public void push(int x) { q.offer(x); for (int i = q.size() - 1; i > 0; i--) q.offer(q.poll()); }
        public int pop() { return q.poll(); }
        public int top() { return q.peek(); }
        public boolean empty() { return q.isEmpty(); }
    }
    static class MyCircularQueue {                                       // LC 622
        private final int[] data;
        private int head, tail, size;
        public MyCircularQueue(int k) { data = new int[k]; }
        public boolean enQueue(int v) {
            if (size == data.length) return false;
            data[tail] = v; tail = (tail + 1) % data.length; size++;
            return true;
        }
        public boolean deQueue() {
            if (size == 0) return false;
            head = (head + 1) % data.length; size--;
            return true;
        }
        public int Front() { return size == 0 ? -1 : data[head]; }
        public int Rear() { return size == 0 ? -1 : data[(tail - 1 + data.length) % data.length]; }
        public boolean isEmpty() { return size == 0; }
        public boolean isFull() { return size == data.length; }
    }
    public static void main(String[] args) { MinStack m = new MinStack(); m.push(-2); m.push(0); m.push(-3); MyQueue q = new MyQueue(); q.push(1); q.push(2); MyCircularQueue c = new MyCircularQueue(2); c.enQueue(1); c.enQueue(2); c.enQueue(3); System.out.println(m.getMin() + " " + q.pop() + " " + c.Rear() + " " + c.isFull()); } // -3 1 2 true
}
```

- **复杂度**：最小栈各操作 O(1)；双栈队列 `pop` 摊还 O(1)（总搬迁次数 ≤ 元素总数）；循环队列各操作 O(1)；空间 O(n)。
- **白板最容易写错哪一行**：`if (out.isEmpty())` —— 双栈队列**只能在 `out` 为空时**才倒腾；不判空就倒会把顺序搞乱、也破坏摊还复杂度。
- **追问链**：
  - L1 概念：双栈队列为什么是摊还 O(1) 而非最坏 O(1)？→ 单次 `pop` 可能触发 O(n) 搬迁，但每个元素一生只被搬一次，均摊下来 O(1)。
  - L2 机制：最小栈为什么要 `<=` 而不是 `<`？→ 重复最小值时，若用 `<` 则第二个相同最小值不入栈，弹出一个后 `getMin` 会错。
  - L3 源码/参数：`ArrayDeque` 能存 null 吗？→ **不能**，`ArrayDeque` 禁止 null（`push(null)` 抛 NPE）；`LinkedList` 允许 null。常见事实性考点。
  - L4 场景取舍：循环队列为什么不直接用 `LinkedList`？→ 数组循环队列内存连续、无节点开销、cache 友好、无 GC 压力；`ArrayBlockingQueue` 内部就是环形数组。
  - L5 反例边界：循环队列 `head==tail` 能判满吗？→ 不能，空和满都会 `head==tail`；必须额外用 `size` 或「牺牲一个空格」来区分。
- **常见错误 / 面试陷阱**：
  - 「最小栈用单个变量存最小值」→ 弹出最小值后无法恢复次小值，必须用栈。
  - 「用队列实现栈时两个队列来回倒」→ 单队列插入时旋转即可，两个队列也行但更绕。
  - 「JDK 的 `Stack` 类可用」→ `Stack` 继承 `Vector`，方法带 `synchronized`、性能差，已不推荐；用 `ArrayDeque`。
- **变体**：LC 716（最大栈）；LC 239（滑动窗口最大值，单调队列）；LC 622/641（循环双端队列）。

### 3.4 手写阻塞队列

- **考察点**：生产者-消费者、`wait/notifyAll` 与 `Condition` 的差异、与 `ArrayBlockingQueue` 的字段对照。
- **思路**：① **面试官为什么问这个**：考并发基础——等待唤醒、虚假唤醒、锁与条件的对应关系，以及「能不能照着 JDK 源码写」。② **版本一（synchronized + wait/notifyAll）**：单一对象锁，`put` 满则 `wait`、`take` 空则 `wait`，做完 `notifyAll`。缺点：两类等待者共用一个等待集，唤醒是「广撒网」。③ **版本二（ReentrantLock + 两个 Condition）**：`notFull`、`notEmpty` 两个条件队列，`put` 后只 `notEmpty.signal()`（精准唤醒消费者），`take` 后只 `notFull.signal()`——这正是 `ArrayBlockingQueue` 的做法。④ **关键**：等待必须用 `while` 而非 `if`（防虚假唤醒与被抢）。
- **Java 代码**：

```java
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

public class BlockingQueues {
    static class SyncQueue<T> {                                          // 版本一：synchronized + wait/notifyAll
        private final Object[] items;
        private int head, tail, count;
        public SyncQueue(int cap) { items = new Object[cap]; }
        public synchronized void put(T x) throws InterruptedException {
            while (count == items.length) wait();                        // while 防虚假唤醒
            items[tail] = x; tail = (tail + 1) % items.length; count++;
            notifyAll();                                                 // 唤醒两类等待者
        }
        @SuppressWarnings("unchecked")
        public synchronized T take() throws InterruptedException {
            while (count == 0) wait();
            T x = (T) items[head]; items[head] = null;                   // 置 null 帮助 GC
            head = (head + 1) % items.length; count--;
            notifyAll();
            return x;
        }
    }
    static class LockQueue<T> {                                          // 版本二：Lock + 两个 Condition
        private final Object[] items;
        private int head, tail, count;
        private final ReentrantLock lock = new ReentrantLock();
        private final Condition notEmpty = lock.newCondition(), notFull = lock.newCondition();
        public LockQueue(int cap) { items = new Object[cap]; }
        public void put(T x) throws InterruptedException {
            lock.lock();
            try {
                while (count == items.length) notFull.await();
                items[tail] = x; if (++tail == items.length) tail = 0; count++;
                notEmpty.signal();                                       // 只唤醒消费者
            } finally { lock.unlock(); }
        }
        @SuppressWarnings("unchecked")
        public T take() throws InterruptedException {
            lock.lock();
            try {
                while (count == 0) notEmpty.await();
                T x = (T) items[head]; items[head] = null;
                if (++head == items.length) head = 0; count--;
                notFull.signal();                                        // 只唤醒生产者
                return x;
            } finally { lock.unlock(); }
        }
    }
    public static void main(String[] args) throws InterruptedException { LockQueue<Integer> q = new LockQueue<>(2); q.put(1); q.put(2); System.out.println(q.take() + " " + q.take()); } // 1 2
}
```

- **复杂度**：put/take 均摊 O(1)；空间 O(capacity)。
- **与 ArrayBlockingQueue 字段对照**：JDK 用 `final Object[] items`、`int takeIndex/putIndex/count`、`final ReentrantLock lock`、`Condition notEmpty/notFull`——和上面 `LockQueue` 几乎一一对应。看清这一点，白板就等于默写源码。
- **白板最容易写错哪一行**：`while (count == 0) notEmpty.await();` —— 写成 `if` 是并发经典 bug；被唤醒后条件可能已不成立（虚假唤醒/被别的线程抢走），必须重新判断。
- **追问链**：
  - L1 概念：为什么用 `while` 不用 `if`？→ 防虚假唤醒，以及被唤醒后到重新拿锁期间条件可能又变了。
  - L2 机制：`signal` 和 `signalAll` 区别？→ `signal` 唤醒一个等待者（精准、开销小），`signalAll` 唤醒全部；两个 Condition 分开时用 `signal` 即可，单锁一条件时只能用 `notifyAll`（否则可能唤醒错的一方导致死等）。
  - L3 源码/参数：`ArrayBlockingQueue` 默认公平吗？→ 默认非公平（`fair=false`），构造可传 `true` 使用公平锁。
  - L4 场景取舍：有界还是无界？→ 生产必须**有界**，无界（如 `LinkedBlockingQueue` 默认容量 `Integer.MAX_VALUE`）在消费慢时会 OOM。
  - L5 反例边界：忘记 `finally { lock.unlock(); }` 会怎样？→ 抛异常后锁不释放，其他线程永久阻塞——必须 try/finally。
- **常见错误 / 面试陷阱**：
  - 「`wait` 要写在 `synchronized` 外」→ 错，`wait/notify` 必须在持有该对象监视器时调用，否则 `IllegalMonitorStateException`。
  - 「`LinkedBlockingQueue` 是用一把锁」→ 错，它用 `putLock`/`takeLock` 两把锁；`ArrayBlockingQueue` 才是一把。高频对比点。
  - 「`put` 和 `add`/`offer` 一样」→ 不同：`add` 满时抛异常、`offer` 满时返回 false、`put` 满时阻塞。
- **变体**：`ArrayBlockingQueue` / `LinkedBlockingQueue` / `SynchronousQueue` / `DelayQueue`；`Disruptor` 无锁环形队列。

### 3.5 链表反转系列

- **考察点**：迭代三指针、递归的返回值与断链、组内翻转的边界。
- **思路**：① **迭代（LC 206）**：`prev/cur` 两指针，循环里先存 `next`，再让 `cur.next = prev`，然后整体后移。② **递归**：先递归到底拿到新头，再让 `head.next.next = head`、`head.next = null`。③ **两两交换（LC 24）**：加 dummy，`prev` 指向每组前驱，交换 first/second 后 `prev` 前移。④ **K 个一组（LC 25）**：先用 dummy，每组先探够 k 个（不足则不翻转），再组内翻转并接到 `groupNext`。
- **Java 代码**：

```java
public class LinkedListReverse {
    static class ListNode {
        int val; ListNode next;
        ListNode(int v) { val = v; }
        ListNode(int v, ListNode n) { val = v; next = n; }
    }
    static ListNode reverseIter(ListNode head) {                 // LC 206 迭代
        ListNode prev = null, cur = head;
        while (cur != null) {
            ListNode next = cur.next;                            // 先存 next
            cur.next = prev; prev = cur; cur = next;             // 再改指针
        }
        return prev;
    }
    static ListNode reverseRecur(ListNode head) {                // LC 206 递归
        if (head == null || head.next == null) return head;
        ListNode newHead = reverseRecur(head.next);
        head.next.next = head; head.next = null;                 // 断尾防环
        return newHead;
    }
    static ListNode swapPairs(ListNode head) {                   // LC 24
        ListNode dummy = new ListNode(0, head), prev = dummy;
        while (prev.next != null && prev.next.next != null) {
            ListNode first = prev.next, second = first.next;
            first.next = second.next; second.next = first; prev.next = second;
            prev = first;
        }
        return dummy.next;
    }
    static ListNode reverseKGroup(ListNode head, int k) {        // LC 25
        ListNode dummy = new ListNode(0, head), groupPrev = dummy;
        while (true) {
            ListNode kth = groupPrev;
            for (int i = 0; i < k; i++) { kth = kth.next; if (kth == null) return dummy.next; }
            ListNode groupNext = kth.next, prev = groupNext, cur = groupPrev.next;
            while (cur != groupNext) {                            // 组内翻转，尾部接 groupNext
                ListNode next = cur.next; cur.next = prev; prev = cur; cur = next;
            }
            ListNode newGroupPrev = groupPrev.next;               // 翻转后变成本组尾
            groupPrev.next = kth; groupPrev = newGroupPrev;
        }
    }
    static ListNode build(int... vs) { ListNode d = new ListNode(0), c = d; for (int v : vs) c = c.next = new ListNode(v); return d.next; }
    static String show(ListNode h) { StringBuilder sb = new StringBuilder(); for (ListNode p = h; p != null; p = p.next) sb.append(p.val).append(p.next != null ? "->" : ""); return sb.toString(); }
    public static void main(String[] a) { System.out.println(show(reverseIter(build(1, 2, 3, 4, 5))) + " | " + show(swapPairs(build(1, 2, 3, 4))) + " | " + show(reverseKGroup(build(1, 2, 3, 4, 5), 2))); } // 5->4->3->2->1 | 2->1->4->3 | 2->1->4->3->5
}
```

- **复杂度**：全部 O(n) 时间；迭代 O(1) 空间，递归 O(n) 栈空间。
- **白板最容易写错哪一行**：迭代里的 `ListNode next = cur.next;` —— 一定要在改 `cur.next` **之前**保存后继，写反了链会断、后半段丢失。
- **追问链**：
  - L1 概念：递归反转的空间复杂度？→ O(n) 递归栈；要 O(1) 就用迭代。
  - L2 机制：K 个一组为什么要先「探够 k 个」？→ 不足 k 个的尾巴保持原序，必须先确认本组有 k 个再翻转。
  - L3 源码/参数：dummy 节点的作用？→ 统一「可能有头变更」的操作，返回 `dummy.next`，避免对头节点写特判分支。
  - L4 场景取舍：区间反转（LC 92）怎么套用？→ 先走 `left-1` 步到翻转段前驱，再对 `[left,right]` 做组内翻转，接回两端。
  - L5 反例边界：`k=1` 或链表长度 0 会怎样？→ `k=1` 每轮直接返回原链；空链表递归/迭代都要能安全返回。
- **常见错误 / 面试陷阱**：
  - 「递归反转忘了 `head.next = null`」→ 会让原头（现尾）仍指向已被改的节点，形成环。
  - 「K 组翻转时对不足 k 个的尾部也反转」→ 与原题要求相反，必须先探够 k 个。
  - 「两两交换用值交换而非指针交换」→ 面试官要看指针操作，值交换算偷懒（虽然 LC 上能过）。
- **变体**：LC 92（区间反转）、LC 61（旋转链表）、LC 143（重排链表）、LC 234（回文链表）。

### 3.6 快慢指针系列

- **考察点**：环判定、环入口的数学推导、中点、相交链表的行程等价、链表归并。
- **思路**：① **判环（LC 141）**：slow 走 1、fast 走 2，有环必相遇。② **环入口（LC 142）**：相遇后让一个指针回 head，两指针同速前进，相遇处即入口（推导见下）。③ **中点**：`fast` 到末尾时 `slow` 在中点；偶数长度返回第二个中点。④ **相交（LC 160）**：双指针各走完自己再走对方，两段总路程相等（都 = a+b+c），必然在交点相遇。⑤ **合并有序（LC 21）**：dummy + 双指针。
- **数学推导（环入口，必须能完整写）**：
  设 head 到环入口距离为 `a`，环入口到相遇点距离为 `b`，环长为 `L`。
  相遇时：slow 走了 `a + b`（进环后走不到一圈就被追上），fast 走了 `a + b + kL`（`k ≥ 1` 为 fast 多绕的圈数），且 `fast = 2 · slow`。
  于是 `2(a + b) = a + b + kL`，化简得 `a + b = kL`，即 `a = kL − b = (k−1)L + (L − b)`。
  含义：从 head 走 `a` 步，与从相遇点先走完 `L−b`（到环入口）再绕 `k−1` 圈，**落点相同**，都是环入口。
  所以：头指针与相遇点指针**同速前进，相遇处就是环入口**。
- **Java 代码**：

```java
public class FastSlowPointer {
    static class ListNode {
        int val; ListNode next;
        ListNode(int v) { val = v; }
        ListNode(int v, ListNode n) { val = v; next = n; }
    }
    static boolean hasCycle(ListNode head) {                     // LC 141
        ListNode slow = head, fast = head;
        while (fast != null && fast.next != null) {
            slow = slow.next; fast = fast.next.next;
            if (slow == fast) return true;                       // 相遇即有环
        }
        return false;
    }
    static ListNode detectCycle(ListNode head) {                 // LC 142：a = (k-1)L + (L-b)
        ListNode slow = head, fast = head;
        while (fast != null && fast.next != null) {
            slow = slow.next; fast = fast.next.next;
            if (slow == fast) {                                  // 相遇点
                ListNode p = head;
                while (p != slow) { p = p.next; slow = slow.next; }   // 同速走，相遇即入口
                return p;
            }
        }
        return null;
    }
    static ListNode middleNode(ListNode head) {                  // 中点（偶数取后一个）
        ListNode slow = head, fast = head;
        while (fast != null && fast.next != null) { slow = slow.next; fast = fast.next.next; }
        return slow;
    }
    static ListNode getIntersectionNode(ListNode a, ListNode b) {   // LC 160
        if (a == null || b == null) return null;
        ListNode p = a, q = b;
        while (p != q) { p = (p == null) ? b : p.next; q = (q == null) ? a : q.next; }   // 各走完再走对方
        return p;
    }
    static ListNode mergeTwoLists(ListNode l1, ListNode l2) {    // LC 21
        ListNode dummy = new ListNode(0), cur = dummy;
        while (l1 != null && l2 != null) {
            if (l1.val <= l2.val) { cur.next = l1; l1 = l1.next; } else { cur.next = l2; l2 = l2.next; }
            cur = cur.next;
        }
        cur.next = (l1 != null) ? l1 : l2;                       // 接上剩余
        return dummy.next;
    }
    public static void main(String[] a) { ListNode n1 = new ListNode(3), n2 = new ListNode(2), n3 = new ListNode(0), n4 = new ListNode(-4); n1.next = n2; n2.next = n3; n3.next = n4; n4.next = n2; System.out.println(hasCycle(n1) + " " + detectCycle(n1).val); } // true 2
}
```

- **复杂度**：判环/入口 O(n) 时间 O(1) 空间；相交 O(a+b)；归并 O(m+n)。
- **白板最容易写错哪一行**：`while (fast != null && fast.next != null)` —— 必须**先判 `fast` 再判 `fast.next`**，顺序写反或漏判会 NPE。
- **追问链**：
  - L1 概念：为什么有环一定会相遇？→ fast 每轮比 slow 多走 1 步，进环后相当于在长度 L 的环上以相对速度 1 追赶，最多 L 轮追上。
  - L2 机制：为什么从 head 和相遇点同速走会在入口相遇？→ 由 `a = (k−1)L + (L−b)`，两侧路程差恰是整数圈，落点同为环入口。
  - L3 源码/参数：fast 一次走 3 步行吗？→ 行，能判环，但入口推导的等式会变、且 fast 可能「跳过」slow，一般仍用 2。
  - L4 场景取舍：中点的两种口径？→ fast 从 head 起步取到第二个中点；若想让偶数长度取第一个，让 fast 初始指向 `head.next`。
  - L5 反例边界：无环链表上跑环入口检测？→ `while` 会因 `fast` 到尾而退出并返回 null，不会死循环。
- **常见错误 / 面试陷阱**：
  - 「判环用哈希表存访问过的节点」→ 也对，但 O(n) 空间；快慢指针 O(1) 空间才是标准解。
  - 「环入口就是相遇点」→ 错，相遇点只是环上某点，入口要把指针拉回 head 再同速走。
  - 「相交链表比较节点值」→ 必须比较**节点引用**（`p != q`），值相同不代表同一节点。
- **变体**：LC 143（重排链表，找中点+反转+合并）；LC 876（中点）；LC 287（找重复数，值域上做快慢指针）。

### 3.7 二叉树：遍历、判定与 LCA

- **考察点**：三种遍历的递归与迭代写法、层序、BST 判定的上下界、LCA 的后序分治。
- **思路**：① **前序迭代**：栈，先压右再压左（保证左先出）。② **中序迭代**：一路向左压栈，弹出后转向右子树——BST 中序即升序。③ **后序迭代**：按「根→右→左」遍历并**头插**结果，等价于「左→右→根」。④ **层序（LC 102）**：队列，每轮按当前队列长度分层。⑤ **判断 BST**：**只比较父子是错的**（反例见下），必须传入 `(low, high)` 上下界递归。⑥ **LCA（LC 236）**：后序分治，左右子树各返回一个结果，若两侧都找到则该节点即 LCA。
- **Java 代码**：

```java
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedList;
import java.util.List;
import java.util.Queue;

public class BinaryTreeOps {
    static class TreeNode {
        int val; TreeNode left, right;
        TreeNode(int v) { val = v; }
    }
    static List<Integer> preorderIter(TreeNode root) {           // LC 144
        List<Integer> res = new ArrayList<>();
        if (root == null) return res;
        Deque<TreeNode> st = new ArrayDeque<>();
        st.push(root);
        while (!st.isEmpty()) {
            TreeNode n = st.pop(); res.add(n.val);
            if (n.right != null) st.push(n.right);               // 先压右，左先出
            if (n.left != null) st.push(n.left);
        }
        return res;
    }
    static List<Integer> inorderIter(TreeNode root) {            // LC 94
        List<Integer> res = new ArrayList<>();
        Deque<TreeNode> st = new ArrayDeque<>();
        TreeNode cur = root;
        while (cur != null || !st.isEmpty()) {
            while (cur != null) { st.push(cur); cur = cur.left; }   // 一路向左
            cur = st.pop(); res.add(cur.val); cur = cur.right;      // 弹出后转右
        }
        return res;
    }
    static List<Integer> postorderIter(TreeNode root) {          // LC 145：根右左 + 头插
        LinkedList<Integer> res = new LinkedList<>();
        if (root == null) return res;
        Deque<TreeNode> st = new ArrayDeque<>();
        st.push(root);
        while (!st.isEmpty()) {
            TreeNode n = st.pop(); res.addFirst(n.val);
            if (n.left != null) st.push(n.left);
            if (n.right != null) st.push(n.right);
        }
        return res;
    }
    static List<List<Integer>> levelOrder(TreeNode root) {       // LC 102
        List<List<Integer>> res = new ArrayList<>();
        if (root == null) return res;
        Queue<TreeNode> q = new LinkedList<>();
        q.offer(root);
        while (!q.isEmpty()) {
            int size = q.size(); List<Integer> level = new ArrayList<>(size);
            for (int i = 0; i < size; i++) {                     // 只处理本层
                TreeNode n = q.poll(); level.add(n.val);
                if (n.left != null) q.offer(n.left);
                if (n.right != null) q.offer(n.right);
            }
            res.add(level);
        }
        return res;
    }
    static int maxDepth(TreeNode root) { return root == null ? 0 : 1 + Math.max(maxDepth(root.left), maxDepth(root.right)); }
    static boolean isValidBST(TreeNode root) { return valid(root, Long.MIN_VALUE, Long.MAX_VALUE); }
    private static boolean valid(TreeNode n, long lo, long hi) {   // 传上下界，只比父子是错的
        if (n == null) return true;
        if (n.val <= lo || n.val >= hi) return false;
        return valid(n.left, lo, n.val) && valid(n.right, n.val, hi);
    }
    static TreeNode lowestCommonAncestor(TreeNode root, TreeNode p, TreeNode q) {   // LC 236
        if (root == null || root == p || root == q) return root;
        TreeNode l = lowestCommonAncestor(root.left, p, q), r = lowestCommonAncestor(root.right, p, q);
        if (l != null && r != null) return root;                 // p、q 分居两侧
        return l != null ? l : r;
    }
    public static void main(String[] args) { TreeNode root = new TreeNode(3); root.left = new TreeNode(2); root.right = new TreeNode(5); root.left.left = new TreeNode(1); root.left.right = new TreeNode(4); System.out.println(preorderIter(root) + " " + inorderIter(root) + " " + postorderIter(root) + " " + maxDepth(root)); } // [3, 2, 1, 4, 5] [1, 2, 4, 3, 5] [1, 4, 2, 5, 3] 3
}
```

- **复杂度**：所有遍历 O(n) 时间；递归栈与迭代显式栈 O(h)（h 为树高，最坏 O(n)）；层序空间 O(宽度)。
- **判断 BST 的反例**：`root=10, root.left=5, root.right=15, root.right.left=6`。根 10 的右子树里出现了 6<10 的节点，但「只比父子」会认为 `15>10`、`6<15` 都合法而误判为 BST。正确做法是给每个节点限定区间：左子树 `(−∞,10)`、右子树 `(10,+∞)`，6 落在 `(10,15)` 之外即被识破。
- **白板最容易写错哪一行**：`if (n.val <= lo || n.val >= hi) return false;` —— BST 要求**严格**单调，用 `long` 做上下界；若用 `Integer.MIN_VALUE` 做初值，会被值为 `Integer.MIN_VALUE` 的节点坑到。
- **追问链**：
  - L1 概念：中序迭代为什么要「一路向左」？→ 中序要先访问最左节点，栈用于回溯到父节点再转右子树。
  - L2 机制：后序迭代用「头插」为什么等价？→ 按根→右→左弹栈顺序，反向即左→右→根，正是后序。
  - L3 源码/参数：`ArrayDeque` 当栈为什么优于 `Stack`？→ `ArrayDeque` 无 `synchronized`、数组实现更快；`Stack` 已过时。
  - L4 场景取舍：LCA 递归 vs 保存父指针？→ 单次查询递归最简 O(n)；多次查询可用 Tarjan 离线或倍增/欧拉序 RMQ 优化到 O(log n)。
  - L5 反例边界：p 或 q 不在树里，LCA 会返回什么？→ 会把它当作找到自身返回，得不到「不存在」的信息；题干若要求判存在需额外处理。
- **常见错误 / 面试陷阱**：
  - 「BST 判定只比父子」→ 错，必须传上下界（见反例）。
  - 「后序迭代和先序迭代只差一个 push 顺序」→ 需要配合头插/反转，直接改顺序会得到错误的「镜像」。
  - 「LCA 找的是值相等的节点」→ 应找引用相同的节点；树中值可能重复。
- **变体**：LC 145（后序，纯栈不反转的写法）、LC 199（右视图）、LC 98（验证 BST）、LC 235（BST 的 LCA，可用值比较直接下降）。

## 4. 面试问法与答题框架

1. **「手写一个 LRU。」**
   - ① 先说结构：HashMap + 双向链表（+两个哨兵）；② `get` 命中要移到头部、`put` 满要淘汰尾部；③ 写 `addFirst/removeNode/moveToHead` 小方法；④ 淘汰时用 `node.key` 删 map；⑤ 主动提 LinkedHashMap 版与并发版。
   - 加分：「生产里我会用 Caffeine，它用分段锁 + W-TinyLFU，并发和命中率都比手写强。」

2. **「LinkedHashMap 怎么做 LRU？内部靠什么回调？」**
   - ① 构造传 `accessOrder=true`；② 覆写 `removeEldestEntry`；③ `afterNodeAccess` 管访问后移尾；④ `afterNodeInsertion` 管插入后淘汰；⑤ 还有 `afterNodeRemoval` 管删除时摘链。
   - 加分：「注意 `getOrDefault` 走的是 `getNode`、不触发 `afterNodeAccess`，用它取数会导致 LRU 顺序失效。」

3. **「LFU 和 LRU 的区别？为什么生产少用 LFU？」**
   - ① LFU 按频次淘汰、同频次按 LRU；② 需要 key→freq、freq→LRU 两层结构；③ 复杂度更高、内存更大；④ 有缓存污染问题（老热点常驻）；⑤ 生产用 W-TinyLFU 近似解决。
   - 加分：「LFU 的 minFreq 只在最小桶清空时才自增，这个不变量是 O(1) 淘汰的关键。」

4. **「用两个栈实现队列，复杂度怎么算？」**
   - ① 输入栈收、输出栈出；② 只在输出栈空时倒入；③ 每元素最多被搬一次 → 摊还 O(1)；④ 单次最坏 O(n)；⑤ 空判断要看两个栈。
   - 加分：「摊还分析的关键是每个元素入队后只经历一次『从 in 到 out』的搬迁，总搬迁次数不超过元素总数。」

5. **「手写一个阻塞队列。」**
   - ① 环形数组 + 一把锁 + 两个 Condition；② 满则 `notFull.await()`、空则 `notEmpty.await()`；③ 等待用 `while` 防虚假唤醒；④ 取出后置 null 帮助 GC；⑤ 对照 `ArrayBlockingQueue` 字段。
   - 加分：「`LinkedBlockingQueue` 用 putLock/takeLock 两把锁，吞吐高于 `ArrayBlockingQueue` 的单锁，但代价是节点对象和 GC 压力。」

6. **「链表怎么判断有环、找环入口？」**
   - ① 快慢指针判环；② 相遇后一指针回 head 同速走；③ 推导 `a = (k−1)L + (L−b)`；④ 相遇处即入口；⑤ 空间 O(1)。
   - 加分：「推导的本质是相遇点到入口的距离 `L−b` 与 head 到入口的距离 a 差整数圈，所以两指针同速必在入口碰头。」

7. **「K 个一组翻转链表怎么写？」**
   - ① dummy + groupPrev；② 每组先探够 k 个，不足则不翻；③ 记录 `groupNext`；④ 组内翻转并把尾部接到 groupNext；⑤ 更新 groupPrev 为原组首（现组尾）。
   - 加分：「`k=1` 时每轮直接返回，`k` 大于链表长时整个链表不翻转，这两种边界要能在白板上立刻说清。」

8. **「怎么判断一棵树是不是 BST？」**
   - ① 只比父子是错的，给反例；② 传 `(low, high)` 上下界递归；③ 左子树上界收紧为当前值、右子树下界收紧；④ 用 `long` 防止边界值溢出；⑤ 也可中序遍历验证严格升序。
   - 加分：「反例是 root=10、右子树的左孩子=6，只比父子会误判为 BST，上下界法能把 6 卡在 (10,15) 之外。」

## 5. 常见误区汇总

| 错误说法 | 正确理解 | 一句话记忆锚点 |
| --- | --- | --- |
| LinkedHashMap 默认就是 LRU | 需 `accessOrder=true` 且覆写 `removeEldestEntry` | 两个开关缺一不可 |
| 可用 `getOrDefault` 触发访问顺序 | `getOrDefault` 走 `getNode` 不触发 `afterNodeAccess` | LRU 取数用 `super.get` |
| LRU 淘汰时用 value 从 map 里删 | 必须用被删节点的 key | 删 map 认 key，不认 value |
| LinkedHashMap 只有 `afterNodeAccess` 一个回调 | 共有 `afterNodeAccess/afterNodeInsertion/afterNodeRemoval` | 访问/插入/删除三回调 |
| 单链表就能实现 O(1) 的 LRU | 删尾/移尾 O(n)，必须双向链表 + 哨兵 | LRU 要用双向链表 |
| LFU 的 minFreq 每次访问都自增 | 只在被清空的桶是最小桶时才自增 | minFreq 只在最小桶空了才升 |
| LFU 一定比 LRU 命中率高 | LFU 有缓存污染，老热点常驻、新热点进不来 | LFU 会缓存污染 |
| 双栈队列的 pop 是 O(1) | 是摊还 O(1)，单次可能 O(n) | 摊还 O(1)，非最坏 O(1) |
| 最小栈用一个变量存最小值 | 弹出后无法恢复次小值，要用最小值栈 | 最小栈要配辅助栈 |
| `ArrayDeque` 可以存 null | 禁止 null，`push(null)` 抛 NPE；`LinkedList` 才允许 | ArrayDeque 不存 null |
| 阻塞队列等待用 `if` 就行 | 必须 `while`，防虚假唤醒 | 等待一律 `while` |
| `LinkedBlockingQueue` 用一把锁 | 用 putLock/takeLock 两把；`ArrayBlockingQueue` 才是一把 | ABQ 单锁，LBQ 双锁 |
| 循环队列 `head==tail` 即满 | 空和满都会 `head==tail`，要用 size 或留一格 | 循环队列要另存 size |
| 快慢指针 `while(fast.next!=null && fast!=null)` | 顺序反了会 NPE，必须先判 `fast` | 先判 fast，再判 fast.next |
| 环入口就是相遇点 | 相遇点只是环上一点，入口要回 head 同速再走 | 相遇点≠入口 |
| BST 判定只比较父子 | 必须传 (low, high) 上下界，父子比较会漏判 | BST 判定要上下界 |
| 相交链表比较节点值 | 必须比较节点引用 | 相交比引用，不比值 |
| `Stack` 类是推荐用法 | 已过时（继承 Vector、方法同步），用 `ArrayDeque` | 用 ArrayDeque 不用 Stack |
