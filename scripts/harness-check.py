#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
harness-check.py — 汇总体检：一条命令看 harness 健康（一句话驱动"执行 harness"的落点）。

把分散在多个脚本/文件里的状态汇总成一份固定格式报告：
    1. 指令层：CLAUDE.md/AGENTS.md 存在？含「项目 Harness 指针」节？
    2. 记忆层：STATE.json 规则数/事故数；notes/ 决策四态计数 + note-lifecycle verify 状态
    3. 交接层：HANDOFF.md 存在？变更日志最后一条日期（是否已过期未更新）
    4. 执行层：.claude/settings.json 是否配置 PostToolUse/Stop hooks
    5. 整体：调用 audit.py 拿退出码（0=健康，1=NOT-OK，2=参数错，3=drift）
    6. 建议：按检查结果给出下一步动作清单

用法：
    python scripts/harness-check.py [--dir <项目根>] [--json]

退出码：0=全绿或仅有提示；1=存在 NOT-OK（与 audit 联动）。
纯标准库；UTF-8 三通道；不写 __pycache__。
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys

for _stream_name in ("stdout", "stdin", "stderr"):
    _s = getattr(sys, _stream_name, None)
    if _s is not None and hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

sys.dont_write_bytecode = True

HERE = os.path.dirname(os.path.abspath(__file__))
# 指令文件里"已嵌入 harness 治理"的节标题标记（任一命中即认为有治理节；模板/惯例/英文变体都认）
POINTER_MARKS = ("项目 Harness 指针", "Harness governance", "Harness 日常用法", "Harness Governance")


def _read(path):
    try:
        with open(path, "r", encoding="utf-8-sig") as fh:
            return fh.read()
    except OSError:
        return None


def _today():
    return datetime.date.today().isoformat()


def _run_script(root, script, *args):
    """跑同目录脚本，返回 (exit, stdout)。best-effort，失败返回 (2, "")。

    注意：--root 放在子命令之后（note-lifecycle.py verify --root X 才是合法顺序）。
    """
    path = os.path.join(HERE, script)
    if not os.path.isfile(path):
        return 2, ""
    try:
        r = subprocess.run([sys.executable, "-B", path] + list(args) + ["--root", root],
                           capture_output=True, timeout=180, text=True, encoding="utf-8", errors="replace")
        return r.returncode, r.stdout
    except Exception:
        return 2, ""


def check_instruction(root):
    """指令层：指令文件存在 + 含指针节。"""
    findings = []
    files = [f for f in ("CLAUDE.md", "AGENTS.md", ".cursor/rules/project.mdc") if os.path.isfile(os.path.join(root, f))]
    if not files:
        findings.append(("NOT-OK", "指令文件缺失（CLAUDE.md/AGENTS.md/.cursor/rules 都没有）——先跑 bootstrap.py --init"))
    else:
        ok = any(any(m in (_read(os.path.join(root, f)) or "") for m in POINTER_MARKS) for f in files)
        findings.append(("OK" if ok else "WARN",
                         "指令文件 %s%s" % ("、".join(files), "（含 Harness 治理节）" if ok else "（缺 Harness 治理节，可手动补或重跑 --init 生成）")))
    return findings


def check_memory(root):
    """记忆层：STATE.json 规则/事故 + notes/ 决策四态 + note verify。"""
    findings = []
    state_path = os.path.join(root, "STATE.json")
    if os.path.isfile(state_path):
        try:
            st = json.loads(_read(state_path) or "{}")
            rules = st.get("rules", [])
            incidents = st.get("meta", {}).get("total_incidents", 0)
            active = [r for r in rules if r.get("status") != "revoked" and not r.get("rule_removed")]
            findings.append(("OK", "STATE.json：规则 %d 条（有效 %d）| 事故/事件 %d 次" % (len(rules), len(active), incidents)))
        except ValueError:
            findings.append(("NOT-OK", "STATE.json 解析失败（JSON 损坏）"))
    else:
        findings.append(("WARN", "STATE.json 缺失——跑 python scripts/record-error.py --init 初始化事故记忆"))

    notes_dir = os.path.join(root, "notes")
    if os.path.isdir(notes_dir):
        counts = {lc: 0 for lc in ("proposed", "implemented", "rejected", "archived")}
        for lc in counts:
            lc_dir = os.path.join(notes_dir, lc)
            if os.path.isdir(lc_dir):
                for cls in os.listdir(lc_dir):
                    cls_dir = os.path.join(lc_dir, cls)
                    if os.path.isdir(cls_dir):
                        counts[lc] += len([f for f in os.listdir(cls_dir) if f.endswith(".md")])
        exit_code, out = _run_script(root, "note-lifecycle.py", "verify")
        verify_ok = exit_code == 0
        findings.append(("OK" if verify_ok else "NOT-OK",
                         "notes/ 决策：proposed %d / implemented %d / rejected %d / archived %d | verify %s"
                         % (counts["proposed"], counts["implemented"], counts["rejected"], counts["archived"],
                            "PASS" if verify_ok else "FAIL（跑 note-lifecycle.py verify 看详情）")))
    else:
        findings.append(("WARN", "notes/ 决策树缺失——跑 bootstrap.py --init 生成"))
    return findings


