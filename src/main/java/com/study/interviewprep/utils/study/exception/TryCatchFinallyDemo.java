package com.study.interviewprep.utils.study.exception;

public class TryCatchFinallyDemo {
    public static int testReturn() {
        try {
            System.out.println("try 执行");
            return 100;
        } catch (Exception e) {
            System.out.println("catch 执行");
            return 200;
        } finally {
            System.out.println("finally 执行");
        }
    }

    public static void main(String[] args) {
        System.out.println(testReturn());
    }
}
