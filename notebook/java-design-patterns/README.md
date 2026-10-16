# Java 设计模式 · 笔记索引

> GoF 23 种设计模式全量成稿，一模式一文件。每份讲义的结构统一为：
> **是什么 → 解决什么问题 → 怎么写（含可运行示例）→ 使用场景（含 JDK / Spring / MyBatis / Dubbo 真实例子）→ 生产问题与排查 → 60 秒口述版 → 追问链·参考答案 → 误区·正解 → 相关模式**
> 架构图统一用 **Mermaid**（classDiagram / sequenceDiagram / stateDiagram-v2），直接在 Markdown 预览器里渲染，无需图片文件。

## 一句话总纲

| | 关注点 | 口诀 |
| --- | --- | --- |
| **创建型**（5） | 对象的**创建** | 绕开 `new`，把创建过程收口 |
| **结构型**（7） | 类与对象的**组合** | 用组合/包装改变结构，而不是改代码 |
| **行为型**（11） | 对象间的**职责与通信** | 把变化的行为抽出来，解耦交互 |

---

## 一、创建型（Creational）

| # | 文件 | 模式 | 一句话作用 | 典型场景 | 热度 |
| --- | --- | --- | --- | --- | --- |
| 01 | [`pattern-01-singleton.md`](pattern-01-singleton.md) | 单例 Singleton | 保证一个类在一个 JVM 内只有一个实例 | 配置、连接池、ID 生成器 | ★★★★★ |
| 02 | [`pattern-02-factory-method.md`](pattern-02-factory-method.md) | 工厂方法 Factory Method | 父类定创建接口，子类决定实例化哪个类 | `Calendar#getInstance()`、Spring `FactoryBean` | ★★★★☆ |
| 03 | [`pattern-03-abstract-factory.md`](pattern-03-abstract-factory.md) | 抽象工厂 Abstract Factory | 一个工厂产出**一整个产品族** | JDBC `Connection`、Dubbo `@SPI` | ★★★☆☆ |
| 04 | [`pattern-04-builder.md`](pattern-04-builder.md) | 建造者 Builder | **分步骤**构造复杂对象，终结重叠构造器 | `HttpRequest.newBuilder()`、Lombok `@Builder` | ★★★★☆ |
| 05 | [`pattern-05-prototype.md`](pattern-05-prototype.md) | 原型 Prototype | 用复制代替构造，关键在**深拷贝 vs 浅拷贝** | 昂贵对象的复制、配置模板 | ★★☆☆☆ |

## 二、结构型（Structural）

| # | 文件 | 模式 | 一句话作用 | 典型场景 | 热度 |
| --- | --- | --- | --- | --- | --- |
| 06 | [`pattern-06-adapter.md`](pattern-06-adapter.md) | 适配器 Adapter | 把一个接口**转换**成客户端期望的接口 | `InputStreamReader`、Spring MVC `HandlerAdapter` | ★★★★☆ |
| 07 | [`pattern-07-bridge.md`](pattern-07-bridge.md) | 桥接 Bridge | 抽象与实现分离，两个维度**独立变化** | JDBC 驱动、多渠道 × 多消息类型 | ★★☆☆☆ |
| 08 | [`pattern-08-composite.md`](pattern-08-composite.md) | 组合 Composite | 树形结构，让单个对象与组合对象**用法一致** | MyBatis `SqlNode`、组织架构/菜单树 | ★★★☆☆ |
| 09 | [`pattern-09-decorator.md`](pattern-09-decorator.md) | 装饰器 Decorator | **动态叠加**职责，替代继承爆炸 | `java.io` 流、MyBatis `CachingExecutor` | ★★★★☆ |
| 10 | [`pattern-10-facade.md`](pattern-10-facade.md) | 外观 Facade | 给一批子系统一个**统一入口** | SLF4J、`JdbcTemplate`、BFF 网关 | ★★★☆☆ |
| 11 | [`pattern-11-flyweight.md`](pattern-11-flyweight.md) | 享元 Flyweight | 分离内外状态，**按 key 共享**细粒度对象 | `IntegerCache`、`String` 常量池 | ★★★☆☆ |
| 12 | [`pattern-12-proxy.md`](pattern-12-proxy.md) | 代理 Proxy | **控制**对一个对象的访问 | MyBatis `MapperProxy`、Spring AOP | ★★★★★ |

## 三、行为型（Behavioral）

