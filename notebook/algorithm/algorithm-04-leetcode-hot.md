# 算法 · 力扣高频题
> 面试导向的 9 道高频题精讲：套路识别、可提交 Java 代码、追问链与边界陷阱。
> 版本前提：JDK 17。为省篇幅，代码省略 `import`；LeetCode 判题环境已自动引入 `java.util.*` 等常用类，本地编译请自行补 import。

## 1. 题目清单
| 编号 | 题目 | LC 题号 | 难度 | 核心套路 | 面试频率 |
| --- | --- | --- | --- | --- | --- |
| 1 | 两数之和 | 1 | Easy | 哈希表（值→下标） | 极高（热身必问） |
| 2 | 三数之和 | 15 | Medium | 排序 + 双指针 + 三处去重 | 极高 |
| 3 | 四数之和 | 18 | Medium | 双层枚举 + 双指针泛化 | 高 |
| 4 | 无重复字符的最长子串 | 3 | Medium | 滑动窗口（最长） | 极高 |
| 5 | 最小覆盖子串 | 76 | Hard | 滑动窗口（最短） | 高 |
| 6 | 最长回文子串 | 5 | Medium | 中心扩展 / 区间 DP | 极高 |
| 7 | 合并区间 | 56 | Medium | 排序 + 贪心扫描 | 极高 |
| 8 | 买卖股票 I / II | 121 / 122 | Easy/Medium | 贪心 / 状态机 DP | 极高 |
| 9 | 买卖股票（手续费 / 冷冻期） | 714 / 309 | Medium | 状态机 DP | 高 |
| 10 | 爬楼梯 | 70 | Easy | 线性 DP + 滚动数组 | 极高 |
| 11 | 零钱兑换 | 322 | Medium | 完全背包 DP | 极高 |
| 12 | 最长递增子序列 | 300 | Medium | DP / 贪心 + 二分 tails | 极高 |
| 13 | 岛屿数量 | 200 | Medium | DFS / BFS / 并查集 | 极高 |
| 14 | 滑动窗口最大值 | 239 | Hard | 单调队列 | 极高 |
| 15 | 每日温度 | 739 | Medium | 单调栈 | 高 |
| 16 | 接雨水 | 42 | Hard | 单调栈 / 双指针 | 极高 |

> 题号 1/2/3（两数→三数→四数之和）合并为「3.1」；题号 8/9 同属买卖股票母题，合并为「3.5」；题号 10/11/12 合并为「3.6」。

## 2. 五大高频套路（先看这个）
面试先**报套路名再写代码**：面试官能立刻确认你站在正确思路上。

### 2.1 双指针
- **识别信号**：有序 / 排序后可用；求「对、组、区间」满足条件；返回**元素值**而非原始下标。无序要双指针必须先排序；一旦排序**原始下标丢失**，故「返回下标」类题（LC 1）不能排序。
- **骨架**（有序数组对撞）：
```java
int l = 0, r = n - 1;
while (l < r) {
    int sum = nums[l] + nums[r];
    if (sum == target) { /* 收集 */ l++; r--; }
    else if (sum < target) l++;
    else r--;
}
```

### 2.2 滑动窗口
- **识别信号**：连续子数组 / 子串；求最长、最短、恰好满足条件。`left` 只增不减 → 均摊 O(n)。
- **骨架**：
```java
int left = 0;
for (int right = 0; right < n; right++) {
    // 1. 扩张：纳入 nums[right]
    while (/* 窗口不满足约束 */) { /* 2. 收缩：移除 nums[left]，left++ */ }
    // 3. 更新答案（最长类在此，最短类放 while 内）
}
```

### 2.3 二分
- **识别信号**：有序 / 单调 / 「最小化最大值」「最大化最小值」/ 查找边界。用循环不变式而非死记加减一。
- **骨架**（左闭右开，找第一个 ≥ target）：
```java
int l = 0, r = n;              // [l, r)
while (l < r) {
    int mid = l + (r - l) / 2; // 防 l+r 溢出
    if (nums[mid] < target) l = mid + 1;
    else r = mid;
}
return l;                      // 第一个 >= target 的位置
```

### 2.4 动态规划
- **识别信号**：求最优 / 计数；有重叠子问题。**四步走**：① 定义 `dp[i]` 含义 → ② 状态转移 → ③ 初始化与边界 → ④ 遍历顺序（**顺序错，答案错**，见零钱兑换）。
- **骨架**：
```java
int[] dp = new int[n + 1];
for (int i = 1; i <= n; i++)
    for (int c : choices) dp[i] = /* 由 dp[i - c] 等推出 */;
```

### 2.5 单调栈 / 单调队列
- **识别信号**：求「下一个更大 / 更小元素」→ 单调栈；求「窗口最值」→ 单调队列。每元素至多入栈一次、出栈一次 → 摊还 O(n)。
- **骨架**（下一个更大元素）：
```java
Deque<Integer> stack = new ArrayDeque<>(); // 存下标
for (int i = 0; i < n; i++) {
    while (!stack.isEmpty() && nums[i] > nums[stack.peek()]) {
        int idx = stack.pop();  // nums[i] 即 nums[idx] 的下一个更大
    }
    stack.push(i);
}
```

## 3. 逐题详解

