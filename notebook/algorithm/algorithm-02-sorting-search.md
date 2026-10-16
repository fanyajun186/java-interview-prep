# 算法 · 排序与查找

> 一句话定位：排序是面试的「入场券」——考的不是默写，而是「复杂度 / 稳定性 / 原地性」三件套的推导，以及 JDK 为什么选这个不选那个。
> 版本前提：JDK 17

## 1. 题目清单

| 编号 | 题目 | 对应 LC 题号 | 难度 | 考察点 | 面试频率 |
| --- | --- | --- | --- | --- | --- |
| 1 | 冒泡排序（+两个优化） | — | 简单 | 交换、提前终止、最好 O(n) 的来源 | 中 |
| 2 | 选择排序 | — | 简单 | 恒定比较次数、不稳定、交换最少 | 中 |
| 3 | 插入排序 | — | 简单 | 小规模优势、稳定、二分插入优化点 | 高 |
| 4 | 快速排序（Hoare/Lomuto/三路） | LC 912 | 中等 | partition、随机化、重复元素退化、栈深 | 极高 |
| 5 | 归并排序 + 逆序对 | 剑指 Offer 51 | 中等 | 分治、稳定、O(n) 空间、逆序对计数 | 极高 |
| 6 | 堆排序 | — | 中等 | siftDown 建堆 O(n)、不稳定、cache | 高 |
| 7 | 二分查找（5 个变体） | 704/34/33/153/162/875 | 简单~中等 | 边界、区间定义、二分答案 | 极高 |
| 8 | TopK / 第 K 大 | LC 215 | 中等 | 小顶堆、Quick Select、BFPRT | 极高 |
| 9 | 十大排序总表 + Java 内置排序 | — | 中等 | DualPivotQuicksort vs TimSort | 高 |

> LC 912（排序数组）是小节综合题：手写快排/归并/堆排三选一即可，但要能解释为什么选它。

## 2. 十大排序总表（先看这个）

先记这张表，再看单题会顺很多。**n 为元素个数，k 为桶/计数排序的值域。**

| 排序 | 平均 | 最好 | 最坏 | 空间 | 稳定 | 原地 | 一句话记忆 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 冒泡 | O(n²) | O(n) | O(n²) | O(1) | 是 | 是 | 加 swapped 标志，最好 O(n) |
| 选择 | O(n²) | O(n²) | O(n²) | O(1) | 否 | 是 | 比较恒 n(n-1)/2，与数据无关 |
| 插入 | O(n²) | O(n) | O(n²) | O(1) | 是 | 是 | 近乎有序时接近 O(n) |
| 希尔 | O(n^1.3) | O(n) | O(n²) | O(1) | 否 | 是 | 增量序列决定复杂度 |
| 归并 | O(n log n) | O(n log n) | O(n log n) | O(n) | 是 | 否 | 唯一稳且恒 O(n log n)，代价是空间 |
| 快排 | O(n log n) | O(n log n) | O(n²) | O(log n) | 否 | 是 | 平均最快，最坏靠随机化规避 |
| 堆排 | O(n log n) | O(n log n) | O(n log n) | O(1) | 否 | 是 | 建堆 O(n)、原地、cache 不友好 |
| 计数 | O(n+k) | O(n+k) | O(n+k) | O(n+k) | 是 | 否 | 值域小才行，非比较排序 |
| 桶 | O(n+k) | O(n) | O(n²) | O(n+k) | 是 | 否 | 分桶后桶内排序，数据要均匀 |
| 基数 | O(d(n+k)) | O(d(n+k)) | O(d(n+k)) | O(n+k) | 是 | 否 | 按位从低到高排，d 为位数 |

**三件套速记**：
- **稳定性**：相等元素相对顺序是否保持。稳定的有「冒泡、插入、归并、计数、桶、基数」；快排/选择/堆排/希尔不稳定。
- **原地性**：是否 O(1) 额外空间。归并（O(n)）和计数/桶/基数出局。
- **下界**：基于**比较**的排序最坏下界是 Ω(n log n)（决策树有 n! 个叶子，深度 ≥ log₂(n!) = Θ(n log n)）。想突破必须用非比较排序。

## 3. 逐题详解

### 3.1 冒泡排序

- **考察点**：为什么最好情况是 O(n)？两个优化分别优化了什么？
- **思路**：① 每轮相邻两两比较，把最大的「冒」到末尾；第 i 轮后末尾 i 个已就位，内层只需到 `n-1-i`。② **优化 1（提前终止）**：某轮无任何交换说明已有序，直接结束——这是「最好 O(n)」的唯一来源。③ **优化 2**：记录本轮最后一次交换位置 `lastSwap`，其后已有序，下轮右边界收缩到 `lastSwap`。
- **Java 代码**：

```java
public class BubbleSort {
    public static void bubbleSortBasic(int[] a) {          // 朴素版
        for (int i = 0; i < a.length - 1; i++)
            for (int j = 0; j < a.length - 1 - i; j++)
                if (a[j] > a[j + 1]) swap(a, j, j + 1);
    }
    public static void bubbleSortEarlyExit(int[] a) {      // 优化 1：无交换即结束
        for (int i = 0; i < a.length - 1; i++) {
            boolean swapped = false;
            for (int j = 0; j < a.length - 1 - i; j++)
                if (a[j] > a[j + 1]) { swap(a, j, j + 1); swapped = true; }
            if (!swapped) return;                          // 已有序 → O(n)
        }
    }
    public static void bubbleSortLastSwap(int[] a) {       // 优化 2：收缩右边界
        int bound = a.length - 1;
        for (int i = 0; i < a.length - 1; i++) {
            boolean swapped = false; int lastSwap = 0;
            for (int j = 0; j < bound; j++)
                if (a[j] > a[j + 1]) { swap(a, j, j + 1); swapped = true; lastSwap = j; }
            if (!swapped) return;
            bound = lastSwap;                              // 之后部分已就位
        }
    }
    private static void swap(int[] a, int i, int j) { int t = a[i]; a[i] = a[j]; a[j] = t; }
    public static void main(String[] a) { int[] x = {5,2,9,1,5,6}; bubbleSortLastSwap(x); System.out.println(java.util.Arrays.toString(x)); }
}
```

