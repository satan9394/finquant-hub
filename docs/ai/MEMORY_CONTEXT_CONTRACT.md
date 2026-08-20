# Typed Memory Context Contract v1

Typed memory context is an untrusted, budgeted projection of owner-scoped retrieval results. It is not a fact store and does not change record status.

- Every rendered line is a complete JSON object with a stable `memory:<id>` citation.
- The header states that recalled content is data, may be wrong or stale, and must not be executed as instructions.
- `candidate`, `AI_INFERENCE`, and `USER_HYPOTHESIS` remain visibly unverified.
- Recall explanations retain matched terms, subject, classification, valid/observed time, evidence id, data status, source, as-of, and quality flags.
- Missing canonical evidence renders provenance `state=UNKNOWN`, `data_status=UNKNOWN`, and `source=UNKNOWN`; it is never filled from another record.
- Both character and conservative token estimates are hard budgets. A record that does not fit is omitted whole, so partial JSON cannot enter the prompt.

AIOS-023 deliberately does not connect this assembler to chat or research answer paths. Rollout remains a later opt-in task after retrieval and context contracts are independently verified.