### 3.1 两数之和 / 三数之和
- **考察点**：哈希「空间换时间」；排序去重；双指针泛化；`int` 溢出防护。
- **思路**：暴力 O(n²) 作基线。突破口——对 `nums[i]` 要找的是 `target - nums[i]`，「查找某值是否存在」用哈希把内层 O(n) 降到 O(1)。**两数之和为什么不能排序双指针**：题目要返回**原始下标**，排序会打乱下标且还原成本高，故用 `Map<值,下标>`。三数/四数之和只要求返回**元素组合**，所以**先排序**：有序即可对撞双指针，把「k 数之和」泛化为「固定 k-2 个数 + 内层两数双指针」，总复杂度 O(n^{k-1})（三数 O(n²)、四数 O(n³)）。
- **Java 代码（LC 1）**：
```java
class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> map = new HashMap<>(); // 值 -> 下标
        for (int i = 0; i < nums.length; i++) {
            int need = target - nums[i];
            if (map.containsKey(need)) return new int[]{map.get(need), i}; // 先查再放，防自配对
            map.put(nums[i], i);
        }
        return new int[]{-1, -1};
    }
}
```
- **Java 代码（LC 15，三处去重点透）**：
```java
class Solution {
    public List<List<Integer>> threeSum(int[] nums) {
        List<List<Integer>> res = new ArrayList<>();
        Arrays.sort(nums);                        // 排序：双指针与去重的前提
        int n = nums.length;
        for (int i = 0; i < n - 2; i++) {
            if (nums[i] > 0) break;               // 剪枝：最小数为正，凑不出 0
            if (i > 0 && nums[i] == nums[i - 1]) continue;   // 去重①：固定数
            int l = i + 1, r = n - 1;
            while (l < r) {
                int sum = nums[i] + nums[l] + nums[r];
                if (sum == 0) {
                    res.add(Arrays.asList(nums[i], nums[l], nums[r]));
                    while (l < r && nums[l] == nums[l + 1]) l++; // 去重②：左指针
                    while (l < r && nums[r] == nums[r - 1]) r--; // 去重③：右指针
                    l++; r--;                     // 去重完成后才移动，顺序不能反
                } else if (sum < 0) l++;          // 和太小，左移
                else r--;                         // 和太大，右移
            }
        }
        return res;
    }
}
```
- **复杂度**：LC 1 时间 O(n)、空间 O(n)。LC 15 排序 O(n log n) + 枚举 O(n²) = **O(n²)**，额外空间 O(1)。
- **追问链**：L1「为何用哈希表？」→ 空间换时间，查找补数 O(1)；L2「先查 `need` 再 `put` 能反吗？」→ 不能，反了会把自己当配对（`target=2*nums[i]` 返回 `[i,i]`）；L3「`Arrays.asList` 可变吗？」→ 定长视图，`add/remove` 抛 `UnsupportedOperationException`；
  L4「重复元素怎么存？」→ LC 1 存最新下标（`put` 覆盖），要返回所有下标记法则用 `Map<值,List<下标>>`；L5「`[0,0,0,0]`？」→ 只输出一个 `[0,0,0]`，三处去重共同生效。
- **常见错误 / 陷阱**：
  - 错误说法「三数之和用哈希更简单」→ 正确理解：哈希法去重更难（需 `Set<List<Integer>>`），常数更大；排序双指针是主流。
  - 错误说法「三数之和不能排序」→ 正确理解：该题**不要求下标**，排序正解；只有 LC 1 这类要下标的才不能排序。
- **变体**：LC 16 最接近的三数之和。

- **四数之和（LC 18，泛化模板）**：内核同「排序 + 对撞双指针」——外层枚举两数 + 内层两数双向指针，复杂度 O(n³)；四数求和须转 `long` 防溢出；去重在两层各加一次。
- **Java 代码（LC 18）**：
```java
class Solution {
    public List<List<Integer>> fourSum(int[] nums, int target) {
        List<List<Integer>> res = new ArrayList<>();
        Arrays.sort(nums);
        int n = nums.length;
        for (int i = 0; i < n - 3; i++) {
            if (i > 0 && nums[i] == nums[i - 1]) continue;          // 去重①
            for (int j = i + 1; j < n - 2; j++) {
                if (j > i + 1 && nums[j] == nums[j - 1]) continue;  // 去重②
                int l = j + 1, r = n - 1;
                while (l < r) {
                    long sum = (long) nums[i] + nums[j] + nums[l] + nums[r]; // 防溢出
                    if (sum == target) {
                        res.add(Arrays.asList(nums[i], nums[j], nums[l], nums[r]));
                        while (l < r && nums[l] == nums[l + 1]) l++; // 去重③
                        while (l < r && nums[r] == nums[r - 1]) r--; // 去重④
                        l++; r--;
                    } else if (sum < target) l++;
                    else r--;
                }
            }
        }
        return res;
    }
}
```
- **LC 18 复杂度**：时间 **O(n³)**（两层枚举 × 双指针 O(n)）；空间 O(1)。
- **追问链**：L1「最快复杂度？」→ O(n³)，本质「固定 k-1 个数 + 双指针」；L2「为何要 `(long)`？」→ 四数之和可达 4×10⁹，超 `int` 上限会溢出；L3「`Arrays.asList` 泛型？」→ 自动装箱，返回 `List<Integer>`；
  L4「k 数之和通解？」→ 递归固定一个数 + 内部 k-1 数之和，递归基为两数双指针；L5「去重②为何 `j > i+1`？」→ 保证在本层首元素之后才比较前一个，避免误跳首位。