- **复杂度**：比较最坏 = n(n-1)/2 → O(n²)；最好（有序 + 提前终止）= n-1 次 → O(n)；空间 O(1)；只在 `>` 时交换，相等不换 → **稳定**。
- **追问链**：
  - L1 概念：为什么最好 O(n)？→ 优化 1 的 `swapped` 标志让已有序数组一轮退出。
  - L2 机制：为什么不是 O(1)？→ 至少要扫一遍确认「无交换」，就得看 n 个元素。
  - L3 源码/参数：JDK 有冒泡吗？→ 没有。JDK 只在 TimSort / 双轴快排的小数组分支用**插入排序**，常数比冒泡小。
  - L4 场景取舍：优化后能替代插入排序吗？→ 不能。近乎有序时插入排序几乎不移动，冒泡仍要完整比较一遍。
  - L5 反例边界：优化 2 对什么最有效？→ 形如 `[1,2,…,n,0]`：第一轮把 0 冒到最前，`lastSwap=0`，后续 `bound=0` 立即结束。
- **常见错误 / 面试陷阱**：
  - 「冒泡最好 O(n)」→ 不加 `swapped` 优化时最好仍是 O(n²)，优化是前提。
  - 「冒泡天然稳定」→ 必须用严格 `>` 才交换；写 `>=` 会破坏稳定性。
- **变体**：鸡尾酒排序（双向冒泡）；LC 1051（高度检查器，数「需要移动的元素」）。

### 3.2 选择排序

- **考察点**：为什么永远 O(n²)？为什么不稳定？为什么交换次数最少？
- **思路**：① 每轮在未排序区间找最小值，与区间首元素交换。② **永远 O(n²)**：即使已有序，也要扫完整段去「确认」最小值，比较恒为 n(n-1)/2。③ **不稳定**：交换跨距离，例 `[2a,2b,1]` 把 1 与 2a 换位，得 `[1,2b,2a]`，两个 2 顺序被打乱。④ **交换最少**：每轮至多 1 次，总 ≤ n-1，适合「写代价 ≫ 比较代价」的场景。
- **Java 代码**：

```java
public class SelectionSort {
    public static void selectionSort(int[] a) {
        for (int i = 0; i < a.length - 1; i++) {
            int minIdx = i;
            for (int j = i + 1; j < a.length; j++)
                if (a[j] < a[minIdx]) minIdx = j;          // 只更下标，不交换
            if (minIdx != i) { int t = a[i]; a[i] = a[minIdx]; a[minIdx] = t; }
        }
    }
    public static void main(String[] a) { int[] x = {5,2,9,1,5,6}; selectionSort(x); System.out.println(java.util.Arrays.toString(x)); }
}
```

- **复杂度**：比较恒 n(n-1)/2 = O(n²)；交换 ≤ n-1 = O(n)；空间 O(1)；**不稳定**。
- **追问链**：
  - L1 概念：为什么最好也是 O(n²)？→ 找不到最小值就无法确定这一位放谁，必须扫完整段。
  - L2 机制：交换次数到底多少？→ 每轮至多 1 次、总 O(n)，这是它在「写昂贵」场景的唯一优势。
  - L3 源码/参数：能改成稳定吗？→ 可以，改成「找到最小值后逐个后移插入」（不交换），但就退化成插入排序。
  - L4 场景取舍：什么时候真用它？→ 几乎不用。它更多是「对比对象」，衬托快排/堆排。
  - L5 反例边界：`[1,2,3]` 有序，比较几次？→ 仍是 3 次（n(n-1)/2），只是不做交换。
- **常见错误 / 面试陷阱**：
  - 「选择排序稳定」→ 错。跨距离交换必然可能打乱相等元素（堆排序同理）。
  - 「交换最少所以最快」→ 错。它比较最多，仅当**交换代价 ≫ 比较代价**才划算。
- **变体**：双向选择排序（同时选最小和最大）；与堆排序对比「同样选极值，堆用 log 时间找到」。

### 3.3 插入排序

- **考察点**：小规模为什么快？稳定性怎么保证？二分插入优化的是什么（没优化什么）？
- **思路**：① 维护「已排序前缀」，把 `key` 向左比，比它大的右移一格，空位放 `key`。② **小规模优势**：常数小、无递归、cache 友好、近乎有序时移动极少，这正是 JDK 小数组退化到它的原因。③ **稳定**：用 `a[j] > key`（严格大于）才右移，停下时 `key` 插到相等元素之后。④ **二分插入优化的是「比较次数」**：找位置从 O(n) 降到 O(log n)，但**移动仍 O(n²)**，总体仍 O(n²)——经典陷阱题。
- **Java 代码**：

```java
public class InsertionSort {
    public static void insertionSort(int[] a) {
        for (int i = 1; i < a.length; i++) {
            int key = a[i], j = i - 1;
            while (j >= 0 && a[j] > key) a[j + 1] = a[j--];   // 严格大于 → 稳定
            a[j + 1] = key;
        }
    }
    public static void binaryInsertionSort(int[] a) {         // 二分插入
        for (int i = 1; i < a.length; i++) {
            int key = a[i], lo = 0, hi = i;                   // 在 [lo,hi) 找第一个 > key
            while (lo < hi) {
                int mid = lo + ((hi - lo) >>> 1);
                if (a[mid] <= key) lo = mid + 1;              // <= 保证稳定
                else hi = mid;
            }
            System.arraycopy(a, lo, a, lo + 1, i - lo);       // [lo,i-1] 右移
            a[lo] = key;
        }
    }
    public static void main(String[] a) { int[] x = {5,2,9,1,5,6}; binaryInsertionSort(x); System.out.println(java.util.Arrays.toString(x)); }
}
```

