# MySQL InnoDB 连表查询：为什么「小表驱动大表」

> 主题：join 算法与驱动表选择 | 面试权重：高（MySQL 优化轮高频，且「背口诀」与「懂成本模型」分水岭明显）
> 一句话定位：这不是 MySQL 的规则，而是 Nested-Loop Join 乘法结构的数学推论。

---

## 0. 这题在面试里考什么

- 出现频率：MySQL 优化类问题中约 60% 会涉及，常出现在「慢 SQL 怎么优化」的追问里。
- 三种问法：
  1. 直接问原理（「为什么小表驱动大表」）—— 筛选级，答「OLTP 场景常用」直接淘汰。
  2. 给 SQL 问怎么改（「这条 join 走没走索引，怎么优化」）—— 主力考法。
  3. 问例外与边界（「那大表 join 大表怎么办」「LEFT JOIN 能换驱动表吗」）—— 区分度高。
- 失分集中区：把「小表」等同于物理行数；不知道 BNL 按字节算；把 `STRAIGHT_JOIN` 理解成「强制小表驱动」；不知道 8.0.20 hash join 改变了这个口诀的地位。

---

## 1. 考点清单

### 必考
- [ ] Nested-Loop Join 是 InnoDB 唯一的 join 执行范式，驱动表 = 外层循环
- [ ] 总成本公式：驱动表读一次 + N × 被驱动表单次访问成本
- [ ] Index Nested-Loop Join（INLJ）的成本模型与 N 的线性放大
- [ ] Block Nested-Loop Join（BNL）的分批机制与扫描遍数公式
- [ ] 「小表」的准确定义（过滤后行数 / 字节数 / 数据量，三者不同）
- [ ] 优化器按成本模型选驱动表，`INNER JOIN` 可交换，`LEFT/RIGHT JOIN` 被语法锁定
- [ ] `EXPLAIN` 第一行就是驱动表

### 应当掌握
- [ ] Hash Join 在 8.0.20 起取代 BNL（等值 join + 无索引），复杂度 O(N+M)
- [ ] `join_buffer_size` 默认 256KB，会话级分配
- [ ] Batched Key Access（BKA）+ MRR 的作用
- [ ] `Extra` 各标志含义：`Using join buffer (hash join)` / `(Block Nested Loop)` / `(Batched Key Access)`
- [ ] `STRAIGHT_JOIN` 的真实语义（强制书写顺序，非强制小表）
- [ ] `rows × filtered` 与驱动表实际行数的关系
- [ ] 优化器「选错驱动表」的排查（统计信息、optimizer_trace、ANALYZE TABLE）
- [ ] `EXPLAIN FORMAT=JSON` 的 `nested_loop` 数组与 `EXPLAIN ANALYZE`

### 了解即可
- [ ] `optimizer_switch` 的 `block_nested_loop` / `hash_join` 开关
- [ ] `hash_join` 自 8.0.18 引入、8.0.20 默认开启
- [ ] 非等值 join 仍走 BNL 而非 Hash Join

---

## 2. 核心原理

### 2.1 前提：InnoDB 的 join 只有 NLJ 一种范式

MySQL 不支持 hash join 之外的「排序合并」等算法族，所有 join 都是嵌套循环的变体：

```
for each row in 驱动表（外层）：      -- 执行 N 次
    取出 join 列的值
    for each match in 被驱动表（内层）：  -- 每次都是一次「访问动作」
        输出匹配行
```

驱动表（driving table / outer table）= 外层循环；被驱动表（inner table）= 内层循环。**「谁驱动谁」= 「谁的循环在外层」。**

### 2.2 成本公式与「为什么是乘法」

```
总成本 ≈ Cost(扫描驱动表一次) + N × Cost(被驱动表单次访问)
                                ^
                            N = 驱动表过滤后行数
```

关键在 **N 是乘数**：

- 把大表放外层 → 昂贵的「内层访问动作」执行 M 次
- 把小表放外层 → 同样的动作只执行 N 次

这就是「小表驱动大表」的全部底层逻辑。它不是启发式规则，而是乘法结构的必然结果。

### 2.3 三种内层访问方式的成本模型

| 算法 | 适用条件 | 内层动作 | 总成本 | 版本 |
| --- | --- | --- | --- | --- |
| **INLJ** | 被驱动表 join 列有索引 | B+ 树查找 + 回表 | `N × Cost(单次查找)` | 一直有 |
| **BNL** | 无索引 | 全表扫 × 批次数 | `ceil(N字节 / join_buffer_size) × Cost(扫一遍 M)` | 5.6 - 8.0.19 |
| **BKA** | 有索引 + MRR 开启 | 批量索引查找 + 顺序回表 | 同上但单次成本更低 | 5.6+ |
| **Hash Join** | 无索引 + 等值 join | 小表建哈希表，大表探测 | `O(N + M)` | 8.0.18 引入 / 8.0.20 默认 |