- **常见错误 / 陷阱**：
  - 错误说法「四数之和不需要 long」→ 正确理解：int 计算会溢出，必须转 long。
  - 错误说法「排序后去重可省」→ 正确理解：不去重会产出大量重复解，属正确性要求。
- **变体**：k 数之和通解；LC 16。

### 3.2 无重复字符的最长子串（LC 3）与最小覆盖子串（LC 76）
- **考察点**：可变长滑动窗口；窗口合法性判定；计数技巧。
- **思路**：LC 3 右指针扩张，若该字符上次出现位置 **≥ left**（在当前窗口内重复），把 `left` 跳到上次位置 +1。LC 76 用计数判断窗口是否覆盖 `t`，覆盖时**在 while 内**收缩并更新最短答案。差异：最长类在 while **外**更新、最短类在 while **内**更新。
- **Java 代码（LC 3）**：
```java
class Solution {
    public int lengthOfLongestSubstring(String s) {
        Map<Character, Integer> last = new HashMap<>(); // 字符 -> 最后出现下标
        int left = 0, max = 0;
        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            if (last.containsKey(c) && last.get(c) >= left) left = last.get(c) + 1; // 收缩
            last.put(c, right);
            max = Math.max(max, right - left + 1);
        }
        return max;
    }
}
```
- **Java 代码（LC 76）**：
```java
class Solution {
    public String minWindow(String s, String t) {
        if (s == null || t == null || s.length() < t.length()) return "";
        Map<Character, Integer> need = new HashMap<>(), window = new HashMap<>();
        for (char c : t.toCharArray()) need.merge(c, 1, Integer::sum);
        int required = need.size();          // 需覆盖的字符种类数
        int left = 0, start = 0, minLen = Integer.MAX_VALUE, formed = 0;
        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            window.merge(c, 1, Integer::sum);
            if (need.containsKey(c) && window.get(c).equals(need.get(c))) formed++;
            while (formed == required) {     // 已覆盖，尝试收缩
                if (right - left + 1 < minLen) { minLen = right - left + 1; start = left; } // 最短类在 while 内更新
                char d = s.charAt(left);
                window.merge(d, -1, Integer::sum);
                if (need.containsKey(d) && window.get(d) < need.get(d)) formed--;
                left++;
            }
        }
        return minLen == Integer.MAX_VALUE ? "" : s.substring(start, start + minLen);
    }
}
```
- **复杂度**：两题均 **O(n)**（指针各扫一遍），空间 O(字符集)。
- **追问链**：L1「窗口合法性怎么刻画？」→ LC 3 看「有无重复」，LC 76 看「字符种类计数达标」；L2「LC 3 为何判 `last.get(c) >= left`？」→ 上次位置在 left 左侧说明已不在窗口，无需收缩；L3「LC 3 能优化吗？」→ ASCII 场景用 `int[128]` 替代 HashMap，常数更小；
  L4「含 Unicode 怎么办？」→ 用 `Map<Character,Integer>`，`int[128]` 不够；L5「空串 / `"bbbb"` / 单字符？」→ 返回 0 / 1 / 1。
- **常见错误 / 陷阱**：
  - 错误说法「LC 3 的 left 无脑取 `last+1`」→ 正确理解：必须判 `last.get(c) >= left`，否则 left 会回退。
  - 错误说法「LC 76 记录剩余字符总数即可」→ 正确理解：可用但需处理重复计数，用「达标种类数」更直观。
- **变体**：LC 340 至多 K 个不同字符的最长子串；LC 438 找到所有字母异位词；LC 727 最小窗口子序列。

### 3.3 最长回文子串（LC 5）
- **考察点**：中心扩展；区间 DP；Manacher（了解）。
- **思路**：回文有两种中心——奇数（单字符 `i,i`）、偶数（双字符 `i,i+1`），共 2n−1 个中心。枚举中心向两侧扩展取最长。
- **Java 代码（中心扩展）**：
```java
class Solution {
    public String longestPalindrome(String s) {
        if (s == null || s.length() < 1) return "";
        int start = 0, end = 0;
        for (int i = 0; i < s.length(); i++) {
            int len = Math.max(expand(s, i, i), expand(s, i, i + 1)); // 奇/偶中心
            if (len > end - start) {
                start = i - (len - 1) / 2;
                end = i + len / 2;
            }
        }
        return s.substring(start, end + 1);
    }
    private int expand(String s, int l, int r) {
        while (l >= 0 && r < s.length() && s.charAt(l) == s.charAt(r)) { l--; r++; }
        return r - l - 1; // 循环末两侧各越界一步
    }
}
```
- **Java 代码（区间 DP）**：`dp[i][j]` = `s[i..j]` 是否回文；`dp[i][j] = (s[i]==s[j]) && (j-i<2 || dp[i+1][j-1])`，按**区间长度**升序遍历。
```java
class Solution {
    public String longestPalindrome(String s) {
        int n = s.length();
        if (n < 2) return s;
        boolean[][] dp = new boolean[n][n];
        int start = 0, maxLen = 1;
        for (int i = 0; i < n; i++) dp[i][i] = true;
        for (int len = 2; len <= n; len++) {          // 按长度升序，保证子区间先算
            for (int i = 0; i + len - 1 < n; i++) {
                int j = i + len - 1;
                dp[i][j] = s.charAt(i) == s.charAt(j) && (len == 2 || dp[i + 1][j - 1]);
                if (dp[i][j] && len > maxLen) { maxLen = len; start = i; }
            }
        }
        return s.substring(start, start + maxLen);
    }
}
```
- **复杂度**：中心扩展 O(n²) 时间 / O(1) 空间；DP O(n²) 时间 / O(n²) 空间。**Manacher** 可 O(n)，面试**提及即可**，一般不要求手写。
- **追问链**：L1「为什么两种中心？」→ 偶数回文没有单一中心字符；L2「`expand` 返回 `r-l-1`？」→ 循环结束时两侧各越界一步；L3「DP 为何按长度升序？」→ `dp[i][j]` 依赖更短的 `dp[i+1][j-1]`；
  L4「超长串选哪个？」→ 中心扩展省空间，要 O(n) 用 Manacher；L5「`"cbbd"` / `"a"` / 空串？」→ `"bb"` / `"a"` / `""`。