- **复杂度**：最坏移动 n(n-1)/2 → O(n²)；最好（有序）每元素比较 1 次、移动 0 次 → O(n)；空间 O(1)；稳定。
- **追问链**：
  - L1 概念：为什么近乎有序时快？→ 移动次数 = 逆序对数量，近乎有序时逆序对少，趋近 O(n)。
  - L2 机制：移动次数与什么成正比？→ 逆序对数量（求逆序对时还会用到这个事实）。
  - L3 源码/参数：JDK 哪里用了？→ TimSort 对长度 < `MIN_MERGE`(=32) 的 run 用二分插入；双轴快排也有 `INSERTION_SORT_THRESHOLD`。
  - L4 场景取舍：为什么快排/归并的小区间都退化到它？→ 小 n 时 O(n²) 与 O(n log n) 常数差被吃掉，而它常数最小、无递归。
  - L5 反例边界：二分插入能到 O(n log n) 吗？→ 不能，移动 O(n²) 主导；除非数据是链表（又失去随机访问）。
- **常见错误 / 面试陷阱**：
  - 「二分插入排序是 O(n log n)」→ 错，只优化比较，移动仍 O(n²)。
  - 「插入排序只适合小数据」→ 不严谨。**近乎有序**的大数据它也快。
- **变体**：二分插入；希尔排序（按增量分组做插入排序）。

### 3.4 快速排序

- **考察点**：Hoare 与 Lomuto 两种 partition、随机化 pivot 的必要性、重复元素退化、最坏 O(n²) 与栈深。
- **思路**：① **Lomuto**：取最右为 pivot，单指针把小于它的换到左边，好写，但对**已有序**或**大量重复**退化 O(n²)。② **Hoare**：双指针从两端向中间扫，各自停下再交换，交换更少、分区更均衡。③ **随机化 pivot**：随机取一个换到边界，使最坏依赖随机性而非输入，保证期望 O(n log n)，也能挫败「构造输入打爆快排」的攻击。④ **三路快排**：划分成 `< | == | >` 三段，重复元素一次到位不再递归——**处理大量重复元素的正解**。⑤ **最坏 O(n²) 与栈深**：每次只分出一个元素时递归深度 O(n)，时间 O(n²) 且**栈会爆**；随机化后期望深度 O(log n)。
- **Java 代码**：

```java
public class QuickSort {
    static int partitionLomuto(int[] a, int lo, int hi) {      // 单指针，pivot 取最右
        int pivot = a[hi], i = lo;
        for (int j = lo; j < hi; j++) if (a[j] < pivot) swap(a, i++, j);
        swap(a, i, hi);
        return i;
    }
    static int partitionHoare(int[] a, int lo, int hi) {       // 双向指针，返回分割点 j
        int pivot = a[lo + ((hi - lo) >>> 1)], i = lo - 1, j = hi + 1;
        while (true) {
            do { i++; } while (a[i] < pivot);
            do { j--; } while (a[j] > pivot);
            if (i >= j) return j;
            swap(a, i, j);
        }
    }
    static void quickSortHoare(int[] a, int lo, int hi) {      // 递归区间 [lo,j] 与 [j+1,hi]
        if (lo >= hi) return;
        int j = partitionHoare(a, lo, hi);
        quickSortHoare(a, lo, j); quickSortHoare(a, j + 1, hi);
    }
    static void quickSortRandom(int[] a, int lo, int hi) {     // 随机化 pivot
        if (lo >= hi) return;
        swap(a, lo, lo + (int) (Math.random() * (hi - lo + 1)));
        int p = partitionLomuto(a, lo, hi);
        quickSortRandom(a, lo, p - 1); quickSortRandom(a, p + 1, hi);
    }
    static void quickSort3Way(int[] a, int lo, int hi) {       // 三路：重复元素一次到位
        if (lo >= hi) return;
        int lt = lo, i = lo + 1, gt = hi, pivot = a[lo];
        while (i <= gt) {
            if (a[i] < pivot) swap(a, lt++, i++);
            else if (a[i] > pivot) swap(a, i, gt--);
            else i++;
        }
        quickSort3Way(a, lo, lt - 1); quickSort3Way(a, gt + 1, hi);
    }
    static void swap(int[] a, int i, int j) { int t = a[i]; a[i] = a[j]; a[j] = t; }
    public static void main(String[] a) { int[] x = {5,2,9,1,5,6,5,5}; quickSort3Way(x, 0, x.length - 1); System.out.println(java.util.Arrays.toString(x)); }
}
```

- **复杂度**：平均 T(n)=2T(n/2)+O(n)=O(n log n)；最坏 T(n)=T(n-1)+O(n)=O(n²)；递归栈平均 O(log n)、最坏 O(n)；原地、不稳定；期望比较次数 ≈ 2n ln n ≈ 1.39 n log₂n。
- **追问链**：
  - L1 概念：平均和最坏分别是多少？→ 平均 O(n log n)、最坏 O(n²)。
  - L2 机制：为什么最坏 O(n²)？→ 划分极不均衡退化成「减治」，T(n)=T(n-1)+O(n)。
  - L3 源码/参数：JDK 怎么选 pivot？→ 双轴快排用「五数取中」而非随机，省掉 `Math.random` 开销。
  - L4 场景取舍：三路 vs 随机二路？→ 重复多时三路显著更优（重复区不再递归）；重复少时随机二路常数更小。
  - L5 反例边界：全相同元素会怎样？→ 朴素二路 + Lomuto 每轮把 pivot 放边界 → O(n²)；三路一轮搞定为 O(n)。
- **常见错误 / 面试陷阱**：
  - 「快排最坏 O(n²) 所以不敢用」→ JDK 用了它（双轴），期望 O(n log n)、常数最小，取中后最坏概率极低。
  - 「Hoare 返回 pivot 位置」→ 错。返回的是**分割点 j**，递归区间是 `[lo,j]` 和 `[j+1,hi]`。
- **变体**：双轴快排（JDK `Arrays.sort(int[])`）；Introspective Sort（递归过深切堆排，C++ `std::sort`）。

### 3.5 归并排序（含逆序对）

