package com.study.interviewprep;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 面试复习工作区启动类。
 *
 * <p>后续做的实验（如 GC 日志、锁、EXPLAIN 等）都可以作为子包挂在这个启动类的扫描范围内。</p>
 */
@SpringBootApplication
public class InterviewPrepApplication {

    public static void main(String[] args) {
        SpringApplication.run(InterviewPrepApplication.class, args);
    }
}
