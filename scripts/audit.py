#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
harness-engineering audit.py — 自动核查单项目 harness 的健康状态。

用法：
    python scripts/audit.py <项目根目录>                     # 输出 markdown 报告
    python scripts/audit.py <项目根目录> --json              # 输出 JSON 报告
    python scripts/audit.py <项目根目录> --metrics STATE.json # 输出生长健康（规则命中/过期/返工率）
    python scripts/audit.py <项目根目录> --baseline base.md   # 存一份基线
    python scripts/audit.py <项目根目录> --diff base.md       # 与基线对比，drift 退出码 3
    python scripts/audit.py <项目根目录> --fail-on-pii        # 隐私命中升级为 NOT-OK（默认 WARN）

退出码：0=健康无 NOT-OK；1=存在 NOT-OK（需修复）；2=参数错误（审计目标不存在/基线文件缺失）；3=与基线有 drift。非 0 ≠ 一定有 drift。

语义边界（v4.4.0 复核 low-3/low-4 已文档化）：
- **expiry 当天即失效**：`_rule_active` 用 `d > today` 判定生效（`expiry == 今天` 视为已失效，不入 rule_count/命中）。
- **顶层退出码与 STATE 度量段独立**：退出码由全报告是否有 NOT-OK 决定（如缺 CLAUDE.md 时 exit 1）；
  振荡/revoked/候选回收等度量在「生长健康」段内以 WARN/INFO 呈现，**不影响**顶层退出码。
- **归档（v4.5.0）**：超阈值撤销/过期规则由 record-error 迁入 `archived` 段（主表 rules[] 减容）；
  `archived_count` 显示归档条数、`rules_total` 显示主表原始条数（归档后下降 = compaction 生效）；
  `rule_count` 只计生效规则（与归档无耦合，归档的是已失效规则）。
- **SKIP 语义（v4.8.1，fresh-install invariant）**：SKIP = 组件未启用/不适用，不计 NOT-OK、不影响退出码；
  仅「已启用但缺失/未跟踪/配错」才 NOT-OK。hooks 启用判定 = `.claude/settings.json`（项目级）或
  `.claude/settings.local.json`（用户级）含非空 `hooks` 配置；bootstrap 预装的 `record-error.py` 若未启用
  属 N-A（SKIP），启用后未入 git 才 NOT-OK。
