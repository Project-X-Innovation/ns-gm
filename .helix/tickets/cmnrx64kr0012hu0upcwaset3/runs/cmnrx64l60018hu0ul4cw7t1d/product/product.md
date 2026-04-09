# Product: NetSuite Execute Mode With Approval

## Problem Statement

ns-gm (NetSuite God Mode) currently operates in a fire-and-forget execution model: user code is sent to a NetSuite RESTlet and executed immediately with no preview, approval gate, or dry-run capability. There is no way for a human to review what changes a script will make to NetSuite records before those changes are committed. This makes ns-gm unsuitable for approval-gated workflows where destructive record mutations need human sign-off.

`TicketMode.EXECUTE` exists as a Prisma enum value in helix-global-server but has zero implementation across all system layers (0 EXECUTE tickets out of 214 total in production). EXECUTE tickets currently run identically to AUTO mode.

## Product Vision

Enable a two-phase execution model for NetSuite scripts: first, show the user exactly what record changes the script would make (dry-run); then, only commit those changes after explicit human approval. This gives organizations safe, auditable control over NetSuite record mutations orchestrated through Helix.

## Users

| User | Context |
|------|---------|
| **Helix platform users** | Create EXECUTE mode tickets in Helix to run SuiteScript against their NetSuite instance with approval gating |
| **Standalone ns-gm CLI users** | Use ns-gm directly (without Helix) for ad-hoc SuiteScript execution via `ns-gm run` — must not be affected by this change |
| **Helix administrators** | Configure ns-gm credentials per organization/environment |

## Use Cases

1. **Approval-gated record mutation**: A user creates an EXECUTE ticket describing a NetSuite change (e.g., "update the price on these 50 items"). The system generates a SuiteScript, dry-runs it to show a before/after diff of all record changes, pauses for human approval, and only executes after the user approves.

2. **Change rejection**: A user reviews the dry-run results, sees unexpected changes (wrong records targeted, unintended field modifications), and rejects the proposed execution. No changes are committed to NetSuite.

3. **Execution tracking**: After approving, the user monitors execution status (EXECUTING -> SUCCEEDED/FAILED) with clear feedback on outcome.

4. **Standalone ns-gm usage (non-regression)**: A user who only uses ns-gm CLI directly (without Helix) continues to use `ns-gm run`, `ns-gm logs`, `ns-gm env`, and `ns-gm setup` exactly as before. No existing behavior changes.

## Core Workflow

1. User creates an EXECUTE mode ticket in Helix describing the desired NetSuite change
2. The Helix workflow generates a SuiteScript (agent-authored code)
3. System triggers a **dry-run**: the script runs against the RESTlet with write operations intercepted (proxy N/record module captures before/after state without committing)
4. Dry-run results are presented to the user as a structured change summary (record type, record ID, field-level before/after values)
5. User reviews the change summary and either **approves** or **rejects**
6. On approval: system executes the script with real modules (identical to a normal `run`), records the outcome
7. On rejection: flow terminates, no changes are committed

## Essential Features (MVP)

1. **Dry-run RESTlet action**: New `dry-run` action in the RESTlet that intercepts N/record write methods (`save()`, `submitFields()`, `delete()`) via proxy module, captures before/after field state, and returns a structured change summary without committing
2. **Execute-approved RESTlet action**: New `execute-approved` action that runs the script with real (unproxied) modules after approval validation
3. **Express proxy endpoints**: New `/dry-run` and `/execute` endpoints in the ns-gm local proxy server, following the existing `/run` endpoint pattern
4. **NsExecuteRequest data model**: New Prisma model with 10-state lifecycle (PROPOSED -> DRY_RUNNING -> PENDING_APPROVAL -> APPROVED -> EXECUTING -> SUCCEEDED/FAILED/REJECTED/EXPIRED/DRY_RUN_FAILED) to track each execute request
5. **Server API endpoints**: CRUD + lifecycle endpoints for execute-request management (create/trigger dry-run, list, detail, approve, reject, status polling)
6. **Deterministic executor service**: Server-side service that makes authenticated RESTlet calls using existing OAuth 2.0 credential infrastructure for both dry-run and execute-approved phases
7. **HMAC approval token**: Server-generated token that secures the approve -> execute transition
8. **Workflow integration**: EXECUTE mode handling in the workflow step chain so EXECUTE tickets follow the correct path (generate script -> dry-run -> approval pause -> execution)
9. **Approval UI**: EXECUTE mode rendering in the client ticket-detail page with before/after record diff visualization, human-readable change summary, approve/reject controls, and status polling
10. **RESTlet sync**: Both copies of the RESTlet (ns-gm repo root and helix-global-server SDF copy) updated identically

## Features Explicitly Out of Scope (MVP)

- **Autonomous execution without approval** — every EXECUTE ticket requires human sign-off
- **CLI approval commands** in helix-cli — approval happens in the web UI only
- **Sandbox-first execution** — dry-run happens in the same environment as the eventual execution
- **Sublist change capture without agent hints** — getFields() returns body fields only; sublist capture relies on agent-provided `targetSublistIds`
- **NetSuite-side effect prediction** — workflow triggers, UserEventScripts, formula recalculations, and validation rules triggered by the actual commit are not captured in dry-run
- **Batch/bulk approval** — each execute request is approved individually
- **Rollback capability** — once approved and executed, there is no automatic undo

