package com.study.interviewprep.utils.study.concurrent;

import java.util.concurrent.Semaphore;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class SemaphoreRateLimitDemo {
    // 同一时刻最多 3 个线程调用下游接口
    private static final Semaphore semaphore = new Semaphore(3);
    private static final ExecutorService pool = Executors.newFixedThreadPool(10);

    public static void main(String[] args) throws InterruptedException {
        for (int i = 1; i <= 10; i++) {
            final int taskId = i;
            pool.submit(() -> {
                try {
                    semaphore.acquire();          // 抢许可，抢不到就阻塞
                    try {
                        System.out.println(Thread.currentThread().getName()
                                + " 调用下游接口, task=" + taskId
                                + ", 剩余许可=" + semaphore.availablePermits());
                        Thread.sleep(200);        // 模拟 RPC 耗时
                    } finally {
                        System.out.println(Thread.currentThread().getName()
                                + " 释放许可, task=" + taskId
                                + ", 剩余许可=" + semaphore.availablePermits());
                        semaphore.release();       // 必须在 finally 释放
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            });
        }
        pool.shutdown();
        pool.awaitTermination(30, TimeUnit.SECONDS);
        System.out.println("所有任务执行完成");
        // 不加这行，程序不会退出
        System.exit(0);// 不等非守护线程，直接走关闭流程
    }
}
