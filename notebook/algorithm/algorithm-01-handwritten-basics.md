# 算法 · 手写基础题与并发小题

> 一句话定位：覆盖中大厂一面/二面高频的「手写代码 + 并发小题」，考的是能不能一次写对、边界清不清楚、机制讲不讲得透。
> 版本前提：JDK 17（示例代码兼容 JDK 8+ 语法，均可编译运行）。

## 1. 题目清单

| 编号 | 题目 | 对应 LC 题号 | 难度 | 考察点 | 面试频率 |
| --- | --- | --- | --- | --- | --- |
| 1 | 单例模式四种写法 | 无 | 中 | 线程安全、指令重排、类加载、反射/序列化防御 | 极高 |
| 2 | 手写线程安全计数器 | 无 | 中 | CAS、分段累加、伪共享、弱一致性 | 高 |
| 3 | 两线程交替打印 | 1114 / 1115 / 1116 | 中 | wait/notify、Condition、Semaphore、park/unpark | 极高 |
| 4 | 字符串反转与回文判断 | 344 / 125 / 541 | 易-中 | 双指针、Unicode 代理对、递归栈深度 | 高 |
| 5 | 大数相加 | 415 | 易 | 逐位进位、长度不等、字符串模拟 | 中 |
| 6 | 数组原地操作三连 | 283 / 26 / 189 | 易-中 | 快慢指针、三次反转、原地交换 | 极高 |

## 2. 高频套路总结

**双指针（相向对撞 / 同向快慢）**

```
相向（反转、回文）：left=0, right=n-1; while(left<right){ 处理; left++; right--; }
同向（原地删除、移动零）：slow=写入位, fast=扫描位;
  while(fast<n){ if(满足保留){ nums[slow++]=nums[fast]; } fast++; }  // slow 即新长度
```

**原地交换**：用临时变量 `swap`；别写 `a^=b^=a^=b`（同一下标会清零）。稳定删除用「覆盖写」，交换会打乱相对顺序。

**CAS 自旋**

```
do { old = value.get(); next = f(old); }        // old 必须在循环体内重新读
while (!value.compareAndSet(old, next));        // 失败即重试
```

**Condition 精确唤醒**

```
lock.lock();
try {
  while (!条件成立) { condition.await(); }   // 必须 while，不能 if
  临界区逻辑;
  otherCondition.signal();                    // 唤醒指定等待队列
} finally { lock.unlock(); }
```

一个 Lock 可 `newCondition()` 出多个等待队列，实现「A 叫醒 B，B 叫醒 A」的精确配对。

## 3. 逐题详解

### 3.1 单例模式四种写法

- **考察点**：延迟初始化下的线程安全；`volatile` 与指令重排；类加载机制保证的线程安全；枚举防反射、防反序列化的原理。
- **思路**（朴素写法 → 缺陷 → 改良）：
  1. **饿汉**：类加载时创建，`<clinit>` 由 JVM 保证同步，天然线程安全；缺点是不能延迟加载。
  2. **懒汉（不加锁）**：`if (instance == null) instance = new X()`，多线程会创建多个实例 —— 必须改。
  3. **DCL**：把同步块缩到判空之后，两次判空 + `synchronized`；**必须给 `instance` 加 `volatile`**。
  4. **静态内部类**：实例放进私有静态内部类，靠 JVM 保证类加载（`<clinit>`）的线程安全与「用到才加载」，延迟 + 线程安全一举两得。
  5. **枚举**：单元素枚举，JVM 保证唯一，编译器为枚举封死反射创建、反序列化走 `Enum.valueOf`，防破坏能力最强。

  **DCL 为什么必须 volatile**：`instance = new Singleton()` 编译后大致三步 —— ①分配内存 ②执行构造器初始化 ③把引用赋给 `instance`。②③之间无数据依赖，JIT/CPU 可能重排为 ①→③→②。另一线程在第一次判空处看到 `instance != null` 就直接返回，拿到的正是「已分配、字段还是默认值」的**半初始化对象**。`volatile` 禁止该写与后续读之间的重排序，堵住窗口。
- **Java 代码**：