**INLJ 是最纯粹的形态**：内层单次成本几乎固定，总成本对驱动表行数**线性**。举例：

| 驱动方向 | 内层索引查找次数 | 相对成本 |
| --- | --- | --- |
| 小表（1 万行）驱动大表（500 万行） | 1 万次 | 1× |
| 大表驱动小表 | 500 万次 | 500× |

**BNL 的收益机制完全不同**：由于 join_buffer 的批量机制，内层是「每装一批驱动表数据，就完整扫一遍被驱动表」。所以：

```
被驱动表被完整扫描的遍数 = ceil(驱动表参与 join 的字节数 / join_buffer_size)
```

`join_buffer_size` 默认 256KB，通常足以装下小表 → 分批数 = 1 → **大表只被完整扫描 1 遍**。这是 BNL 下小表驱动的真实收益来源：**减少被驱动表的完整扫描遍数**，而不是减少总行读取量（总行读取量近似对称）。

### 2.4 「小表」的准确含义（核心分水岭）

| 算法 | 「小」的度量 | 原因 |
| --- | --- | --- |
| INLJ | `rows × filtered`（过滤后参与 join 的行数） | 内层循环次数 = 驱动表实际行数 |
| BNL | 参与 join 的**字节数**（行数 × 列宽） | join_buffer 按字节分配 |
| Hash Join | 参与 join 的数据量 | 决定哈希表内存占用 |

**准确表述：「过滤后参与 join 的数据量小的表应该驱动」。**

推论：一张 500 万行的表，如果 `where` 条件把它过滤到 200 行，它就应该当驱动表。所以**加一个高选择性 where 条件的收益，往往大于调换 join 顺序**。

推论 2：BNL 下一张 1000 行但每行 2KB（大 TEXT 字段参与 join）的表，可能比一张 5 万行的窄表更容易撑爆 join_buffer。

### 2.5 谁决定驱动表

| 场景 | 谁决定 | 能否交换 |
| --- | --- | --- |
| `INNER JOIN` | 优化器按成本模型自由选择 | 可以 |
| `LEFT JOIN` | **左表必须是驱动表** | 不可以（要保留左表所有行，交换后语义改变） |
| `RIGHT JOIN` | 右表必须是驱动表 | 不可以 |
| `STRAIGHT_JOIN` | 按 SQL 书写顺序强制 | 不可以 |

优化器的成本模型：`Cost(驱动表扫描) + Cost(被驱动表单次访问) × rows × filtered`。注意用的是**统计信息估算值**，统计过期会导致「选错驱动表」（与「选错索引」同类问题）。

**`STRAIGHT_JOIN` 的真实语义**：强制按书写顺序，不是「强制小表驱动」。写错方向反而会把优化器的正确决策锁死。它只在确认优化器选错时作为兜底。

### 2.6 版本演进与口诀的「贬值」

- **5.6 之前**：纯 NLJ，无索引 join = O(N × M) 灾难。
- **5.6**：引入 BNL + BKA。此时「小表驱动大表」的收益最显著。
- **8.0.18**：引入 Hash Join（`optimizer_switch` 中 `hash_join` 默认关）。
- **8.0.20**：Hash Join 对等值 join 默认开启，BNL 退守非等值场景。`Extra` 从 `Using join buffer (Block Nested Loop)` 变为 `Using join buffer (hash join)`。

**Hash Join 的影响**：复杂度 O(N + M)，两边驱动几乎等价 → **「小表驱动大表」在无索引场景的收益大幅下降**，只剩「小表建哈希表内存占用小」。但**有索引场景（INLJ）完全不受影响**，口诀依然成立。

### 2.7 验证方式

```sql
-- EXPLAIN 第一行 = 驱动表，后续行 = 被驱动表
EXPLAIN SELECT * FROM t_small s JOIN t_big b ON b.s_id = s.id;

-- 看清嵌套结构
EXPLAIN FORMAT=JSON SELECT ...;   -- nested_loop 数组的顺序即执行顺序

-- 8.0.18+ 给真实行数与耗时
EXPLAIN ANALYZE SELECT ...;
```

| Extra 标志 | 含义 | 优化方向 |
| --- | --- | --- |
| 被驱动表 `type = ref` / `eq_ref` | INLJ，走了索引 | 已最优 |
| `Using join buffer (hash join)` | 8.0.20+ 无索引等值 join | **给被驱动表 join 列加索引（收益最大）** |
| `Using join buffer (Block Nested Loop)` | 5.6 - 8.0.19 无索引路径 | 同上 |
| `Using join buffer (Batched Key Access)` | BKA + MRR | 已较好 |

### 2.8 实操优先级

