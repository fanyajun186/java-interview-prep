# InnoDB + RR：加与不加 @Transactional 时的加锁行为全解

> 场景：Java 方法内依次执行 `insert 用户表`、`update 统计表`、`delete 临时表`。引擎 InnoDB，隔离级别 RR（MySQL 默认）。考察点：**锁是引擎加的，@Transactional 只决定锁活多久**。

---

## 0. 核心结论（背这三句即可）

1. **锁不是 `@Transactional` 加的** —— 它只做两件事：AOP 代理包住方法、进入时 `setAutoCommit(false)` 退出时 `commit`/`rollback`。加锁主体永远是 InnoDB，加锁时刻是 SQL 真正执行时（执行器经 handler API 逐行调引擎）。
2. **两种情况下「是否加锁」「加什么锁」完全相同** —— 三条写操作都会加锁，类型一模一样。差别只有一个：**锁的持有时间**。
3. **不加注解 = 语句级持有（毫秒级释放）；加注解 = 事务级持有（直到方法返回 commit）**。所以加注解的真实代价不是「锁变多」，而是「锁被拉长」—— 死锁概率、锁等待、连接占用同步放大。

---

## 1. 前提：事务边界由谁定义

| | 不加 `@Transactional` | 加 `@Transactional` |
| --- | --- | --- |
| autocommit | 1（默认） | 由 Spring 置为 0 |
| 事务粒度 | 每条 SQL 一个隐式事务 | 整个方法一个显式事务 |
| 提交时机 | 语句执行完立即提交 | 方法返回后由代理提交 |
| 异常处理 | 无回滚，前面已提交 | 默认 RuntimeException 才回滚 |

> 注意：MyBatis 场景下不加注解时，SqlSession 每次操作后提交（或连接归还时提交），效果等同「每条 SQL 独立事务」。

---

## 2. 三个操作各自产生的锁

### 2.1 INSERT（用户表）

| 锁 | 加在哪 | 生命期 |
| --- | --- | --- |
| 插入意向锁（Insert Intention Lock） | 待插入的**间隙**上，声明「我要在 (a,b) 里插」 | **瞬时** —— 插入完成即释放 |
| 隐式 X 记录锁 | 新插入记录（聚簇索引） | **持久** —— 到事务结束 |
| S 型 next-key lock | **仅唯一键冲突时**：对已存在的冲突记录加 S 锁后等待 | 到事务结束 |

要点：

- **插入意向锁之间互相兼容**，只与 gap lock 冲突 → 这是「RR 下两个长事务在同一间隙插入必然死锁」的根源。
- 「insert 也加 S 锁」的准确语境是**唯一键冲突**。这解释了经典现象：先 `select` 确认用户名不存在、再 `insert` 却报唯一键冲突 —— 快照读看不到对方的未提交插入，约束检查（当前读语义）却能。
- 插入会导致页内记录移动与间隙分裂，可能阻塞其他事务已持有的 gap lock。

### 2.2 UPDATE（统计表）

一定是隐式 X 锁，**粒度完全取决于 where 走什么索引**：

| where 条件 | 加锁粒度 | 依据 |
| --- | --- | --- |
| 主键 / 唯一索引等值**命中** | **记录锁** | 优化 1：唯一索引等值 → next-key 退化为记录锁 |
| 主键 / 唯一索引等值**未命中** | **间隙锁** | 优化 2：向右遍历到第一个不满足值 → 退化 |
| 普通索引等值 | **next-key lock** + 退化 gap | 原则 1 + 优化 2 |
| 唯一索引**范围** | next-key lock（历史上多锁一个间隙） | 加锁 bug（8.0 部分场景已优化） |
| **不走索引** | **锁全表所有间隙**（≈ 锁表） | 原则 2：访问到的对象才加锁，全表访问 = 全表加锁 |

补充两点：

- 若 `update` 修改的列**本身带索引**，会同时锁住二级索引的旧项与新项。
- 统计表典型写法 `update stat set cnt = cnt + 1 where id = ?` → 主键等值 → **记录锁**，最轻形态。

**丢失更新辨析**（工程上比四类并发问题更致命）：

```sql
-- 安全：X 锁保护下读当前值再写
update stat set cnt = cnt + 1 where id = 1;

-- 危险：应用层先 select 得到 10，再 set 绝对值 11，并发下互相覆盖
select cnt from stat where id = 1;
update stat set cnt = 11 where id = 1;
```