- **形态级防护（VS-37）**：代码/契约面出现「引述被更正的旧句」形态即 WARN（提示改指路式）；
  **历史归档面（docs/ai/*、task/*、memory/*、notes/*）显式豁免**——档案保留旧说法属承重语义，
  改写＝伪造记录；第三方引文（RFC/ISO/GB-T/PEP 等来源编号**紧邻**框架词时）另有豁免。该 WARN 不影响顶层退出码
  （与 PII 同：默认 WARN，需要阻断时由人升级为 NOT-OK，本卡刻意不自升）。

只做「可编程核查」的项；其余人工判断项见 references/harness-audit.md。
纯标准库，无第三方依赖；脚本内已处理 UTF-8 输出，Windows 控制台无需设 PYTHONIOENCODING。
隐私扫描只报告掩码（手机仅留前 3 位），不输出完整 PII。
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys

# 三通道统一 UTF-8（stdin/stderr 是本轮补全，修中文错误消息乱码）
for _stream_name in ("stdout", "stdin", "stderr"):
    _s = getattr(sys, _stream_name, None)
    if _s is not None and hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

TEXT_EXTS = {".md", ".txt", ".json", ".yaml", ".yml", ".py", ".js", ".ts", ".sh", ".toml", ".cfg", ".env"}
ENV_FILES = {".env", ".env.example", ".env.local"}
INSTRUCTION_FILES = ("CLAUDE.md", "AGENTS.md")
GATE_CMDS = [
    r"pytest", r"npm test", r"pnpm test", r"yarn test", r"go test", r"cargo test",
    r"mvn test", r"dotnet test", r"python -m pytest", r"npm run test", r"pnpm run test",
    r"make test", r"just test",
]
PHONE_RE = re.compile(r"1[3-9]\d{9}|[１-９]\d{10}|[０-９]{11}")
EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+\.\w{2,}\b")
APIKEY_RE = re.compile(
    r"(sk-proj-[A-Za-z0-9_-]{16,}|sk-ant-api03-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{20,}|sk_live_[A-Za-z0-9]{16,}"
    r"|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}"
    r"|AIza[0-9A-Za-z_-]{20,}|glx-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{16,})"
)
RULE_ID_RE = re.compile(r"^R\d+$")
GIT_TRACK_RELS = (".claude/hooks", ".github/workflows")  # settings.local.json 属个人配置，不要求入 git

SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".next", ".cache", ".pytest_cache"}
SCAN_SKIP_DIRS = SKIP_DIRS  # 隐私扫描跳过目录

# --- VS-37：形态级防护 —— 代码/契约面不许"引述被更正的旧句" ----------------------
# 背景：本仓曾为说明「旧说法不实」而在代码/契约面**把旧句逐字抄回**，于是字面 grep 旧句仍命中，
# 后续审计会把「引述」误读成「代码仍在不实地声明」（VS-28 的 NIT-1；VS-33 已改为指路式）。
# 本规则**锁形态、不锁某句话**：判据是「引述框架词 + 紧随的引文实体」，换一句旧文照样命中，
# 也不会因为某个具体句子消失而失效。两段都满足才告警：
#   ① 引述框架词：弱 = 原文/原句/原话/原表述/原说法/旧说法 + 系词「为/是」；
#      强 = 「已删除的」「删除的」「旧」+ 原文（源码里写成 (?:已删除的|删除的|旧)原文 的分组式，
#      不写整串字面量，否则本规则会命中自己的定义）。
#   ② 紧随的**引文实体**：成对引号里至少 2 字；**冒号后紧跟非空白只对强框架词算数**
#      （弱框架词认冒号会误报——VS-37 修复轮 D2，见下方常量处注释）。
#      没有引文实体就不是「引述」——"这份旧文本已删除"不告警；推荐写法
#      「此处原有断言已删除，取回：git show <sha> -- <path>」也不告警（无框架词）。
# 精度（实测得出，别放宽；三级收紧逐级验证，数字锚定基线提交 d44a850 的 git archive 抽取面）：
#   ① **不能只匹配裸「原文」**——本仓裸「原文」几乎全是「原始文本」义（错误原文/事件原文/中文原文），
#      实测基线作用面 **13 处，逐条核实 13/13 都是误报**（0 处是「引述」义）。
#   ② 加系词「为/是」（原文、原句 + 系词）后基线归零；但**还必须要求紧随引文实体**：否则
#      「旧说法 + 系词」这类**正常行文**照样命中——实测本文件第一版注释就被自己的规则命中 3 处，
#      加上引文要求后归零。⇒ ①+② = 本规则，基线作用面命中 **0**。
#   ③ 第三方引文豁免：只认**紧邻框架词**（间隔 ≤6 字符且中间无句读）的来源编号
#      RFC/ISO/GB-T/PEP。`规范`/`标准`/`官方`/`外部`/`上游`/`第三方` 这类泛词**不再豁免**——
#      它们只是中文技术行文的高频词，不足以证明引文实体来自第三方；旧版按「前 24 字符内出现
#      泛词即整行豁免」会静默吞掉真告警（VS-37 修复轮 D3 实测 3/3 漏报）。
# 作用面（`_quote_old_scope`）：`QUOTE_OLD_CODE_EXTS` 声明的源码扩展名 + `AGENTS.md`/`CLAUDE.md`
#   + 文件名含 CONTRACT/ARCHITECTURE/SCHEMA/TECH_STACK 的 `.md`。扩展名闸门取
#   `TEXT_EXTS | QUOTE_OLD_CODE_EXTS`——若只取 `TEXT_EXTS`，声明面里
#   `.tsx .jsx .vue .mjs .cjs .ps1 .sql` 这 7 个永远进不到正则（VS-37 修复轮 D1：
#   `frontend/src` 下 110 个 `.tsx/.jsx/.vue` 一个都没被扫过，「作用面含 .tsx」曾是假话）。
# **历史归档面（docs/ai/*、task/*、memory/*、notes/*）
#   显式豁免**——档案本来就该保留旧说法，改写＝伪造记录；reference/ 是只读第三方克隆，一并跳过。
QUOTE_OLD_STRONG_RE = re.compile(r"(?:已删除的|删除的|旧)原文")
QUOTE_OLD_WEAK_RE = re.compile(r"(?:原文|原句|原话|原表述|原说法|旧说法)(?:为|是)")
_QUOTE_OLD_QCHARS = "\u201c\u201d\u2018\u2019\"'\u300c\u300d\u300e\u300f\u300a\u300b"
# 引文实体之一：成对引号里 ≥2 字（可前置全/半角括号与空白）。
QUOTE_OLD_QUOTE_SPAN_RE = re.compile(
    r"\s*[\uff08(]?\s*[" + _QUOTE_OLD_QCHARS + r"][^\n]{2,}?[" + _QUOTE_OLD_QCHARS + r"]"
)
# 引文实体之二：冒号后紧跟非空白——**只对强框架词开放**（VS-37 修复轮 D2）。
# 理由：本仓「错误原文」「事件原文」这类词后面接冒号，正是「原始文本」义的最自然写法；
# 弱框架词一旦认冒号，一个词改写就能让本该排除的那一族命中（实测 4/4 误报）。
# ⚠️ 这段说明本身也不能写出被禁形态（本文件在作用面内）——故此处用文字描述而非举例。
QUOTE_OLD_SPAN_RE = re.compile(r"(?:%s|\s*[\uff1a:]\s*\S)" % QUOTE_OLD_QUOTE_SPAN_RE.pattern)
QUOTE_OLD_RE = re.compile(
    r"(?:%s%s|%s%s)" % (QUOTE_OLD_STRONG_RE.pattern, QUOTE_OLD_SPAN_RE.pattern,
                        QUOTE_OLD_WEAK_RE.pattern, QUOTE_OLD_QUOTE_SPAN_RE.pattern)
)
# 第三方引文豁免（VS-37 修复轮 D3）：只认来源编号（RFC/ISO/GB-T/PEP），且必须**紧邻**框架词。
# 删掉 `规范`/`标准`/`第三方`/`上游`/`官方`/`外部`——按泛词整行豁免时，一句
# 「遵循既有规范。此处…」就能把真告警静默吞掉（实测 3/3 漏报）。
QUOTE_OLD_EXTERN_RE = re.compile(r"(?:RFC\s*\d+|ISO\s*\d+|GB/?T?\s*[\d.]+|PEP\s*\d+)")
QUOTE_OLD_EXTERN_MAX_GAP = 6                      # 来源编号与框架词之间最多 6 字符
QUOTE_OLD_EXTERN_BREAKS = "\u3002\uff01\uff1f\uff1b;\uff0c,\u3001\n"  # 出现句读即不算紧邻
QUOTE_OLD_CODE_EXTS = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".ps1", ".sh", ".sql"}
QUOTE_OLD_CONTRACT_DOC_RE = re.compile(r"(?:CONTRACT|ARCHITECTURE|SCHEMA|TECH_STACK)", re.I)
QUOTE_OLD_CONTRACT_DOC_NAMES = {"AGENTS.md", "CLAUDE.md"}
# 历史归档面：**本来就该保留旧说法**（改写＝伪造记录），显式豁免——即使文件名像契约文档
QUOTE_OLD_ARCHIVE_PREFIXES = ("docs/ai/", "task/", "memory/", "notes/")
QUOTE_OLD_SCAN_SKIP_DIRS = SCAN_SKIP_DIRS | {"reference"}  # reference/ 是只读第三方克隆


def find_instruction(root):
    for f in INSTRUCTION_FILES:
        p = os.path.join(root, f)
        if os.path.isfile(p):
            return p
    return None


def scan_text_files(root):
    """扫描文本文件里的隐私模式（手机号/邮箱/疑似密钥），只报告掩码（手机仅前 3 位）。"""
    hits = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SCAN_SKIP_DIRS]
        for fn in filenames:
            if fn in ENV_FILES:
                pass  # .env 也扫
            elif os.path.splitext(fn)[1].lower() not in TEXT_EXTS:
                continue
            p = os.path.join(dirpath, fn)
            try:
                if os.path.getsize(p) > 1_000_000:
                    continue
                with open(p, "r", encoding="utf-8", errors="replace") as fh:
                    for lineno, line in enumerate(fh, 1):
                        for m in PHONE_RE.finditer(line):
                            hits.append((os.path.relpath(p, root), lineno, "phone", m.group()[:3] + "****"))
                        for m in EMAIL_RE.finditer(line):
                            if len(m.group()) < 40:
                                hits.append((os.path.relpath(p, root), lineno, "email", "…" + m.group()[-4:]))
                        for m in APIKEY_RE.finditer(line):
                            hits.append((os.path.relpath(p, root), lineno, "key", m.group()[:4] + "****"))
            except OSError:
                pass
    return hits


def count_rules(text):
    """数规则行；排除占位/注释/生成说明行。"""
    n = 0
    for line in text.splitlines():
        s = line.strip()
        if any(s.startswith(x) for x in (">", "#", "<!--", "占位", "由")):
            continue
        if s.startswith(("-", "!", "*")) and any(w in s for w in ("必须", "禁止", "不允许", "只", "不", "命令", "测试", "提交")):
            n += 1
    return n


def git_tracked(root, rel):
    """检查文件是否被 git 跟踪。返回 True/False；root 不在 git 仓库内或 git 不可用时返回 None（跳过）。"""
    try:
        is_repo = subprocess.run(["git", "-C", root, "rev-parse", "--is-inside-work-tree"], capture_output=True)
        if is_repo.returncode != 0 or is_repo.stdout.strip() != b"true":
            return None
        r = subprocess.run(["git", "-C", root, "ls-files", "--error-unmatch", rel], capture_output=True)
        return r.returncode == 0
    except OSError:
        return None


def parse_ts(ts):
    """兼容 'YYYY-MM-DD HH:MM' 与 'YYYY-MM-DD' 两种时间戳格式，返回 date 或 None。"""
    s = str(ts).strip()
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _rule_active(r):
    """时间失效语义（v4.4.0 Graph 路径 C）：revoked 标记或已过期 = 非生效规则。

    旧数据（无 revoked/expiry/valid_time 字段）按永不过期处理，完全兼容。
    expiry 不可解析视为已失效（防御：别把坏时间戳当成「永不过期」）。
    """
    if r.get("revoked"):
        return False
    exp = r.get("expiry")
    if not exp:
        return True
    d = parse_ts(exp)
    if d is None:
        return False
    return d > datetime.date.today()


def detect_oscillations(events):
    """振荡检测（脚本判，从人盯变脚本判）：同一规则删（rule_removed）后重加（rule_added）。

    events 为 append-only 事件数组（record-error 按时间顺序追加）。返回振荡条目列表：
      {"rule", "removed_ts", "re_added_ts"}
    每次「删 → 重加」记一条；删→重加→删→重加 记两条。旧数据无过期语义时同样可判（事件日志已具备）。

    跨归档窗口（v4.5.0）：本函数只消费 events，与规则是否已迁入 archived 无关——record-error 归档时
    **不归档 events**（append-only 审计日志），故「归档前删除、归档后重加」的振荡仍由本函数判出，不因归档断链。
    """
    by_rule = {}
    for e in events:
        rid = e.get("rule")
        if rid:
            by_rule.setdefault(rid, []).append(e)
    out = []
    for rid in sorted(by_rule):
        removed_at = None
        for e in by_rule[rid]:
            if e.get("type") == "rule_removed":
                removed_at = e.get("ts")
            elif e.get("type") == "rule_added" and removed_at is not None:
                out.append({"rule": rid, "removed_ts": removed_at, "re_added_ts": e.get("ts")})
                removed_at = None
    return out


def load_metrics(state_path):
    """读取 STATE.json，计算生长健康指标（返工率按近 30 天窗口）。

    v4.4.0：统计只对「生效规则」计算（revoked/过期规则按查询过滤，不再计入 rule_count/命中/候选回收）。
    """
    if not os.path.isfile(state_path):
        return None
    try:
        st = json.load(open(state_path, "r", encoding="utf-8"))
    except (OSError, ValueError):
        return {"error": "STATE.json 损坏或不可解析"}
    if not isinstance(st, dict) or not isinstance(st.get("rules", []), list) or not isinstance(st.get("events", []), list):
        return {"error": "STATE.json 结构非法（rules/events 须为数组）"}
    today = datetime.date.today()
    cutoff = today - datetime.timedelta(days=30)
    rules = st.get("rules", [])
    events = st.get("events", [])
    active = [r for r in rules if _rule_active(r)]
    revoked = [r for r in rules if not _rule_active(r)]
    # 返工率：近 30 天窗口
    recent = [e for e in events if (d := parse_ts(e.get("ts"))) is not None and d >= cutoff]
    rework = sum(1 for e in recent if e.get("type") == "rework")
    viol = sum(1 for e in recent if e.get("type") == "violation")
    denom = rework + viol
    rate = round(rework / denom, 2) if denom else None
    # 候选回收：last_hit>30 天（hits>0）或 born>30 天从未触发（hits==0）——只对生效规则
    stale = []
    for r in active:
        lh = r.get("last_hit")
        born = r.get("born")
        hits = r.get("hits", 0)
        if lh and hits > 0:
            d = parse_ts(lh)
            if d and (today - d).days > 30:
                stale.append(r.get("id"))
        elif not lh and hits == 0 and born:
            d = parse_ts(born)
            if d and (today - d).days > 30:
                stale.append(r.get("id"))
    summary = {
        "rule_count": len(active),
        "total_hits": sum(r.get("hits", 0) for r in active),
        "stale_30d": stale,
        "rework_rate": rate,
        "events_total": len(events),
        "rules_added": st.get("meta", {}).get("rules_added", 0),
        "rules_removed": st.get("meta", {}).get("rules_removed", 0),
        "revoked_count": len(revoked),
        "archived_count": len(st.get("archived", [])),   # v4.5.0 归档段（rules[] 已迁出，metrics 天然忽略）
        "rules_total": len(rules),                        # v4.5.0 主表原始条数（归档后下降 = compaction 生效）
        "oscillations": detect_oscillations(events),
    }
    return summary


def load_profile(state_path):
    """读 STATE.json 的 meta.profile（模式选择器），损坏/非 dict 返回 None（不裸崩）。"""
    try:
        st = json.load(open(state_path, "r", encoding="utf-8"))
        prof = st.get("meta", {}).get("profile")
        return prof if isinstance(prof, dict) else None
    except (OSError, ValueError):
        return None


def _quote_old_scope(rel, base):
    """VS-37 作用面判定：'in'=代码/契约面（告警面）；'archive'=历史归档面（豁免）；None=不扫。"""
    r = rel.replace("\\", "/")
    if any(r.startswith(p) for p in QUOTE_OLD_ARCHIVE_PREFIXES):
        return "archive"
    ext = os.path.splitext(base)[1].lower()
    if ext in QUOTE_OLD_CODE_EXTS:
        return "in"
    if ext == ".md" and (base in QUOTE_OLD_CONTRACT_DOC_NAMES or QUOTE_OLD_CONTRACT_DOC_RE.search(base)):
        return "in"
    return None


def _quote_old_extern_exempt(line, start):
    """VS-37 修复轮 D3：第三方引文豁免——只有**紧邻框架词**的来源编号才算。

    判据：框架词前 24 字符窗口内存在 RFC/ISO/GB-T/PEP 编号，且该编号与框架词之间
    间隔 ≤QUOTE_OLD_EXTERN_MAX_GAP 且不含句读（。！？；，、）。旧版按
    「窗口内出现 规范/标准/官方/外部/上游/第三方 等泛词」整行豁免，会把真告警静默吞掉。
    """
    window = line[max(0, start - 24):start]
    for em in QUOTE_OLD_EXTERN_RE.finditer(window):
        gap = window[em.end():]
        if len(gap) > QUOTE_OLD_EXTERN_MAX_GAP:
            continue
        if any(c in gap for c in QUOTE_OLD_EXTERN_BREAKS):
            continue
        return True
    return False


def scan_quote_old(root):
    """VS-37：形态级扫描「引述被更正的旧句」。返回 (in_scope_hits, archive_hits)，均为 (rel, lineno, 片段)。

    in_scope 才会告警；archive 只统计（证明豁免是承重的、不是空豁免）。
    逐行判据 = QUOTE_OLD_RE 命中，且不是「紧邻来源编号的正常引文」（第三方外文原文豁免）。
    """
    in_scope, archive = [], []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in QUOTE_OLD_SCAN_SKIP_DIRS]
        for fn in filenames:
            rel = os.path.relpath(os.path.join(dirpath, fn), root).replace(os.sep, "/")
            where = _quote_old_scope(rel, fn)
            # VS-37 修复轮 D1：闸门必须是 TEXT_EXTS ∪ QUOTE_OLD_CODE_EXTS，否则
            # .tsx/.jsx/.vue/.mjs/.cjs/.ps1/.sql 这 7 个已声明扩展名永远进不到正则。
            if where is None or os.path.splitext(fn)[1].lower() not in (TEXT_EXTS | QUOTE_OLD_CODE_EXTS):
                continue
            p = os.path.join(dirpath, fn)
            try:
                if os.path.getsize(p) > 1_000_000:
                    continue
                with open(p, "r", encoding="utf-8", errors="replace") as fh:
                    for lineno, line in enumerate(fh, 1):
                        m = QUOTE_OLD_RE.search(line)
                        if not m:
                            continue
                        if _quote_old_extern_exempt(line, m.start()):
                            continue  # 正常引文（第三方文档/规范原文）不拦
                        (in_scope if where == "in" else archive).append((rel, lineno, m.group().strip()[:60]))
            except OSError:
                pass
    return in_scope, archive


def audit(root):
    root = os.path.abspath(root)
    report = {"root": root, "label": os.path.basename(root) or root, "sections": []}
    inst = find_instruction(root)

    # 指令层
    inst_items = []
    if inst:
        text = open(inst, "r", encoding="utf-8", errors="replace").read()
        lines = text.count("\n") + 1
        n_rules = count_rules(text)
        if lines > 300:
            inst_items.append({"check": "指令文件行数 ≤ 300", "status": "NOT-OK",
                               "action": f"{os.path.basename(inst)} 有 {lines} 行，超出下沉到 docs/", "evidence": f"{lines} 行"})
        elif lines > 150:
            inst_items.append({"check": "指令文件行数 ≤ 150（理想 ~100）", "status": "WARN",
                               "action": "考虑精简", "evidence": f"{lines} 行"})
        else:
            inst_items.append({"check": "指令文件行数", "status": "OK", "action": "-", "evidence": f"{lines} 行"})
        inst_items.append({"check": "规则密度（仅粗略计数，人工复核）", "status": "INFO",
                           "action": "逐行问：删掉会导致 agent 犯错吗？", "evidence": f"约 {n_rules} 条规则行"})
        # 冲突启发式：仅当同一关键词下出现「禁止/必须」与「允许/不需要」对立才算
        OPPOSITES = (("必须", "不需要"), ("禁止", "允许"), ("不允许", "允许"), ("不允许", "可以"), ("never", "always"))
        dup = {}
        for line in text.splitlines():
            s = line.strip().lstrip("-!*").strip()
            for kw in ("push", "commit", "ORM", "fetch", "测试", "依赖", "分支", "数据库", "注释"):
                if kw in s:
                    dup.setdefault(kw, []).append(s[:60])
        real_conflicts = []
        for kw, lines2 in dup.items():
            joined = "\n".join(lines2)
            for neg, pos in OPPOSITES:
                if neg in joined and pos in joined:
                    real_conflicts.append(kw)
                    break
        if real_conflicts:
            inst_items.append({"check": "同主题对立规则启发式扫描", "status": "WARN",
                               "action": f"人工复核主题是否有互相矛盾规则：{', '.join(set(real_conflicts))}", "evidence": ",".join(set(real_conflicts))})
    else:
        inst_items.append({"check": "存在指令文件（CLAUDE.md / AGENTS.md）", "status": "NOT-OK",
                           "action": "用 templates/CLAUDE.md-router.md 或 AGENTS.md-map.md 搭一个", "evidence": "未找到"})
    report["sections"].append({"name": "指令层", "items": inst_items})

    # 约束层
    constr_items = []
    ci_dir = os.path.join(root, ".github", "workflows")
    always_include = os.path.join(root, ".claude", "settings.local.json")
    hooks_cfg = os.path.join(root, ".claude", "settings.json")
    # v4.8.1：hooks 启用判定 = settings.json（项目级）或 settings.local.json（用户级）含非空 hooks 配置
    hooks_enabled = False
    for _cfg in (hooks_cfg, always_include):
        try:
            if os.path.isfile(_cfg):
                hooks_enabled = hooks_enabled or bool(json.load(open(_cfg, "r", encoding="utf-8")).get("hooks"))
        except (OSError, ValueError):
            continue  # 坏 JSON 按未启用处理，避免 fresh-install 误报
    if hooks_enabled:
        constr_items.append({"check": "工具调用前拦截（hooks）", "status": "OK", "action": "-",
                             "evidence": ".claude/settings.json 已配置 hooks"})
    else:
        constr_items.append({"check": "工具调用前拦截（hooks）", "status": "SKIP",
                             "action": "有不可逆红线需要时才在 .claude/settings.json 配置 hooks",
                             "evidence": "hooks 未启用（无 settings.json hooks 配置）"})
    if os.path.isdir(ci_dir):
        constr_items.append({"check": "CI 阻断", "status": "OK", "action": "-", "evidence": f"{os.path.relpath(ci_dir, root)} 存在"})
    else:
        constr_items.append({"check": "CI 阻断", "status": "INFO",
                             "action": "CI 是全运行时通用的约束层，可考虑", "evidence": "未发现 .github/workflows"})
    # 约束层入 git（只查 hooks/CI；settings.local.json 属个人配置，不要求入 git）
    for rel in GIT_TRACK_RELS:
        if not os.path.exists(os.path.join(root, rel)):
            continue
        tracked = git_tracked(root, rel)
        if rel == ".claude/hooks" and not hooks_enabled:
            # v4.8.1 fresh-install invariant：未启用的 hooks = N-A（bootstrap 预装脚本但无启用配置），
            # 不算配置错误；仅「已启用但未跟踪」才 NOT-OK（真错误，防静默丢失）
            constr_items.append({"check": f"约束层入 git：{rel}", "status": "SKIP",
                                 "action": "启用 hooks 后应纳入版本控制",
                                 "evidence": "hooks 未启用（N-A）"})
            continue
        if tracked is True:
            constr_items.append({"check": f"约束层入 git：{rel}", "status": "OK", "action": "-", "evidence": "已跟踪"})
        elif tracked is False:
            constr_items.append({"check": f"约束层入 git：{rel}", "status": "NOT-OK",
                                 "action": "强制层不入 git 会静默丢失（Heronas 反例 4），纳入版本控制", "evidence": "存在但未跟踪"})
    if os.path.isfile(always_include):
        try:
            data = json.load(open(always_include, "r", encoding="utf-8"))
            ai = data.get("alwaysInclude", [])
            if ai:
                constr_items.append({"check": "alwaysInclude 硬加载（仅 Claude Code 有效）", "status": "OK",
                                     "action": "核实这些文件存在", "evidence": f"alwaysInclude: {ai}"})
            else:
                constr_items.append({"check": "alwaysInclude", "status": "INFO", "action": "-", "evidence": "空"})
        except (OSError, ValueError):
            constr_items.append({"check": "settings.local.json 可解析", "status": "WARN",
                                 "action": "个人配置，不影响团队；若该成员 Claude Code 失效再修", "evidence": "JSON 解析失败"})
    report["sections"].append({"name": "约束层", "items": constr_items})

    # 反馈层
    fb_items = []
    gate_found = []
    if inst:
        text = open(inst, "r", encoding="utf-8", errors="replace").read()
        for cmd in GATE_CMDS:
            if re.search(cmd, text):
                gate_found.append(cmd)
    if gate_found:
        fb_items.append({"check": "客观门禁命令（文本匹配；可跑性需人工实测）", "status": "OK",
                         "action": "确保 agent 能真的跑起来", "evidence": " ".join(sorted(set(gate_found)))})
    else:
        fb_items.append({"check": "客观门禁命令（文本匹配；可跑性需人工实测）", "status": "WARN",
                         "action": "指令文件里加一条可跑的命令（pytest/npm test 等）", "evidence": "未在指令文件发现测试命令"})
    report["sections"].append({"name": "反馈层", "items": fb_items})

    # 记忆层
    mem_items = []
    for m in ("NOTES.md", "STATE.json"):
        if os.path.isfile(os.path.join(root, m)):
            mem_items.append({"check": f"记忆载体（{m}）", "status": "OK", "action": "-", "evidence": "存在"})
    if os.path.isdir(os.path.join(root, "docs")):
        mem_items.append({"check": "文档目录", "status": "OK", "action": "补 INDEX/ADR 更好", "evidence": "存在"})
    if not mem_items:
        mem_items.append({"check": "记忆层", "status": "INFO", "action": "重要决策迁进仓库（NOTES.md / STATE.json / docs/）", "evidence": "未发现"})
    report["sections"].append({"name": "记忆层", "items": mem_items})

    # 编排层
    orch_items = []
    # 简单启发：编排需求信号——指令文件里是否提及多 agent / 子代理 / 角色
    if inst:
        text = open(inst, "r", encoding="utf-8", errors="replace").read()
        signals = [s for s in ("多 agent", "子代理", "Planner", "Evaluator", "Generator", "角色") if s in text]
        if signals:
            orch_items.append({"check": "编排需求信号（能单不多）", "status": "INFO",
                               "action": "按可还原性判据判定：能单 agent 就别拆；拆则先写数据契约", "evidence": ", ".join(signals)})
        else:
            orch_items.append({"check": "编排需求信号", "status": "OK", "action": "-", "evidence": "无（单 agent 够用）"})
        if "预算" in text or "上限" in text:
            orch_items.append({"check": "轮次/成本上限", "status": "OK", "action": "-", "evidence": "指令文件已提预算/上限"})
        else:
            orch_items.append({"check": "轮次/成本上限", "status": "INFO",
                               "action": "编排/多轮循环建议设预算上限（超出即停、人在环续批）", "evidence": "未显式声明"})
    else:
        orch_items.append({"check": "编排层", "status": "INFO", "action": "先有指令层再谈编排", "evidence": "无指令文件"})
    report["sections"].append({"name": "编排层", "items": orch_items})

    # 数据正确性（人工判断项；不产出自动 NOT-OK）
    report["sections"].append({"name": "数据正确性", "items": [
        {"check": "golden set / 字段级验收指标（预算单位、缺失率、误提取率）", "status": "INFO",
         "action": "提取类项目必须有，否则代码对≠数据对", "evidence": "人工判断"},
        {"check": "单位/金额归一化", "status": "INFO", "action": "万元/元混用是经典错法，加断言", "evidence": "人工判断"},
    ]})

    # 隐私（默认 WARN，--fail-on-pii 才升级 NOT-OK）
    priv_items = []
    hits = scan_text_files(root)
    if hits:
        phones = sum(1 for h in hits if h[2] == "phone")
        emails = sum(1 for h in hits if h[2] == "email")
        keys = sum(1 for h in hits if h[2] == "key")
        priv_items.append({"check": "样本扫描（手机/邮箱/疑似密钥，仅掩码）", "status": "WARN",
                           "action": "确认是测试数据还是真实 PII；真实 PII 不入库不提交", "evidence": f"手机 {phones}、邮箱 {emails}、密钥 {keys}，样例见下方"})
        for h in hits[:8]:
            priv_items.append({"check": f"PII 样例（{h[2]}）", "status": "WARN", "action": "人工核实", "evidence": f"{h[0]}:{h[1]} → {h[3]}"})
    else:
        priv_items.append({"check": "样本扫描（手机/邮箱/密钥）", "status": "OK", "action": "-", "evidence": "未发现"})
    report["sections"].append({"name": "隐私", "items": priv_items})

    # 形态级防护（VS-37）：代码/契约面不许"引述被更正的旧句"；历史归档面豁免
    old_items = []
    old_in, old_arch = scan_quote_old(root)
    if old_in:
        old_items.append({"check": "代码/契约面出现\"引述被更正的旧句\"形态（形态判据，不锁具体句子）",
                          "status": "WARN",
                          "action": "改为指路式：\"此处原有断言已删除，取回：git show <sha> -- <path>\"；"
                                    "逐字旧文只留在 docs/ai/* 历史档案（档案不许改写）",
                          "evidence": f"{len(old_in)} 处：" + "；".join(
                              "%s:%d（%s）" % (r, n, s) for r, n, s in old_in[:5])})
        for r, n, s in old_in[:8]:
            old_items.append({"check": "引述旧句样例", "status": "WARN", "action": "人工核实并改指路式",
                              "evidence": f"{r}:{n} → {s}"})
    else:
        old_items.append({"check": "代码/契约面出现\"引述被更正的旧句\"形态（形态判据，不锁具体句子）",
                          "status": "OK", "action": "-",
                          "evidence": "0 处（作用面：源码扩展名 .py/.ts/.tsx/.js/.jsx/.mjs/.cjs/.vue/.ps1/.sh/.sql "
                                      "的注释与 docstring + AGENTS.md/CLAUDE.md + 契约类 .md）"})
    old_items.append({"check": "历史归档面豁免（改写＝伪造记录，故不计入告警）", "status": "INFO", "action": "-",
                      "evidence": f"{len(old_arch)} 处命中落在 docs/ai/*、task/* 等历史归档面——**豁免、不告警**"
                                  f"（档案保留旧说法属承重语义，改写＝伪造记录）；该数非零且随档案增长属预期，不是缺陷；"
                                  f"正常引文（框架词紧邻 RFC/ISO/GB-T/PEP 来源编号）同样豁免"})
    report["sections"].append({"name": "形态级防护（引述旧句）", "items": old_items})

    # 基础设施
    report["sections"].append({"name": "基础设施", "items": [
        {"check": "git 仓库", "status": "OK" if os.path.isdir(os.path.join(root, ".git")) else "WARN",
         "action": "-" if os.path.isdir(os.path.join(root, ".git")) else "建议纳入版本控制",
         "evidence": "存在" if os.path.isdir(os.path.join(root, ".git")) else "未发现"},
        {"check": "tests/ 目录存在", "status": "OK" if os.path.isdir(os.path.join(root, "tests")) else "INFO",
         "action": "-" if os.path.isdir(os.path.join(root, "tests")) else "有测试覆盖更佳", "evidence": "存在" if os.path.isdir(os.path.join(root, "tests")) else "未发现"},
    ]})

    return report


def add_metrics_section(report, metrics):
    if metrics is None or "error" in (metrics or {}):
        return
    items = [
        {"check": "规则注册表条数（仅生效；revoked/过期已过滤）", "status": "INFO", "action": "-", "evidence": str(metrics["rule_count"])},
        {"check": "规则总命中（仅生效规则）", "status": "INFO", "action": "-", "evidence": str(metrics["total_hits"])},
        {"check": "30 天未触发（候选回收，含从未触发的已成年规则）", "status": "WARN" if metrics["stale_30d"] else "OK",
         "action": "按 growth-loop 回收度量逐个判定删/留", "evidence": ", ".join(metrics["stale_30d"]) or "无"},
        {"check": "30 天返工率", "status": "NOT-OK" if (metrics["rework_rate"] is not None and metrics["rework_rate"] >= 0.5) else "INFO",
         "action": "≥50% 时先修门禁，别继续加规则", "evidence": str(metrics["rework_rate"]) if metrics["rework_rate"] is not None else "近 30 天样本不足"},
        {"check": "规则振荡（删后重加，v4.4.0 脚本可判）", "status": "WARN" if metrics["oscillations"] else "OK",
         "action": "同主题反复加删=极限环，先调触发阈值（同错≥2 次改≥3 次）再动内容（growth.md 振荡检测）",
         "evidence": ", ".join("%s: 删@%s→重加@%s" % (o["rule"], o["removed_ts"], o["re_added_ts"]) for o in metrics["oscillations"]) or "无"},
        {"check": "已撤销/过期规则（保留在 rules[] 供审计）", "status": "INFO", "action": "-", "evidence": str(metrics["revoked_count"])},
        {"check": "归档规则（超阈值迁入 archived，v4.5.0 compaction）", "status": "INFO",
         "action": "-", "evidence": f"{metrics['archived_count']} 条已归档（主表 rules_total={metrics['rules_total']}）"},
        {"check": "生长方向（加/删规则）", "status": "INFO", "action": "-", "evidence": f"added {metrics['rules_added']} / removed {metrics['rules_removed']}"},
    ]
    report["sections"].append({"name": "生长健康（STATE 度量）", "items": items})


def to_markdown(report):
    # 用相对标签（非绝对路径），保证 baseline/diff 跨机器稳定
    lines = [f"# Harness 审计报告 — {report['label']}", ""]
    for sec in report["sections"]:
        lines.append(f"## {sec['name']}")
        for it in sec["items"]:
            status = it["status"]
            if status == "OK":
                mark = "[OK]"
            elif status == "NOT-OK":
                mark = "[NOT-OK]"
            elif status == "WARN":
                mark = "[WARN]"
            elif status == "SKIP":
                mark = "[SKIP]"
            else:
                mark = "[INFO]"
            lines.append(f"{mark} {it['check']}")
            if it.get("action") and it["action"] != "-":
                lines.append(f"    -> {it['action']}")
            lines.append(f"    证据：{it['evidence']}")
        lines.append("")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="harness-engineering 自动审计")
    ap.add_argument("root", nargs="?", default=".", help="项目根目录（默认当前目录）")
    ap.add_argument("--json", action="store_true", help="输出 JSON")
    ap.add_argument("--out", default=None, help="输出到文件")
    ap.add_argument("--metrics", default=None, help="STATE.json 路径，追加生长健康段")
    ap.add_argument("--baseline", default=None, help="把当前报告存为基线文件")
    ap.add_argument("--diff", default=None, help="与基线对比，drift 退出码 3")
    ap.add_argument("--fail-on-pii", action="store_true", help="隐私命中升级为 NOT-OK（默认 WARN）")
    args = ap.parse_args()

    if not os.path.isdir(args.root):
        print(f"审计目标不存在或不是目录: {args.root}", file=sys.stderr)
        return 2

    report = audit(args.root)
    # 模式选择器：production 或 compliance 变体下隐私命中升级 NOT-OK（否则 --fail-on-pii 才升）
    profile = load_profile(os.path.join(args.root, "STATE.json")) if os.path.isdir(args.root) else None
    mode = (profile or {}).get("mode")
    compliance = bool(profile and "compliance" in profile.get("modifiers", []))
    production = mode == "production"
    if args.metrics:
        add_metrics_section(report, load_metrics(args.metrics))
    # 隐私升级
    if args.fail_on_pii or compliance or production:
        for sec in report["sections"]:
            if sec["name"] == "隐私":
                for it in sec["items"]:
                    if it["status"] == "WARN" and "样例" not in it["check"] and "未发现" not in it.get("evidence", ""):
                        it["status"] = "NOT-OK"

    text = json.dumps(report, ensure_ascii=False, indent=2) if args.json else to_markdown(report)

    if args.baseline:
        with open(args.baseline, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(f"基线已存 {args.baseline}")

    any_not_ok = any(it["status"] == "NOT-OK" for sec in report["sections"] for it in sec["items"])
    code = 1 if any_not_ok else 0

    if args.diff:
        if not os.path.isfile(args.diff):
            print("基线不存在: %s" % args.diff, file=sys.stderr)
            return 2
        base = open(args.diff, "r", encoding="utf-8").read()
        if base.strip() != text.strip():
            print("WARN 与基线存在 drift（harness 状态已变化）。建议重新审计并核对每条差异。", file=sys.stderr)
            code = 3
        else:
            print("OK 与基线一致，无 drift。")

    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(f"报告已写入 {args.out}")
    elif not args.baseline and not args.diff:
        print(text)
    return code


if __name__ == "__main__":
    sys.exit(main())
