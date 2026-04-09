# Tech Research: Proxy Module Research — ns-gm

## Technology Foundation

- **Runtime**: SuiteScript 2.1 (`@NApiVersion 2.1`) RESTlet with `@NModuleScope Public`
- **Execution model**: `new Function(...moduleNames, userCode)` at line 166 of `ns_gm_restlet.js` creates an execution function; line 169 calls it with `...moduleValues` (real N/* module objects as positional parameters)
- **Module injection**: Lines 115-125 build `moduleParamNames[]` and `moduleParamValues[]` arrays dynamically from `requestedModules` via `loadModule()`. The `moduleMap` (lines 71-96) contains 24 pre-loaded N/* modules.
- **Current actions**: `run` (execute code) and `getscriptexecutionlogs` (retrieve logs) — the only two branches in the `post()` dispatcher (lines 23-37)
- **Express proxy**: `server/app.js` with POST `/run` and POST `/logs` endpoints; forwards to RESTlet via `nsapi.REST.post()` (OAuth 2.0 M2M with JWT PS256 via `server/auth.js`)
- **No build step**, no test framework, no lint/typecheck. Pure JS + Express + Commander CLI.
- **Governance budget**: 5,000 units per RESTlet invocation

## Architecture Decision

### Options Considered

**Option A: Separate UserEventScript (beforeSubmit hooks)**

Deploy a new `beforeSubmit` UES alongside the RESTlet. The UES fires on every Helix-initiated record save and makes an `N/https.post` call to Helix to check approval status.

- *Pros*: Captures exact final record state at the point of commit; leverages NetSuite's built-in save lifecycle.
- *Cons*: **Governance chaining risk** is the critical blocker — RESTlet code calls `record.save()`, which triggers the UES, which calls `N/https.post()`. Governance units compound across script contexts. Oracle best practice: "keep beforeSubmit lean." External HTTP latency in beforeSubmit may cause timeouts. Requires deploying a new script type to customer accounts (new operational pattern). Needs a new NS-to-Helix auth channel.
- *Verdict*: **Rejected.** Governance chaining risk and operational complexity make this unsuitable for MVP.

**Option B: Two-Phase RESTlet with Module Proxy (CHOSEN)**

Add new `dry-run` and `execute-approved` actions to the existing RESTlet. The `dry-run` action swaps the real `N/record` module with a proxy wrapper in the `moduleParamValues` array before passing to `safeExecute()`. Write operations are intercepted; reads pass through to real NetSuite data.

- *Pros*: No new NetSuite script deployment. No governance chaining — stays within the RESTlet's single 5000-unit context. Architecturally natural: `new Function()` already receives modules as positional arguments. Reuses the full existing pipeline. New actions are additive else-if branches — zero risk to existing `run`/`logs` paths.
- *Cons*: Cannot capture NetSuite-side effects (workflows, UserEventScripts, formula recalculations triggered by real saves). Proxy must handle the N/record API surface that agent scripts use.

**Option C: Companion Suitelet with NetSuite-native UI**

Deploy a Suitelet that provides an approval UI within NetSuite.

- *Pros*: Native NetSuite UI.
- *Cons*: Fractures UX — approval should happen in Helix, not NetSuite. Out of scope per product spec.
- *Verdict*: **Rejected.**

### Chosen Option: Two-Phase RESTlet with Module Proxy (Option B)

**Rationale:**
1. The `new Function(...moduleNames, userCode)` pattern at line 166 already passes modules as function arguments. Swapping a proxy `record` module into `moduleParamValues[i]` for the `dry-run` action requires no fundamental change to the execution model.
2. All operations stay within one RESTlet invocation — no governance chaining.
3. No new script deployment to customer accounts. No new auth channels.
4. Two prior research tickets (cmnqr8lkk, cmnrx64kr) have independently validated this approach as the recommended path with LOW regression risk.
5. Backward compatibility is automatic: new actions are additive `else if` branches in the `post()` dispatcher.

## Core API/Methods

### RESTlet Action Extensions

**`dry-run` action** — new `else if` branch in `post()` at line 23:
- Input: `{ action: "dry-run", data: { code, modules, context } }` where `context` contains `{ targetRecordTypes, targetSublistIds, description }`
- Flow: Build `moduleParamNames`/`moduleParamValues` as normal, then **replace** the `record` entry in `moduleParamValues` with a proxy wrapper object before calling `safeExecute()`
- Output: `{ success, recordChanges[], governance, executionTime }` where `recordChanges` is the array of captured before/after operations

**`execute-approved` action** — new `else if` branch in `post()`:
- Input: `{ action: "execute-approved", data: { code, modules, approvalToken, approvalId } }`
- Flow: Functionally identical to existing `run` action — executes code with real (non-proxied) modules. Echoes `approvalToken` in response for server-side verification.
- Output: Standard `run` response format + `{ approvalToken }` echo

### Module Proxy Design (within RESTlet)

The proxy wraps the real `N/record` module for `dry-run` only. Core principle: **read-through, write-intercept**.

| N/record Method | Proxy Behavior |
|----------------|----------------|
| `record.load(options)` | **Pass-through** to real module. Captures loaded record's body field values via `getFields()` as "before" state. Returns real Record object (wrapped to intercept `.save()`). |
| `record.create(options)` | **Pass-through** to real module (creates in-memory record). Returns wrapped Record to intercept `.save()`. |
| `record.copy(options)` | **Pass-through** to real module. Captures source record state. Returns wrapped Record. |
| `record.delete(options)` | **Intercepted**: Loads target record for "before" state capture, marks as deletion, returns without deleting. |
| `record.submitFields(options)` | **Intercepted**: Loads target record for "before" state, captures submitted values as "after", does not commit. Returns record ID. |
| `Record.prototype.save()` | **Intercepted**: Captures all modified field values as "after" state. Returns existing ID (for loaded records) or placeholder negative ID (for created records). Does not commit. |
| `record.transform(options)` | **Pass-through** to real module. Captures source state. Nested operations in transform callbacks are NOT intercepted (known limitation). |

**All other methods** pass through unmodified: `getValue`, `getText`, `getSublistValue`, `getLineCount`, `getField`, `getFields`, `setValue`, `setText`, `setSublistValue`, `insertLine`, `removeLine`, etc. Read operations on Record instances and all 23 other N/* modules are untouched.

### Field State Capture Strategy

1. **Body fields**: Use `record.getFields()` on loaded/created records. Returns all body-level field IDs. For each field: `{ fieldId, value: record.getValue({fieldId}), text: record.getText({fieldId}) }`.
2. **Sublist fields**: No equivalent discovery API for sublists. Mitigation:
   - Accept `targetSublistIds` in the `dry-run` context from the AI agent (it knows which sublists its code modifies)
   - Attempt common sublist IDs for transaction records (`item`, `expense`, `line`, `partner`, `salesteam`) with silent failure for non-existent sublists
   - Future: record-type-to-sublist mapping table
3. **Limitations**: `getFields()` returns body fields only. Sublist capture completeness depends on hints or known sublist IDs.

### Express Proxy Endpoints

Two new endpoints in `server/app.js` following the existing `/run` pattern:

```
POST /dry-run    → { action: "dry-run", data: { code, modules, context } }
POST /execute    → { action: "execute-approved", data: { code, modules, approvalToken, approvalId } }
```

Both use `requireActiveProfile()` + `nsapi.REST.post()` — identical authentication flow to `/run`.

## Technical Decisions

### 1. Proxy lives inside the RESTlet, not the Express proxy

The module proxy **must** be implemented within `ns_gm_restlet.js` because:
- The N/record module objects are instantiated by NetSuite's AMD `define()` at the top of the RESTlet (lines 7-16)
- The proxy wrapper must wrap these real module objects to delegate read operations
- The Express proxy (`server/app.js`) is a pure pass-through; it sends actions and receives results

**Rejected alternative**: Building a proxy at the Express layer. This is impossible — the Express proxy has no access to NetSuite's N/* module objects; it only sends JSON payloads to the RESTlet URL.

### 2. Only N/record needs proxying for MVP

Of the 24 pre-loaded modules, only `N/record` contains write methods that modify NetSuite data in ways relevant to the dry-run use case. All other modules either:
- Are read-only (`N/search`, `N/query`, `N/runtime`, `N/config`)
- Have side effects outside the record mutation scope (`N/email`, `N/task`, `N/file`)
- Are utility modules (`N/format`, `N/encode`, `N/crypto`, `N/xml`, `N/url`)

`N/transaction.void()` is the one exception — it's a write operation. **Deferred to Round 2** per prior research consensus.

### 3. Approval token validation is server-side only

The RESTlet's `execute-approved` action is functionally identical to `run` — it executes code with real modules. The `approvalToken` is included in the request and echoed in the response. The Helix server (not the RESTlet) validates the token, ensuring the correct approved script ran.

**Rationale**: This avoids embedding shared secrets in the RESTlet (which would require SDF deployment coordination). The security boundary is the Helix server's `NsExecuteService`, which is the sole code path that can invoke `execute-approved`. The RESTlet runs in a trusted context (authenticated via OAuth 2.0 M2M).

**Rejected alternative**: HMAC validation inside the RESTlet. Would require provisioning a shared secret to NetSuite via script parameters or headers — adds operational complexity for no security gain given the existing auth chain.

### 4. Governance safety threshold

Dry-run consumes governance units from the same RESTlet invocation. The proxy should check `runtime.getCurrentScript().getRemainingUsage()` (already used at lines 47-48 of `handleRunAction`) and abort if remaining units drop below 200, returning a partial result with a governance warning.

### 5. Change summary output format

The `recordChanges` array in the dry-run response follows this structure:

```
{
  operation: "save" | "create" | "submitFields" | "delete",
  recordType: string,
  recordId: string | number | null,
  before: { [fieldId]: { value, text } },
  after: { [fieldId]: { value, text } },
  sublists: { [sublistId]: { before: [...lines], after: [...lines] } }
}
```

This is sufficient for the server to produce a human-readable "before → after" change summary.

## Cross-Platform Considerations

### RESTlet Deployment Coordination

The modified RESTlet must be deployed to customer NetSuite accounts via SDF before the server starts sending `dry-run` actions. If the server calls `dry-run` against an old RESTlet, it gets `{ success: false, error: "Unknown action: dry-run" }`.

**Mitigation**: The server should handle `"Unknown action"` responses gracefully and surface a clear error. Deployment sequence: update RESTlet first, then enable `dry-run` calls in the orchestrator.

### Backward Compatibility

New `dry-run` and `execute-approved` actions are additive `else if` branches. The existing `run` and `getscriptexecutionlogs` actions are completely unchanged. Any version of the server/CLI that only uses `run` will continue to work with the updated RESTlet. The updated RESTlet also works with old server/CLI versions (they never send the new actions).

### Duplicate RESTlet Sync

The `helix-global-server` maintains a duplicate RESTlet at `netsuite-setup/FileCabinet/SuiteScripts/ns_gm_restlet.js` deployed via SDF. This copy **must** be updated in lockstep with the `ns-gm` root copy. Currently these are manually maintained (identical content confirmed by inspection).

## Performance Expectations

| Operation | Expected Latency | Governance Cost |
|-----------|-----------------|-----------------|
| `dry-run` with 1 record load + field capture | 2-5 seconds | ~20-50 units |
| `dry-run` with 3 record loads + captures | 5-10 seconds | ~60-150 units |
| Module proxy wrapping overhead | <10ms | 0 units (pure JS) |
| `execute-approved` (identical to `run`) | 2-10 seconds | Depends on script |
| `getFields()` call per record | <50ms | 0 units (in-memory) |

The governance budget of 5,000 units is sufficient for typical agent scripts that modify 1-5 records. Complex scripts with many record operations may need governance monitoring.

## Dependencies

**No new dependencies for ns-gm.** The repo remains pure JS + Express:

- RESTlet changes: Pure SuiteScript 2.1 using existing pre-loaded modules (no new `N/*` imports needed)
- Express proxy changes: Follow existing `/run` endpoint pattern using existing `nsapi.REST.post()`
- CLI changes: None required for the proxy mechanism itself (CLI remains a `/run` consumer)

**Cross-repo dependency**: `helix-global-server` must update its duplicate RESTlet copy to match.

## Deferred to Round 2

| Item | Rationale |
|------|-----------|
| N/transaction.void() proxy | Focus on N/record for MVP; expand proxy surface iteratively |
| Comprehensive sublist auto-discovery | Start with `getFields()` + common sublists + agent hints; full metadata mapping later |
| record.transform() callback interception | Nested operations within transform callbacks are complex; document as known limitation |
| BeforeSubmit safety net (Approach A as defense-in-depth) | Layer after Approach B is proven in production |
| Governance budget alerting/metrics | Track governance in responses; alerting thresholds in Round 2 |
| RESTlet version capability check | New RESTlet could report supported actions via a `capabilities` action; not needed for MVP |

## Summary Table

| Dimension | Decision |
|-----------|----------|
| **Architecture** | Two-Phase RESTlet with Module Proxy (Approach B) |
| **New RESTlet actions** | `dry-run` (proxied N/record) + `execute-approved` (real modules, token echo) |
| **Proxy target** | N/record write methods: `save`, `submitFields`, `delete` |
| **Proxy passthrough** | All read methods + all 23 other N/* modules |
| **Substitution point** | `moduleParamValues[]` array (lines 115-125) — swap `record` entry before `safeExecute()` |
| **Token validation** | Server-side only; RESTlet echoes token |
| **Governance safety** | Abort at <200 remaining units; return partial result |
| **Field discovery** | `getFields()` for body fields; agent hints + common sublists for sublists |
| **New Express endpoints** | POST `/dry-run`, POST `/execute` |
| **Backward compatibility** | Additive actions; existing `run`/`logs` unchanged |
| **Dependencies** | None new; pure JS + existing modules |

## Open Risks

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | Proxy may miss edge-case N/record methods used by agent scripts | Medium | Start with core write methods; log unproxied method calls; expand iteratively |
| 2 | Sublist field capture incomplete without known sublist IDs | Medium | Agent hints in context; common sublist enumeration; future metadata table |
| 3 | RESTlet deployment coordination — dry-run called before RESTlet updated | Medium | Handle "Unknown action" gracefully; deploy RESTlet before enabling server dry-run calls |
| 4 | 5,000 governance units may be tight for complex scripts with many record operations + field enumeration | Low | Governance safety threshold at 200; return partial results |
| 5 | `record.create()` placeholder ID may confuse downstream code that checks record IDs | Low | Use negative IDs to avoid collision; document in change summary |
| 6 | Production NS role is VIEW-only — execute-approved in production needs role changes | Medium | Sandbox-first (FULL permissions); production role review is a separate workstream |
| 7 | NetSuite side-effects (workflows, UES, formula recalcs) not visible in dry-run | Low | Document as known limitation; dry-run captures direct field changes only |

## APL Statement Reference

See `tech-research/apl.json` for structured questions, answers, and evidence.

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| `ticket.md` (ns-gm) | Research scope — three questions about proxy module feasibility | Confirmed: proxy modules can intercept real operations, not just user input |
| `diagnosis/diagnosis-statement.md` (ns-gm) | Root cause analysis of module injection mechanism | Lines 115-125 + 166 are the substitution point; read-through / write-intercept confirmed |
| `diagnosis/apl.json` (ns-gm) | Structured Q&A with code-line evidence | All six research questions answered with evidence; two prior tickets validated approach |
| `product/product.md` (ns-gm) | MVP scope, use cases, design principles | Dry-run preview + approved execution; transparency principle; additive-only changes |
| `scout/scout-summary.md` (ns-gm) | Architecture analysis of RESTlet module injection | 24 pre-loaded modules; `new Function()` pattern; prior research references |
| `scout/reference-map.json` (ns-gm) | File inventory, facts, unknowns | Key files; sublist discovery unknown; governance budget unknown |
| `ns_gm_restlet.js` (direct read) | Verify module injection pattern and action dispatcher | Confirmed: lines 23-37 action routing, 71-96 moduleMap, 115-125 array build, 163-169 safeExecute |
| `server/app.js` (direct read) | Endpoint pattern for new dry-run/execute endpoints | POST `/run` pattern (lines 35-86): validate → `nsapi.REST.post()` → structured response |
| `server/auth.js` (direct read) | OAuth 2.0 M2M implementation details | Token caching, 401 retry, `REST.post()` interface — all reusable for new actions |
| Prior tech-research (cmnqr8lkk) | Architecture decision on proxy approach | Approach B chosen over 5 alternatives; detailed proxy spec; HMAC simplified to server-side |
| Prior diagnosis (cmnrx64kr) | Proxy viability validation | Confirmed viable; before/after capture spec; LOW regression risk |
| `diagnosis/diagnosis-statement.md` (helix-global-server) | Server role in proxy modules | Duplicate RESTlet sync; credential chain reusable; orchestrator EXECUTE-mode gap |
| `product/product.md` (helix-global-server) | Server-side scope | RESTlet sync, orchestrator branching, credential reuse, change summary persistence |
| `repo-guidance.json` | Repo intent classification | ns-gm = target (primary), helix-global-server = target (secondary) |
| SuiteScript 2.0 Typings (Context7) | Verify N/record API surface | Confirmed `record.load()`, `record.getFields()`, `record.save()` API patterns |