def check_handoff(root):
    """交接层：HANDOFF.md 存在 + 变更日志最后一条日期。"""
    findings = []
    path = os.path.join(root, "HANDOFF.md")
    text = _read(path)
    if text is None:
        findings.append(("NOT-OK", "HANDOFF.md 缺失——跑 bootstrap.py --init 生成；收尾时用 handoff-log.py 追加"))
        return findings
    dates = re.findall(r"- (\d{4}-\d{2}-\d{2})", text)
    if not dates:
        findings.append(("WARN", "HANDOFF.md 存在但变更日志还没有记录（收尾时用 python scripts/handoff-log.py --append ...）"))
        return findings
    last = max(dates)
    stale = (datetime.date.today() - datetime.date.fromisoformat(last)).days
    if stale > 3:
        findings.append(("WARN", "HANDOFF.md 变更日志最后一条 %s（%d 天前）——可能忘了收尾记录" % (last, stale)))
    else:
        findings.append(("OK", "HANDOFF.md 变更日志最新 %s（%d 天前）" % (last, stale)))
    return findings


def check_hooks(root):
    """执行层：.claude/settings.json 是否配置 PostToolUse/Stop。"""
    findings = []
    path = os.path.join(root, ".claude", "settings.json")
    text = _read(path)
    if text is None:
        findings.append(("WARN", ".claude/settings.json 缺失——Claude Code 下 hooks 未接线（其他运行时不受影响）"))
        return findings
    has_post = '"PostToolUse"' in text
    has_stop = '"Stop"' in text
    findings.append(("OK" if (has_post or has_stop) else "WARN",
                     ".claude/settings.json：PostToolUse=%s Stop=%s" % (has_post, has_stop)))
    return findings


def check_audit(root):
    """整体：调用 audit.py 拿退出码。"""
    audit_py = os.path.join(HERE, "audit.py")
    if not os.path.isfile(audit_py):
        return [("WARN", "audit.py 不在 scripts/ 内（--install-scripts 未装？）")]
    try:
        r = subprocess.run([sys.executable, "-B", audit_py, root], capture_output=True, timeout=300,
                           text=True, encoding="utf-8", errors="replace")
        code = r.returncode
        if code == 0:
            return [("OK", "audit.py 退出码 0（健康）")]
        if code == 1:
            return [("NOT-OK", "audit.py 退出码 1（存在 NOT-OK）——跑 python scripts/audit.py . 看明细")]
        if code == 3:
            return [("NOT-OK", "audit.py 退出码 3（配置漂移）——跑 python scripts/audit.py . 看明细")]
        return [("WARN", "audit.py 退出码 %s（非 0/1/3，可能是大目录超时或参数问题）" % code)]
    except Exception:
        return [("WARN", "audit.py 执行异常（大目录可能超时）")]


def main():
    ap = argparse.ArgumentParser(description="harness 汇总体检（一句话「执行 harness」的落点）")
    ap.add_argument("--dir", default=None, help="项目根目录（默认当前目录）")
    ap.add_argument("--json", action="store_true", help="输出 JSON")
    args = ap.parse_args()

    root = os.path.abspath(args.dir or ".")
    sections = [
        ("指令层", check_instruction(root)),
        ("记忆层", check_memory(root)),
        ("交接层", check_handoff(root)),
        ("执行层", check_hooks(root)),
        ("整体", check_audit(root)),
    ]
    results = []
    for sec, items in sections:
        for status, detail in items:
            results.append({"section": sec, "status": status, "detail": detail})

    not_ok = [r for r in results if r["status"] == "NOT-OK"]
    warn = [r for r in results if r["status"] == "WARN"]
    exit_code = 1 if not_ok else 0

    if args.json:
        print(json.dumps({"tool": "harness-check", "root": root, "checked_at": _today(),
                          "results": results, "summary": {"not_ok": len(not_ok), "warn": len(warn)},
                          "exit": exit_code}, ensure_ascii=False, indent=2))
        return exit_code

    print("# Harness 汇总体检 —— %s（%s）" % (os.path.basename(root), _today()))
    for sec, items in sections:
        print("\n## %s" % sec)
        for status, detail in items:
            print("[%s] %s" % (status, detail))
    print("\n## 建议")
    if not_ok:
        for r in not_ok:
            print("- %s：%s" % (r["section"], r["detail"]))
    elif warn:
        print("- 无 NOT-OK，%d 项提示（WARN）按需处理。" % len(warn))
    else:
        print("- 全部 OK。日常收尾别忘了：python scripts/handoff-log.py --append \"做了什么\" --verify \"结果\"")
    print("\nSUMMARY: %d NOT-OK / %d WARN → exit %s" % (len(not_ok), len(warn), exit_code))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
