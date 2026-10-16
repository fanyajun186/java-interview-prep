# XXL-JOB · 使用介绍、表结构与底层实现原理

> 一句话定位：XXL-JOB 是「调度中心 + 执行器」分离的轻量级分布式任务调度平台。面试考察分三层——会不会用（接入与配置）、知不知道状态存哪（8 张表）、能不能讲清调度中心到执行器的完整调用链与时间轮（这一层决定评级）。
> 版本前提：以 XXL-JOB 2.3.x / 2.4.x 为主，涉及版本差异处单独标注。JDK 8+。

## 0. 面试权重与备考策略

| 层级 | 考察形式 | 必须能答到什么程度 |
| --- | --- | --- |
| 使用层 | 「你们定时任务怎么做的」 | 能说出执行器接入五步、路由策略与阻塞策略的区别与选型 |
| 存储层 | 「任务状态存哪」 | 能说出 8 张表各自承载什么机制，尤其 `xxl_job_log` 的两段结构与 `xxl_job_lock` 单行锁 |
| 原理层 | 「调度是秒级的吗，怎么做到的」 | **能默画完整调用链**，讲清时间轮 + 5 秒预读，讲清超时与 misfire 的区别 |
| 深水区 | 「一定不会重复执行吗」 | 能主动说出「调度锁不保证不重复」，并列出一到五条重复来源与幂等方案 |

时间分配建议：使用层 20%、表结构 20%、调用链与时间轮 40%、幂等与高可用 20%。

---

## 1. 是什么

XXL-JOB 的核心设计是**调度与执行分离**：

- **调度中心（xxl-job-admin）**：一个 Spring Boot 应用。负责维护任务配置、计算触发时间、触发执行器、收集日志与告警。它不知道任务要干什么。
- **执行器（executor）**：业务应用引入 `xxl-job-core` 后内嵌一个 Netty HTTP Server（默认 9999 端口）。它不知道什么时候该跑。
- **共享状态**：两者之间只靠一个 MySQL 交换状态（任务配置、注册表、调度锁、日志）。

这个三角结构决定了它的全部优缺点：**部署极简（只要一个 MySQL），但 DB 成为核心依赖（DB 挂了调度就停），且因为「触发是异步的」而无法保证任务不重复执行**。

### 1.1 与同类方案的对比

| 方案 | 调度中心 | 集群/分片 | 额外依赖 | 主要缺陷 |
| --- | --- | --- | --- | --- |
| Spring `@Scheduled` | 无 | 不支持 | 无 | 多实例重复执行，无法统一管理 |
| Quartz | 无（各应用自调度） | 靠 DB 行锁，配置繁琐 | 11 张自己的表 | 无 UI、分片要自己写、无失败重试与告警 |
| ElasticJob | 无中心（ZK 选举） | 支持，分片强 | ZooKeeper | 要维护 ZK；无集中式 UI；分片规则不直观 |
| **XXL-JOB** | 有中心（DB 协调） | 支持（分片广播） | MySQL 即可 | 调度中心 + DB 是单点风险；秒级精度，不适应毫秒级场景 |

选 XXL-JOB 的实际理由通常是三条：业务应用加个依赖就是执行器，**不用改架构**；**有可视化 UI，改 CRON 不用发版**；**只要一个 MySQL 就能跑，不用引 ZK**。

---

## 2. 使用介绍

### 2.1 执行器接入五步

**第一步：引依赖**

```xml
<dependency>
    <groupId>com.xuxueli</groupId>
    <artifactId>xxl-job-core</artifactId>
    <version>2.4.0</version>
</dependency>
```

**第二步：配置**

```yaml
xxl:
  job:
    admin:
      addresses: http://admin-host:8080/xxl-job-admin   # 调度中心地址，多个用逗号分隔
    accessToken: default_token                          # 认证令牌，必须与调度中心一致
    executor:
      appname: order-service                            # 执行器 AppName，对应 UI 上的执行器组
      address:                                          # 留空自动获取，多网卡必填
      ip:
      port: 9999                                        # 内嵌 Netty 端口
      logpath: /data/applogs/xxl-job/jobhandler         # 任务日志根目录
      logretentiondays: 30                              # 日志保留天数，-1 表示永久
```

**第三步：注册执行器 Bean**

```java
@Configuration
public class XxlJobConfig {

    @Value("${xxl.job.admin.addresses}")
    private String adminAddresses;
    @Value("${xxl.job.accessToken}")
    private String accessToken;
    @Value("${xxl.job.executor.appname}")
    private String appname;
    @Value("${xxl.job.executor.port}")
    private int port;
    @Value("${xxl.job.executor.logpath}")
    private String logPath;
    @Value("${xxl.job.executor.logretentiondays}")
    private int logRetentionDays;

    @Bean
    public XxlJobSpringExecutor xxlJobExecutor() {
        XxlJobSpringExecutor executor = new XxlJobSpringExecutor();
        executor.setAdminAddresses(adminAddresses);
        executor.setAppname(appname);
        executor.setPort(port);
        executor.setAccessToken(accessToken);
        executor.setLogPath(logPath);
        executor.setLogRetentionDays(logRetentionDays);
        return executor;
    }
}
```

**第四步：写 Handler（Bean 模式，生产推荐）**