- **常见错误 / 陷阱**：
  - 错误说法「只枚举奇数中心」→ 正确理解：会漏「bb」「abba」等偶数回文。
  - 错误说法「DP 按 i、j 双层循环即可」→ 正确理解：必须按区间长度遍历。
- **变体**：LC 647 回文子串计数；LC 516 最长回文子序列；LC 132 分割回文串 II。

### 3.4 合并区间（LC 56）
- **考察点**：排序 + 贪心；区间重叠判定；数组↔List 转换。
- **思路**：按**左端点升序**排序后，重叠关系局部化——只需比较当前区间左端与已合并区间右端。重叠则合并（右端取 `max`），否则追加。
- **Java 代码**：
```java
class Solution {
    public int[][] merge(int[][] intervals) {
        if (intervals.length == 0) return new int[0][];
        Arrays.sort(intervals, (a, b) -> Integer.compare(a[0], b[0])); // 按左端点排序
        List<int[]> res = new ArrayList<>();
        res.add(intervals[0]);
        for (int i = 1; i < intervals.length; i++) {
            int[] cur = intervals[i], last = res.get(res.size() - 1);
            if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]); // 重叠，右端取 max
            else res.add(cur);                                          // 不重叠，追加
        }
        return res.toArray(new int[res.size()][]);
    }
}
```
- **复杂度**：时间 **O(n log n)**（排序主导），空间 O(n)。
- **边界条件**：空数组返回 `new int[0][]`（不能 `null`）；单区间原样返回；完全包含 `[1,10]+[2,3]` → `[1,10]`（**必须取 max**）；端点相接 `[1,2]+[2,3]` → 视为重叠（`cur[0] <= last[1]` 含 `=`）。
- **追问链**：L1「为何排序降复杂度？」→ 重叠关系局部化，扫描即可；L2「右端为何取 max？」→ 新区间可能被完全包含，直接覆盖会丢长右端；L3「比较器为何用 `Integer.compare`？」→ 避免 `a[0]-b[0]` 极端值溢出；
  L4「数据近乎有序？」→ 可插入/归并思路，一般排序即可；L5「`[[1,4],[0,2],[3,5]]`？」→ 排序后 `[[0,2],[1,4],[3,5]]`，结果 `[[0,5]]`。
- **常见错误 / 陷阱**：
  - 错误说法「`last[1] = cur[1]`」→ 正确理解：必须 `max`，否则被包含的小区间会缩短结果。
  - 错误说法「端点相接不算重叠」→ 正确理解：LC 56 中 `<=` 即重叠。
- **变体**：LC 57 插入区间；LC 435 无重叠区间；LC 452 引爆气球。

### 3.5 买卖股票的最佳时机（LC 121 / 122 / 714 / 309）
- **考察点**：贪心；状态机 DP；状态定义与滚动。
- **思路（LC 121）**：维护「历史最低买点」，每天尝试以今日价卖出求利润。**贪心成立**：只准一次买卖，最优必为「历史最小买点 → 之后某卖点」。
- **Java 代码（LC 121）**：
```java
class Solution {
    public int maxProfit(int[] prices) {
        int minPrice = Integer.MAX_VALUE, maxProfit = 0;
        for (int p : prices) {
            if (p < minPrice) minPrice = p;                      // 更新最低买点
            else maxProfit = Math.max(maxProfit, p - minPrice);  // 今日卖出
        }
        return maxProfit;
    }
}
```
- **思路（LC 122）**：等价于「收集所有上坡」——`prices[i] > prices[i-1]` 就把差值计入。**成立**：连续上涨的收益和等于首尾差，跨越下跌的交易可拆成独立上坡。
- **Java 代码（LC 122）**：
```java
class Solution {
    public int maxProfit(int[] prices) {
        int profit = 0;
        for (int i = 1; i < prices.length; i++)
            if (prices[i] > prices[i - 1]) profit += prices[i] - prices[i - 1];
        return profit;
    }
}
```
- **DP 化改造（状态定义）**：`hold`（今日结束持有股票的最大收益）、`cash`（今日结束空仓的最大收益），转移 `hold = max(hold, cash - price)`、`cash = max(cash, hold + price [- fee])`。
- **Java 代码（LC 714，卖出扣手续费）**：
```java
class Solution {
    public int maxProfit(int[] prices, int fee) {
        int hold = -prices[0], cash = 0;
        for (int i = 1; i < prices.length; i++) {
            hold = Math.max(hold, cash - prices[i]);        // 保持持有 / 今日买入
            cash = Math.max(cash, hold + prices[i] - fee);  // 保持空仓 / 今日卖出扣费
        }
        return cash;
    }
}
```
- **LC 309（冷冻期）状态定义**：三状态 `hold`（持有）、`sold`（今日卖出）、`rest`（空仓可买，含冷却）；转移 `hold=max(hold, rest-price)`、`sold=hold+price`、`rest=max(rest, sold)`，答案 `max(sold, rest)`。买入只能来自 `rest`（`sold` 次日才解冻），故至少需三状态。
- **复杂度**：全部 O(n) 时间；均为 O(1) 滚动空间。
- **追问链**：L1「121 与 122 区别？」→ 121 限一次（最低买点贪心），122 不限次（收集上坡 / 状态机）；L2「DP 为何用 `new*` 暂存？」→ 避免本轮更新污染下一状态（309 尤甚）；L3「手续费在买入还是卖出扣？」→ 任选一处，全局一致即可，本例卖出扣；
  L4「冷冻期为何至少三状态？」→ 「今日卖出」与「空闲」未来可买性不同，需拆开；L5「空数组 / 单调下跌 / 单日？」→ 单调下跌收益 0，309 首日 `hold=-price`、`sold=0`。