- **考察点**：自顶向下/自底向上、稳定性、O(n) 空间、逆序对计数。
- **思路**：① **分治**：对半递归排序再 `merge` 两个有序段。② **自顶向下**递归到底；**自底向上**先两两合并再四四合并，用循环代替递归，省栈、适合链表。③ **稳定**：`merge` 相等时**先取左边**（`a[i] <= a[j]`）。④ **O(n) 空间**：需要等长的 `tmp` 数组——这也是「链表排序首选归并」的原因（链表 merge 可 O(1) 空间）。⑤ **逆序对**：`merge` 时若 `a[i] > a[j]`，则左半 `[i..mid]` 全部大于 `a[j]`，一次贡献 `mid-i+1` 个逆序对。
- **Java 代码**：

```java
public class MergeSort {
    static void mergeSort(int[] a) {                           // 自顶向下
        if (a != null && a.length > 1) sort(a, new int[a.length], 0, a.length - 1);
    }
    private static void sort(int[] a, int[] tmp, int lo, int hi) {
        if (lo >= hi) return;
        int mid = lo + ((hi - lo) >>> 1);
        sort(a, tmp, lo, mid); sort(a, tmp, mid + 1, hi);
        if (a[mid] <= a[mid + 1]) return;                     // 已有序跳过合并
        merge(a, tmp, lo, mid, hi);
    }
    private static int merge(int[] a, int[] tmp, int lo, int mid, int hi) {
        int i = lo, j = mid + 1, k = lo, cnt = 0;
        while (i <= mid && j <= hi) {
            if (a[i] <= a[j]) tmp[k++] = a[i++];              // <= 保证稳定
            else { cnt += mid - i + 1; tmp[k++] = a[j++]; }   // 逆序对：左半 [i..mid] 全 > a[j]
        }
        while (i <= mid) tmp[k++] = a[i++];
        while (j <= hi) tmp[k++] = a[j++];
        System.arraycopy(tmp, lo, a, lo, hi - lo + 1);
        return cnt;
    }
    static void mergeSortBU(int[] a) {                         // 自底向上，无递归
        int n = a.length; int[] tmp = new int[n];
        for (int len = 1; len < n; len <<= 1)
            for (int lo = 0; lo < n - len; lo += (len << 1))
                merge(a, tmp, lo, lo + len - 1, Math.min(lo + (len << 1) - 1, n - 1));
    }
    static int reversePairs(int[] a) {                         // 剑指 Offer 51
        return a == null || a.length < 2 ? 0 : mergeSortCount(a, new int[a.length], 0, a.length - 1);
    }
    private static int mergeSortCount(int[] a, int[] tmp, int lo, int hi) {
        if (lo >= hi) return 0;
        int mid = lo + ((hi - lo) >>> 1);
        int cnt = mergeSortCount(a, tmp, lo, mid) + mergeSortCount(a, tmp, mid + 1, hi);
        return cnt + merge(a, tmp, lo, mid, hi);              // merge 内已累计逆序对
    }
    public static void main(String[] a) { int[] x = {5,2,9,1,5,6}; mergeSort(x); System.out.println(java.util.Arrays.toString(x)); System.out.println(reversePairs(new int[]{7,5,6,4})); } // 5
}
```

- **复杂度**：T(n)=2T(n/2)+O(n)=O(n log n)，任何输入都一样；空间 O(n)（tmp）+ 递归栈 O(log n)；稳定。
- **追问链**：
  - L1 概念：归并最坏是多少？→ 恒 O(n log n)，不会像快排退化。
  - L2 机制：代价是什么？→ O(n) 空间，且缓存局部性不如快排（来回读写 tmp）。
  - L3 源码/参数：JDK 哪里用了？→ `TimSort`（`Arrays.sort(Object[])` / `Collections.sort`）本质是「归并 + 插入」，核心是识别天然有序 run 再归并。
  - L4 场景取舍：链表为什么用归并？→ 链表不能随机访问，快排 partition 失效；归并 merge 只需顺序访问、可 O(1) 空间。
  - L5 反例边界：逆序对为何用 `<=` 取左？→ 保证稳定；用 `<` 相等时取右会漏计/破坏稳定性。
- **常见错误 / 面试陷阱**：
  - 「归并是原地排序」→ 错，需要 O(n) 辅助数组。
  - 「逆序对要 O(n²)」→ 归并分治或树状数组/BIT 可 O(n log n)，注意用 `long` 防溢出（可达 n²/2）。
- **变体**：自底向上归并；归并求逆序对 / 求「右侧更小元素个数」（LC 315）。

### 3.6 堆排序

- **考察点**：siftDown 建堆 O(n) 的级数推导、排序阶段、不稳定、cache 不友好。
- **思路**：① **建堆**：从最后一个非叶子节点 `n/2-1` 往前，对每个节点 `siftDown`。② **为什么是 O(n)**：高度 h 的节点约 n/2^(h+1) 个，每个下沉代价 O(h)，总 Σ (n/2^(h+1))·h = O(n)（级数收敛）。直觉：绝大多数节点在底层，只需下移很少。③ **排序阶段**：反复把堆顶（最大）与末尾交换，堆规模减 1，再 `siftDown`，O(n log n)。④ **不稳定**：堆顶与末尾是远距离交换。⑤ **cache 不友好**：父子下标跳跃（`2i+1`），访问不连续。
- **Java 代码**：

```java
public class HeapSort {
    public static void heapSort(int[] a) {
        int n = a.length;
        for (int i = n / 2 - 1; i >= 0; i--) siftDown(a, i, n);   // 建堆：整体 O(n)
        for (int end = n - 1; end > 0; end--) {                   // 排序：O(n log n)
            swap(a, 0, end);
            siftDown(a, 0, end);
        }
    }
    private static void siftDown(int[] a, int root, int size) {   // 大顶堆下沉
        while (true) {
            int left = 2 * root + 1;
            if (left >= size) return;
            int largest = left, right = left + 1;
            if (right < size && a[right] > a[left]) largest = right;
            if (a[root] >= a[largest]) return;
            swap(a, root, largest);
            root = largest;                                       // 继续向下
        }
    }
    private static void swap(int[] a, int i, int j) { int t = a[i]; a[i] = a[j]; a[j] = t; }
    public static void main(String[] a) { int[] x = {5,2,9,1,5,6}; heapSort(x); System.out.println(java.util.Arrays.toString(x)); }
}
```