## Success Criteria

1. A user can create an EXECUTE mode ticket and receive a structured before/after change preview before any NetSuite records are modified
2. Approving executes the script; rejecting prevents any changes — no partial commits
3. All existing ns-gm CLI commands (`run`, `logs`, `env`, `setup`) and existing RESTlet actions (`run`, `getscriptexecutionlogs`) function identically for non-Helix users
4. All existing Express proxy endpoints (`/run`, `/logs`) continue to work unchanged
5. Execute-request lifecycle is fully tracked with clear status progression visible in the UI
6. Quality gates pass across all three repos: typecheck, lint, and build

## Key Design Principles

- **Additive only**: New RESTlet actions, proxy endpoints, API routes, and UI components are added alongside existing ones — no modifications to existing paths
- **Non-Helix user safety**: The ns-gm standalone experience is completely unaffected; new actions/endpoints are only triggered by the Helix server
- **Honest previews**: Dry-run shows what the proxy can capture (body fields, explicitly hinted sublists) and does not claim to predict NetSuite server-side effects
- **Human-in-the-loop**: No execution without explicit approval; approval tokens are server-generated and single-use

## Scope & Constraints

| Constraint | Detail |
|------------|--------|
| **Three repos changed** | ns-gm (RESTlet + proxy), helix-global-server (model, API, service, workflow, SDF RESTlet), helix-global-client (approval UI) |
| **One repo context-only** | helix-cli — no changes needed for MVP |
| **Governance budget** | 5000 units per RESTlet invocation; dry-run and execute-approved are separate invocations with independent budgets |
| **SDF redeployment** | Customers using the SDF SuiteApp will need to redeploy after the RESTlet is updated |
| **No test framework in ns-gm** | ns-gm has no automated tests; validation is manual |
| **Migration required** | helix-global-server uses file-based Prisma migrations; the new NsExecuteRequest model requires a generated migration file |

## Future Considerations

- CLI-based approval commands in helix-cli for power users
- Autonomous execution mode (skip approval for low-risk changes)
- Improved sublist capture without requiring agent hints
- Execution rollback/undo capability
- Batch approval for multiple execute requests
- Sandbox-first dry-run (run in sandbox environment, execute in production)

## Open Questions / Risks

| Question / Risk | Status |
|----------------|--------|
| Sublist field capture depends on agent-provided `targetSublistIds` hints; if the agent omits them, sublist changes are invisible in the dry-run | Known limitation — documented in scope |
| `record.create()` + `.save()` dry-run returns a placeholder ID since no real record exists yet; consumer must handle this | Needs implementation decision |
| Nested operations inside `record.transform()` callbacks may not be fully captured by the proxy | Known limitation |
| NetSuite server-side effects (workflows, UE scripts, formula fields) are not captured in dry-run | Known limitation — documented to users |
| Whether both RESTlet copies should be maintained long-term or consolidated into a single source of truth | Deferred — both copies updated identically for now |
| SDF redeployment requirement creates a customer communication need | Operational concern |
| Approval UI polling interval and timeout for EXPIRED status transition | Needs implementation decision |

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md (ns-gm) | Ticket requirements | Implement recommended approach; verify proxy module viability; preserve non-Helix functionality |
| scout/scout-summary.md (ns-gm) | ns-gm architecture and RESTlet structure | Three-tier CLI -> proxy -> RESTlet; two RESTlet copies; module injection via new Function() |
| scout/reference-map.json (ns-gm) | File inventory and execution model | 8 key files; proxy modules replace N/record in moduleParamValues array for dry-run |
| diagnosis/diagnosis-statement.md (ns-gm) | Proxy module viability confirmation | Module injection at line 166 enables proxy substitution; write methods intercepted, reads pass through |
| diagnosis/apl.json (ns-gm) | Detailed Q&A on proxy viability and governance | Proxy confirmed viable; 5000 gov units sufficient per invocation; non-Helix regression risk LOW |
| scout/scout-summary.md (helix-global-server) | Server architecture and EXECUTE mode gaps | TicketMode.EXECUTE defined but unused; NsDeployment as pattern; credential infrastructure ready |
| diagnosis/diagnosis-statement.md (helix-global-server) | Server implementation scope | 6 areas: data model, API, executor service, HMAC, workflow chain, SDF RESTlet sync |
| diagnosis/apl.json (helix-global-server) | Server Q&A on schema, workflow, and endpoints | NsExecuteRequest with 10-state enum; isNonImplementationStep() needs EXECUTE handling |
| scout/scout-summary.md (helix-global-client) | Client architecture and UI patterns | No approval UI exists; deployment-detail.tsx as reference; polling and mutation patterns |
| diagnosis/diagnosis-statement.md (helix-global-client) | Client implementation scope | Approval panel in ticket-detail, change diff component, approve/reject controls, API hooks |
| diagnosis/apl.json (helix-global-client) | Client Q&A on UI components and API hooks | ExecuteRequestPanel, RecordChangeDiff, conditional polling, new execute-requests.ts service |
| repo-guidance.json (helix-global-client) | Cross-repo intent | 3 target repos (ns-gm, server, client), 1 context (helix-cli) |