```java
@Component
public class OrderJobHandler {

    @XxlJob("orderTimeoutCancelHandler")   // 值必须与 UI 上任务的 JobHandler 完全一致
    public void orderTimeoutCancel() {
        // 分片参数
        int shardIndex = XxlJobHelper.getShardIndex();
        int shardTotal = XxlJobHelper.getShardTotal();
        // 任务参数（UI 上配置的执行参数）
        String param = XxlJobHelper.getJobParam();

        XxlJobHelper.log("分片 {}/{} 开始，param={}", shardIndex, shardTotal, param);
        try {
            // 业务逻辑，只处理属于自己分片的数据
            orderService.cancelTimeoutOrders(shardIndex, shardTotal);
            XxlJobHelper.handleSuccess("处理完成");       // 显式标记成功
        } catch (Exception e) {
            XxlJobHelper.log(e);                          // 异常堆栈写入任务日志
            XxlJobHelper.handleFail("处理失败：" + e.getMessage());  // 显式标记失败
        }
    }
}
```

`XxlJobHelper` 的常用方法：

| 方法 | 作用 |
| --- | --- |
| `log(String format, Object... args)` | 写日志，内容会通过 `/log` 接口回传调度中心 |
| `getJobParam()` | 取 UI 上配置的执行参数 |
| `getShardIndex()` / `getShardTotal()` | 分片序号（从 0 开始）/ 分片总数 |
| `getJobId()` / `getLogId()` | 当前任务 ID / 本次日志 ID（= 日志文件名） |
| `handleSuccess(msg)` / `handleFail(msg)` | 显式标记执行结果 |
| `getXxlJobContext()` | 取本次执行的完整上下文 |

**第五步：UI 上建执行器 + 建任务**

先建执行器（AppName = `order-service`，注册方式选「自动注册」，等 30 秒心跳上来地址列表会自动出现），再建任务（JobHandler 填 `orderTimeoutCancelHandler`，调度类型选 CRON）。

### 2.2 三个必踩的接入坑

| 现象 | 原因 | 排查 |
| --- | --- | --- |
| 触发返回 401 | `accessToken` 两端不一致 | 对比执行器配置与调度中心 `application.properties` |
| 任务报「执行器地址列表为空」 | `appname` 与 UI 上执行器组的 AppName 不一致，注册到了错误的组 | 查 `xxl_job_registry` 表里的 `registry_group` |
| 执行器注册到错误 IP | 多网卡 / 容器环境自动取到了虚拟网卡地址 | 手工指定 `xxl.job.executor.ip` |

### 2.3 任务配置项速查

| 配置项 | 取值 | 要点 |
| --- | --- | --- |
| 调度类型 | `NONE` / `CRON` / `FIX_RATE`（2.4 起另有 `FIX_DELAY`） | `FIX_RATE` 从上次触发时刻起算间隔；`FIX_DELAY` 从上次执行**结束**时刻起算；`NONE` 只手动触发 |
| 运行模式 | `BEAN` / `GLUE(...)` | GLUE 可在 UI 上直接写代码热更新，适合临时脚本；生产建议 BEAN（可版本管理、可测试） |
| Cron | CRON 表达式 | **秒级精度**，格式为 6 位（含秒），如 `0 0/5 * * * ?` |
| 路由策略 | 10 种 | 分片广播是多机并行批处理的主力，其余见下表 |
| 阻塞处理策略 | `SERIAL_EXECUTION`（默认）/ `DISCARD_LATER` / `COVER_EARLY` | 只作用于**单机内部**的同一个 jobId |
| 子任务 ID | 逗号分隔的 jobId | 当前任务成功后触发下游任务 |
| 任务超时 | `executorTimeout`（秒，0 = 不限） | 见第 6 节 |
| 失败重试次数 | `executorFailRetryCount` | 重试是「重新触发一次」，不是续跑，会重复执行 |
| 调度过期策略 | `DO_NOTHING`（默认）/ `FIRE_ONCE_NOW` | misfire 时的行为，见第 6 节 |

### 2.4 路由策略十种

| 策略 | 行为 | 适用 | 缺陷 |
| --- | --- | --- | --- |
| `FIRST` / `LAST` | 固定选地址列表第一个/最后一个 | 单机验证、固定主机 | 无故障转移 |
| `ROUND` | 轮询 | 执行器同质、任务均匀 | 不考虑负载 |
| `RANDOM` | 随机 | 同质、实现简单 | 可能反复命中慢节点 |
| `CONSISTENT_HASH` | 按 jobId 哈希固定到某节点 | 任务需固定落某台 | 节点增减会重分配 |
| `LEAST_FREQUENTLY_USED` | 选历史调用次数最少 | 长期量均衡 | **统计在进程内，多实例下不准确** |
| `LEAST_RECENTLY_USED` | 选最久未被调用 | 长期均衡 | 同上 |
| `FAILOVER` | 逐个尝试，失败换下一个 | 高可用优先 | **重试会造成重复执行**，必须幂等 |
| `BUSYOVER` | 通过 `/idleBeat` 探测，忙则换 | 避免请求堆到忙碌节点 | 每次多一次探测 RPC |
| `SHARDING_BROADCAST` | 广播给所有在线执行器，各带 `shardIndex`/`shardTotal` | 大数据量并行批处理 | 数据倾斜；执行器数量变化会改分片规则 |

加分点：LFU / LRU 的统计是**调度中心进程内的内存状态**，多实例部署时每个实例各算各的，严格来说不精确——这体现了「中心化调度 + 多实例」在状态一致性上的固有妥协。

### 2.5 分片广播的标准写法

```java
int shardIndex = XxlJobHelper.getShardIndex();
int shardTotal = XxlJobHelper.getShardTotal();
// 方式一：取模（分片数随执行器数量浮动，必须幂等）
if (userId % shardTotal == shardIndex) { ... }

// 方式二（推荐）：逻辑分片固定，避免扩缩容导致数据重复
int LOGICAL_SHARDS = 32;
for (int i = shardIndex; i < LOGICAL_SHARDS; i += shardTotal) {
    // 处理第 i 个逻辑分片的数据
}
```