- **复杂度**：建堆 O(n)，排序 n 次 siftDown 各 O(log n) → 总 O(n log n)；空间 O(1)；原地、**不稳定**。
- **追问链**：
  - L1 概念：建堆为什么 O(n) 不是 O(n log n)？→ 自底向上 siftDown，多数节点在底层只下移常数步，Σ h·n/2^(h+1) 收敛到 O(n)。
  - L2 机制：为什么不用 siftUp 建堆？→ 从顶往下成本 Σ log i = O(n log n)，比 siftDown 差。
  - L3 源码/参数：父子下标？→ 0-based：左 `2i+1`、右 `2i+2`、父 `(i-1)/2`；`PriorityQueue` 就用它。
  - L4 场景取舍：堆排 vs 快排？→ 快排平均常数更小、cache 更友好；堆排胜在最坏也 O(n log n)、原地，且天然支持只取 TopK。
  - L5 反例边界：要降序？→ 建小顶堆，或建大顶堆排成升序再反转。
- **常见错误 / 面试陷阱**：
  - 「建堆是 O(n log n)」→ 错，是 O(n)，务必会推级数。
  - 「`PriorityQueue` 默认大顶堆」→ 错，**默认小顶堆**，大顶堆要传 `Comparator.reverseOrder()`。
- **变体**：TopK 用小顶堆（见 3.8）；数据流中位数用双堆；堆化已有数组。

### 3.7 二分查找（5 个变体）

- **考察点**：区间定义（闭 vs 半开）、左右边界、旋转数组、峰值、二分答案。
- **思路**：① **两种模板**：闭区间 `[lo,hi]` 配 `while(lo<=hi)`、收缩 `mid±1`；半开区间 `[lo,hi)` 配 `while(lo<hi)`、收缩 `hi=mid`。**选定一个全程一致**，混乱是 bug 之源。② **左右边界**：统一用「第一个 `>= target`」的 `lowerBound`，左边界 = `lowerBound(t)`，右边界 = `lowerBound(t+1)-1`。③ **旋转数组**：核心是「**必有半边有序**」，先判断哪半有序，再看 target 是否落在其中。④ **峰值**：`a[mid] > a[mid+1]` 说明峰值在左（含 mid）。⑤ **二分答案**：把「最小可行解」转成对答案区间的二分 + `check(mid)` 单调判定。
- **Java 代码**：

```java
public class BinarySearch {
    static int search(int[] a, int target) {                  // 模板 1：闭区间 [lo,hi]
        int lo = 0, hi = a.length - 1;
        while (lo <= hi) {
            int mid = lo + ((hi - lo) >>> 1);
            if (a[mid] == target) return mid;
            else if (a[mid] < target) lo = mid + 1;
            else hi = mid - 1;
        }
        return -1;
    }
    static int search2(int[] a, int target) {                 // 模板 2：左闭右开 [lo,hi)
        int lo = 0, hi = a.length;
        while (lo < hi) {
            int mid = lo + ((hi - lo) >>> 1);
            if (a[mid] < target) lo = mid + 1;
            else if (a[mid] > target) hi = mid;
            else return mid;
        }
        return -1;
    }
    static int lowerBound(int[] a, int target) {              // 第一个 >= target 的下标
        int lo = 0, hi = a.length;
        while (lo < hi) {
            int mid = lo + ((hi - lo) >>> 1);
            if (a[mid] < target) lo = mid + 1;
            else hi = mid;                                    // 答案在左侧（含 mid）
        }
        return lo;
    }
    static int[] searchRange(int[] a, int t) {                // LC 34 左右边界
        int left = lowerBound(a, t);
        if (left == a.length || a[left] != t) return new int[]{-1, -1};
        return new int[]{left, lowerBound(a, t + 1) - 1};
    }
    static int searchRotated(int[] a, int target) {           // LC 33 旋转数组
        int lo = 0, hi = a.length - 1;
        while (lo <= hi) {
            int mid = lo + ((hi - lo) >>> 1);
            if (a[mid] == target) return mid;
            if (a[lo] <= a[mid]) {                            // 左半 [lo,mid] 有序
                if (a[lo] <= target && target < a[mid]) hi = mid - 1;
                else lo = mid + 1;
            } else {                                          // 右半 [mid,hi] 有序
                if (a[mid] < target && target <= a[hi]) lo = mid + 1;
                else hi = mid - 1;
            }
        }
        return -1;
    }
    static int findMin(int[] a) {                             // LC 153 旋转数组最小值
        int lo = 0, hi = a.length - 1;
        while (lo < hi) {
            int mid = lo + ((hi - lo) >>> 1);
            if (a[mid] > a[hi]) lo = mid + 1;                 // 最小值在右半
            else hi = mid;                                    // 在左半（含 mid）
        }
        return a[lo];
    }
    static int findPeakElement(int[] a) {                     // LC 162 峰值
        int lo = 0, hi = a.length - 1;
        while (lo < hi) {
            int mid = lo + ((hi - lo) >>> 1);
            if (a[mid] > a[mid + 1]) hi = mid;                // 下坡 → 峰值在左（含 mid）
            else lo = mid + 1;                                // 上坡 → 在右
        }
        return lo;
    }
    static int minEatingSpeed(int[] piles, int h) {           // LC 875 二分答案
        int lo = 1, hi = 0;
        for (int p : piles) hi = Math.max(hi, p);
        while (lo < hi) {
            int mid = lo + ((hi - lo) >>> 1);
            if (canFinish(piles, mid, h)) hi = mid;           // 可行 → 试更小
            else lo = mid + 1;
        }
        return lo;
    }
    private static boolean canFinish(int[] piles, int speed, int h) {
        long hours = 0;
        for (int p : piles) hours += (p + speed - 1) / speed;  // 向上取整
        return hours <= h;
    }
    public static void main(String[] a) { System.out.println(search(new int[]{1,3,5,7,9}, 5)); System.out.println(searchRotated(new int[]{5,6,7,1,2,3,4}, 3)); System.out.println(findMin(new int[]{5,6,7,1,2,3,4})); System.out.println(minEatingSpeed(new int[]{3,6,7,11}, 8)); }
}
```

