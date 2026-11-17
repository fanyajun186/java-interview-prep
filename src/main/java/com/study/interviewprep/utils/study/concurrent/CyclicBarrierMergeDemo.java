package com.study.interviewprep.utils.study.concurrent;

import java.util.concurrent.BrokenBarrierException;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

public class CyclicBarrierMergeDemo {
    private static final int PARTIES = 4;
    private static final int[] partial = new int[PARTIES];
    private static final AtomicInteger total = new AtomicInteger();

    public static void main(String[] args) {
        // 最后一个到达的线程负责合并各分片结果
        CyclicBarrier barrier = new CyclicBarrier(PARTIES, () -> {
            int sum = 0;
            for (int v : partial) {
                sum += v;
            }
            total.set(sum);
            System.out.println("本轮合并完成, 结果 = " + sum + ", 屏障自动重置");
        });

        ExecutorService pool = Executors.newFixedThreadPool(PARTIES);
        for (int i = 0; i < PARTIES; i++) {
            final int idx = i;
            pool.submit(() -> {
                try {
                    for (int round = 1; round <= 2; round++) {   // 跑两轮, 验证可循环
                        partial[idx] = (idx + 1) * 100 + round;  // 模拟本分片计算
                        System.out.println(partial[idx]);
                        System.out.println(Thread.currentThread().getName() + " 第" + round + "轮到达屏障");
                        barrier.await();                         // 互相等待, 到齐一起走
                    }
                } catch (InterruptedException | BrokenBarrierException e) {
                    System.out.println("屏障被打破: " + e.getClass().getSimpleName());
                }
            });
        }
        pool.shutdown();
    }
}
