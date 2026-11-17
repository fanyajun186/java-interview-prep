package com.study.interviewprep.utils.study.concurrent;

import java.util.concurrent.atomic.AtomicStampedReference;

public class AtomicStampedFixDemo {

    // 版本戳: 值每发生一次变化就 +1
    private static AtomicStampedReference<Integer> ref =
            new AtomicStampedReference<>(100, 1200);

    public static void main(String[] args) throws InterruptedException {
        System.out.println("===== 场景: 100 -> 50 -> 100, 中间被改过 =====");

        Thread t1 = new Thread(() -> {
            // 用 get(int[]) 一次读出配套的 值 + 戳（别分开调两次，见 §7.5）
            int[] stampHolder = new int[1];
            Integer value = ref.get(stampHolder);
            int stamp = stampHolder[0];      // 读到 value=100, stamp=0
            System.out.println("T1 读到 value=" + value + ", stamp=" + stamp);

            try { Thread.sleep(1000); } catch (InterruptedException e) { }

            // 同时比较 值 和 版本戳
            boolean ok = ref.compareAndSet(value, value - 20, stamp, stamp + 1);
            System.out.println("T1 CAS(value:100->80, stamp:" + stamp + "->" + (stamp + 1) + ") 结果 = " + ok);
        });

        Thread t2 = new Thread(() -> {
            try { Thread.sleep(100); } catch (InterruptedException e) { }
            ref.compareAndSet(100, 50, ref.getStamp(), ref.getStamp() + 1);
            System.out.println("T2 扣款 50 完成, 当前 value=" + ref.getReference()
                    + ", stamp=" + ref.getStamp());
        });

        Thread t3 = new Thread(() -> {
            try { Thread.sleep(500); } catch (InterruptedException e) { }
            ref.compareAndSet(50, 100, ref.getStamp(), ref.getStamp() + 1);
            System.out.println("T3 退款 50 完成, 当前 value=" + ref.getReference()
                    + ", stamp=" + ref.getStamp());
        });

        t1.start(); t2.start(); t3.start();
        t1.join(); t2.join(); t3.join();

        System.out.println("最终 value=" + ref.getReference() + ", stamp=" + ref.getStamp());
        System.out.println("结论: T1 的 CAS 失败(false), ABA 被版本戳挡住了");
    }
}