- **复杂度**：O(log n) 时间（二分答案 `check` 为 O(n)，总 O(n log(maxValue))）；迭代版空间 O(1)。
- **追问链**：
  - L1 概念：为什么 O(log n)？→ 每次排除一半，n → n/2 → … → 1，共 log₂n 次。
  - L2 机制：为何用 `lo + (hi-lo)/2` 而非 `(lo+hi)/2`？→ 防整型溢出（两者接近 `Integer.MAX_VALUE` 时会变负）。
  - L3 源码/参数：`>>> 1` 是什么？→ 无符号右移，等价除 2 向下取整，比 `/2` 更清晰表达取中点。
  - L4 场景取舍：两种模板怎么选？→ 求边界用半开 + `lowerBound` 更顺；关键是一致。
  - L5 反例边界：`while(lo<hi)` 里写 `lo=mid` 会怎样？→ **死循环**。`hi=lo+1` 时 `mid=lo`，必须写 `lo=mid+1`。
- **常见错误 / 面试陷阱**：
  - 「LC 33 用 `a[lo] < a[mid]` 判断有序」→ 区间剩两个元素（`lo==mid`）会判错，应写 `a[lo] <= a[mid]`。
  - 「LC 153 用 `a[mid] > a[lo]` 判断」→ 逻辑不对，判断最小值应比较 `a[mid]` 与 `a[hi]`。
  - 「二分只能用于有序数组」→ 只要有**单调性/可判定**就能二分（峰值、二分答案）。
- **变体**：LC 704/34/35（插入位置）/69（sqrt）/4（两有序数组中位数）/410（分割数组最大值）。

### 3.8 TopK / 第 K 大

- **考察点**：小顶堆 vs Quick Select vs BFPRT；海量/数据流为什么必须用堆。
- **思路**：① **全排序** O(n log n)，数据小可以但不体现思考。② **小顶堆**：维护大小 k 的**小顶堆**，堆满后遇比堆顶大就弹顶压入，堆顶即第 k 大，O(n log k)、空间 O(k)。③ **Quick Select**：基于 partition 只递归含目标下标的一半，平均 O(n)，但最坏可退 O(n²)。④ **BFPRT**：用「中位数的中位数」选 pivot，**最坏保证 O(n)**，代价是常数大。⑤ **海量/数据流为什么用堆**：数据放不下内存时 Quick Select 需要随机访问整段数据，做不到；堆只需 O(k) 空间、一次流式扫描。
- **Java 代码**：

```java
import java.util.PriorityQueue;
import java.util.Random;

public class TopK {
    static int findKthLargestHeap(int[] nums, int k) {          // 小顶堆 O(n log k)
        PriorityQueue<Integer> minHeap = new PriorityQueue<>(); // 默认小顶堆
        for (int x : nums) {
            minHeap.offer(x);
            if (minHeap.size() > k) minHeap.poll();             // 弹出最小的
        }
        return minHeap.peek();                                  // 堆顶 = 第 k 大
    }
    static final Random RND = new Random();
    static int findKthLargestQuickSelect(int[] nums, int k) {   // 平均 O(n)
        int target = nums.length - k, lo = 0, hi = nums.length - 1;
        while (lo < hi) {
            int p = partition(nums, lo, hi);
            if (p == target) return nums[p];
            else if (p < target) lo = p + 1;
            else hi = p - 1;
        }
        return nums[lo];
    }
    static int partition(int[] a, int lo, int hi) {
        swap(a, lo + RND.nextInt(hi - lo + 1), hi);
        int pivot = a[hi], i = lo;
        for (int j = lo; j < hi; j++) if (a[j] < pivot) swap(a, i++, j);
        swap(a, i, hi);
        return i;
    }
    static int findKthLargestBFPRT(int[] nums, int k) {         // 最坏 O(n)
        return select(nums, 0, nums.length - 1, nums.length - k);
    }
    private static int select(int[] a, int lo, int hi, int k) { // k 为升序下标
        if (lo == hi) return a[lo];
        int pivot = medianOfMedians(a, lo, hi), lt = lo, i = lo, gt = hi;
        while (i <= gt) {                                       // 三路划分
            if (a[i] < pivot) swap(a, lt++, i++);
            else if (a[i] > pivot) swap(a, i, gt--);
            else i++;
        }
        if (k < lt) return select(a, lo, lt - 1, k);
        if (k > gt) return select(a, gt + 1, hi, k);
        return pivot;
    }
    private static int medianOfMedians(int[] a, int lo, int hi) {  // 中位数的中位数
        int n = hi - lo + 1;
        if (n <= 5) { insertSort(a, lo, hi); return a[lo + n / 2]; }
        int g = (n + 4) / 5, med[] = new int[g];
        for (int i = 0; i < g; i++) {
            int s = lo + i * 5, e = Math.min(s + 4, hi);
            insertSort(a, s, e);
            med[i] = a[s + (e - s) / 2];
        }
        return select(med, 0, g - 1, g / 2);
    }
    private static void insertSort(int[] a, int lo, int hi) {
        for (int i = lo + 1; i <= hi; i++) {
            int key = a[i], j = i - 1;
            while (j >= lo && a[j] > key) a[j + 1] = a[j--];
            a[j + 1] = key;
        }
    }
    private static void swap(int[] a, int i, int j) { int t = a[i]; a[i] = a[j]; a[j] = t; }
    public static void main(String[] a) { int[] x = {3,2,1,5,6,4}; System.out.println(findKthLargestHeap(x, 2) + " " + findKthLargestQuickSelect(x, 2) + " " + findKthLargestBFPRT(x, 2)); } // 5 5 5
}
```