```java
// 饿汉
public class SingletonEager {
    private static final SingletonEager INSTANCE = new SingletonEager();
    private SingletonEager() {}
    public static SingletonEager getInstance() { return INSTANCE; }
}
// DCL 双重检查锁
public class SingletonDCL {
    private static volatile SingletonDCL instance;        // volatile 禁止 2/3 重排
    private SingletonDCL() {}
    public static SingletonDCL getInstance() {
        if (instance == null) {                            // 第一次检查：无锁快速路径
            synchronized (SingletonDCL.class) {
                if (instance == null) {                    // 第二次检查：防重复创建
                    instance = new SingletonDCL();         // 1 分配 2 初始化 3 赋值
                }
            }
        }
        return instance;
    }
}
// 静态内部类
public class SingletonHolder {
    private SingletonHolder() {}
    private static class Holder { private static final SingletonHolder INSTANCE = new SingletonHolder(); }
    public static SingletonHolder getInstance() { return Holder.INSTANCE; }   // 触发 Holder.<clinit>
}
// 枚举
public enum SingletonEnum {
    INSTANCE;
    public void doSomething() { System.out.println("business method"); }
}
// 反射破坏演示
import java.lang.reflect.Constructor;
public class BreakDemo {
    public static void main(String[] args) throws Exception {
        SingletonDCL s1 = SingletonDCL.getInstance();
        Constructor<SingletonDCL> c = SingletonDCL.class.getDeclaredConstructor();
        c.setAccessible(true);
        System.out.println(s1 == c.newInstance());         // 反射破坏：false
    }
}
```
- **破坏与防御**：
  - **反射破坏**：`setAccessible(true)` + `newInstance()` 绕过私有构造器。防御：构造器内判空抛异常（仅对已初始化有效）；**枚举天然拦截**（反射层对枚举构造器抛 `IllegalArgumentException`，Cannot reflectively create enum objects）。
  - **序列化破坏**：反序列化按字节流新建对象，**不走构造器**。防御：实现 `private Object readResolve() { return INSTANCE; }` 让反序列化返回原实例；枚举反序列化由 `ObjectInputStream` 特判走 `Enum.valueOf`，只按 name 取常量，天然拦截。
- **复杂度**：时间 O(1)，空间 O(1)。饿汉/枚举在类初始化时创建，DCL/Holder 首次访问时创建。
- **追问链**（问法 → 答题落点）：
  - **L1 概念**｜「单例有几种写法？」→ 饿汉、DCL、静态内部类、枚举，按「延迟加载」与「防破坏能力」两个维度比较。
  - **L2 机制**｜「DCL 为什么加 volatile / 静态内部类凭什么线程安全？」→ 前者因对象创建 ①②③ 步中 ②③ 可重排会读到半初始化对象，volatile 禁止重排；后者不靠锁，靠 JVM 类初始化：`<clinit>` 由 JVM 加锁且只执行一次（JLS 12.4.2）。
  - **L3 源码/参数**｜「枚举为什么防反射防序列化？」→ 反射创建枚举时 `Constructor.newInstance` 检查 `isEnum()` 抛异常；枚举反序列化由 `ObjectInputStream` 特判走 `Enum.valueOf`。
  - **L4 场景取舍**｜「生产用哪种？」→ 无特殊要求用 Holder 或枚举；需序列化优先枚举；无状态简单场景用饿汉。JDK 中 `Runtime.getRuntime()` 是饿汉。
  - **L5 反例边界**｜「枚举完美吗？」→ 需 `extends` 某类时不适用（枚举已隐式 `extends Enum`）；ClassLoader 隔离（Tomcat 各 webapp）下「单例」只在单个 ClassLoader 内成立。
- **常见错误 / 面试陷阱**：
  - 「DCL 两次判空就够，volatile 是可选的」→ 错，volatile 是正确性必需；JDK 5 修正 volatile 语义后 DCL 才成立。
  - 「静态内部类靠 synchronized」→ 错，靠类加载机制的互斥性，无任何显式锁。
  - 「饿汉式线程不安全」→ 错，`<clinit>` 天然线程安全，最容易误判。
  - 「反射破坏无解」→ 部分错，构造器判空 + 枚举可防；判空对「已初始化」有效，枚举才完整。
- **变体**：JDK 中的 `Runtime.getRuntime()`、`System.out`；Spring 默认 singleton 是「容器级单例」（`DefaultSingletonBeanRegistry` 缓存 + 三级缓存），非 JVM 级；可变字段的单例仍需自行加锁或改无状态。

### 3.2 手写线程安全计数器

- **考察点**：四种实现；CAS 重试代价；`LongAdder` 分段思想、伪共享、`sum()` 弱一致性。
- **思路**：
  1. **`synchronized`**：正确，但同一把锁串行化所有递增，竞争激烈时阻塞/唤醒开销大。
  2. **`ReentrantLock`**：能力更强（可中断、超时、公平、多 Condition），本质仍是互斥。
  3. **`AtomicLong`**：无锁 CAS 循环；问题是**所有线程抢同一个地址**，竞争越激烈 CAS 失败越多、缓存行反复失效，形成热点塌陷。
  4. **`LongAdder`**（JDK 8 新增）：把值分片到 `base` + `Cell[]`，线程按探针散列到各自 Cell 累加，`sum()` 汇聚。
     - **为什么更快**：空间换时间 + 竞争分散。N 线程各写各的，而非抢 1 个地址；`Cell` 用 `@sun.misc.Contended` 做缓存行填充，避免相邻 Cell 落在同一缓存行造成**伪共享**。
     - **为什么 sum() 弱一致**：无锁遍历各 Cell，遍历期间允许并发写，故为「某瞬间的近似值」。要精确瞬时值用 `AtomicLong`。