分片键要**分布均匀且稳定**（用户 ID、订单 ID），避免用「创建时间」这类聚集键，否则数据倾斜。因为 `shardTotal` 等于**当前在线执行器数**，扩缩容会改变分片规则，所以**分片任务必须幂等**。

---

## 3. 表结构（8 张表）

每张表对应一个机制。

### 3.1 `xxl_job_info` —— 任务主表

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | int PK | 即 jobId |
| `job_group` | int | → `xxl_job_group.id` |
| `job_desc` / `author` / `alarm_email` | varchar | 描述 / 负责人 / 告警邮箱 |
| `add_time` / `update_time` | datetime | 创建 / 修改时间 |
| `schedule_type` | varchar(50) | `NONE` / `CRON` / `FIX_RATE`（2.4 起 `FIX_DELAY`） |
| `schedule_conf` | varchar(128) | 值含义取决于 `schedule_type` |
| `misfire_strategy` | varchar(50) | `DO_NOTHING` / `FIRE_ONCE_NOW` |
| `executor_route_strategy` | varchar(50) | 路由策略枚举名 |
| `executor_handler` | varchar(255) | 与 `@XxlJob` 注解值一致 |
| `executor_param` | varchar(512) | 任务参数 |
| `executor_block_strategy` | varchar(50) | 阻塞策略枚举名 |
| `executor_timeout` | int | 超时秒数，0 不限 |
| `executor_fail_retry_count` | int | 失败重试次数 |
| `glue_type` | varchar(50) | `BEAN` / `GLUE_GROOVY` / `GLUE_SHELL` … |
| `glue_source` `glue_remark` `glue_updatetime` | mediumtext / varchar / datetime | GLUE 源码（2.3 起版本记录主要落 `xxl_job_logglue`） |
| `child_jobid` | varchar(255) | 子任务 ID，逗号分隔 |
| `trigger_status` | tinyint | `0` 停止 / `1` 运行 |
| `trigger_last_time` | bigint(13) | 上次调度时间，**毫秒时间戳** |
| `trigger_next_time` | bigint(13) | 下次调度时间，**毫秒时间戳** |

**两个关键设计**：

1. `trigger_last_time` / `trigger_next_time` 存**毫秒时间戳**而不是 datetime，是为了扫描时能直接做数值比较（`trigger_next_time <= now + 5000`），datetime 需要函数运算会导致索引失效。
2. 这两个字段承担**调度进度持久化**：任务停止时 `trigger_next_time` 置 0，重新启动时重新计算。**调度中心重启后能接着跑，靠的就是它们。**

### 3.2 `xxl_job_log` —— 状态机，不是流水

| 字段 | 说明 |
| --- | --- |
| `id` | logId，**同时是执行器磁盘上的日志文件名** |
| `job_group` `job_id` `executor_address` `executor_handler` `executor_param` | 触发时的**配置快照**（后续改任务配置不影响历史日志） |
| `executor_sharding_param` | 格式 `1/2`，即 `shardIndex/shardTotal` |
| `executor_fail_retry_count` | 本次是第几次重试 |
| `trigger_time` `trigger_code` `trigger_msg` | **调度阶段**，调度中心写入。`200` = 触发成功 |
| `handle_time` `handle_code` `handle_msg` | **执行阶段**，执行器回调后更新。`200` 成功 / `500` 失败 |
| `alarm_status` | `0` 默认 / `1` 无需告警 / `2` 告警成功 / `3` 告警失败 |
| 索引 | `I_job_id`、`I_trigger_time`、`I_handle_code` |

**为什么叫状态机**：调度中心先写 `trigger_*` 段并把 logId 随触发请求下发，执行器执行完通过回调更新同一行的 `handle_*` 段。所以一行日志代表「一次触发的完整生命周期」。

`I_handle_code` 索引的存在本身就是线索——它是给 `JobFailMonitorHelper` 每 30 秒扫「失败但未告警」用的。**`trigger_code=200` 但 `handle_code=500` 这个组合最关键**：说明触达成功、任务跑了、但业务失败，这正是失败重试的判定依据。

### 3.3 其余六张表

| 表 | 关键字段 | 承载的机制 |
| --- | --- | --- |
| `xxl_job_registry` | `registry_group`（AppName）、`registry_key`（执行器组名）、`registry_value`（`http://ip:port/`）、`update_time`；三者唯一索引 | 执行器心跳注册。30s 一次 `INSERT ... ON DUPLICATE KEY UPDATE update_time`；调度中心删除 `update_time` 早于「now - 90s」的记录判定下线 |
| `xxl_job_lock` | `lock_name`（PK，**全表只有一行** `schedule_lock`） | 调度分布式锁，实例间靠 `SELECT ... FOR UPDATE` 抢占 |
| `xxl_job_log_report` | `trigger_day`、`running_count`、`suc_count`、`fail_count` | UI 报表数据，由 `JobLogReportHelper` 按天聚合 |
| `xxl_job_logglue` | `job_id`、`glue_type`、`glue_source`、`glue_remark`、`add_time`、`update_time` | GLUE 源码的历史版本，支持回滚 |
| `xxl_job_group` | `app_name`、`title`、`address_type`（0 自动 / 1 手动）、`address_list` | 执行器组定义，手动录入用于非 Java 执行器或网络不通场景 |
| `xxl_job_user` | `username`、`password`、`role`（0 普通 / 1 管理员）、`permission`（允许操作的执行器 id 列表） | 控制台账号与权限隔离 |

