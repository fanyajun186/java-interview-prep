package com.study.interviewprep.utils.study.concurrent;

import java.util.concurrent.atomic.AtomicInteger;

public class AbaAccountDemo {

    private static AtomicInteger balance = new AtomicInteger(100);

    /**
     * T2 扣款 50: true
     * T1 读到余额 = 100
     * T3 退款 50: true
     * T1 CAS(100, 80) 结果 = true, 最终余额 = 80
     * === 期望余额 80 (100-20), 实际 80 ===
     * 注意: 退款 50 这笔被 T1 的 CAS 无声吞掉了
     * @param args
     * @throws InterruptedException
     */
    public static void main(String[] args) throws InterruptedException {
        // T1: 读余额, 打算扣 20, 但故意慢一步
        Thread t1 = new Thread(() -> {
            int expected = balance.get();          // 读到 100
            System.out.println("T1 读到余额 = " + expected);
            try {
                Thread.sleep(1000);
            } catch (InterruptedException e) {

            }
            // 此刻余额已经历 100 -> 50 -> 100, T1 的 CAS 依然成功
            boolean ok = balance.compareAndSet(expected, expected - 20);
            System.out.println("T1 CAS(100, 80) 结果 = " + ok + ", 最终余额 = " + balance.get());
        });

        // T2: 扣款 50
        Thread t2 = new Thread(() -> {
            System.out.println("T2 扣款 50: " + balance.compareAndSet(100, 50));
        });

        // T3: 退款 50, 余额又回到 100
        Thread t3 = new Thread(() -> {
            try { Thread.sleep(300); } catch (InterruptedException e) { }
            System.out.println("T3 退款 50: " + balance.compareAndSet(50, 100));
        });

        t1.start(); t2.start(); t3.start();
        t1.join(); t2.join(); t3.join();
        System.out.println("=== 期望余额 80 (100-20), 实际 " + balance.get() + " ===");
        System.out.println("注意: 退款 50 这笔被 T1 的 CAS 无声吞掉了");
    }
}