| # | 文件 | 模式 | 一句话作用 | 典型场景 | 热度 |
| --- | --- | --- | --- | --- | --- |
| 13 | [`pattern-13-chain-of-responsibility.md`](pattern-13-chain-of-responsibility.md) | 责任链 Chain of Responsibility | 请求沿链传递，处理者可**选择中断** | Servlet Filter、`HandlerInterceptor`、Netty Pipeline、Sentinel SlotChain | ★★★★★ |
| 14 | [`pattern-14-command.md`](pattern-14-command.md) | 命令 Command | 把请求**对象化**，支持排队/日志/撤销 | `Runnable`、`Callable`、undo log | ★★★☆☆ |
| 15 | [`pattern-15-interpreter.md`](pattern-15-interpreter.md) | 解释器 Interpreter | 为小文法定义 AST 并解释执行 | 正则、SpEL、OGNL | ★☆☆☆☆ |
| 16 | [`pattern-16-iterator.md`](pattern-16-iterator.md) | 迭代器 Iterator | 顺序访问聚合元素而不暴露内部结构（**重点 fail-fast**） | `java.util.Iterator`、MyBatis `Cursor` | ★★★☆☆ |
| 17 | [`pattern-17-mediator.md`](pattern-17-mediator.md) | 中介者 Mediator | 用中介**协调**一组对象，网状变星状 | `Timer`、线程池、MQ、Controller | ★★☆☆☆ |
| 18 | [`pattern-18-memento.md`](pattern-18-memento.md) | 备忘录 Memento | 保存状态**快照**用于回滚，且不破坏封装 | 事务 undo log、SAVEPOINT、编辑器 undo | ★★☆☆☆ |
| 19 | [`pattern-19-observer.md`](pattern-19-observer.md) | 观察者 Observer | 一对多依赖，状态变更**自动通知** | Spring `@EventListener`、`PropertyChangeListener` | ★★★★★ |
| 20 | [`pattern-20-state.md`](pattern-20-state.md) | 状态 State | 行为随**内部状态**自动改变 | 订单/支付状态机、线程状态、Spring StateMachine | ★★★★☆ |
| 21 | [`pattern-21-strategy.md`](pattern-21-strategy.md) | 策略 Strategy | 封装一组**可互换算法**，消除 `if-else` | `Comparator`、`RejectedExecutionHandler`、支付方式 | ★★★★★ |
| 22 | [`pattern-22-template-method.md`](pattern-22-template-method.md) | 模板方法 Template Method | 固定算法骨架，**步骤延迟到子类** | **AQS `acquire`→`tryAcquire`**、`HttpServlet#service`、`refresh()` | ★★★★☆ |
| 23 | [`pattern-23-visitor.md`](pattern-23-visitor.md) | 访问者 Visitor | 不改元素类即可新增**操作**，靠**双分派** | `FileVisitor`、ASM `ClassVisitor`、注解处理器 | ★☆☆☆☆ |

---

## 易混模式辨析速查（面试最常追问）

| 对比 | 本质区别 | 一句话口诀 |
| --- | --- | --- |
| **工厂方法 vs 抽象工厂** | 一个工厂产**一个产品** vs 产**一整个产品族** | 「单品 vs 一套」；抽象工厂加产品族易、加产品等级难（开闭原则倾斜） |
| **简单工厂 vs 工厂方法** | 简单工厂一个静态方法 + `if/else`，加产品要改工厂类，**违反开闭**，且**不是 GoF 23 种之一** | 「简单工厂是语法技巧，工厂方法是设计模式」 |
| **适配器 vs 装饰器 vs 代理** | 适配器**改接口**；装饰器**不改接口、加职责、可层层叠加**；代理**不改接口、控制访问、通常只包一层** | 「换接口 / 加功能 / 管访问」 |
| **装饰器 vs 责任链** | 装饰器**必须**继续调用被装饰对象；责任链处理者可以**中断**传递 | 「一个必须走到底，一个可以喊停」 |
| **桥接 vs 适配器** | 桥接是**设计前**分离两个变化维度；适配器是**事后**补救不兼容的接口 | 「桥先修好再通车，适配器是硬接」 |
| **外观 vs 中介者** | 外观**单向**（客户端→子系统，子系统不知道它）；中介者**双向**（同事之间经它协调） | 「对外简化 vs 对内协调」 |
| **享元 vs 单例 vs 对象池** | 享元**按 key 共享多份**且对象被同时使用（必须不可变）；单例**全局一份**；对象池**独占借还** | 「共享 / 唯一 / 借用」 |
| **策略 vs 状态** | UML 几乎相同。**策略由客户端主动选择**且策略间互不感知；**状态由内部自动流转**且状态间互相知晓 | 「策略是你选的，状态是它自己变的」 |
| **策略 vs 模板方法** | 策略用**组合**（接口）替换整个算法；模板方法用**继承**（抽象类）只替换部分步骤 | 「可换 vs 只填空」；现代工程优先组合 |
| **命令 vs 策略** | 命令封装**请求**（为了排队/撤销/日志）；策略封装**算法**（为了替换） | 「存的是动作 vs 存的是算法」 |
| **备忘录 vs 命令撤销** | 备忘录存**状态快照**，直接整体覆盖；命令 undo 执行**逆操作** | 「回档 vs 反悔」 |
| **观察者 vs 发布订阅** | 观察者**同步、直接调用、彼此知晓**；发布订阅有 **Broker**、通常异步、互不知晓 | 「对象级通知 vs 架构级总线」 |
| **观察者 vs 中介者** | 观察者**单向广播**；中介者**双向协调**同事间的交互 | 「广播 vs 调度」 |
| **访问者 vs 迭代器** | 迭代器负责**遍历**；访问者负责**对不同类型元素做不同操作**（靠双分派） | 「怎么走 vs 走到位做什么」 |