1. **给被驱动表的 join 列建索引** → 把 BNL / Hash Join 变成 INLJ。数量级收益，优先级最高。
2. **用 `where` 把行数压下来** → 两边都变小，双份收益。
3. **最后才考虑驱动顺序** → 仅 `INNER JOIN` 可动，且优化器通常已选对。
4. `join_buffer_size` 调大能减少 BNL 扫描遍数，但**会话级分配**，高并发下会反噬内存。

---

## 3. 实验设计：观察驱动表选择与 join 算法

**目的**：亲手验证三种算法的 `Extra` 差异，以及驱动表行数对耗时的影响。

**环境**：MySQL 8.0.20+（观察 Hash Join）与 5.7（观察 BNL）对照最佳。

```sql
CREATE TABLE t_small (id INT PRIMARY KEY, s_id INT, pad VARCHAR(64));
CREATE TABLE t_big   (id INT PRIMARY KEY, s_id INT, no_idx INT, pad VARCHAR(64));

-- t_small 1 万行、t_big 500 万行
-- 给 t_big.s_id 建索引，不给 t_big.no_idx 建索引
ALTER TABLE t_big ADD INDEX idx_s_id (s_id);
```

实验一：有索引 vs 无索引

```sql
-- A：被驱动表有索引 → INLJ
EXPLAIN SELECT * FROM t_small s JOIN t_big b ON b.s_id = s.id;
-- 预期：第一行 t_small，第二行 t_big，type=ref，key=idx_s_id，无 join buffer

-- B：被驱动表无索引 → Hash Join（8.0.20+）或 BNL（5.7）
EXPLAIN SELECT * FROM t_small s JOIN t_big b ON b.no_idx = s.id;
-- 预期：第二行 Extra = Using join buffer (hash join) 或 (Block Nested Loop)
```

实验二：交换驱动表

```sql
-- 用 STRAIGHT_JOIN 强制大表驱动
SELECT STRAIGHT_JOIN * FROM t_big b JOIN t_small s ON b.s_id = s.id;
-- 对比耗时：预期显著变慢（A 方案快 1-2 个数量级）
```

实验三：`where` 改变「小表」的定义

```sql
-- t_big 过滤到极少行后被选为驱动表
EXPLAIN SELECT * FROM t_big b JOIN t_small s ON b.s_id = s.id WHERE b.id < 100;
-- 预期：EXPLAIN 第一行变成 t_big（因为 rows × filtered 很小）
```

实验四：`join_buffer_size` 对 BNL 的影响（需 5.7 或关闭 hash join）

```sql
SET optimizer_switch = 'hash_join=off';   -- 8.0 下强制走 BNL
SET SESSION join_buffer_size = 262144;    -- 256KB
EXPLAIN SELECT * FROM t_small s JOIN t_big b ON b.no_idx = s.id;
-- 用 EXPLAIN ANALYZE 对比 256KB / 4MB 下的实际耗时与扫描行数
```

**结论**：`Extra` 标志能直接判定算法；驱动表行数是 INLJ 成本的线性因子；`where` 过滤会改变优化器对「谁是驱动表」的判断。

---

## 4. 高频追问链

**主问题：为什么小表驱动大表更快？**
- 追问 1：底层原因？→ 被驱动表要被访问 N 次（N = 驱动表过滤后行数），N 是乘数；大表驱动会让内层动作执行 M 次。
- 追问 2：不能靠加索引解决吗？→ 可以且更优 —— 加索引把内层动作从「全表扫」变成「索引查找」，两者叠加才是最优解。
- 追问 3：「小表」是行数少吗？→ 不是。INLJ 看 `rows × filtered`，BNL 看字节数，Hash Join 看数据量。

**主问题：有索引和无索引时，小表驱动的收益一样吗？**
- 落点：完全不同。INLJ 总成本 ∝ N（纯线性放大，交换驱动差几倍就是行数比）；BNL 总成本 ∝ `ceil(N字节/buffer) × M`，因为 buffer 常能装下小表，大表往往只被扫 1 遍，收益量级小于 INLJ。
- 追问：8.0.20 之后？→ 等值 join 变 Hash Join，O(N+M)，两边驱动几乎等价，口诀基本失效。
- 追问：那口诀还有用吗？→ 在 INLJ（被驱动表有索引）场景下完全成立，而那正是生产上的常态。

**主问题：`STRAIGHT_JOIN` 能优化 join 性能吗？**
- 落点：它是把控制权从优化器手里拿走，不是优化手段。只在确认优化器选错时兜底使用。
- 追问：更正确的做法？→ `ANALYZE TABLE` 刷新统计信息，或改写 SQL 让优化器能选对；兜底时才用 `STRAIGHT_JOIN` 并加注释说明原因。
- 追问：它强制的是「小表驱动」吗？→ 不是，强制的是「按书写顺序驱动」。写反了会更慢。