- **Java 代码**：

```java
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.LongAdder;
import java.util.concurrent.locks.ReentrantLock;
// synchronized
public class SyncCounter {
    private long value = 0;
    public synchronized void increment() { value++; }
    public synchronized long get() { return value; }
}
// ReentrantLock
public class LockCounter {
    private final ReentrantLock lock = new ReentrantLock();
    private long value = 0;
    public void increment() { lock.lock(); try { value++; } finally { lock.unlock(); } }
    public long get() { lock.lock(); try { return value; } finally { lock.unlock(); } }
}
// AtomicLong（CAS）
public class AtomicCounter {
    private final AtomicLong value = new AtomicLong(0L);
    public void increment() { value.incrementAndGet(); }
    public long get() { return value.get(); }
}
// LongAdder（分片）
public class AdderCounter {
    private final LongAdder value = new LongAdder();
    public void increment() { value.increment(); }
    public long get() { return value.sum(); }        // 弱一致
}
```
- **复杂度**：单次递增：`synchronized`/`Lock` O(1) 含阻塞开销；`AtomicLong` O(1) 期望、最坏 O(n) 自旋；`LongAdder` O(1) 期望。`sum()` O(cells)。`LongAdder` 额外 O(cells) 空间。
- **追问链**：
  - **L1 概念**｜「加一个数的线程安全做法？」→ synchronized、Lock、AtomicLong、LongAdder，从互斥到无锁到分片。
  - **L2 机制**｜「CAS 循环怎么写 / LongAdder 为什么快？」→ 前者 `do { old = get(); } while (!compareAndSet(old, old+1));`；后者 base + Cell[] 分片，线程散列到不同 Cell 稀释竞争，Cell 有缓存行填充避免伪共享。
  - **L3 源码/参数**｜「sum() 为什么弱一致？」→ 无锁遍历各 Cell，允许并发写，非瞬时精确值；还提供 `sumThenReset()` 做周期聚合。
  - **L4 场景取舍**｜「项目用哪个？」→ 指标统计用 LongAdder；需精确读（订单号、序列号）用 AtomicLong。
  - **L5 反例边界**｜「LongAdder 一定更快吗？」→ 不一定，低竞争时 AtomicLong 更简单更快；竞争激烈才是 LongAdder 主场。
- **常见错误 / 面试陷阱**：
  - 「LongAdder 是 JDK 7 的」→ 错，**JDK 8 新增**。
  - 「sum() 精确」→ 错，弱一致，只保证最终统计正确。
  - 「伪共享靠 volatile 解决」→ 错，伪共享是缓存行问题，靠填充解决。
  - 「AtomicLong 加了锁所以慢」→ 错，它是 CAS 无锁，慢在高竞争下的自旋与缓存行失效。
- **变体**：`LongAccumulator`（可传任意二元函数，如 `Long::max`）；`DoubleAdder`；`AtomicLongFieldUpdater`（省内存）；分段思想与 JDK 7 `ConcurrentHashMap` 的 Segment 同源。

### 3.3 两个线程交替打印

- **考察点**：线程协作与唤醒精度；`wait` 必须配 `while`；`notify` 唤醒错对象的风险；四种同步原语对比。
- **思路**：
  1. **synchronized + wait/notify**：共用锁，打印后 `notifyAll` 并 `wait`。坑一：`wait` 必须放 `while` 判条件（虚假唤醒 / 条件已变）。坑二：`notify()` 只唤醒一个，可能唤醒错对象 —— 双线程场景用 `notifyAll()` 保证正确。
  2. **ReentrantLock + 两个 Condition**：一个 Lock 派生 `oddCond`/`evenCond`，奇数唤偶数、偶数唤奇数，**精确唤醒**，避免唤醒错对象。
  3. **Semaphore**：两个许可 `(1,0)` 构成令牌接力，谁拿到谁打印，打完释放对方许可；无显式锁。
  4. **LockSupport.park/unpark**：基于许可，`unpark` 可先于 `park`（许可累积 1），天然避免丢失唤醒；不需锁、不需循环判条件，但要自己维护线程引用与顺序。
- **Java 代码**：