- **常见错误 / 陷阱**：
  - 错误说法「122 用 121 的最低买点即可」→ 正确理解：多次交易须支持多次买卖。
  - 错误说法「309 两状态够用」→ 正确理解：冷冻期使「卖出当天」与「空闲」可买性不同。
- **变体**：LC 123 最多两次；LC 188 最多 k 次（121/122 是 k=1 / k=∞ 特例）。

### 3.6 动态规划三连：爬楼梯 / 零钱兑换 / 最长递增子序列
- **考察点**：线性 DP、完全背包、LIS；遍历顺序与状态定义。
- **思路（LC 70）**：`f(n)=f(n-1)+f(n-2)`（斐波那契），两变量滚动，空间 O(1)。
- **Java 代码（LC 70）**：
```java
class Solution {
    public int climbStairs(int n) {
        if (n <= 2) return n;
        int a = 1, b = 2;                 // f(1), f(2)
        for (int i = 3; i <= n; i++) { int c = a + b; a = b; b = c; }
        return b;
    }
}
```
- **思路（LC 322）**：`dp[i]` = 凑出金额 `i` 的最少硬币数；`dp[i] = min(dp[i], dp[i-coin]+1)`。初始化用哨兵 `amount+1`，最后判 `> amount` 则无解。
- **遍历顺序为什么影响结果**：**求最值**（本题最少硬币）——外层金额、内层硬币，**顺序不影响答案**（求最值对顺序不敏感，硬币可无限用）。**求方案数**（LC 518）——**顺序敏感**：**外层硬币、内层金额 → 组合数**（不考虑顺序）；**外层金额、内层硬币 → 排列数**（考虑顺序）。记忆锚点：**求最值不敏感，求方案数敏感；组合称硬币在外，排列称金额在外**。
- **Java 代码（LC 322）**：
```java
class Solution {
    public int coinChange(int[] coins, int amount) {
        int[] dp = new int[amount + 1];
        Arrays.fill(dp, amount + 1);      // 哨兵：不可能的大值
        dp[0] = 0;
        for (int i = 1; i <= amount; i++)
            for (int coin : coins)
                if (coin <= i) dp[i] = Math.min(dp[i], dp[i - coin] + 1);
        return dp[amount] > amount ? -1 : dp[amount];
    }
}
```
- **思路（LC 300）**：
  - **O(n²) DP**：`dp[i]` = 以 `nums[i]` **结尾**的最长严格递增子序列长度；`dp[i] = max(dp[j]+1)`（`j<i && nums[j]<nums[i]`）。
  - **O(n log n) 贪心 + 二分**：`tails[k]` = **所有长度为 k+1 的递增子序列中，结尾元素的最小值**。`tails` 严格递增（二分的根据）。遍历 `x`：二分找**第一个 ≥ x** 的位置 `l`，用 `x` 覆盖 `tails[l]`；`l == size` 则 `size++`。**`tails` 长度即 LIS 长度**，但它**不是**某条真实子序列，只是各长度的最优结尾。
- **Java 代码（LIS，O(n log n)）**：
```java
class Solution {
    public int lengthOfLIS(int[] nums) {
        int[] tails = new int[nums.length];
        int size = 0;                     // 有效长度 == 当前 LIS 长度
        for (int x : nums) {
            int l = 0, r = size;          // 在 [0, size) 找第一个 >= x
            while (l < r) {
                int mid = l + (r - l) / 2;
                if (tails[mid] < x) l = mid + 1;
                else r = mid;
            }
            tails[l] = x;                 // 覆盖（l == size 即追加）
            if (l == size) size++;
        }
        return size;
    }
}
```
- **复杂度推导**：O(n²) DP 外层 n、内层均摊 n → O(n²)，空间 O(n)。O(n log n) 外层 n 次、每次二分 O(log size) → **O(n log n)**，空间 O(n)。
- **追问链**：L1「`tails` 含义？」→ 各长度递增子序列的最小结尾，其长度 = LIS 长度；L2「覆盖 `tails[l]` 会破坏结构吗？」→ 用更小结尾替换同长度结尾只会让后续更易接上，不减少长度；L3「二分找 `≥ x` 还是 `> x`？」→ 严格递增用「第一个 ≥ x」（lowerBound），非严格用「第一个 > x」；
  L4「要求出具体序列？」→ 需记录前驱，或改用 O(n²) DP 回溯；L5「`tails` 被中途覆盖 / 空数组？」→ 覆盖不代表最终序列，仅保证长度，空数组返回 0。