修法：`select ... for update`（悲观）或 `update ... set cnt = #{new}, version = version + 1 where id = 1 and version = #{old}`（乐观，判断影响行数）。

### 2.3 DELETE（临时表）

加锁规则与 `update` **完全一致**（都是当前读 + 隐式 X 锁 + 按索引决定粒度）。额外：

- 删除会对该记录的**所有索引项**加锁，不只聚簇索引。
- 无索引条件同样锁全表间隙。

**「临时表」的术语辨析（加分点）**：

- 若确为 MySQL 的 `CREATE TEMPORARY TABLE` → **会话私有**，其他会话看不到这张表，**不存在跨会话锁竞争**（内部仍走锁机制，但没有冲突方）。
- 若只是业务命名叫「临时表」的普通 InnoDB 表 → 锁行为与普通表完全相同。

---

## 3. 加与不加的完整对比

| 维度 | 不加 `@Transactional` | 加 `@Transactional` |
| --- | --- | --- |
| 事务边界 | 三条 SQL 各成一个隐式事务 | 三条 SQL 同一事务 |
| **是否加锁** | **都加** | **都加** |
| **锁的类型** | **完全相同** | **完全相同** |
| **锁持有时长** | **语句级**，SQL 执行完即释放 | **事务级**，持到方法返回并 commit |
| 锁竞争窗口 | ≈ 单条 SQL 执行时间（毫秒级） | ≈ 整个方法执行时间（含 RPC / 循环 / IO） |
| 原子性 | 无（中途失败前面已提交） | 有 |
| 死锁概率 | 低 | **高** |
| 数据一致性风险 | **高**（部分成功） | 低 |
| 连接占用 | 短 | 长（事务期间连接不能归还连接池） |
| 间隙锁影响 | 几乎无（瞬时释放） | **显著**（持到 commit，阻塞并发插入） |

---

## 4. 加注解后的四类真实风险

1. **非 DB 逻辑变成「持锁执行」**
   方法内的 HTTP / RPC 调用、循环、缓存操作、文件 IO 全部落在锁持有期内。**铁律：事务方法里不要放远程调用。**

2. **跨表加锁顺序不一致 → 死锁**
   方法 A 顺序 `用户表 → 统计表 → 临时表`，方法 B 顺序 `临时表 → 统计表 → 用户表`：
   A 持有用户表等统计表，B 持有临时表 + 统计表等用户表 → 环路。
   不加注解时锁瞬间释放，这种环路极难形成。

3. **RR 下间隙锁被放大（最易忽略）**
   - 不加注解：gap lock 随语句结束释放，几乎不阻塞插入。
   - 加注解：gap lock 持到 commit，并发插入被阻塞概率大增。
   这是「RR + 长事务」最典型的性能事故。

4. **事务失效的隐藏坑**
   自调用（`this.method()`）、`private` 方法、异常被 `catch` 吞掉、多线程调用、非 public —— 注解直接失效，退回到三条独立事务。
   **「加了注解反而不安全」的典型**：你依赖了原子性，但它没生效，且无人察觉。

**风险终局**：持锁线程堆积 → Tomcat / 业务线程池耗尽 → 服务不可用。锁问题最终以「服务雪崩」暴露，而不是以「数据库慢」暴露。

---

## 5. 决策建议

| 场景 | 决策 |
| --- | --- |
| 三操作有业务原子性要求（用户创建与统计数必须一致） | **必须加**。约束：DB 操作集中在方法头部、非 DB 逻辑挪到事务外、全局统一加锁顺序、设置合理的事务超时 |
| 三操作业务上无原子性要求（清理临时表、写审计日志） | **不加**，每条 SQL 独立提交，锁窗口最小 |
| 只有单条 SQL 需要原子性 | 不需要注解（单条 SQL 本身即原子事务） |

加注解时的推荐写法：

```java
public void biz(Req req) {
    // 非 DB 逻辑放在事务外：远程调用、参数校验、缓存预热
    remoteCall(req);
    txService.doDbWork(req);   // 只有 DB 操作在事务内
}

@Transactional(rollbackFor = Exception.class, timeout = 3)
public void doDbWork(Req req) {
    userMapper.insert(...);    // 固定加锁顺序：user → stat → temp
    statMapper.incr(...);
    tempMapper.delete(...);
}
```