---

## 4. 底层实现：完整调用链路

**务必能默画这 10 步。**

| 步 | 位置 | 动作 |
| --- | --- | --- |
| 1 | 调度中心 `scheduleThread` | 抢调度锁（`SELECT ... FOR UPDATE`），查出 `trigger_status=1` 且 `trigger_next_time <= now + 5000` 的任务（按 `trigger_next_time` 升序，限制 preReadCount 条） |
| 2 | 调度中心 `scheduleThread` | 对每个任务算出下次触发时间，把 jobId 按「触发秒」写入时间轮槽位；更新 `trigger_last_time` / `trigger_next_time`，提交事务、释放锁 |
| 3 | 调度中心 `ringThread` | 每秒对齐整秒唤醒，取出当前秒与前一秒的槽位，逐个提交给触发线程池 |
| 4 | 调度中心 快/慢线程池 | 先写一条 `xxl_job_log`（`trigger_*` 段），再通过 `XxlJobRemotingUtil` 发 HTTP POST 到执行器 `/run`（带 `XXL-JOB-ACCESS-TOKEN`，连接/读取超时 3s） |
| 5 | 执行器 `EmbedServer` | Netty 收到请求，校验 token，交给 `ExecutorBizImpl.run()` |
| 6 | 执行器 `ExecutorBizImpl` | 校验 handler 是否存在；按 jobId 从 `jobThreadRepository` 取 `JobThread`，不存在则 `registJobThread` 新建并 start；按**阻塞策略**决定丢弃/覆盖/入队 |
| 7 | 执行器 `JobThread` | 触发参数进入 `LinkedBlockingQueue`（容量 2000） |
| 8 | 执行器 `JobThread` | 从队列取出，构造 `XxlJobContext`（含 logId、分片参数），调用 `IJobHandler.execute()`。`XxlJobHelper.log()` 写入本地日志文件 `{logPath}/{yyyy-MM-dd}/{logId}.log` |
| 9 | 执行器 → 调度中心 | 执行结果返回；`JobCompleteHelper` 更新 `handle_code`，处理子任务链 |
| 10 | 调度中心 `JobFailMonitorHelper` | 每 30s 扫描执行失败的日志，触发告警（邮件 / Webhook）与失败重试 |

### 4.1 三个最容易答错的点

**① 调度与执行完全异步。** 时间轮只决定「何时提交到线程池」，提交后要排队。所以调度精度受线程池繁忙程度影响——这是「任务延迟」的主要来源，而不是时间轮不准。

**② JobThread 是「一个 jobId 一条线程」，不是「一次触发一条线程」。** 这是阻塞策略能生效的前提：因为同一 jobId 只有一个执行体，队列里堆积的任务才能被「串行 / 丢弃 / 覆盖」三选一处理。

**③ 触发请求不等于执行完成。** `ExecutorBizImpl.run()` 只做「找 JobThread + 入队」，入队成功立即返回 200，**不等任务执行完**。所以那个 3 秒的 HTTP 超时只覆盖「投递」动作，与任务跑多久无关。

### 4.2 执行器的接口与阻塞策略

内嵌 Netty 提供五个接口：

| 接口 | 作用 |
| --- | --- |
| `/run` | 接收触发请求并执行 |
| `/beat` | 心跳（调度中心存活检测） |
| `/idleBeat` | 查询某 JobThread 是否空闲（`BUSYOVER` 路由用） |
| `/kill` | 终止正在运行的任务 |
| `/log` | 接收任务执行过程中回传的日志 |

三种阻塞处理策略：

| 策略 | 触发时队列已有任务 | 适用 |
| --- | --- | --- |
| `SERIAL_EXECUTION`（默认） | 新触发**入队排队**，FIFO 执行 | 任务必须顺序执行 |
| `DISCARD_LATER` | **丢弃**本次触发，标记为失败 | 耗时任务，只关心「有在跑就行」 |
| `COVER_EARLY` | **终止**正在跑的任务 + **清空队列**，执行本次 | 只关心最新一次结果（如全量刷新缓存） |

注意：阻塞策略只作用于**单机内部**；跨机器的并发要靠路由策略或业务幂等。

### 4.3 调度中心的线程模型

| 线程 / 线程池 | 数量 | 职责 |
| --- | --- | --- |
| `scheduleThread` | 1 | 扫库、抢锁、算下次触发时间、写时间轮 |
| `ringThread` | 1 | 每秒消费时间轮槽位，提交触发线程池 |
| 快线程池 `fastPool` | 默认最大 200 | 正常任务触发 |
| 慢线程池 `slowPool` | 默认最大 100 | 慢任务触发，避免拖垮快池 |
| `JobFailMonitorHelper` | 1 | 每 30s 扫失败日志，告警 + 重试 |
| `JobCompleteHelper` | 1 | 处理执行结果回调与子任务 |
| `JobLogReportHelper` | 1 | 生成报表、清理过期日志 |
| `RegistryMonitorThread` | 1 | 刷新并清理执行器注册信息（每 30s） |

**快慢线程池的判据**：单次触发 RPC 耗时超过 **500ms** 记为一次「慢」；某任务在 **1 分钟内慢触发超过 10 次**、或快池队列已满，则该任务的后续触发改走慢池。这样「慢执行器」不会占满快池线程拖累其它任务。

---

## 5. 时间轮的实现

### 5.1 为什么用时间轮