---

## 框架 / 源码速查（答题时举真例子）

| 模式 | JDK 里的例子 | 框架里的例子 |
| --- | --- | --- |
| 单例 | `Runtime#getRuntime()` | Spring `SingletonBeanRegistry` |
| 工厂方法 | `Calendar#getInstance()`、`NumberFormat#getInstance()` | Spring `FactoryBean`、SLF4J `LoggerFactory` |
| 抽象工厂 | `Connection#createStatement()`（JDBC 产品族） | Dubbo `ProxyFactory` / `RegistryFactory` |
| 建造者 | `StringBuilder`、`HttpRequest.newBuilder()` | MyBatis `SqlSessionFactoryBuilder`、OkHttp `Request.Builder` |
| 原型 | `ArrayList#clone()`、`Calendar#clone()` | 深拷贝工具（注意 Spring/Apache `BeanUtils` 是**浅拷贝**） |
| 适配器 | `InputStreamReader`、`Arrays#asList()`、`FutureTask` | Spring MVC `HandlerAdapter`、MyBatis 日志适配 |
| 桥接 | JDBC `DriverManager` + `Driver` | SLF4J 门面与实现绑定 |
| 组合 | AWT `Container`/`Component` | MyBatis `SqlNode` 动态 SQL 树 |
| 装饰器 | `java.io` 全家桶、`Collections#synchronizedList()` | MyBatis `CachingExecutor`、Dubbo `ProtocolFilterWrapper` |
| 外观 | `Executors` | SLF4J、`JdbcTemplate`、`SqlSession`、API 网关 |
| 享元 | `IntegerCache`（-128~127）、`String` 常量池 | 各类按 key 复用的不可变缓存 |
| 代理 | JDK `Proxy` / `InvocationHandler` | MyBatis `MapperProxy`、Spring AOP（`@Transactional` / `@Cacheable`） |
| 责任链 | Servlet `Filter` | Spring MVC `HandlerInterceptor`、Netty `ChannelPipeline`、Sentinel `SlotChain` |
| 命令 | `Runnable` / `Callable` + 线程池队列 | 数据库 undo log / redo log |
| 解释器 | `java.util.regex.Pattern` | SpEL、OGNL、MyBatis 动态 SQL 表达式 |
| 迭代器 | `Iterator` / `Spliterator` | MyBatis `Cursor` 流式查询 |
| 中介者 | `Timer`、`ExecutorService` | MQ、注册中心、MVC Controller |
| 备忘录 | 事务 SAVEPOINT、undo log | 编辑器 `UndoManager`、快照回滚 |
| 观察者 | `PropertyChangeListener`、JDK 9 `Flow` | Spring `@EventListener` / `@TransactionalEventListener`、Guava `EventBus` |
| 状态 | `Thread.State`、TCP 状态机 | Spring StateMachine、订单/支付状态流转 |
| 策略 | `Comparator`、`ThreadPoolExecutor` 的 `RejectedExecutionHandler` | Spring Security `PasswordEncoder`、支付/优惠计算 |
| 模板方法 | **AQS `acquire()`→`tryAcquire()`**、`HttpServlet#service()` | Spring `AbstractApplicationContext#refresh()`、MyBatis `BaseExecutor#query()` |
| 访问者 | `java.nio.file.FileVisitor`、`ElementVisitor` | ASM `ClassVisitor`、ANTLR Visitor、注解处理器 |

