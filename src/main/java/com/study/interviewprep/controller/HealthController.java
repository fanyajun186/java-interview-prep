package com.study.interviewprep.controller;

import java.time.Instant;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 健康检查接口：验证应用是否正常启动，顺带消除根路径 404。
 */
@RestController
public class HealthController {

    @GetMapping({"/", "/health"})
    public Map<String, Object> health() {
        return Map.of(
                "status", "UP",
                "app", "java-interview-prep",
                "time", Instant.now().toString()
        );
    }
}