**主问题：`LEFT JOIN` 能改成小表驱动吗？**
- 落点：不能交换，左表被语法锁定为驱动表。
- 追问：想优化怎么办？→ 给右表 join 列加索引（关键）；业务允许时改写让原本的小表成为左表；或拆成两条 SQL 应用层组装。
- 追问：为什么必须左表驱动？→ 要保留左表所有行，右表无匹配补 NULL，交换后语义改变。

**主问题：大表 join 大表怎么优化？**
- 落点：驱动顺序几乎帮不上忙（两边都大）。方向是：先用高选择性 `where` 把某一边压小；或者拆成多次查询在应用层组装；或者把 join 结果预计算成宽表 / 冗余字段。
- 追问：分库分表后呢？→ 跨库 join 基本不可行，只能冗余字段、广播表、ES 宽表，或让分片键使关联数据落同一分片。

---

## 5. 大厂真题方向

1. 「为什么说小表驱动大表？底层原理是什么？」—— 要点：NLJ 双层循环 + N 是乘数。
2. 「这条 join SQL 你怎么优化？」—— 要点：先看 EXPLAIN，判断是 INLJ 还是 join buffer，加索引优先。
3. 「有索引的情况下还需要关心驱动表吗？」—— 要点：需要，INLJ 下降 N 就是线性降成本。
4. 「`STRAIGHT_JOIN` 有什么用？」—— 要点：强制书写顺序，兜底手段而非优化手段。
5. 「`LEFT JOIN` 能不能让小表驱动？」—— 要点：不能，语法锁定；给右表加索引才是正解。
6. 「`Using join buffer` 是什么信号？」—— 要点：被驱动表没走索引，加索引收益最大。
7. 「MySQL 8.0 的 hash join 对 join 优化有什么影响？」—— 要点：等值无索引场景取代 BNL，O(N+M)，口诀收益下降。
8. 「`join_buffer_size` 调大有用吗？有什么风险？」—— 要点：减少 BNL 扫描遍数；会话级分配，高并发吃内存。
9. 「大表 join 大表你怎么办？」—— 要点：过滤压小、应用层组装、冗余/宽表。
10. 「优化器怎么决定谁是驱动表？」—— 要点：成本模型，`rows × filtered`，统计信息。
11. 「为什么优化器会选错驱动表？」—— 要点：统计信息过期、采样偏差；`ANALYZE TABLE` / `optimizer_trace`。
12. 「`EXPLAIN` 里怎么看出谁是驱动表？」—— 要点：第一行；`FORMAT=JSON` 看 `nested_loop` 顺序。
13. 「多表 join 时顺序怎么定？」—— 要点：先让结果集最小的表驱动；但优化器决策可能不同，以 EXPLAIN 为准。

---

## 6. 常见误区

| # | 错误说法 | 正确理解 |
| --- | --- | --- |
| 1 | 「小表驱动大表」是 MySQL 的优化规则 | 是 NLJ 乘法结构的数学推论 |
| 2 | 小表 = 物理行数少 | 是**过滤后**参与 join 的数据量；大表加高选择性 where 后也能当驱动表 |
| 3 | BNL 下「小」按行数算 | 按字节数算，join_buffer 按字节分配 |
| 4 | `STRAIGHT_JOIN` 强制小表驱动 | 强制按书写顺序，写反方向更慢 |
| 5 | BNL 的总行读取量比交换后少 | 近似对称；真正差异在被驱动表的**完整扫描遍数** |
| 6 | 调大 `join_buffer_size` 一定更快 | 减少扫描遍数，但 per-connection 分配，高并发会反噬 |
| 7 | 8.0 之后这句话照样管用 | 等值无索引场景已被 Hash Join 取代；有索引场景仍成立 |
| 8 | 有索引就不需要关心驱动表了 | INLJ 下总成本 ∝ N，驱动表行数是线性因子 |
| 9 | `LEFT JOIN` 优化器可以自由交换 | 左表被语法锁定为驱动表 |
| 10 | `EXPLAIN` 的 rows 是精确值 | 是统计信息估算值，可能差一个数量级 |

---

## 7. 面试收尾句

> InnoDB 的 join 本质是嵌套循环 —— 驱动表决定内层循环执行多少次，被驱动表决定每次循环多贵。总成本 = 驱动表读一次 + N × 被驱动表单次访问成本，因为 N 是乘数，降低驱动表的数据量就能线性降低总成本 —— 这就是「小表驱动大表」的全部底层逻辑，它是乘法结构的必然结果，不是一条经验规则。而且加索引的优先级永远高于调驱动顺序：把内层动作从「全表扫」变成「索引查找」，收益是数量级的。