---

## 面试高频题速查

| # | 题目 | 答案位置 |
| --- | --- | --- |
| 1 | 手写一种线程安全的懒加载单例，并说明 DCL 为什么加 `volatile`？ | pattern-01 |
| 2 | 枚举单例为什么能防反射和序列化？ | pattern-01 |
| 3 | Spring 的单例和设计模式的单例是一回事吗？ | pattern-01 |
| 4 | 简单工厂、工厂方法、抽象工厂的区别？抽象工厂违反开闭吗？ | pattern-02 / 03 |
| 5 | Lombok `@Builder` 有什么坑？ | pattern-04 |
| 6 | 深拷贝和浅拷贝怎么实现？`BeanUtils.copyProperties` 是哪种？ | pattern-05 |
| 7 | Spring 的 prototype 作用域是原型模式吗？ | pattern-05 |
| 8 | 类适配器和对象适配器区别？Java 里能用哪种？ | pattern-06 |
| 9 | 装饰器、代理、适配器三者怎么区分？ | pattern-06 / 09 / 12 |
| 10 | 组合模式的透明式和安全式怎么取舍？ | pattern-08 |
| 11 | `Integer.valueOf(127) == Integer.valueOf(127)` 为什么是 true？ | pattern-11 |
| 12 | 享元和对象池（连接池）是一回事吗？ | pattern-11 |
| 13 | JDK 动态代理和 CGLib 的区别？Spring 默认用哪个？ | pattern-12 |
| 14 | 为什么同类内部调用 `@Transactional` 方法事务不生效？ | pattern-12 |
| 15 | MyBatis 的 Mapper 接口没有实现类，怎么执行 SQL？ | pattern-12 |
| 16 | 多个 `HandlerInterceptor` 的执行顺序是怎样的？ | pattern-13 |
| 17 | Netty 的 Pipeline 和 Servlet Filter 都是责任链，有什么不同？ | pattern-13 |
| 18 | `ArrayList` 遍历时 `remove` 为什么抛 `ConcurrentModificationException`？ | pattern-16 |
| 19 | `CopyOnWriteArrayList` 的迭代器为什么不抛 CME？ | pattern-16 |
| 20 | 外观模式和中介者模式的区别？ | pattern-10 / 17 |
| 21 | 观察者和发布订阅的区别？Spring 事件是同步还是异步？ | pattern-19 |
| 22 | `@TransactionalEventListener` 解决什么问题？ | pattern-19 |
| 23 | 状态模式和策略模式 UML 一样，区别在哪？ | pattern-20 |
| 24 | 订单状态机怎么保证并发下不重复流转？ | pattern-20 |
| 25 | 策略模式怎么彻底消除 `if-else`？Spring 里怎么做？ | pattern-21 |
| 26 | 模板方法和策略模式怎么选？举个 JDK 里的模板方法 | pattern-22 |
| 27 | AQS 用到了什么设计模式？ | pattern-22 |
| 28 | 访问者模式的双分派是怎么回事？为什么加元素类很难？ | pattern-23 |

---

## 学习建议

1. **优先级**：先吃透 5 星 + 4 星共 10 个（01 单例 / 12 代理 / 13 责任链 / 19 观察者 / 21 策略 / 02 工厂方法 / 04 建造者 / 06 适配器 / 09 装饰器 / 20 状态 / 22 模板方法），其余能在被问到时讲清定义 + 一个真实例子即可。
2. **答题公式**：`定义 → 解决什么痛点 → 一句真实例子（类名/方法名）→ 与相近模式的区别 → 生产里的坑`。只背 UML 不加真实案例，在 P6/P7 面试里基本拿不到分。
3. **最容易翻车的三处**：单例的 `volatile`、代理的自调用失效、迭代器的 fail-fast。这三处是追问的深水区，务必能讲到源码层。
4. **不要背 UML 图**：面试官问的是「什么时候用、为什么不用别的方案」，把「辨析速查表」那几组对子讲清楚，比画 23 张类图有用得多。