---

## 6. 高频追问链

**主问题：加 `@Transactional` 会「多」加锁吗？**
- 追问：那锁是哪里来的？→ InnoDB 执行 SQL 时加的，Spring 不参与加锁。
- 追问：两种情况差别在哪？→ 只有持有时间：语句级 vs 事务级。
- 追问：所以加注解更慢？→ 吞吐上确实如此。但**正确解法是缩事务，不是去掉注解** —— 拿原子性换性能是错的方向。

**主问题：`insert` 也会加锁？加什么锁？**
- 追问：加在哪？→ 隐式 X 记录锁加在新记录上（持久）；插入意向锁加在待插入间隙（瞬时）。
- 追问：插入意向锁之间会互相阻塞吗？→ 不会，互相兼容，只与 gap lock 冲突。
- 追问：什么时候 insert 会加 S 锁？→ 唯一键冲突时，对已存在记录加 S 型 next-key lock 后等待。

**主问题：统计表 `update stat set cnt=cnt+1 where id=?` 加什么锁？**
- 追问：为什么是记录锁？→ 主键等值 → 唯一索引等值命中 → next-key 退化为记录锁。
- 追问：若 `where biz_type=?` 无索引呢？→ **锁全表所有间隙**，等价锁表，死锁概率爆炸。
- 追问：加联合索引呢？→ 普通索引 → next-key lock + 退化 gap，仍可控但比记录锁重。

**主问题：加注解后死锁风险为什么变高？**
- 追问：两个成因？→ 持锁时间变长；跨表加锁顺序不一致。
- 追问：怎么治理？→ 统一加锁顺序、缩事务、保证更新走索引、业务层捕获 `DeadlockLoserDataAccessException` 退避重试。
- 追问：间隙锁的角色？→ RR 下 gap lock 之间兼容，但与前方的插入意向锁冲突，两个长事务在同间隙插入必然死锁。

**主问题：不加 `@Transactional` 是不是更安全（因为锁更短）？**
- 追问：主要问题在哪？→ 不是锁，是**一致性**。insert 成功 update 失败 → 用户表多了记录、统计数没加。
- 追问：怎么权衡？→ 要原子性就加事务，但必须缩事务 + 定顺序；不要原子性的操作就别加。

**主问题：这个场景最容易出的线上事故是什么？**
- 落点：RR 长事务 + 间隙锁。用户在事务内做了远程调用导致事务 1~3 秒，期间统计表被锁、临时间隙被锁，并发写入全部排队，线程池打满。
- 追问：怎么发现？→ `information_schema.INNODB_TRX` 看长事务、`performance_schema.data_lock_waits` 看等待链、`SHOW ENGINE INNODB STATUS` 看最近死锁。
- 追问：怎么预防？→ 事务超时（`@Transactional(timeout=)`）、监控长事务、把远程调用移出事务。

---

## 7. 常见误区

| # | 错误说法 | 正确理解 |
| --- | --- | --- |
| 1 | `@Transactional` 就是加锁 | 它只定义事务边界与 autocommit 开关，加锁的是 InnoDB |
| 2 | 不加注解就不会有锁 | 每条写 SQL 都加锁，只是释放极快 |
| 3 | 加了注解锁变多 | 锁类型完全一样，只是持有时间变长 |
| 4 | `insert` 不加锁 | 加隐式 X 记录锁，唯一键冲突时还加 S 型 next-key lock |
| 5 | 插入意向锁之间会互相阻塞 | 互相兼容，只与 gap lock 冲突 |
| 6 | 间隙锁在 RC 下也存在 | 只在 RR 及以上生效 |
| 7 | 加注解一定比不加安全 | 事务失效时你以为有原子性其实没有；长事务还会放大锁风险 |
| 8 | 死锁是 bug | 是并发系统常态，应用必须能捕获并重试 |
| 9 | `update ... set cnt=cnt+1` 有并发问题 | 安全，X 锁保护；有问题的是「先查再写绝对值」 |
| 10 | 临时表也会和其它会话争锁 | 真正的 MySQL 临时表是会话私有的，无跨会话竞争 |

---

## 8. 可跑实验设计

### 实验 A：验证「不加事务时锁瞬间释放」