- **复杂度**：全排序 O(n log n)；小顶堆 O(n log k)、空间 O(k)；Quick Select 平均 O(n)、最坏 O(n²)；BFPRT 最坏 O(n)（pivot 保证 30%/70% 划分）、空间 O(log n)。
- **追问链**：
  - L1 概念：第 k 大为什么用小顶堆而非大顶堆？→ 小顶堆堆顶是「k 个候选里最小」，方便淘汰；大顶堆堆顶是最大，无法判断该扔谁。
  - L2 机制：Quick Select 为什么平均 O(n)？→ 每次只进一半：n + n/2 + n/4 + … = 2n = O(n)。
  - L3 源码/参数：`PriorityQueue` 默认什么堆？→ 小顶堆，要大顶堆传 `Comparator.reverseOrder()`。
  - L4 场景取舍：海量/数据流用哪个？→ 堆。Quick Select 需随机访问全数组，放不下内存就没法用；堆只需 O(k) 空间流式处理。
  - L5 反例边界：BFPRT 保证最坏 O(n)，为何工程少用？→ 每轮分组、排序、递归选 pivot 常数大；随机化 Quick Select 平均更快，`shuffle` 后最坏概率极低。
- **常见错误 / 面试陷阱**：
  - 「第 k 大用大顶堆弹 k 次」→ 那是取前 k 大（O(n + k log n)），只求第 k 大的值用小顶堆更省。
  - 「Quick Select 是 O(n log n)」→ 错，平均 O(n)，因为它不递归整个数组。
- **变体**：LC 347（前 K 个高频元素，桶排序也可）、LC 692（前 K 个高频单词）、数据流中位数（双堆）。

### 3.9 十大排序总表 + Java 内置排序

- **考察点**：`Arrays.sort(int[])` 与 `Arrays.sort(Object[])` 用的算法为何不同、稳定性差异、阈值退化。
- **思路**：① **`Arrays.sort(int[])`** 用 **双轴快排（DualPivotQuicksort）**，**不稳定**；基本类型的「相等」无法被观察，稳定与否无意义，故选常数更小的快排。② **`Arrays.sort(Object[])` / `Collections.sort`** 用 **TimSort**，**稳定**；对象相等时可能有可观察语义（订单按金额排，同金额需保留原先后）。③ **阈值退化**：两者在小数组（TimSort 的 `MIN_MERGE = 32`；双轴快排插入阈值约 47，随版本/类型不同）都**退化成插入排序**。④ **`Arrays.parallelSort`** 用 ForkJoin 分治并行，大数组才划算。
- **Java 代码**（验证稳定性差异）：

```java
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

public class JdkSortBehavior {
    public static void main(String[] args) {
        int[] a = {5, 2, 9, 1, 5, 6};
        Arrays.sort(a);                                   // DualPivotQuicksort，稳定与否无法观察
        System.out.println(Arrays.toString(a));           // [1, 2, 5, 5, 6, 9]
        Integer[] b = {5, 2, 9, 1, 5, 6};
        Arrays.sort(b);                                   // TimSort，稳定
        System.out.println(Arrays.toString(b));           // [1, 2, 5, 5, 6, 9]
        String[] arr = {"b1", "a1", "b2", "a2"};
        Arrays.sort(arr, Comparator.comparing(s -> s.charAt(0)));   // 稳定：相等保持原顺序
        System.out.println(Arrays.toString(arr));         // [a1, a2, b1, b2]
        List<Integer> list = Arrays.asList(3, 1, 2);
        list.sort(Comparator.naturalOrder());             // 内部走 Arrays.sort(Object[])
        System.out.println(list);                         // [1, 2, 3]
    }
}
```

- **复杂度**：TimSort 最坏 O(n log n)、最好 O(n)（已有序 run）；双轴快排平均 O(n log n)、理论最坏 O(n²)（有计数/插入兜底，实际几乎不退化）。
- **追问链**：
  - L1 概念：为什么基本类型用快排、对象用归并？→ 基本类型不需要稳定、快排常数小；对象需要稳定，TimSort 稳定。
  - L2 机制：TimSort 的 `MIN_MERGE`？→ 32，小于它直接二分插入排序。
  - L3 源码/参数：TimSort 两个核心步骤？→ 找 run（天然升/降序段）+ 归并；run 太短则扩展并插入排序。
  - L4 场景取舍：`List.sort` 与 `Collections.sort` 一样吗？→ JDK 8 起 `Collections.sort` 委托 `List.sort`，最终都走 `Arrays.sort(Object[])` → TimSort。
  - L5 反例边界：JDK 7 后 `Arrays.sort(Comparator)` 为何不再抛 `IllegalArgumentException`？→ 改用 TimSort 后对违反比较器契约的情形容忍度更高（仍是未定义行为）。
- **常见错误 / 面试陷阱**：
  - 「`Arrays.sort(int[])` 是快排，对象数组也是快排」→ 不一样，对象数组走 TimSort。
  - 「`Collections.sort` 用快排」→ 错，用 TimSort。
  - 「`Arrays.sort` 最坏一定 O(n log n)」→ 对 TimSort 成立；`int[]` 理论最坏 O(n²)，但实际罕见。
- **变体**：`Arrays.parallelSort`（ForkJoin 并行）；`TreeMap`/`TreeSet`（红黑树有序）；`PriorityQueue`（堆）。

## 4. 面试问法与答题框架

1. **「手写一个快排吧。」**
   - ① 先声明区间模板（闭/半开）并全程一致；② 明确 partition 用哪种（Lomuto 好写、Hoare 更快）；③ 写清递归终止条件 `lo >= hi`；④ 主动提随机化；⑤ 指出重复多时改三路。
   - 加分：「元素有大量重复时我会用三路快排，把等于 pivot 的一段一次处理掉，避免重复递归导致 O(n²)。」

2. **「快排最坏 O(n²)，为什么 JDK 还用快排？」**
   - ① 最坏只在极端不均衡划分时出现；② 随机化/取中后期望 O(n log n)，最坏概率极低；③ 常数最小、cache 友好、原地 O(log n) 空间；④ JDK 用双轴快排并配插入排序兜底。
   - 加分：「JDK 的对象排序反而用 TimSort，因为对象需要稳定；`int[]` 不需要稳定才选快排。」

