package com.study.interviewprep.utils.study.concurrent;

import java.util.concurrent.atomic.AtomicMarkableReference;

public class AtomicMarkableDemo {
    public static void main(String[] args) {
        AtomicMarkableReference<String> ref =
                new AtomicMarkableReference<>("node", false);
        System.out.println("初始: " + ref.getReference() + ", marked=" + ref.isMarked());

        // 标记该节点"已被逻辑删除"
        boolean ok = ref.compareAndSet("node", "node", false, true);
        System.out.println("标记为已删除: " + ok + ", marked=" + ref.isMarked());

        // 另一个线程拿着旧的 marked=false 来改, 会失败
        boolean ok2 = ref.compareAndSet("node", "other", false, false);
        System.out.println("用旧标记尝试修改: " + ok2 + " (false 说明感知到已被改过)");
    }
}