```sql
-- 会话 1（模拟不加事务）
update stat set cnt = cnt + 1 where id = 1;   -- 单条，自动提交
-- 会话 2 立刻执行，不会阻塞
select * from stat where id = 1;
```

结论：单条 SQL 自成一个事务，锁在语句结束就没了。

### 实验 B：验证「加了事务后锁持到 commit」

```sql
-- 会话 1
BEGIN;
update stat set cnt = cnt + 1 where id = 1;   -- 记录锁，持有中
-- 先不 commit

-- 会话 2（会阻塞，等到 innodb_lock_wait_timeout 默认 50s）
update stat set cnt = cnt + 1 where id = 1;

-- 查询谁在等谁
SELECT * FROM performance_schema.data_lock_waits;
SELECT * FROM information_schema.INNODB_TRX;
```

预期现象：会话 2 阻塞；`data_lock_waits` 出现一条等待记录；会话 1 commit 后会话 2 立刻成功。

### 实验 C：验证 insert 的隐式 X 记录锁与唯一键冲突 S 锁

```sql
-- 表：t(id PK, uid UNIQUE, c int)

-- 会话 1
BEGIN;
insert into t values (1, 100, 1);
-- 不提交

-- 会话 2：插入相同唯一键，会被阻塞（对已存在记录加 S 型 next-key lock）
insert into t values (2, 100, 1);   -- 阻塞

-- 查看锁
SELECT ENGINE_LOCK_ID, LOCK_TYPE, LOCK_MODE, LOCK_DATA
FROM performance_schema.data_locks WHERE OBJECT_NAME = 't';
```

预期现象：会话 2 在 uid=100 上出现 `S,REC_NOT_GAP`（S 型记录锁）等待；会话 1 rollback 后会话 2 成功。

### 实验 D：验证「同一间隙、两个长事务 → 死锁」

```sql
-- 表：g(id PK, c int)，已有 c = 5、15

-- 会话 1
BEGIN;
select * from g where c = 10 for update;   -- 锁间隙 (5,15)，gap lock
-- 不提交

-- 会话 2
BEGIN;
select * from g where c = 12 for update;   -- gap lock 之间兼容，也能成功

-- 会话 1
insert into g values (11, 11);   -- 插入意向锁与 S2 的 gap 冲突 → 阻塞

-- 会话 2
insert into g values (13, 13);   -- 与 S1 的 gap 冲突 → 死锁

SHOW ENGINE INNODB STATUS\G;    -- LATEST DETECTED DEADLOCK
```

预期现象：出现 `Deadlock found when trying to get lock`，其中一个事务被回滚。

### 实验 E：验证「无索引 update 锁全表间隙」

```sql
-- 表：t2(id PK, biz_type int, cnt int)，biz_type 无索引

-- 会话 1
BEGIN;
update t2 set cnt = cnt + 1 where biz_type = 1;
-- 不提交

-- 会话 2：在完全无关的 id 上插入也会阻塞
insert into t2 values (99999, 7, 1);   -- 阻塞

SELECT * FROM performance_schema.data_locks WHERE OBJECT_NAME = 't2';
```

预期现象：`data_locks` 中出现大量 `X,GAP,INSERT_INTENTION` 之外的 `X` 锁覆盖全表间隙 → 证明「无索引更新 = 锁表」。

---

## 9. 一页速记

```
@Transactional 不生产锁，只延长锁的寿命。

不加注解 → 语句级锁（毫秒）      加注解 → 事务级锁（直到 commit）
         ↓                                  ↓
    一致性问题（部分成功）              死锁 / 锁等待 / 连接占用 / 间隙锁放大

三个操作的锁（两种情况完全相同）：
  insert  → 插入意向锁（瞬时）+ 隐式 X 记录锁 + 冲突时 S next-key
  update  → 隐式 X 锁，粒度 = f(索引)：记录锁 / next-key / 全表间隙
  delete  → 同上，且锁所有索引项

最危险的两个组合：
  ① 无索引的 where + 写操作  → 锁全表间隙 → 死锁爆炸
  ② RR + 长事务 + 间隙锁     → 并发插入被阻塞 → 线程池打满

治理四件套：统一加锁顺序 / 缩事务（远程调用移出） / 更新必走索引 / 业务层重试
```