```java
// 实现一：synchronized + wait/notifyAll，交替打印 1..100
public class PrintWithWaitNotify {
    private static final Object LOCK = new Object();
    private static int num = 1;
    private static final int MAX = 100;
    public static void main(String[] args) {
        Runnable task = () -> {
            while (true) {
                synchronized (LOCK) {
                    if (num > MAX) { LOCK.notifyAll(); return; }
                    System.out.println(Thread.currentThread().getName() + " -> " + num);
                    num++;
                    LOCK.notifyAll();                 // 用 notifyAll 防唤醒错对象
                    try {
                        if (num > MAX) return;
                        LOCK.wait();                  // 释放锁并等待
                    } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
                }
            }
        };
        new Thread(task, "T1").start();
        new Thread(task, "T2").start();
    }
}
// 实现二：ReentrantLock + 两个 Condition（精确唤醒）
import java.util.concurrent.locks.*;
public class PrintWithCondition {
    private static final ReentrantLock lock = new ReentrantLock();
    private static final Condition oddC = lock.newCondition(), evenC = lock.newCondition();
    private static int num = 1;
    public static void main(String[] args) {
        start(1, 1, oddC, evenC, "Odd");         // 参数：起始值, 期望奇偶, 自己队列, 对方队列
        start(2, 0, evenC, oddC, "Even");
    }
    private static void start(int from, int parity, Condition self, Condition other, String name) {
        new Thread(() -> {
            for (int i = from; i <= 100; i += 2) {
                lock.lock();
                try {
                    while ((num & 1) != parity) self.await();   // while 而非 if
                    System.out.println(name + " -> " + num);
                    num++;
                    other.signal();                             // 精确唤醒另一方
                } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
                finally { lock.unlock(); }
            }
        }, name).start();
    }
}
// 实现三：Semaphore 令牌接力
import java.util.concurrent.Semaphore;
public class PrintWithSemaphore {
    private static final Semaphore oddSem = new Semaphore(1), evenSem = new Semaphore(0);
    private static int num = 1;
    public static void main(String[] args) {
        new Thread(() -> run(1, oddSem, evenSem, "Odd"), "Odd").start();
        new Thread(() -> run(2, evenSem, oddSem, "Even"), "Even").start();
    }
    private static void run(int from, Semaphore self, Semaphore other, String name) {
        for (int i = from; i <= 100; i += 2) {
            try { self.acquire(); } catch (InterruptedException e) { return; }
            System.out.println(name + " -> " + num); num++; other.release();
        }
    }
}
// 实现四：LockSupport.park/unpark 许可接力
import java.util.concurrent.locks.LockSupport;
public class PrintWithLockSupport {
    private static int num = 1;
    public static void main(String[] args) {
        Thread[] odd = new Thread[1], even = new Thread[1];
        odd[0] = new Thread(() -> {
            for (int i = 1; i <= 100; i += 2) {
                System.out.println("Odd  -> " + num); num++;
                LockSupport.unpark(even[0]);       // 先给许可，再自阻塞
                LockSupport.park();
            }
        }, "Odd");
        even[0] = new Thread(() -> {
            for (int i = 2; i <= 100; i += 2) {
                LockSupport.park();                // 先等许可
                System.out.println("Even -> " + num); num++;
                LockSupport.unpark(odd[0]);
            }
        }, "Even");
        odd[0].start();
        even[0].start();
    }
}
```
- **复杂度**：每次交接 O(1)，总唤醒 O(n)，空间 O(1)。
- **追问链**：
  - **L1 概念**｜「两线程交替打印怎么做？」→ 至少两种：synchronized+wait/notifyAll、Lock+Condition；再补 Semaphore 与 LockSupport。
  - **L2 机制**｜「wait 为什么必须写在 while 里 / notify 与 notifyAll 区别？」→ 前者因虚假唤醒 + 被唤醒时条件可能已变，`if` 只判一次会误入临界区；后者 notify 随机唤醒一个可能唤醒错对象，notifyAll 唤醒全部配合 while 重判最稳。
  - **L3 源码/参数**｜「Condition.await 与 Object.wait 差别？」→ 需先持有锁；一个 Lock 可派生多个等待队列（精确唤醒）；可中断、可超时（`awaitNanos`）。
  - **L4 场景取舍**｜「四种怎么选？」→ 快速用 wait/notifyAll；要精确唤醒用 Condition；纯令牌传递用 Semaphore；要不占锁、允许先唤醒后等待用 LockSupport。
  - **L5 反例边界**｜「LockSupport 的坑？」→ `park` 可能因中断或 `unpark` 提前调用而虚假返回，官方要求**循环重新检查条件**；`park()` 不释放任何锁。
