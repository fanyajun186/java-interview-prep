# Spring 与分布式 · 笔记索引

> 覆盖 Spring Boot / Spring Cloud / Spring Cloud Alibaba 与分布式基础。版本基线以 2026-10 的官方稳定版为准。

## 讲义清单

| 文件 | 主题 | 一句话 |
| --- | --- | --- |
| [`spring-distributed-transactions.md`](spring-distributed-transactions.md) | 分布式事务 | 2PC/TCC/Saga/本地消息/事务消息/Seata |
| [`spring-distributed-id-snowflake.md`](spring-distributed-id-snowflake.md) | 分布式 ID | Snowflake、时钟回拨、号段模式 |
| [`spring-distributed-nacos.md`](spring-distributed-nacos.md) | Nacos | 注册中心 + 配置中心、gRPC 长连接、Distro/JRaft |
| [`spring-distributed-eureka.md`](spring-distributed-eureka.md) | Eureka | 心跳、AP、内存注册表、自我保护 |
| [`spring-distributed-sentinel.md`](spring-distributed-sentinel.md) | Sentinel | 流控、滑动窗口、熔断状态机、雪崩 |
| [`spring-distributed-springboot-startup.md`](spring-distributed-springboot-startup.md) | Spring Boot 启动 | run 主干、事件顺序、内嵌容器 |
| [`spring-distributed-openfeign.md`](spring-distributed-openfeign.md) | OpenFeign | `@FeignClient` 字段、Encoder/Decoder、LoadBalancer、Ribbon 退场 |
| [`spring-distributed-resilience4j.md`](spring-distributed-resilience4j.md) | Resilience4j | 熔断、舱壁、限流、重试、超时、降级 |
| [`spring-distributed-boot-vs-cloud.md`](spring-distributed-boot-vs-cloud.md) | Boot vs Cloud | 定位差异、生态、版本对应 |
| [`spring-distributed-circular-dependency.md`](spring-distributed-circular-dependency.md) | 循环依赖 | 三级缓存、`getEarlyBeanReference`、为什么解不了、`@Lazy` 修法 |
| [`spring-distributed-cap.md`](spring-distributed-cap.md) | CAP | 为什么只能满足两个、CP/AP 选型 |

## 版本基线

- Spring Boot **4.1.x**，Spring Cloud **2025.1.x（Oakwood）**，Spring Cloud Alibaba **2025.1.0.0**
- Nacos **3.2.4**（2.x 线 **2.5.4**），Sentinel **1.8.10**，Resilience4j **2.4.0**，Eureka 维护模式
- Ribbon 自 **2020.0** 移除，改用 Spring Cloud LoadBalancer

## 高频题速查

| 问题 | 先看哪份 |
| --- | --- |
| 注册中心怎么选、Nacos 变更怎么推送 | `spring-distributed-nacos.md` |
| Eureka 心跳、自我保护、注册表存哪 | `spring-distributed-eureka.md` |
| Sentinel 滑动窗口、熔断状态机、雪崩 | `spring-distributed-sentinel.md` |
| Spring Boot 启动流程、内嵌 Tomcat 时机 | `spring-distributed-springboot-startup.md` |
| OpenFeign 调用链、@FeignClient 字段、LoadBalancer | `spring-distributed-openfeign.md` |
| Resilience4j 熔断/舱壁/限流/重试/超时 | `spring-distributed-resilience4j.md` |
| Boot 和 Cloud 区别、生态与版本 | `spring-distributed-boot-vs-cloud.md` |
| 三级缓存为什么不能省成两级、2.6 为什么报错 | `spring-distributed-circular-dependency.md` |
| CAP 为什么只能满足两个 | `spring-distributed-cap.md` |
