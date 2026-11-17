package com.study.interviewprep.utils.study.concurrent;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class CountDownLatchInitDemo {
    private static final int SERVICE_COUNT = 3;
    private static final CountDownLatch latch = new CountDownLatch(SERVICE_COUNT);
    private static final ExecutorService pool = Executors.newFixedThreadPool(SERVICE_COUNT);

    public static void main(String[] args) throws InterruptedException {
        String[] services = {"缓存预热", "字典加载", "RPC连接池"};
        for (String name : services) {
            pool.submit(() -> {
                try {
                    Thread.sleep((long) (Math.random() * 2000));  // 模拟初始化耗时
                    System.out.println(name + " 初始化完成");
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    latch.countDown();   // 无论成功失败都要减，否则主线程永远等
                }
            });
        }
        System.out.println("主线程等待所有服务初始化...");
        latch.await();                   // 阻塞直到 count 为 0
        System.out.println("全部就绪, 应用启动");
        pool.shutdown();
    }
}