- **常见错误 / 面试陷阱**：
  - 「wait 用 if 判条件就够」→ 错，必须 while，防虚假唤醒。
  - 「notify 能精确唤醒指定线程」→ 错，Object.notify 无法指定，精确唤醒用 Condition。
  - 「park 会释放锁」→ 错，park/unpark 与锁无关，仅操作阻塞许可。
  - 「Semaphore 就是互斥锁」→ 部分错，许可为 1 时可当互斥用，但本质是信号量，不保证持有者可重入。
- **变体**：LC 1114 按序打印（三线程三阶段）；LC 1115/1116；多线程按序循环打印 A/B/C（三条件或三信号量）；生产者-消费者（条件变为队列非空/非满）。

### 3.4 字符串反转与回文判断

- **考察点**：双指针原地反转；递归与栈深；Unicode 代理对陷阱；回文多思路对比。
- **思路**：
  - **反转**：相向双指针交换，O(n) 时间。递归写法优雅但有 O(n) 栈深，且 `substring` 不断产生新对象（O(n²) 空间）。
  - **代理对陷阱**：Java 的 `char` 是 UTF-16 **码元**，一个「字符」不一定是一个 `char`。emoji（如 U+1F600）与部分 CJK 扩展字是**代理对**，占两个 `char`。逐 `char` 反转会拆开代理对，产生非法 UTF-16 序列（乱码）。正确做法按 **code point** 处理（`codePoints()` / `appendCodePoint`）。主动提这个坑是强加分项。
  - **回文**：双指针 O(n)/O(1) 最优；反转比较 O(n)/O(n) 直观但多空间且 `reverse()` 同样有代理对问题（见 L3）；递归/栈可讲但非最优。LC 125 在指针推进时跳过非字母数字。
- **Java 代码**：

```java
// 反转一：双指针（char[] 原地）
public static String reverse(String s) {
    if (s == null) return null;
    char[] arr = s.toCharArray();
    int left = 0, right = arr.length - 1;
    while (left < right) {
        char tmp = arr[left]; arr[left] = arr[right]; arr[right] = tmp;
        left++; right--;
    }
    return new String(arr);
}
// 反转二：递归（O(n) 栈深 + O(n^2) 字符串空间）
public static String reverseRecursive(String s) {
    if (s == null || s.length() <= 1) return s;
    return reverseRecursive(s.substring(1)) + s.charAt(0);
}
// 反转三：按 code point 反转，正确处理代理对
public static String reverseByCodePoint(String s) {
    if (s == null) return null;
    int[] cps = s.codePoints().toArray();
    StringBuilder sb = new StringBuilder(s.length());
    for (int i = cps.length - 1; i >= 0; i--) sb.appendCodePoint(cps[i]);
    return sb.toString();
}
// 回文一：基础双指针
public static boolean isPalindrome(String s) {
    if (s == null) return false;
    int left = 0, right = s.length() - 1;
    while (left < right) {
        if (s.charAt(left) != s.charAt(right)) return false;
        left++; right--;
    }
    return true;
}
// 回文二：LC 125 忽略非字母数字与大小写
public static boolean isPalindromeIgnoreCase(String s) {
    int left = 0, right = s.length() - 1;
    while (left < right) {
        while (left < right && !Character.isLetterOrDigit(s.charAt(left))) left++;
        while (left < right && !Character.isLetterOrDigit(s.charAt(right))) right--;
        if (Character.toLowerCase(s.charAt(left)) != Character.toLowerCase(s.charAt(right))) return false;
        left++; right--;
    }
    return true;
}
```
- **复杂度**：反转双指针 O(n)/O(n)（`toCharArray`）；按 code point 反转 O(n)/O(n)；回文双指针 O(n) 时间 / O(1) 额外空间；递归反转 O(n) 时间 / O(n) 栈 + O(n²) 字符串空间。
- **追问链**：
  - **L1 概念**｜「字符串反转怎么写？」→ 双指针原地交换，`toCharArray` 后交换再 `new String`。
  - **L2 机制**｜「含 emoji 反转会怎样？」→ 代理对被拆开产生非法 UTF-16 序列，需按 code point 处理。
  - **L3 源码/参数**｜「`StringBuilder.reverse()` 怎么处理代理对？」→ 内部检测到 surrogate pair 时**整对翻转**，对合法代理对字符串安全。
  - **L4 场景取舍**｜「回文用哪种？」→ 常规双指针 O(1) 空间；要忽略标点大小写就在推进时跳过（LC 125）。
  - **L5 反例边界**｜「递归反转的边界？」→ 长串 `StackOverflowError`；`substring` 生成大量中间对象。
