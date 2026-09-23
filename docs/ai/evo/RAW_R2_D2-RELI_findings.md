# RAW R2 D2-RELI audit findings (salvaged from transcript; agent died at 429)


--- finding 1 ---
I'll start by reading the project brief to understand recent deliveries, then investigate the highest-risk areas within my file budget.

--- finding 2 ---
Let me read the key files. I have a budget of 8 files. PROJECT_BRIEF.md counts as 1. Let me plan:

2. llm_client.py (retry)
3. research_jobs.py (retry cap)
4. research_orch.py (degradation)
5. start.bat (backup)
6. scheduler.py
7. database.py (backup/migration sections - maybe grep)
8. One more - maybe report_export.py or main.py or config.py

Let me read llm_client.py and research_jobs.py first, in parallel. Actually I should be careful about size. Let me check sizes first... Actually just read them.

Let me be efficient: read llm_client.py, research_jobs.py in parallel.

Actually, let me use grep to find the retry code specifically to save budget. But reading is fine. Let me read.

Budget: I'll aim for ~7 files. Let me do llm_client.py and research_jobs.py concurrently.

Wait — also the task says check research_orch.py degradation semantics across all failure paths. That's important for question 3.

Let me read llm_client.py first (probably ~400 lines).

--- finding 3 ---
Key finding #1 already: `_post_chat_with_retry` uses `self._http_client()` per attempt — a NEW AsyncClient per attempt. That's fine-ish. But more important:

**No jitter** — `_BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))` = fixed 0.5s, 1.0s. With 4 agents in parallel (research_orch runs 4 agents concurrently) x multiple rounds, all hitting 429 at the same time will retry in lockstep → thundering herd. Actually with only 3 attempts and 2 sleeps of 0.5/1.0s, the amplification is bounded: 3x request amplification. But the "thundering herd" is synchronized retries.

**Bigger issue**: `chat_stream` (line 356-389) does NOT use `_post_chat_with_retry` — no retry for streaming. So streaming paths fail on a single 429/5xx. That's an inconsistency: the G-11 fix covers non-streaming only. Which SSE pipelines use chat_stream? That's a gap — "未受控" for streaming.

Also `_post_chat_with_retry` retries on 429 with no `Retry-After` header respect. And no overall deadline — 3 attempts × timeout 120s = up to 360s+ per call. In a tool loop with max_rounds=5, that's 5 × 360s = 1800s = 30min for one agent. Combined with scheduler. Actually more importantly: retry × tool loop × 4 agents → the request amplification per research run = up to 3× . If upstream is rate-limiting persistently (quota exhausted), retrying is useless and triples pressure.

Also: retry on 429 without checking whether it's a quota-exhaustion 429 (insufficient balance) vs rate limit. DeepSeek returns 402 for insufficient balance usually. Fine.

Another: `record_llm_usage` is only called on success — retried attempts that succeeded get recorded once. Good.

Wait, actually there's a subtle bug: in the retry loop, when `last_exc = None` and response is non-retryable... returns. Fine. But if a previous attempt had an exception and then... no, last_exc is reset.

Hmm, actually there IS a bug: `last_exc = None` set in the `else` branch before checking retryable. OK.

Now, another important thing: the retry creates a new httpx.AsyncClient per attempt — no connection reuse but that's minor.

Let me now read research_jobs.py (retry cap) and scheduler.py.

Let me read research_jobs.py and research_orch.py.Key finding already: streaming path bypasses retry entirely. Let me check the job/retry layer.