| 方案 | DB 查询频率（每实例） | 触发精度 | 问题 |
| --- | --- | --- | --- |
| 每秒查一次 DB | 60 次/分钟 | 秒级 | DB 压力大，多实例还要抢锁 |
| 每 5 秒查一次，直接触发 | 12 次/分钟 | **5 秒** | 精度不够，秒级 CRON 无法满足 |
| **5 秒预读 + 内存时间轮** | 12 次/分钟 | **秒级** | 需要预读窗口逻辑（XXL-JOB 的方案） |
| Quartz 的 `PriorityQueue` | 无 | 秒级 | 需自行实现集群与分片 |

核心思想：**用「5 秒查一次 DB」换「每秒都能触发」**——查询次数降到 1/5，精度仍是秒级。

### 5.2 数据结构与源码要点

```java
// key = 秒（0-59），value = 该秒要触发的 jobId 列表
private static ConcurrentMap<Integer, List<Integer>> ringData = new ConcurrentHashMap<>();

// 写入方（scheduleThread 调用）
private static void pushTimeRing(int ringSecond, int jobId) {
    List<Integer> ringItemData = ringData.get(ringSecond);
    if (ringItemData == null) {
        ringItemData = new ArrayList<Integer>();
        ringData.put(ringSecond, ringItemData);
    }
    ringItemData.add(jobId);
}
```

槽位下标的计算：`(int)((triggerNextTime / 1000) % 60)`。**这就是「60 个槽」这个数字的由来**——一个槽对应一分钟里的一秒。

消费方：

```java
while (!ringThreadToStop) {
    // 1. 对齐到系统时钟整秒（不是 sleep(1000)）
    TimeUnit.MILLISECONDS.sleep(1000 - System.currentTimeMillis() % 1000);

    // 2. 同时取「当前秒」和「前一秒」两个槽
    List<Integer> ringItemData = new ArrayList<>();
    int nowSecond = Calendar.getInstance().get(Calendar.SECOND);
    for (int i = 0; i < 2; i++) {
        List<Integer> tmpData = ringData.remove((nowSecond + 60 - i) % 60);
        if (tmpData != null) {
            ringItemData.addAll(tmpData);
        }
    }

    // 3. 逐个提交触发线程池
    for (int jobId : ringItemData) {
        JobTriggerPoolHelper.trigger(jobId, TriggerTypeEnum.CRON, -1, null, null, null);
    }
}
```

三个设计细节：

- **`sleep(1000 - now % 1000)` 而非 `sleep(1000)`**：对齐系统时钟整秒，避免误差累积成漂移。
- **同时取「当前秒」和「前一秒」**：兜底容错。线程调度不保证唤醒精确，若某一秒被跳过或抛异常，前一秒未消费的槽位还能补救。
- **`remove` 即清空**：槽位取走就删除，避免同一任务被重复触发。

### 5.3 预读窗口与 misfire（与第 6 节的「5 秒」呼应）

扫描 SQL 条件是 `trigger_next_time <= now + PRE_READ_MS`（`PRE_READ_MS = 5000`），所以：

| 任务的下次触发时间 | 本轮处理 |
| --- | --- |
| 距今 ≤ 5s 且未到点 | 算槽位 → `pushTimeRing` 写内存槽；`trigger_last_time` / `trigger_next_time` 落库 |
| 距今 ≤ 5s 的短周期任务 | `while` 循环把窗口内的**每一个**触发点都 push 进对应槽（预读多次） |
| 距今 > 5s | **本轮查不出来**，内存里没有任何表示，只存在于 DB 的 `trigger_next_time` 中，等下轮（最多 5 秒后）再判断 |

**一句话**：≤5 秒的任务活在内存时间轮里，>5 秒的任务只活在数据库里。时间轮只有 60 个槽而不够用，正因为它只承载未来 5 秒。

主循环还有两个细节：

- 事务范围：从 `SELECT ... FOR UPDATE` 抢锁开始，到更新完 `trigger_next_time` 提交为止。**锁的粒度就是一次「扫描 + 更新」**，不含触发动作。
- 循环末尾 `sleep(PRE_READ_MS - 本轮耗时)`：让扫描节拍对齐 5 秒刻度，而不是「执行完再等 5 秒」（否则实际间隔会变成 5s + 执行耗时，逐渐漂移）。

### 5.4 设计边界（加分点）

因为只有 60 个槽 + 5 秒窗口，XXL-JOB **不擅长「任意时间点的一次性延迟任务」**。想表达「30 分钟后执行」只能用 CRON 表达式凑（要求时间点有规律），不像 MQ 的延迟消息能指定任意时刻。这是它和消息中间件延迟能力的定位差别。

---

## 6. 超时机制：三套完全不同的「超时」

这是最容易混淆的部分。**XXL-JOB 里与「秒」相关的阈值有四处，服务完全不同的目的。**

| # | 阈值 | 位置 | 真正含义 |
| --- | --- | --- | --- |
| ① | `PRE_READ_MS = 5000` | 调度中心 `JobScheduleHelper` | 预读窗口，见 5.3 |
| ② | `misfireThreshold = 5000` | 调度中心 `JobScheduleHelper` | 调度过期（misfire）判定 |
| ③ | `executor_timeout`（秒，0 不限） | 执行器 `JobThread` | **任务执行超时**，与 5 秒无关 |
| ④ | 3s / 500ms / 30s / 90s | `XxlJobRemotingUtil` 与监控线程 | HTTP 触发超时 / 慢触发阈值 / 心跳 / 注册清理 |

### 6.1 调度过期（misfire）：不到 5 秒是正常的，超过 5 秒才算过期

**这一条最容易被答反。**