- **常见错误 / 面试陷阱**：
  - 「char 交换就够了」→ 部分错，ASCII 够用，代理对会被拆坏。
  - 「`charAt` 返回一个字符」→ 错，`char` 是码元，代理对要两个。
  - 「递归更优雅所以更好」→ 错，栈深 O(n) + 空间 O(n²)。
  - 「`Character.isLetterOrDigit` 对中文返回 false」→ 错，汉字属于字母，返回 true。
- **变体**：LC 344 反转字符数组（纯原地）；LC 541 每 2k 反转前 k 个；LC 5 最长回文子串（中心扩散/Manacher）；LC 7 整数反转（处理溢出）。

### 3.5 大数相加（LC 415）

- **考察点**：逐位相加 + 进位；长度不等补齐；边界（空串、前导零、全 9）；减法扩展。
- **思路**：从两串**末位**开始双指针，取不到按 0，`sum = x + y + carry`，本位 `sum % 10`，进位 `sum / 10`。循环条件 **`i >= 0 || j >= 0 || carry != 0`**（末项保证「99+1=100」最高位进位不丢）。结果逆序拼接后 `reverse()`。边界：空串按 0 处理；题目保证无前导零。**减法扩展**：先比绝对值定符号，大减小逐位借位（不够则 `+10`、`borrow=1`），最后去前导零。
- **Java 代码**：

```java
// 大数相加
public static String addStrings(String num1, String num2) {
    StringBuilder sb = new StringBuilder();
    int i = num1.length() - 1, j = num2.length() - 1, carry = 0;
    while (i >= 0 || j >= 0 || carry != 0) {
        int x = i >= 0 ? num1.charAt(i) - '0' : 0;
        int y = j >= 0 ? num2.charAt(j) - '0' : 0;
        int sum = x + y + carry;
        sb.append(sum % 10);
        carry = sum / 10;
        i--; j--;
    }
    return sb.reverse().toString();
}
// 减法扩展：假定 num1 >= num2 >= 0
public static String subStrings(String num1, String num2) {
    if (compare(num1, num2) < 0) return "-" + subStrings(num2, num1);
    StringBuilder sb = new StringBuilder();
    int i = num1.length() - 1, j = num2.length() - 1, borrow = 0;
    while (i >= 0) {
        int x = num1.charAt(i) - '0' - borrow;
        int y = j >= 0 ? num2.charAt(j) - '0' : 0;
        if (x < y) { x += 10; borrow = 1; } else { borrow = 0; }
        sb.append(x - y);
        i--; j--;
    }
    String res = sb.reverse().toString();
    int k = 0;
    while (k < res.length() - 1 && res.charAt(k) == '0') k++;   // 去前导零
    return res.substring(k);
}
private static int compare(String a, String b) {
    a = trim(a); b = trim(b);
    return a.length() != b.length() ? a.length() - b.length() : a.compareTo(b);
}
private static String trim(String s) {
    int k = 0;
    while (k < s.length() - 1 && s.charAt(k) == '0') k++;
    return s.substring(k);
}
```
- **复杂度**：O(max(m, n)) 时间，O(max(m, n)) 空间（结果串）。减法同阶。
- **追问链**：
  - **L1 概念**｜「大数相加思路？」→ 末位双指针逐位加，维护进位，循环含 `carry != 0`。
  - **L2 机制**｜「为什么 `carry != 0` / 长度不等怎么办？」→ 末项保证最高位进位不丢（99+1=100、5+5=10）；长度不等时越界位取 0，用 `i >= 0 ? num1.charAt(i) - '0' : 0`。
  - **L3 源码/参数**｜「减法借位实现？」→ `x - y - borrow`，x<y 时 `x += 10; borrow = 1`，否则 `borrow = 0`。
  - **L4 场景取舍**｜「为什么不用 BigInteger？」→ 面试考模拟能力；工程中直接用 `BigInteger`，其底层同样是数组分段运算。
  - **L5 反例边界**｜「中间会溢出吗？」→ 字符串模拟不涉及 int/long 溢出；`x+y+carry` 最大 19，安全。
- **常见错误 / 面试陷阱**：
  - 「循环写 `i>=0 && j>=0`」→ 错，用 `||` 处理长度不等，并加 `carry != 0`。
  - 「append 就是正序」→ 错，低位先算必须 `reverse()`。
  - 「减法就是加法取反」→ 错，十进制模拟要显式借位。
  - 「char - '0' 一定得数字」→ 需先清洗前导 `+`/空格。
- **变体**：LC 43 大数相乘（`int[]` 累加再统一进位）；LC 67 二进制相加（`%2`/`/2`）；LC 2 两数相加（链表版，补 0 节点）。