3. **「建堆为什么是 O(n)？」**
   - ① 从 `n/2-1` 往前 siftDown；② 高度 h 的节点约 n/2^(h+1) 个，下沉代价 O(h)；③ 求和 Σ h·n/2^(h+1) = O(n)，级数收敛；④ 对比 siftUp 建堆是 O(n log n)。
   - 加分：「直觉是绝大多数节点在底层，只需下移很少几步，加权后总代价线性。」

4. **「归并和快排怎么选？」**
   - ① 归并稳定、恒 O(n log n)，代价 O(n) 空间；② 快排原地、常数小、期望快，但不稳定、最坏 O(n²)；③ 要稳定 → 归并/TimSort；④ 要原地 → 快排；⑤ 链表 → 归并；⑥ 外部排序 → 归并。
   - 加分：「链表排序首选归并，因为链表不能随机访问，快排 partition 失效，而归并只需顺序访问、可 O(1) 空间。」

5. **「第 K 大有哪些解法？」**
   - ① 全排序 O(n log n)；② 小顶堆 O(n log k)；③ Quick Select 平均 O(n)；④ BFPRT 最坏 O(n)；⑤ 海量数据/数据流只能用堆。
   - 加分：「数据流场景堆是唯一选择，O(k) 空间、单次流式扫描，Quick Select 需要随机访问整段数据做不到。」

6. **「二分怎么写才不会死循环？」**
   - ① 先定区间语义（闭/半开）；② `mid` 用 `lo + (hi-lo)/2` 防溢出；③ 收缩时保证区间**严格缩小**；④ `while(lo<hi)` 配 `lo=mid+1` / `hi=mid`；⑤ 求边界用「第一个 >= target」的统一写法。
   - 加分：「我用左闭右开 + 求边界模板，把『找值』和『找边界』统一成查找第一个满足条件的位置，减少出错。」

7. **「排序的稳定性为什么重要？」**
   - ① 多关键字排序（先按 A 排再按 B 排）；② 稳定排序能保留上一轮结果；③ 对象排序必须稳定（JDK 对象用 TimSort）；④ 基本类型无所谓；⑤ 稳定的：冒泡、插入、归并、计数、桶、基数。
   - 加分：「多字段排序时，我从最次要字段开始依次排序，最后一次主字段排序就能得到正确结果——靠的就是稳定。」

8. **「求逆序对怎么做？」**
   - ① 暴力 O(n²) 不行（n 可达 5 万级）；② 归并分治：merge 时 `a[i] > a[j]` 则贡献 `mid-i+1`；③ 树状数组/线段树也可；④ O(n log n)；⑤ 用 `long` 防溢出（逆序对可达 n²/2）。
   - 加分：「关键在 merge 那一步：右半的 `a[j]` 一旦比左半的 `a[i]` 小，说明左半从 i 到 mid 全大于它，一次加 `mid-i+1`。」

9. **「堆排序比快排慢，为什么还要学？」**
   - ① 最坏也是 O(n log n)，无退化风险；② O(1) 空间、原地；③ 天然支持动态 TopK / 数据流；④ 缺点：cache 不友好、常数大；⑤ `PriorityQueue` 就是堆。
   - 加分：「堆排序的价值是『确定性』——没有最坏退化，且能一直维护一个动态的最小/最大值，快排做不到。」

10. **「二分答案是什么套路？」**
    - ① 找出「答案单调」——答案越大越容易可行；② 枚举答案区间 `[lo, hi]`；③ 写 `check(mid)` 判定可行性；④ 二分找最小/最大可行解；⑤ 注意 `check` 内的溢出与向上取整。
    - 加分：「难点不在二分，而在识别『可行性随答案单调』，比如珂珂吃香蕉，速度越快越容易在 h 小时内吃完。」

## 5. 常见误区汇总

| 错误说法 | 正确理解 | 一句话记忆锚点 |
| --- | --- | --- |
| 冒泡排序最好情况是 O(n) | 只有加了「无交换即结束」标志且数组已有序时才 O(n) | 优化才 O(n)，朴素仍 O(n²) |
| 选择排序不稳定 | 稳定，但远距离交换可能打乱相等元素 | 选择排序：比较恒定、交换最少、不稳定 |
| 插入排序只有小数据才快 | 近乎有序的大数据也快，移动次数 = 逆序对数 | 越有序越快，理想 O(n) |
| 二分插入排序是 O(n log n) | 只把比较降到 O(n log n)，移动仍 O(n²) | 优化的是比较，不是移动 |
| 快排最坏 O(n²) 就该弃用 | 随机化后期望 O(n log n)，JDK 基本类型就用双轴快排 | 期望快、常数小才是关键 |
| Hoare partition 返回 pivot 位置 | 返回的是分割点 j，递归区间是 [lo,j] 与 [j+1,hi] | Hoare 返分割点，不是 pivot 位置 |
| 归并排序是原地排序 | 需要 O(n) 辅助数组 | 归并：稳、恒 n log n、费 O(n) 空间 |
| 归并排序不稳定 | merge 相等时先取左边即稳定 | 稳定靠 `a[i] <= a[j]` 先取左 |
| 堆排序建堆是 O(n log n) | 自底向上 siftDown 建堆是 O(n) | 建堆 O(n)，排序才 O(n log n) |
| PriorityQueue 默认大顶堆 | 默认小顶堆，大顶堆要传 Comparator | PriorityQueue 默认小顶堆 |
| 二分查找只能用在有序数组 | 有单调性/可判定就能二分（峰值、二分答案） | 二分的本质是「单调可判定」 |
| `mid = (lo + hi) / 2` 没问题 | 可能整型溢出，应用 `lo + (hi - lo) / 2` | 求中点先防溢出 |
| `Arrays.sort(int[])` 用归并/TimSort | 用双轴快排（不稳定），对象才用 TimSort（稳定） | 基本类型快排，对象 TimSort |
| 第 K 大要用大顶堆 | 小顶堆维护 k 个候选，堆顶即第 k 大 | 求第 K 大用小顶堆 |