- **常见错误 / 陷阱**：
  - 错误说法「外层金额内层硬币一定错」→ 正确理解：求最值不敏感，只有求**方案数**才敏感。
  - 错误说法「`tails` 就是 LIS 本身」→ 正确理解：`tails` 是各长度最优结尾，非真实子序列。
  - 错误说法「`dp` 定义为前 i 个的最长 LIS」→ 正确理解：必须定义「以 i **结尾**」，否则写不出转移。
- **变体**：LC 518 零钱兑换 II；LC 354 俄罗斯套娃信封；LC 674 最长连续递增序列。

### 3.7 岛屿数量（LC 200）
- **考察点**：网格图遍历；递归深度；并查集。
- **思路**：遇 `'1'` 计数 +1 并「淹没」整座岛。DFS 代码最短但递归深；BFS 用队列逐层扩散，无栈溢出风险；并查集把每个 `'1'` 作为集合、向右下合并，适合动态连通。
- **Java 代码（DFS）**：
```java
class Solution {
    public int numIslands(char[][] grid) {
        if (grid == null || grid.length == 0) return 0;
        int count = 0;
        for (int i = 0; i < grid.length; i++)
            for (int j = 0; j < grid[0].length; j++)
                if (grid[i][j] == '1') { count++; dfs(grid, i, j); }
        return count;
    }
    private void dfs(char[][] grid, int i, int j) {
        if (i < 0 || i >= grid.length || j < 0 || j >= grid[0].length || grid[i][j] != '1') return;
        grid[i][j] = '0';                 // 原地标记访问
        dfs(grid, i + 1, j); dfs(grid, i - 1, j); dfs(grid, i, j + 1); dfs(grid, i, j - 1);
    }
}
```
- **并查集解法要点**：给每个 `'1'` 分配 id（`i*n+j`），初始 `count` 为陆地数；向右、向下相邻若都是 `'1'` 则 `union`，每次成功合并 `count--`（连通分量减一），最终 `count` 即答案。`find` 用隔代路径压缩 `parent[x]=parent[parent[x]]`，配合按秩合并近似 O(1)。DFS/BFS 时间 **O(mn)**、空间最坏 O(mn)；并查集 O(mn·α)≈O(mn)。
- **追问链**：L1「为何把 `'1'` 改 `'0'`？」→ 原地标记访问，省 `visited`；L2「DFS 会栈溢出吗？」→ 最坏整片陆地递归深度 O(mn)，大网格可能 `StackOverflowError`；L3「路径压缩有几种？」→ 隔代压缩与完全压缩（递归 `find`），配合按秩合并近似 O(1)；
  L4「哪种最稳？」→ 面试答 BFS（无栈风险），要动态连通用并查集；L5「空网格 / 全水 / 全陆地？」→ 0 / 0 / 1，`grid.length==0` 必须先判空。
- **常见错误 / 陷阱**：
  - 错误说法「必须开 `visited` 数组」→ 正确理解：原地改即可，但会破坏输入（要求不改输入则需 visited）。
  - 错误说法「并查集一定更快」→ 正确理解：渐进同阶，常数不同；DFS/BFS 更简单。
- **变体**：LC 695 岛屿的最大面积；LC 130 被围绕的区域；LC 547 省份数量。

### 3.8 滑动窗口最大值（LC 239）
- **考察点**：单调队列；为何存**下标**；摊还分析。
- **思路**：维护**单调递减**双端队列，队首即窗口最大值。**存下标不存值**——只有下标能判断元素是否滑出窗口（`<= i - k` 出队）。新元素入队前从队尾弹出所有 `<= nums[i]` 的值（它们不可能再成为后续最大值）。
- **Java 代码**：
```java
class Solution {
    public int[] maxSlidingWindow(int[] nums, int k) {
        int n = nums.length;
        int[] res = new int[n - k + 1];
        Deque<Integer> deque = new ArrayDeque<>();  // 存下标，值单调递减
        for (int i = 0; i < n; i++) {
            while (!deque.isEmpty() && deque.peekFirst() <= i - k) deque.pollFirst(); // 队首滑出
            while (!deque.isEmpty() && nums[deque.peekLast()] <= nums[i]) deque.pollLast(); // 队尾无用
            deque.offerLast(i);
            if (i >= k - 1) res[i - k + 1] = nums[deque.peekFirst()]; // 队首即最大值
        }
        return res;
    }
}
```
- **摊还 O(n) 推导**：每个下标**最多入队一次、出队一次**（`pollFirst`+`pollLast` 合计 ≤ n 次）。故两个 while 的总执行次数 ≤ n，均摊每轮 O(1)，整体 **O(n)**，空间 O(k)。
- **追问链**：L1「为何用双端队列？」→ 两端都要操作：队首出（滑窗）、队尾出（维护单调）；L2「为何存下标？」→ 判断滑出依赖位置，值无法反映位置；L3「`ArrayDeque` 能存 `null` 吗？」→ 不能，`offer` null 抛 NPE；
  L4「和堆比？」→ 堆 O(n log k) 且难删滑出元素，单调队列 O(n) 更优；L5「`k==1` / `k==n`？」→ 分别返回原数组 / 单个最大值，结果长度 `n-k+1`。
