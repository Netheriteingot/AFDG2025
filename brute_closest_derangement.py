#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P15075 [ICPC 2024 Chengdu R] Closest Derangement -- 暴力参考程序

枚举 p 的所有错位排列 q（满足 q_i != p_i），求
    cost(q) = sum_i |p_i - q_i|
的最小值、取到最小值的 q 的个数，以及字典序第 k 小的那一个。

用法：
    python brute_closest_derangement.py              # 按题目输入格式从 stdin 读入
    python brute_closest_derangement.py --count      # 每组只输出「最小代价 个数」
    python brute_closest_derangement.py --all 6      # 枚举 n=6 的所有排列 p，逐个输出统计
    python brute_closest_derangement.py --selftest   # 与 itertools 全枚举对拍

复杂度：最坏仍是指数级（本质上枚举所有错位排列），但用可采纳下界剪枝；
实测 n <= 20 通常很快，n 到 30 左右视数据可能要几十秒，再大不适合。
注意 --all n 的总量约为 (n!)^2，n 建议 <= 7。
"""

import sys
from itertools import permutations

INF = 10 ** 18


def lower_bound(p, used, i, cost):
    """
    从第 i 个位置（含）往后，剩余每个位置各自选最近可用值所贡献的下界之和。
    忽略「多个位置抢同一个值」的冲突，因此是合法的下界。
    若某个剩余位置已无值可选，返回 INF。
    """
    n = len(p)
    lb = cost
    for j in range(i, n):
        pj = p[j]
        m = INF
        for v in range(1, n + 1):
            if not used[v] and v != pj:
                d = abs(pj - v)
                if d < m:
                    m = d
        if m == INF:
            return INF
        lb += m
    return lb


def min_cost(p):
    """返回所有错位排列 q 中 sum |p_i - q_i| 的最小值。"""
    n = len(p)
    used = [False] * (n + 1)
    best = INF

    def dfs(i, cost):
        nonlocal best
        if i == n:
            if cost < best:
                best = cost
            return
        if lower_bound(p, used, i, cost) >= best:
            return
        pi = p[i]
        # 先试距离近的值，尽快得到一个紧的上界用于剪枝
        cand = [v for v in range(1, n + 1) if not used[v] and v != pi]
        cand.sort(key=lambda v: abs(pi - v))
        for v in cand:
            used[v] = True
            dfs(i + 1, cost + abs(pi - v))
            used[v] = False

    dfs(0, 0)
    return best


def count_and_kth(p, best, k=1):
    """
    按字典序枚举所有最小代价解。
    返回 (个数, 字典序第 k 个解)；k 为 0 时不记录具体解，返回 None。
    """
    n = len(p)
    used = [False] * (n + 1)
    q = [0] * n
    count = 0
    kth = None

    def dfs(i, cost):
        nonlocal count, kth
        if i == n:
            if cost == best:
                count += 1
                if k > 0 and count == k:
                    kth = q.copy()
            return
        # 按字典序枚举；下界已超过 best 的子树不可能产生最优解
        if lower_bound(p, used, i, cost) > best:
            return
        pi = p[i]
        for v in range(1, n + 1):
            if not used[v] and v != pi:
                used[v] = True
                q[i] = v
                dfs(i + 1, cost + abs(pi - v))
                used[v] = False

    dfs(0, 0)
    return count, kth


def solve_one(p, k):
    """返回 (最小代价, 解的个数, 字典序第 k 小的最优解或 None)。"""
    best = min_cost(p)
    cnt, kth = count_and_kth(p, best, k)
    return best, cnt, kth


def naive(p):
    """最朴素的全排列枚举，用于对拍。返回 (最小代价, 所有最优解列表)。"""
    n = len(p)
    best = INF
    sols = []
    for q in permutations(range(1, n + 1)):
        if any(q[i] == p[i] for i in range(n)):
            continue
        cost = sum(abs(p[i] - q[i]) for i in range(n))
        if cost < best:
            best = cost
            sols = [q]
        elif cost == best:
            sols.append(q)
    return best, sols


def run_problem(data, count_only):
    """按题目格式处理：T 组 (n, k, p)。"""
    if not data:
        return []
    t = data[0]
    idx = 1
    out = []
    for _ in range(t):
        n, k = data[idx], data[idx + 1]
        idx += 2
        p = data[idx:idx + n]
        idx += n

        best = min_cost(p)
        if count_only:
            cnt, _ = count_and_kth(p, best, 0)
            out.append(f"{best} {cnt}")
        else:
            cnt, kth = count_and_kth(p, best, k)
            if kth is None:
                out.append("-1")
            else:
                out.append(" ".join(map(str, kth)))
    return out


def run_all(n):
    """枚举所有长度为 n 的排列 p，输出「p 最小代价 个数」。"""
    hist = {}
    cost_hist = {}
    total = 0
    for p in permutations(range(1, n + 1)):
        p = list(p)
        best = min_cost(p)
        cnt, _ = count_and_kth(p, best, 0)
        print(*p, best, cnt)
        hist[cnt] = hist.get(cnt, 0) + 1
        cost_hist[best] = cost_hist.get(best, 0) + 1
        total += 1
    print(f"# p 的总数: {total}", file=sys.stderr)
    print("# 个数分布 (个数: 有多少个 p 达到该个数):", file=sys.stderr)
    for c in sorted(hist):
        print(f"#   {c}: {hist[c]}", file=sys.stderr)
    print("# 最小代价分布 (代价: 有多少个 p):", file=sys.stderr)
    for c in sorted(cost_hist):
        print(f"#   {c}: {cost_hist[c]}", file=sys.stderr)


def selftest():
    """与 itertools 全枚举暴力对拍。"""
    import random

    random.seed(20241020)

    # 小 n：检查全部 p
    for n in range(2, 7):
        for p in permutations(range(1, n + 1)):
            p = list(p)
            best, sols = naive(p)
            c = min_cost(p)
            assert c == best, (p, c, best)
            if sols:
                cnt, kth = count_and_kth(p, c, 1)
                assert cnt == len(sols), (p, cnt, len(sols))
                assert kth == list(sols[0]), (p, kth, sols[0])
                cnt, kth = count_and_kth(p, c, len(sols))
                assert kth == list(sols[-1]), (p, kth, sols[-1])
                cnt, kth = count_and_kth(p, c, len(sols) + 1)
                assert kth is None, (p, kth)
            else:
                assert count_and_kth(p, c, 0)[0] == 0

    # n = 7：随机抽查
    n = 7
    for _ in range(20):
        p = list(range(1, n + 1))
        random.shuffle(p)
        best, sols = naive(p)
        c = min_cost(p)
        cnt, kth = count_and_kth(p, c, 1)
        assert c == best, (p, c, best)
        assert cnt == len(sols), (p, cnt, len(sols))
        assert kth == list(sols[0]), (p, kth, sols[0])

    print("selftest OK")


def main():
    # 避免 Windows 终端下中文输出乱码
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    args = sys.argv[1:]

    if args and args[0] == "--selftest":
        selftest()
        return

    if args and args[0] == "--all":
        if len(args) < 2:
            print("usage: --all n", file=sys.stderr)
            sys.exit(1)
        n = int(args[1])
        if n > 7:
            print("警告: --all n 的总量约为 (n!)^2，n > 7 会非常慢", file=sys.stderr)
        run_all(n)
        return

    count_only = bool(args and args[0] == "--count")
    data = list(map(int, sys.stdin.buffer.read().split()))
    out = run_problem(data, count_only)
    sys.stdout.write("\n".join(out) + ("\n" if out else ""))


if __name__ == "__main__":
    sys.setrecursionlimit(10000)
    main()