| 情况 | 判定 | 处理 |
| --- | --- | --- |
| `now > trigger_next_time`，差值 **≤ 5s** | **不是 misfire**，是正常现象（扫描 5s 一轮，到点时可能刚过去几百毫秒） | 立即补触发一次（`TriggerTypeEnum.CRON`），然后推进下次时间 |
| `now - trigger_next_time` **> 5s** | 真正的 misfire（调度中心重启、长时间抢不到锁、任务暂停后恢复） | 按 `misfire_strategy` 处理 |

两种 misfire 策略：

| 策略 | 行为 |
| --- | --- |
| `DO_NOTHING`（默认） | 忽略错过的所有周期，只把 `trigger_next_time` 推进到未来 |
| `FIRE_ONCE_NOW` | 立即补触发一次，然后跳到正常周期（多周期错过也只补一次） |

### 6.2 任务执行超时：设与不设是两套执行模型

**设了超时（`executor_timeout > 0`）：**

```java
// JobThread.run() 的核心逻辑
if (triggerParam.getExecutorTimeout() > 0) {
    Thread futureThread = null;
    try {
        FutureTask<Boolean> futureTask = new FutureTask<>(() -> {
            XxlJobContext.setXxlJobContext(xxlJobContext);
            handler.execute();
            return true;
        });
        futureThread = new Thread(futureTask);
        futureThread.start();
        // JobThread 自己阻塞等待，超时抛 TimeoutException
        Boolean tempResult = futureTask.get(triggerParam.getExecutorTimeout(), TimeUnit.SECONDS);
    } catch (TimeoutException e) {
        XxlJobHelper.log("----------- xxl-job job execute timeout");
        XxlJobHelper.handleTimeout("job execute timeout");
    } finally {
        futureThread.interrupt();   // 只是发中断信号
    }
} else {
    handler.execute();              // JobThread 亲自执行，无任何超时保护
}
```

**这套实现带来四个必须知道的结论：**

1. **设了超时会多起一条临时线程**（`futureThread`），JobThread 退化成「监工」。
2. **JobThread 阻塞在 `futureTask.get(timeout)` 期间不消费队列**，也无法及时响应 stop 信号。所以 `executor_timeout` 不宜设得远大于任务正常耗时，否则该 jobId 的后续触发只能排队（`SERIAL_EXECUTION`）。
3. **超时后只做 `interrupt()`，不保证业务停下。** 三种情况 interrupt 无效：死循环（不检查中断标志）、阻塞在不可中断的 IO（如 socket read）、等待 `synchronized` 锁。**结果是业务继续跑，但调度中心已记失败并可能重试 → 重复处理。**
4. **不设超时（默认 0）则 JobThread 亲自执行，没有任何超时保护。** 任务跑死会让该 jobId 永久阻塞，队列（容量 2000）被慢慢灌满，最终后续触发全部失败。

### 6.3 HTTP 触发超时 3 秒：只管「投递」，不管「执行」

`XxlJobRemotingUtil` 的连接/读取超时默认 3 秒（可通过 `xxl.job.admin.biz.timeout` 与执行器侧配置调整）。但 `ExecutorBizImpl.run()` 只做：

```
按 jobId 取 JobThread → 校验 handler → 按阻塞策略决定丢弃/覆盖/入队 → 返回
```

**入队成功立即返回 200，不等任务执行完。** 所以「任务跑了 10 分钟而触发没超时」是完全正常的——这 3 秒只覆盖「投递到队列」这个毫秒级动作。把这两个超时混为一谈是最常见的答错。

### 6.4 三套超时的对照

| 维度 | HTTP 触发超时 3s | 任务执行超时 `executor_timeout` | 调度 misfire 5s |
| --- | --- | --- | --- |
| 位置 | 调度中心 → 执行器 | 执行器内部 | 调度中心 |
| 覆盖的动作 | 投递请求（入队） | 业务执行全过程 | 触发时间点是否被错过 |
| 超时后的结果 | `trigger_code ≠ 200`，本次调度失败 | `handle_code = 500`，本次执行失败 | 按 `misfire_strategy` 补触发或跳过 |
| 是否可中断 | 是（HTTP 连接直接关） | **只发 interrupt，不保证停** | — |
| 配置项 | `xxl.job.admin.biz.timeout` | 任务配置「任务超时」秒 | 无（硬编码 5000ms） |

---

## 7. 生产中的问题与排查

### 7.1 任务集体延迟

**现象**：本该 10:00:00 触发的任务，日志里 `trigger_time` 是 10:00:12。

**排查路径**：

1. 看 `xxl_job_log.trigger_time` 与预期时间的差值，判断是「调度侧晚了」还是「执行侧晚了」。
2. 若是调度侧：查是否有实例长时间持有 `schedule_lock` 行锁（慢 SQL、大事务）→ 其它实例全部阻塞等待。
3. 若是触发侧：查快/慢线程池是否打满（`trigger_code` 记录 RPC 耗时），慢池被打满会导致所有慢任务集体排队。
4. 查 `scheduleThread` 的单轮耗时（扫描任务过多时，一次查 preReadCount 条并逐个更新，事务时间长）。

**修复**：拆分调度库与业务库；限制单实例承载的任务数（多实例分摊）；给调度中心独立部署，不与业务混部。

### 7.2 执行器注册不上

**排查顺序**（这个顺序很重要）：

1. 执行器的 `xxl.job.admin.addresses` 是否指向正确的调度中心；
2. 执行器 IP 是否可被调度中心访问（容器 / 多网卡时自动选错 IP）；
3. `xxl.job.accessToken` 是否一致；
4. 执行器端口 9999 是否被防火墙拦截；
5. 查 `xxl_job_registry` 表里是否已有该地址的行（有行但 `update_time` 不更新说明心跳失败）。