- **常见错误 / 陷阱**：
  - 错误说法「存值即可，不必存下标」→ 正确理解：存值无法判断滑出，会取到过期最大值。
  - 错误说法「队尾弹出必须用 `<`」→ 正确理解：用 `<=` 可弹出相等值，队列更精简，正确性不变。
- **变体**：剑指 Offer 59-I；LC 1438 绝对差不超过限制的最长子数组。

### 3.9 每日温度（LC 739）与接雨水（LC 42）
- **考察点**：单调栈（下一个更大/更小）；栈内单调性；边界处理。
- **思路（LC 739）**：求每个元素「下一个更高温度」的距离。维护**单调递减栈**（存下标），`temperatures[i] > temperatures[top]` 时 `i` 即栈顶元素的答案。
- **Java 代码（LC 739）**：
```java
class Solution {
    public int[] dailyTemperatures(int[] temperatures) {
        int n = temperatures.length;
        int[] res = new int[n];
        Deque<Integer> stack = new ArrayDeque<>(); // 存下标，栈底到栈顶温度递减
        for (int i = 0; i < n; i++) {
            while (!stack.isEmpty() && temperatures[i] > temperatures[stack.peek()]) {
                int idx = stack.pop();
                res[idx] = i - idx;               // 距离 = 当前下标 - 之前下标
            }
            stack.push(i);
        }
        return res;
    }
}
```
- **思路（LC 42 单调栈）**：维护**单调递减**下标栈。`height[i] > height[top]` 形成凹槽——弹出 `bottom`，新栈顶 `left` 与 `i` 构成左右边界，累加 `(min(height[left],height[i]) - height[bottom]) × (i-left-1)`。
- **思路（LC 42 双指针）**：左右指针向中间靠拢，维护 `leftMax/rightMax`。**若 `height[l] < height[r]`，`l` 处接水由 `leftMax` 决定**（右侧有 `height[r]` 兜底），反之亦然。空间 O(1)。
- **Java 代码（LC 42 单调栈）**：
```java
class Solution {
    public int trap(int[] height) {
        int n = height.length, res = 0;
        Deque<Integer> stack = new ArrayDeque<>(); // 存下标，高度单调递减
        for (int i = 0; i < n; i++) {
            while (!stack.isEmpty() && height[i] > height[stack.peek()]) {
                int bottom = stack.pop();          // 凹槽底部
                if (stack.isEmpty()) break;        // 左侧无边界，接不住
                int left = stack.peek();
                res += (Math.min(height[left], height[i]) - height[bottom]) * (i - left - 1);
            }
            stack.push(i);
        }
        return res;
    }
}
```
- **Java 代码（LC 42 双指针）**：
```java
class Solution {
    public int trap(int[] height) {
        int l = 0, r = height.length - 1, leftMax = 0, rightMax = 0, res = 0;
        while (l < r) {
            if (height[l] < height[r]) {
                leftMax = Math.max(leftMax, height[l]);
                res += leftMax - height[l];        // 由左侧最高决定
                l++;
            } else {
                rightMax = Math.max(rightMax, height[r]);
                res += rightMax - height[r];       // 由右侧最高决定
                r--;
            }
        }
        return res;
    }
}
```
- **复杂度**：LC 739 O(n) 时间 / O(n) 空间；LC 42 单调栈 O(n)/O(n)，双指针 O(n)/**O(1)**。
- **追问链**：L1「单调栈存什么、单调性？」→ 存下标，两题都用递减栈；L2「双指针为何能定单侧边界？」→ `height[l]<height[r]` 说明右侧至少 `height[r]` 挡着，`l` 水位只由 `leftMax` 定；L3「42 栈中 `i-left-1` 含义？」→ 左右边界之间的宽度（不含边界柱）；
  L4「42 两解法怎么选？」→ 要 O(1) 空间选双指针，要顺带求下一个更大选单调栈；L5「空数组 / 单调 / 有平底？」→ 平底用 `>` 而非 `>=`，避免重复计数。
- **常见错误 / 陷阱**：
  - 错误说法「LC 42 双指针要先求左右最高数组」→ 正确理解：那是 O(n) 空间预处理法；双指针可 O(1) 隐式维护。
  - 错误说法「单调栈判断用 `>=` 会错」→ 正确理解：需按题目语义（「更高」用严格 `>`）选择，平底避免重复计数。
- **变体**：LC 84 柱状图中最大的矩形；LC 496 下一个更大元素 I；LC 503 下一个更大元素 II。

## 4. 面试问法与答题框架

1. **「手写一下三数之和。」**
   - 报套路：排序 + 对撞双指针，O(n²)。
   - 点透三处去重：固定数、左指针、右指针及各自动作时机；提剪枝 `nums[i] > 0` 提前 `break`。
   - 边界：空数组、`[0,0,0,0]` 只出一组。
   - **加分**：主动说「此题不要求下标所以能排序；LC 1 要下标只能哈希」。

2. **「两数之和为什么不用双指针？」**
   - 要返回**原始下标**，排序会打乱下标。
   - 哈希 O(n) 时间、O(n) 空间，一次遍历；强调「先查后放」避免自配对。
   - 若只需判断存在，双指针省空间。
   - **加分**：指出变体——已排序只需存在性判断时双指针更优。

3. **「无重复字符最长子串，窗口怎么维护？」**
   - 右指针扩张，左指针跳到「上次出现位置 + 1」。
   - 关键条件 `last.get(c) >= left`，否则 left 会回退；均摊 O(n)。
   - 与 LC 76 对比：最长在 while 外、最短在 while 内更新。
   - **加分**：指出可用 `int[128]` 降常数。

4. **「最长回文子串有几种解法？」**
   - 中心扩展：2n−1 个中心，O(n²)/O(1)。
   - 区间 DP：按长度遍历，O(n²)/O(n²)；Manacher O(n)，提及即可。
   - 强调奇偶两种中心。
   - **加分**：`expand` 返回 `r-l-1` 的推导。

5. **「合并区间怎么保证不丢区间？」**
   - 按左端点排序，扫描时重叠就合并，右端取 `max`（防被包含）。
   - `cur[0] <= last[1]` 含等号，端点相接算重叠；空数组返回 `new int[0][]`。
   - 复杂度 O(n log n)，排序主导。
   - **加分**：比较器用 `Integer.compare` 防溢出。

6. **「买卖股票最多 k 次交易怎么建模？」**
   - 状态机 DP：`hold` / `cash`（冷冻期加 `sold`/`rest`）。
   - 转移 `hold=max(hold, cash-price)`、`cash=max(cash, hold+price[-fee])`；k 次加一维 k。
   - 121/122 是 k=1 / k=∞ 特例。
   - **加分**：说清 122「收集所有上坡」的等价性。

7. **「零钱兑换的遍历顺序有讲究吗？」**
   - 求**最值**：顺序不影响答案；求**方案数**（LC 518）：敏感——硬币在外得组合、金额在外得排列。
   - 完全背包金额正序（对比 0/1 背包倒序）；哨兵 `amount+1`，最后判 `> amount`。
   - 用一句总结「最值不敏感、计数敏感」。
   - **加分**：能现场推导 LC 518 两种顺序分别得到组合与排列。

8. **「LIS 的 O(n log n) 怎么做？」**
   - 维护 `tails`：长度为 `k+1` 的递增子序列的最小结尾。
   - 二分找第一个 `≥ x` 覆盖，`tails` 长度即答案。
   - `tails` **不是**真实子序列，只保证长度；严格递增用「≥」，非严格用「>」。
   - **加分**：说明覆盖不破坏正确性的直觉。

9. **「岛屿数量能用并查集吗？」**
   - 能。每块陆地独立集合，向右下合并，统计连通分量。
   - DFS 最短；BFS 无栈溢出；并查集可扩展动态连通。
   - 原地改 `'1'` 为 `'0'` 省 visited（不改输入则需 visited）；复杂度同阶 O(mn)。
   - **加分**：并查集配路径压缩 + 按秩近似 O(1)。

10. **「滑动窗口最大值为什么是 O(n) 不是 O(nk)？」**
    - 单调队列，队首即最大值；每下标最多入队一次、出队一次 → 摊还 O(1) 每轮。
    - 必须存**下标**才能判断滑出；队尾弹出用 `<=` 更精简。
    - 对比堆解法 O(n log k) 的劣势（难删滑出元素）。
    - **加分**：把两个 while 的总次数 ≤ n 讲成摊还论证。

## 5. 常见误区汇总

| 错误说法 | 正确理解 | 一句话记忆锚点 |
| --- | --- | --- |
| 两数之和用排序双指针返回下标 | 排序丢下标，要下标必须哈希 | 「要下标别排序」 |
| 三数之和只去重固定数 | 三处都去重：固定数 / 左 / 右指针 | 「去重一个都不能少」 |
| `l++/r--` 放在 while 去重之前 | 必须先跳重复再移指针 | 「先去重，再挪指针」 |
| 四数之和无需 long | 四个 int 相加会溢出 | 「四数之和先转 long」 |
| LC 3 左指针无条件取 `last+1` | 必须 `last >= left` 才收缩 | 「过期下标不回退」 |
| 最长/最短窗口更新点相同 | 最长在 while 外、最短在 while 内 | 「最长在外，最短在内」 |
| 回文只有一个中心 | 奇 + 偶共 2n−1 个中心 | 「奇偶两种中心」 |
| 回文 DP 按 i、j 双层循环 | 必须按区间长度升序 | 「按长度遍历」 |
| 合并区间右端直接取 `cur[1]` | 取 `max`，防被包含 | 「右端取 max」 |
| 区间端点相接不算重叠 | LC 56 中 `<=` 视为重叠 | 「相接即重叠」 |
| 122 沿用 121 的最低买点思路 | 多次交易用收集上坡 / 状态机 | 「多次交易收集上坡」 |
| 冷冻期两状态够用 | 需三状态 hold/sold/rest | 「冷冻期多一态」 |
| 零钱兑换遍历顺序总影响结果 | 求最值不敏感，求方案数才敏感 | 「最值不敏感，计数敏感」 |
| `tails` 就是最长递增子序列 | `tails` 是各长度最小结尾，非真实子序列 | 「tails 只保长度」 |
| 单调队列可以只存值 | 必须存下标才能判断滑出 | 「单调队列存下标」 |
| 岛屿必须开 visited 数组 | 可原地把 `'1'` 改 `'0'` | 「原地淹没」 |
| 接雨水双指针要先求左右最高数组 | 双指针可 O(1) 隐式维护 | 「双指针省前缀数组」 |
