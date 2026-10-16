# -*- coding: utf-8 -*-
"""生成 notebook/README.md —— 讲义总目录（按主题分组的完整文件清单）

用法：
    python scripts/gen_notebook_index.py            # 重新生成
    python scripts/gen_notebook_index.py --check    # 只校验是否最新（CI / 手動核对用）

规则：
- 主题目录名与 skill 知识地图一一对应：01-jvm.md -> jvm/
- 主题按知识地图编号排序，未登记的目录排在最后按字母序
- 清单中不包含本脚本生成的 README.md 自身
"""
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
NOTEBOOK = os.path.normpath(os.path.join(HERE, "..", "notebook"))
README = os.path.join(NOTEBOOK, "README.md")

# 主题目录 -> (知识地图文件, 一句话说明)
TOPICS = [
    ("jvm", "01-jvm.md", "JVM 内存结构、GC、类加载、调优与排查"),
    ("java-core", "02-java-core.md", "Java 底层：集合、并发/JMM、锁、类加载"),
    ("java-design-patterns", "10-java-design-patterns.md", "GoF 23 种设计模式：定义、实现、源码案例、辨析与坑"),
    ("mysql", "03-mysql.md", "索引、事务与锁、MVCC、执行计划、主从复制"),
    ("mq", "04-mq.md", "RabbitMQ / RocketMQ / Kafka"),
    ("spring-distributed", "05-spring-distributed.md", "分布式事务、缓存一致性、限流熔断"),
    ("xxl-job", "06-xxl-job.md", "调度架构、分片、幂等、高可用"),
    ("redis", "07-redis.md", "数据类型与编码、持久化、集群、缓存问题与分布式锁"),
    ("ai", "08-ai.md", "LLM / Prompt / RAG / Agent / Java 侧 AI 工程化"),
    ("algorithm", "09-algorithm.md", "复杂度分析、套路模板、手撕题、海量数据处理"),
    ("scenario-design", "11-scenario-design.md", "系统设计场景题：红包 / 秒杀 / 短链 / 点赞 等"),
]


def title_of(path):
    """取文件首个一级标题；取不到就用文件名。"""
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                m = re.match(r"^#\s+(.+?)\s*$", line)
                if m:
                    return m.group(1).strip()
    except OSError:
        pass
    return os.path.splitext(os.path.basename(path))[0]


def lines_of(path):
    try:
        with open(path, encoding="utf-8") as f:
            return sum(1 for _ in f)
    except OSError:
        return 0


def collect():
    """返回 [(topic_dir, [相对路径,...], 是否有README, 附件说明)]，仅含存在的目录。"""
    result = []
    for topic, _km, _desc in TOPICS:
        d = os.path.join(NOTEBOOK, topic)
        if not os.path.isdir(d):
            continue
        md, assets = [], []
        for root, _dirs, files in os.walk(d):
            for name in sorted(files):
                rel = os.path.relpath(os.path.join(root, name), NOTEBOOK).replace("\\", "/")
                if name.endswith(".md"):
                    md.append(rel)
                else:
                    assets.append(rel)
        md.sort(key=lambda p: (os.path.basename(p) != "README.md", p))
        result.append((topic, md, sorted(assets)))
    # 未在 TOPICS 中登记的目录
    known = {t for t, _, _ in TOPICS}
    for name in sorted(os.listdir(NOTEBOOK)):
        p = os.path.join(NOTEBOOK, name)
        if os.path.isdir(p) and name not in known and not name.startswith((".", "_")):
            md = sorted(f"{name}/{f}" for f in os.listdir(p) if f.endswith(".md"))
            assets = sorted(f"{name}/{f}" for f in os.listdir(p)
                            if not f.endswith(".md") and os.path.isfile(os.path.join(p, f)))
            result.append((name, md, assets))
    return result


def build():
    data = collect()
    total_md = sum(len(md) for _, md, _ in data)
    total_lines = sum(lines_of(os.path.join(NOTEBOOK, rel)) for _, md, _ in data for rel in md)
    gen = time.strftime("%Y-%m-%d")

    o = []
    a = o.append
    a("# notebook")
    a("")
    a("讲义存放处。**按主题分目录，不要直接堆在根下。**")
    a("")
    a(f"> 本文件由 `scripts/gen_notebook_index.py` 自动生成，最后更新于 {gen}。")
    a("> 新增 / 重命名讲义后重跑脚本即可刷新清单：")
    a(">")
    a("> ```bash")
    a("> python scripts/gen_notebook_index.py")
    a("> ```")
    a("")
    a("## 总览")
    a("")
    a(f"- **{len(data)}** 个主题目录，**{total_md}** 份讲义，累计约 **{total_lines:,}** 行")
    a("- 每个主题目录内可含一份 `README.md` 作为该主题的索引与高频题速查表")
    a("")
    a("## 目录约定")
    a("")
    a("主题目录名与 skill 知识地图文件一一对应：")
    a("")
    a("| 子目录 | 对应知识地图 | 内容 | 讲义数 |")
    a("| --- | --- | --- | --- |")
    desc_map = {t: d for t, _, d in TOPICS}
    for topic, md, _assets in data:
        a(f"| [`{topic}/`](#{topic}) | `{topic_to_km(topic)}` | {desc_map.get(topic, '—')} | {len(md)} 份 |")
    a("")
    a("## 讲义清单")
    for topic, md, assets in data:
        a("")
        a(f"### {topic}")
        a("")
        if not md:
            a("_（暂无讲义）_")
            a("")
            continue
        a("| 文件 | 标题 | 行数 |")
        a("| --- | --- | --- |")
        for rel in md:
            p = os.path.join(NOTEBOOK, rel)
            name = os.path.basename(rel)
            # README 位于 notebook 根目录，故直接用相对 notebook 的路径
            a(f"| [`{name}`]({rel}) | {title_of(p)} | {lines_of(p)} |")
        if assets:
            a("")
            a("配图 / 附件：" + "、".join(f"`{x}`" for x in assets))
        a("")
    a("## 文件命名")
    a("")
    "`<主题>-<小节>.md`，放进对应子目录。例如："
    for t in ["jvm/jvm-cms.md", "mysql/mysql-core-ten-topics.md", "redis/redis-05-internal-encoding.md"]:
        a(f"- `{t}`")
    a("")
    a("主题前缀保留（便于单独打开文件时辨认来源），分类靠目录表达。")
    a("")
    a("## 写作要求")
    a("")
    a("只记录自己的话、源码要点、踩过的坑，不要复制整段资料。")
    a("结构参考 skill 的 `assets/lecture-template.md`。")
    a("")
    return "\n".join(o)


def topic_to_km(topic):
    for t, km, _ in TOPICS:
        if t == topic:
            return km
    return "—"


def main():
    content = build()
    if "--check" in sys.argv:
        cur = open(README, encoding="utf-8").read() if os.path.exists(README) else ""
        print("README 已是最新" if cur == content else "README 已过期，请重跑 gen_notebook_index.py")
        return
    with open(README, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print(f"已生成 {README}")


if __name__ == "__main__":
    main()