### 3.6 数组原地操作三连

- **考察点**：快慢指针覆盖写；原地交换；三次反转。核心是空间 O(1)。
- **思路**：
  - **移动零（LC 283）**：快慢指针。`fast` 扫描，遇非零与 `slow` 交换、`slow` 前进；非零相对顺序不变，零被挤到末尾。
  - **删除重复项（LC 26）**：`slow` 指向已去重最后一个位置，`fast` 从 1 扫；`nums[fast] != nums[slow]` 时 `slow++` 再覆盖写。返回 `slow + 1`。前提是数组有序。
  - **轮转数组（LC 189）**：三次反转 —— 整体反转 → 反转前 k 个 → 反转后 n-k 个。例 `[1,2,3,4,5,6,7], k=3`：整体得 `[7,6,5,4,3,2,1]`，前 3 得 `[5,6,7,4,3,2,1]`，后 4 得 `[5,6,7,1,2,3,4]`。`k` 先 `k %= n`。
- **Java 代码**：

```java
// LC 283 移动零
public static void moveZeroes(int[] nums) {
    int slow = 0;
    for (int fast = 0; fast < nums.length; fast++) {
        if (nums[fast] != 0) {
            int tmp = nums[slow]; nums[slow] = nums[fast]; nums[fast] = tmp;
            slow++;
        }
    }
}
// LC 26 删除有序数组重复项，返回新长度
public static int removeDuplicates(int[] nums) {
    if (nums.length == 0) return 0;
    int slow = 0;
    for (int fast = 1; fast < nums.length; fast++) {
        if (nums[fast] != nums[slow]) { slow++; nums[slow] = nums[fast]; }
    }
    return slow + 1;
}
// LC 189 轮转数组，三次反转，空间 O(1)
public static void rotate(int[] nums, int k) {
    int n = nums.length;
    if (n == 0) return;
    k %= n;
    reverseRange(nums, 0, n - 1);
    reverseRange(nums, 0, k - 1);
    reverseRange(nums, k, n - 1);
}
private static void reverseRange(int[] nums, int left, int right) {
    while (left < right) {
        int tmp = nums[left]; nums[left] = nums[right]; nums[right] = tmp;
        left++; right--;
    }
}
```
- **复杂度**：移动零 O(n)/O(1)；删除重复项 O(n)/O(1)；轮转三次反转总交换次数 n（整体 n/2 + 前段 k/2 + 后段 (n-k)/2 = n/2 次交换），时间 O(n)、空间 O(1)。
- **追问链**：
  - **L1 概念**｜「三题分别怎么做？」→ 前两个快慢指针覆盖写，轮转用三次反转。
  - **L2 机制**｜「为什么整体 + 两段反转等于右移 k / 去重用 set 行不行？」→ 反转是可逆变换，组合后等价循环移位（手动推 `[1,2,3,4,5], k=2` 验证）；set 可行但 O(n) 空间且破坏原地保序要求。
  - **L3 源码/参数**｜「k 为什么先 `% n`？」→ k 可大于 n，`k % n` 才是有效位移。
  - **L4 场景取舍**｜「轮转别的做法？」→ 额外数组 O(n) 空间最直观；环状替换 O(1) 空间但难写对；三次反转最平衡。
  - **L5 反例边界**｜「移动零保序吗？」→ 交换法保序（按 fast 顺序扫）；「遇零与末尾交换」会打乱顺序。
- **常见错误 / 面试陷阱**：
  - 「移动零用 sort 排到末尾」→ 错，打乱顺序且 O(n log n)。
  - 「删除重复项返回 slow」→ 错，长度是 `slow + 1`。
  - 「轮转 k 不取模」→ 错，`k > n` 会越界。
  - 「空数组忘判」→ 轮转里 `k %= n` 会除零。
- **变体**：LC 27 移除元素（覆盖写）；LC 80 删除重复项 II（`nums[fast] != nums[slow-1]`）；LC 88 合并有序数组（从后往前）；LC 26 无序版需先排序或哈希。

## 4. 面试问法与答题框架

**Q1：你平时写单例用哪种，为什么？**
- 无状态、启动即用用饿汉，代码最少且天然线程安全；需延迟加载用静态内部类 Holder。
- 涉及序列化或想彻底防反射用枚举。
- 加分：DCL 是「面试专用」，实际能用 Holder/枚举就优先，因为 volatile 与重排是易错点。

**Q2：DCL 里 volatile 能不能去掉？**
- 不能，去掉可能拿到半初始化对象。
- 根因是对象创建 ①②③ 步中 ②③ 可重排，另一线程在无锁路径读到非 null 引用。
- 加分：这是「DCL 在 JDK 5 之前不可靠」的原因，JDK 5 修正 volatile 语义后才成立。