**判定下线规则**：调度中心删除 `update_time` 早于「now - 90s」的记录，即**超过 90 秒未心跳被判下线**（心跳周期 30s，容忍 3 次丢失）。

### 7.3 任务重复执行

**为什么会重复（能主动说出来是加分项）**：

1. **调度中心双活/切换**：新实例接管时可能重复触发上一位已发出但未记录完成的任务；
2. **网络分区**：执行器执行成功但回执丢失，调度中心认为失败并重试；
3. **`FAILOVER` 路由 + 失败重试**：同一任务在多个执行器上被执行；
4. **时钟回拨**：NTP 回拨后 `trigger_next_time` 判断异常；
5. **`DISCARD_LATER` 被误用**：任务实际执行了，但调度中心日志被标记失败，从而触发重试；
6. **分片广播扩缩容**：`shardTotal` 变化导致同一数据被不同分片处理。

**关键结论**：`xxl_job_lock` 那把行锁**只保护「扫描 + 触发」这一瞬间，不保证任务不重复执行**。因为触发是异步的，且存在锁超时、网络分区、时钟漂移。

**幂等落地方式**：

| 方式 | 说明 |
| --- | --- |
| 业务幂等表 / 唯一索引 | 「任务名 + 业务 key + 时间窗口」做唯一约束，插入成功才执行 |
| 状态机 | 只允许合法状态流转（如「待对账 → 已对账」），重复触发时状态已变直接跳过 |
| 任务执行记录表 | 记录「任务 + 周期」（如 `bizDate`），已执行则跳过 |
| Redis 分布式锁 | `SETNX jobName + bizKey`，注意设置过期时间与续期 |

**调度锁解决的是「同一时刻谁来调度」，业务幂等解决的是「这条数据要不要再处理一次」——两者是不同层次的问题，缺一不可。**

### 7.4 日志表膨胀

`xxl_job_log` 是增长最快的一张表（每次触发一行）。`JobLogReportHelper` 会按 `xxl.job.logretentiondays` 清理，但要确认：

- 调度中心的日志清理配置是否生效（`logretentiondays` 默认 30）；
- 表是否已因索引过多导致写入慢（`I_job_id`、`I_trigger_time`、`I_handle_code` 三个二级索引）；
- 高频任务（秒级）单表一天可能写入几十万行，建议**缩短保留天数**或**按月分表**。

### 7.5 时钟漂移

`trigger_next_time` 是**绝对时间戳**，一旦某台机器时间被 NTP 回拨或被手工改动，会出现触发时间错乱与 misfire 误判。**全集群必须 NTP 同步，禁止手工改时间。**

---

## 8. 面试问法

**Q1：XXL-JOB 是怎么做到秒级触发精度的，不会每秒查库吗？**
- 答题要点：① 每 5 秒查一次 DB，条件是 `trigger_next_time <= now + 5000`；② 查出来的任务按触发秒写入内存时间轮 `ringData`（60 槽）；③ `ringThread` 每秒对齐整秒唤醒，取当前秒（+ 前一秒兜底）的槽位提交触发线程池；④ 这样 DB 查询频率降到 1/5，精度仍是秒级。
- 加分回答：`sleep(1000 - now % 1000)` 是对齐系统时钟整秒，避免误差累积；`sleep(PRE_READ_MS - 本轮耗时)` 让扫描节拍对齐 5 秒刻度而非「执行完再等 5 秒」。

**Q2：调度中心多实例部署，怎么保证任务只触发一次？**
- 答题要点：① 所有实例共享同一个 DB；② 扫描前 `SELECT * FROM xxl_job_lock WHERE lock_name='schedule_lock' FOR UPDATE` 抢行锁；③ 同一时刻只有一个实例能执行「扫描 + 写时间轮 + 触发」。
- 加分回答：**这把锁不保证任务不重复执行**。它只保护扫描与触发这一瞬间，触发本身是异步的（丢线程池），且存在锁超时、网络分区、时钟漂移。所以业务必须幂等。

**Q3：任务执行超时是怎么实现的？超时后任务真的会停吗？**
- 答题要点：① 超时判定在执行器侧 `JobThread`；② 设了 `executor_timeout` 时用 `FutureTask` 另起一条线程执行，JobThread 阻塞在 `futureTask.get(timeout)` 上；③ 超时抛 `TimeoutException`，调用 `handleTimeout` 标记失败，然后 `futureThread.interrupt()`。
- 加分回答：**interrupt 只是发信号，死循环、阻塞在不可中断 IO、等待 `synchronized` 锁三种情况都停不下来**——业务继续跑但中心已判失败，重试就会重复处理。另外 JobThread 阻塞在 `get()` 期间不消费队列，所以超时值不能设得远大于正常耗时。

**Q4：那个 3 秒的 HTTP 超时会把执行 5 分钟的任务判失败吗？**
- 答题要点：不会。`ExecutorBizImpl.run()` 只做「找 JobThread + 按阻塞策略入队」，入队成功立即返回 200，**不等执行完成**。任务执行是异步的，结果由执行器回调更新 `handle_code`。
- 加分回答：能主动指出「调度超时」与「执行超时」是两个独立维度，分别对应 `trigger_code` 与 `handle_code` 两段字段。

**Q5：阻塞处理策略三种的区别，`COVER_EARLY` 具体做了什么？**
- 答题要点：① `SERIAL_EXECUTION` 入队排队；② `DISCARD_LATER` 直接丢弃并标记失败；③ `COVER_EARLY` 终止正在执行的任务 **并清空队列**，然后执行本次。
- 加分回答：策略只作用于**单机内部**同一个 jobId，跨机器并发仍要靠路由策略或幂等。`COVER_EARLY` 终止也是靠 interrupt，同样不保证立刻停。

**Q6：`xxl_job_log` 表里 `trigger_code` 和 `handle_code` 有什么区别？**
- 答题要点：① `trigger_*` 是**调度阶段**结果（调度中心写，200 表示触发成功）；② `handle_*` 是**执行阶段**结果（执行器回调后更新，200 成功 / 500 失败）；③ 一行日志代表一次触发的完整生命周期，先写前半段再补后半段。
- 加分回答：`I_handle_code` 这个索引就是给 `JobFailMonitorHelper` 每 30 秒扫「失败但未告警」用的；`trigger_code=200 但 handle_code=500` 是失败重试的判定依据。

**Q7：分片广播任务在扩缩容时会有什么问题？**
- 答题要点：`shardTotal` 等于当前在线执行器数，扩缩容会改变分片规则，导致同一数据被不同分片处理，所以**分片任务必须幂等**。
- 加分回答：解决办法是把逻辑分片固定（如固定 32 个逻辑分片，执行器按 `shardIndex` 认领 `i += shardTotal`），让物理执行器数量与数据切分解耦。分片键要选分布均匀且稳定的（用户 ID），避免用创建时间这类聚集键。

**Q8：调度过期（misfire）是怎么判定的，怎么处理？**
- 答题要点：① 判定 `now - trigger_next_time > 5000ms`；② **过期不到 5 秒不算 misfire，会立即补触发一次**；③ 超过 5 秒按策略处理：`DO_NOTHING` 跳过所有错过周期只推进时间，`FIRE_ONCE_NOW` 立即补一次再跳未来。
- 加分回答：扫描周期是 5 秒，所以「过期几百毫秒」是正常现象，不是异常；把 5 秒阈值与扫描周期绑在一起，是为了避免正常的扫描抖动被误判成 misfire。

**Q9：调度中心挂了会怎样？**
- 答题要点：① 调度停止，任务不再触发，但已在执行器运行的任务照常跑完；② 多实例部署时其它实例接管（抢到锁即可继续）；③ 重启后靠 `trigger_next_time` 从 DB 恢复调度进度，错过的周期按 misfire 策略处理。
- 加分回答：**DB 挂了才是真正的致命点**——注册、锁、配置、日志全在 DB，所以生产上调度库必须做主从或高可用，且与业务库隔离。

**Q10：如果让你自己设计一个分布式调度系统，你会怎么做？**
- 答题要点：① 调度与执行分离；② 触发时间持久化（避免重启丢进度）；③ 用内存结构（时间轮或优先队列）承载近期任务，降低 DB 查询频率；④ 多实例用分布式锁选主调度；⑤ 分片广播支持并行；⑥ 幂等设计；⑦ 失败重试与告警；⑧ 任务日志与可观测性。
- 加分回答：能指出现有方案（时间轮 + 预读）的代价是「预读窗口内的时间精度受扫描周期影响」，如果要做毫秒级或任意延迟，应考虑 Netty `HashedWheelTimer`（多层时间轮）或 MQ 延迟消息。

---

## 9. 常见误区

| # | 错误说法 | 正确理解 |
| --- | --- | --- |
| 1 | XXL-JOB 每次都查数据库才知道要不要触发 | 每 5 秒查一次（预读窗口），窗口内的触发靠内存时间轮 |
| 2 | 时间轮是 RingBuffer / 定时器调度器 | 就是一个 `Map<秒, List<jobId>>`，由 `ringThread` 每秒消费，没有 tick 线程 |
| 3 | `@Transactional` 那种「超时」和 XXL-JOB 的执行超时是一回事 | HTTP 触发超时 3s 只管投递；执行超时是执行器侧的 `FutureTask` 机制；misfire 5s 是调度侧 |
| 4 | 任务执行超过 3 秒会被判失败 | 不会。`/run` 只负责入队，执行是异步的 |
| 5 | 超时后任务一定会停 | 只发 `interrupt()` 信号，死循环 / 不可中断 IO / `synchronized` 等待都停不下来 |
| 6 | 调度锁保证了任务不重复执行 | 只保证「同一时刻只有一个实例在调度」，不保证不重复。幂等必须业务自己做 |
| 7 | 一个任务的一次触发会创建一条线程 | 一个 **jobId** 对应一条 `JobThread`，多次触发是往它的队列里放任务 |
| 8 | 阻塞策略可以跨机器生效 | 只作用于单机内部同一 jobId，跨机器并发靠路由策略或幂等 |
| 9 | 执行器地址列表是由调度中心主动探测的 | 是执行器每 30 秒心跳上报写入 `xxl_job_registry`，调度中心只负责刷新与清理 |
| 10 | 换了 Nacos 注册中心就不再依赖 DB | 注册中心只管地址发现，**调度锁仍然依赖 DB**，MySQL 去不掉 |
| 11 | 秒级 CRON 也能精确到毫秒 | 调度精度是秒级，且受触发线程池排队影响，任务延迟是常态 |
| 12 | `xxl_job_log` 里存的是任务日志内容 | 存的是日志**位置索引**（logId）；真正的日志内容在执行器磁盘 `logpath/{yyyy-MM-dd}/{logId}.log` |

---

## 10. 我的薄弱点

（学完后自己填，同步到 `weakness.md`）