**Q3：写个线程安全计数器，几种实现都说说。**
- synchronized、ReentrantLock：互斥，简单但热点竞争下阻塞开销大。
- AtomicLong：CAS 无锁，高竞争时自旋失败多；LongAdder：分片稀释竞争，高并发明显更快。
- 加分：`sum()` 弱一致，适合统计不适合精确读；低并发下可能不如 AtomicLong。

**Q4：LongAdder 为什么比 AtomicLong 快？**
- 把单个热点 value 拆成 base + Cell[]，线程按探针散列到各自 Cell。
- Cell 用 `@Contended` 缓存行填充，避免伪共享。
- 加分：本质是空间换时间 + 竞争分散，与 ConcurrentHashMap 分段锁同源；代价是内存与 `sum()` 弱一致。

**Q5：两线程交替打印怎么保证不唤醒错对象？**
- 用 ReentrantLock + 两个 Condition，奇数唤偶数、偶数唤奇数，精确配对。
- 若用 Object.wait/notify，至少 `notifyAll` + while 判条件。
- 加分：wait 必须在 while 里防虚假唤醒；notify 唤醒的是「某个」而非「指定」线程。

**Q6：为什么 wait 要放在 while 里，if 不行？**
- 存在虚假唤醒（spurious wakeup），线程可能没被 notify 就返回。
- 被唤醒到重新拿到锁之间条件可能已被其他线程改变。
- 加分：这是「条件谓词必须循环检查」的经典结论，JLS 与官方文档明确要求。

**Q7：字符串反转，含 emoji 会出问题吗？**
- 会，emoji 多为代理对，占两个 `char`，逐 `char` 交换会拆对产生非法序列。
- 正确做法按 code point 处理（`codePoints()` + `appendCodePoint`）。
- 加分：`StringBuilder.reverse()` 对代理对成对处理，比自己写 `char` 交换安全。

**Q8：大数相加与数组原地操作，各有哪些坑？**
- 大数相加：循环用 `i>=0 || j>=0 || carry!=0`，结果要 reverse，减法显式借位并去前导零。
- 数组原地：删除重复项返 `slow+1`、轮转先 `k%=n`、移动零用覆盖/交换保序。
- 加分：乘法用 `int[]` 累加再统一进位；轮转可用三次反转做到 O(1) 空间。

## 5. 常见误区汇总

| 错误说法 | 正确理解 | 一句话记忆锚点 |
| --- | --- | --- |
| DCL 的 volatile 可有可无 | volatile 是正确性必需，防对象创建指令重排导致半初始化对象 | 少 volatile 就等着拿半成品 |
| 饿汉式线程不安全 | 饿汉在类加载时创建，`<clinit>` 天然线程安全 | 饿汉最容易被冤枉 |
| 静态内部类靠 synchronized | 靠 JVM 类加载的 `<clinit>` 互斥，无显式锁 | Holder 的安全是类加载给的 |
| 枚举单例也怕反射 | 反射创建枚举时 JVM 抛 `IllegalArgumentException` | 枚举构造器，反射碰不得 |
| LongAdder 是 JDK 7 的 | JDK 8 新增（与 LongAccumulator 同批） | LongAdder 是 Java 8 的礼物 |
| LongAdder.sum() 精确 | 弱一致，并发下为近似值；要精确用 AtomicLong | sum 只保证吞吐对，不保证读得准 |
| 伪共享靠 volatile 解决 | 伪共享是缓存行问题，靠 `@Contended`/填充解决 | 伪共享填缓存行，与 volatile 无关 |
| wait 用 if 判条件就够 | 必须 while，防虚假唤醒与条件变化 | wait 循环判条件，if 是坑 |
| notify 能唤醒指定线程 | Object.notify 无法指定；精确唤醒用 Condition 多队列 | notify 是抽签，Condition 是点名 |
| 字符串反转用 char 交换就行 | 代理对（emoji）会被拆坏，需按 code point 处理 | char 不是字符，代理对会翻车 |
| 递归反转更优雅所以更好 | O(n) 栈深 + O(n²) 空间，长串栈溢出 | 优雅不等于安全 |
| 大数相加循环用 `i>=0 && j>=0` | 用 `i>=0 || j>=0 || carry!=0` 处理长度不等与最高进位 | 三个条件一个都不能少 |
| 删除重复项返回 slow | 应返回 `slow + 1`（slow 是下标） | 下标加一才是长度 |
| 轮转数组 k 不用取模 | k 可能大于 n，必须先 `k %= n` | 轮转先取模，否则越界 |
