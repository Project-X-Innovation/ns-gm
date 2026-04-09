# Tech Research: Proxy Module Research — ES6 Proxy Wrapping of Real NetSuite Modules (ns-gm)

## Technology Foundation

- **Runtime**: SuiteScript 2.1 (`@NApiVersion 2.1`) on **GraalJS** (ES2019+/ES2023). ES6 Proxy is part of ES2015 and is fully supported by GraalJS.
- **Execution model**: `new Function(...moduleNames, userCode)` at line 166 of `ns_gm_restlet.js` creates an execution function; line 169 calls it with `...moduleValues` (real N/* module objects as positional parameters). User code cannot distinguish a Proxy-wrapped module from the real one.
- **Module injection**: Lines 115-125 build `moduleParamNames[]` and `moduleParamValues[]` arrays dynamically from `requestedModules` via `loadModule()`. The `moduleMap` (lines 71-96) contains 24 pre-loaded N/* modules loaded by NetSuite's AMD `define()` (lines 7-16).
- **Current actions**: `run` (execute code) and `getscriptexecutionlogs` (retrieve logs) — the only two branches in the `post()` dispatcher (lines 23-37).
- **Express proxy**: `server/app.js` with POST `/run` and POST `/logs` endpoints; forwards to RESTlet via `nsapi.REST.post()` (OAuth 2.0 M2M with JWT PS256 via `server/auth.js`).
- **No build step**, no test framework, no lint/typecheck. Pure JS + Express + Commander CLI.
- **Governance budget**: 5,000 units per RESTlet invocation.
- **Credential infrastructure**: 10 NsGmCredential records across 5 organizations confirmed operational (runtime-verified via database inspection).

## Architecture Decision

### Evolution from Prior Research

Prior research (tickets cmnqr8lkk, cmnrx64kr) established "Approach B: Module Replacement" — swapping the N/record module object in `moduleParamValues[]` with a custom proxy wrapper. This captures what the user's code calls (Level 1) but misses what the real module processes internally — field sourcing, dependent field population, and in-memory validation are lost because the real module never runs.

The user's refined ask: **"Can we keep the NetSuite module, not our own version of the module, all the code that actually runs in the NetSuite module, but just hijack it at the end when it sends it off to NetSuite?"**

This drives a shift from module replacement to **ES6 Proxy wrapping** — a strict improvement.

### Options Considered

**Option A: Companion beforeSubmit UserEventScript (UES)**

Deploy a `beforeSubmit` UES that fires on every Helix-initiated record save. The UES captures the post-validation 'new record' state at the commit boundary.

- *Pros*: Captures true Level 3 state (post-validation, post-sourcing, post-formula-recalc). NetSuite-native mechanism.
- *Cons*: **Governance chaining risk** — RESTlet → `record.save()` → UES → `N/https.post()`. Governance compounds across script contexts. External HTTP latency in beforeSubmit may cause timeouts. Requires deploying a new script type to customer accounts. Needs a new NS-to-Helix auth channel.
- *Verdict*: **Rejected.** Governance chaining risk and operational complexity make this unsuitable.

**Option B: Module Replacement Proxy (Prior Research)**

Replace the `N/record` module object in `moduleParamValues[]` with a custom wrapper that mimics the N/record API. Write operations intercepted; reads delegate to the real module.

- *Pros*: Proven pattern from prior research. No new NetSuite deployment. Works within single RESTlet governance context.
- *Cons*: **The real module never runs for write operations.** User code executes against a custom object, not the real N/record module. In-memory processing (field sourcing, dependent field population) is NOT captured — only what the user's code explicitly sets (Level 1). High maintenance burden: must implement every N/record method. Risk of missing API methods or behavioral differences.
- *Verdict*: **Superseded** by Option B-prime (ES6 Proxy wrapping).

**Option B-prime: ES6 Proxy Wrapping of Real Module (CHOSEN)**

Wrap the real `N/record` module object in `new Proxy(realModule, handler)` at the `moduleParamValues` substitution point. ALL operations pass through to the real module. The Proxy handler's `get` trap adds observation hooks ONLY at write-boundary methods (`save`, `submitFields`, `delete`).

- *Pros*: **Real module behavior preserved** — all reads, creates, loads, and field manipulations use the actual N/record module. In-memory processing (sourcing, dependent field population, in-memory validation) runs naturally because it's the real module. **Automatic API coverage** — Proxy passes through all unintercepted methods, no need to reimplement the API surface. **Captures Level 2** — the field dump before `save()` reflects the real module's in-memory state, not just user input. Low maintenance: only write-boundary handlers need code.
- *Cons*: **Key unknown**: Whether ES6 Proxy works correctly on GraalJS Java-backed N/* module objects (host object interop edge case). Requires empirical runtime verification. Cannot capture Level 3 (post-commit state) without letting save execute.
- *Verdict*: **Chosen.** Strict improvement over Option B — same observability goals, higher fidelity, less custom code.

**Option C: Monkey-Patching Individual Methods**

Keep the real module but replace individual methods (e.g., `record.save = wrapperFn`) with wrappers that call the originals.

- *Pros*: Simpler than full Proxy; works if Proxy is unavailable.
- *Cons*: Requires N/* module methods to be writable (not frozen/sealed). Modifies the shared module object, which could affect other script executions in the same RESTlet deployment. Does not handle dynamically accessed methods.
- *Verdict*: **Deferred as fallback.** If ES6 Proxy fails on Java-backed objects, monkey-patching is the fallback. Proxy wrapping does not modify the original object, making it safer.

### Chosen Option: ES6 Proxy Wrapping (Option B-prime)

**Rationale:**
1. The user explicitly asked to keep the real module. ES6 Proxy wraps it without modification.
2. SuiteScript 2.1 runs on GraalJS (ES2019+/ES2023). ES6 Proxy (ES2015) is supported. Real-world confirmation: developer Marty Y. Chang's article demonstrates Proxy-wrapped record objects in SuiteScript 2.1 User Event Scripts.
3. The `new Function()` execution scope (line 166) is isolated — user code receives the Proxy-wrapped module as a positional parameter and cannot detect the wrapping.
4. The field dump captured before `save()` reflects the REAL module's in-memory processing (Level 2: sourcing, dependent field population, in-memory validation), not just user-set values (Level 1). This is substantially richer.
5. Only write-boundary handler traps are needed — all other methods are automatic passthrough. Far less code to write and maintain than module replacement.

## Core API/Methods

### Two-Level Proxy Pattern

The architecture uses a two-level Proxy chain:

**Level 1 — Module Proxy**: Wraps the real `N/record` module object. The `get` trap intercepts calls to `create`, `load`, `copy`, `submitFields`, `delete`. Methods that return Record instances (`create`, `load`, `copy`) wrap the returned instance in a Level 2 Proxy. Methods that write directly (`submitFields`, `delete`) are intercepted for state capture.

**Level 2 — Record Instance Proxy**: Wraps each real Record instance returned by `record.create()`, `record.load()`, `record.copy()`. The `get` trap intercepts `save()` to capture the full in-memory field state before the actual save. ALL other Record methods (`getValue`, `setText`, `getSublistValue`, `insertLine`, etc.) pass through to the real Record instance.

### Injection Point

In `handleRunAction()` (or new `handleDryRunAction()`), after building `moduleParamValues` at lines 115-125:

```
// Conceptual — not implementation code:
// For each module in moduleParamValues, if it's 'record', wrap it:
// moduleParamValues[i] = new Proxy(moduleObj, moduleHandler)
```

The real `record` object from NetSuite's AMD `define()` is preserved as the Proxy target. User code calls methods on the Proxy, which delegates to the real module.

### RESTlet Action Extensions

**`dry-run` action** — new `else if` branch in `post()`:
- Input: `{ action: "dry-run", data: { code, modules, context } }` where `context` contains `{ targetSublistIds, description }`
- Flow: Build `moduleParamNames`/`moduleParamValues` as normal, then **wrap** the `record` entry in `moduleParamValues` with `new Proxy(recordModule, handler)` before calling `safeExecute()`
- The handler accumulates intercepted operations into a `capturedChanges` array accessible after execution
- Output: `{ success, recordChanges[], governance, executionTime }` where `recordChanges` is the array of captured operations with field state

**`execute-approved` action** — new `else if` branch in `post()`:
- Input: `{ action: "execute-approved", data: { code, modules, approvalToken, approvalId } }`
- Flow: Functionally identical to existing `run` action — executes code with real (non-proxied) modules. Echoes `approvalToken` in response for server-side verification.
- Output: Standard `run` response format + `{ approvalToken }` echo

### Proxy Handler Design

**Module-Level Handler (wraps N/record):**

| Trapped Method | Behavior |
|---------------|----------|
| `record.create(options)` | Call `realRecord.create(options)`. Wrap returned Record instance in Level 2 Proxy. Return the wrapper. |
| `record.load(options)` | Call `realRecord.load(options)`. Capture "before" field state via `getFields()`/`getValue()`/`getText()`. Wrap returned Record in Level 2 Proxy. Return the wrapper. |
| `record.copy(options)` | Call `realRecord.copy(options)`. Wrap returned Record in Level 2 Proxy. Return the wrapper. |
| `record.submitFields(options)` | **Intercept**: Load the target record for "before" state, capture the submitted field values as "after" delta. Do NOT call `realRecord.submitFields()`. Return the record ID. |
| `record.delete(options)` | **Intercept**: Load target record for state capture, record as deletion. Do NOT call `realRecord.delete()`. Return the record ID. |
| `record.transform(options)` | Call `realRecord.transform(options)`. Wrap returned Record in Level 2 Proxy. Transform callbacks execute against the real module. |
| All other properties | **Passthrough** via default `get` trap: `return Reflect.get(target, prop, receiver)` |

**Record-Instance Handler (wraps each Record):**

| Trapped Method | Behavior |
|---------------|----------|
| `instance.save()` / `instance.save(options)` | **Intercept**: Capture comprehensive field dump from the live Record instance (body fields via `getFields()`/`getValue()`/`getText()`, sublist data via `getLineCount()`/`getSublistValue()`). The dumped state reflects the real module's in-memory processing (sourcing, dependent fields). Do NOT call `realInstance.save()`. Return existing ID (loaded records) or placeholder negative ID (created records). Push captured state to `capturedChanges`. |
| All other properties | **Passthrough** via `Reflect.get(target, prop, receiver)` — `getValue`, `setValue`, `getText`, `getSublistValue`, `insertLine`, etc. all execute on the real Record instance. |

### What This Captures: Three Interception Levels

| Level | Description | ES6 Proxy Approach |
|-------|-------------|-------------------|
| **Level 1** — User Input | Only what user code called (`setValue`, etc.) | Implicitly captured — it's the real module |
| **Level 2** — Pre-save In-Memory State | All field values after real module's in-memory processing (sourcing, dependent fields, in-memory validation) | **CAPTURED** — `getFields()`/`getValue()`/`getText()` on the real Record instance before `save()` |
| **Level 3** — Post-commit State | Field values after `record.save()`'s JVM-internal processing (mandatory checks, formula recalcs, server-side defaults) | Only with real save (side effects) or companion beforeSubmit UES |

**Key insight**: Level 2 is substantially richer than Level 1. When user code calls `record.setValue({fieldId: 'entity', value: 123})` on a Sales Order, the real N/record module immediately populates dependent sourced fields (billing address, terms, tax code, etc.) in memory. The Proxy approach captures ALL of this by reading the record's field values before save — without executing the save.

### Field State Capture Strategy

1. **Body fields**: `record.getFields()` on the live Record instance returns all body-level field IDs. For each: `{ fieldId, value: record.getValue({fieldId}), text: record.getText({fieldId}) }`.
2. **Sublist fields**: No equivalent discovery API for sublists. Mitigation:
   - Accept `targetSublistIds` in the `dry-run` context from the AI agent
   - For each known sublist: `getLineCount({sublistId})` then iterate lines with `getSublistValue()`
   - Attempt common sublist IDs for transaction records (`item`, `expense`, `line`, `partner`, `salesteam`) with silent failure
   - Future: record-type-to-sublist mapping table
3. **Limitations**: `getFields()` returns body fields only. Sublist capture completeness depends on hints or known sublist IDs.

### Change Summary Output Format

```
{
  operation: "save" | "create" | "submitFields" | "delete",
  recordType: string,
  recordId: string | number | null,
  before: { [fieldId]: { value, text } },
  after: { [fieldId]: { value, text } },
  sublists: { [sublistId]: { lineCount: number, lines: [...] } }
}
```

### Express Proxy Endpoints

Two new endpoints in `server/app.js` following the existing `/run` pattern (lines 35-86):

```
POST /dry-run    → { action: "dry-run", data: { code, modules, context } }
POST /execute    → { action: "execute-approved", data: { code, modules, approvalToken, approvalId } }
```

Both use `requireActiveProfile()` + `nsapi.REST.post()` — identical authentication flow to `/run`.

## Technical Decisions

### 1. ES6 Proxy wrapping over module replacement

**Decision**: Use `new Proxy(realModule, handler)` instead of building a custom proxy object.

**Why**: The user explicitly asked for the real module to keep running. Proxy wrapping is a strict improvement over module replacement:

| Aspect | Module Replacement (Prior) | ES6 Proxy Wrapping (New) |
|--------|---------------------------|--------------------------|
| Module behavior | Simulated — custom object mimics API | **Real** — actual N/record runs |
| Record instances | Custom replicas | **Real** NetSuite Record objects |
| In-memory processing | Not captured | **Captured** — real sourcing/validation runs |
| API surface coverage | Must implement every method | **Automatic** — Proxy passes through |
| Maintenance burden | High — must track API changes | **Low** — only write handlers |

**Rejected alternative**: Module replacement (prior Approach B). Lower fidelity, higher maintenance.

### 2. Proxy lives inside the RESTlet, not the Express proxy

The module proxy **must** be implemented within `ns_gm_restlet.js` because the N/record module objects are instantiated by NetSuite's AMD `define()` (lines 7-16). The Express proxy (`server/app.js`) has no access to these objects; it only sends JSON payloads.

### 3. Only N/record needs Proxy wrapping for MVP

Of the 24 pre-loaded modules, only `N/record` contains write methods that modify NetSuite records. `N/transaction.void()` is the one exception — deferred to Round 2. Other write-capable modules (`N/email`, `N/file`, `N/https`, `N/task`) have side effects outside the record mutation scope.

### 4. `save()` is blocked in dry-run, not executed-then-rolled-back

**Decision**: The Record-instance Proxy intercepts `save()` and captures field state WITHOUT calling the real `save()`.

**Why**: NetSuite RESTlets have no transaction rollback API. Letting `save()` execute would commit data and fire workflows/UES with no undo. Blocking save and capturing Level 2 state is the safest approach that still provides substantially richer data than Level 1.

**Rejected alternative**: Execute real `save()` then read back the record. Provides Level 3 fidelity but has irreversible side effects — data mutations, workflow triggers, UES firing.

### 5. Approval token validation is server-side only

The RESTlet's `execute-approved` action echoes the `approvalToken`. The Helix server validates the token. This avoids embedding shared secrets in the RESTlet.

### 6. Governance safety threshold

Dry-run consumes governance from the same RESTlet invocation. The proxy should check `runtime.getCurrentScript().getRemainingUsage()` (already used at line 47) and abort if remaining units drop below 200, returning a partial result with a governance warning.

### 7. `capturedChanges` accumulation pattern

The Proxy handler closures share a `capturedChanges` array created in the `handleDryRunAction` scope. Each intercepted write method pushes to this array. After `safeExecute()` returns, `capturedChanges` is included in the response. This avoids global state — the array is scoped to the single request.

### 8. Fallback strategy if Proxy fails on Java-backed objects

**Primary**: ES6 Proxy wrapping (Option B-prime).
**Fallback**: If empirical testing shows Proxy doesn't work on Java-backed N/* module objects, fall back to monkey-patching individual methods on a shallow clone of the module object. This is less elegant but avoids modifying the shared original.
**Test first**: Before building the full handler, run a minimal Proxy test via ns-gm CLI to confirm viability.

## Cross-Platform Considerations

### RESTlet Deployment Coordination

The modified RESTlet must be deployed to customer NetSuite accounts via SDF before the server starts sending `dry-run` actions. If the server calls `dry-run` against an old RESTlet, it gets `{ success: false, error: "Unknown action: dry-run" }`.

**Mitigation**: The server should handle `"Unknown action"` responses gracefully. Deployment sequence: update RESTlet first, then enable `dry-run` calls.

### Backward Compatibility

New `dry-run` and `execute-approved` actions are additive `else if` branches. Existing `run` and `getscriptexecutionlogs` actions are completely unchanged. Any version of the server/CLI that only uses `run` continues to work. The updated RESTlet also works with old clients.

### Duplicate RESTlet Sync

`helix-global-server` maintains a duplicate RESTlet at `netsuite-setup/FileCabinet/SuiteScripts/ns_gm_restlet.js`. This copy must be updated identically when Proxy code is added. Currently manually maintained.

### NS Role Permissions

- **Sandbox**: FULL permissions — supports both dry-run (read + in-memory operations) and execute-approved (real writes).
- **Production**: VIEW-only — supports dry-run (read operations work) but blocks execute-approved (saves would fail). Production role changes are a separate workstream.

## Performance Expectations

| Operation | Expected Latency | Governance Cost |
|-----------|-----------------|-----------------|
| ES6 Proxy wrapping overhead | <1ms | 0 units (pure JS) |
| `dry-run` with 1 record load + field capture | 2-5 seconds | ~20-50 units |
| `dry-run` with 3 record loads + captures | 5-10 seconds | ~60-150 units |
| `getFields()` call per record | <50ms | 0 units (in-memory) |
| `getValue()`/`getText()` per field | <5ms each | 0 units (in-memory) |
| `execute-approved` (identical to `run`) | 2-10 seconds | Depends on script |

ES6 Proxy has negligible runtime overhead — GraalJS optimizes Proxy trap dispatch. The governance budget of 5,000 units is sufficient for typical agent scripts that modify 1-5 records.

## Dependencies

**No new dependencies for ns-gm.** The repo remains pure JS + Express:

- RESTlet changes: Pure SuiteScript 2.1 using `Proxy` (built-in ES6) and existing pre-loaded modules (no new `N/*` imports)
- Express proxy changes: Follow existing `/run` endpoint pattern using existing `nsapi.REST.post()`
- CLI changes: None required for the proxy mechanism itself

**Cross-repo dependency**: `helix-global-server` must update its duplicate RESTlet copy to match.

**External dependency**: ES6 Proxy on GraalJS Java-backed objects — requires empirical runtime verification before full implementation.

## Deferred to Round 2

| Item | Rationale |
|------|-----------|
| `N/transaction.void()` Proxy wrapping | Focus on N/record for MVP; expand Proxy surface iteratively |
| Other write-capable modules (`N/email`, `N/https`, `N/file`, `N/task`) | Side effects outside record mutation scope; different interception patterns needed |
| Comprehensive sublist auto-discovery | Start with `getFields()` + common sublists + agent hints; full metadata mapping later |
| `record.transform()` callback deep interception | Nested operations within transform callbacks are complex; the returned Record IS Proxy-wrapped, but callback internals are not |
| Companion beforeSubmit UES for Level 3 | Layer after ES6 Proxy approach is proven; provides defense-in-depth for post-validation state |
| Governance budget alerting/metrics | Track governance in responses; alerting thresholds in Round 2 |
| RESTlet version capability check | New RESTlet could report supported actions via a `capabilities` action |
| Monkey-patching fallback implementation | Only build if Proxy fails on Java-backed objects during runtime verification |
| Client-side approval UI | Display intercepted record state for human approval — separate scope |
| Orchestrator EXECUTE-mode branching | 0 EXECUTE tickets in production; build when needed |

## Summary Table

| Dimension | Decision |
|-----------|----------|
| **Architecture** | ES6 Proxy Wrapping of Real N/record Module (Option B-prime) |
| **Key improvement over prior** | Real module runs; Level 2 in-memory state captured (sourcing, dependent fields) |
| **New RESTlet actions** | `dry-run` (Proxy-wrapped N/record) + `execute-approved` (real modules, token echo) |
| **Proxy pattern** | Two-level: Module Proxy (wraps N/record) → Record Instance Proxy (wraps each Record) |
| **Intercepted methods** | `save()`, `submitFields()`, `delete()` at write boundary |
| **Passthrough** | All read methods + all 23 other N/* modules via `Reflect.get()` |
| **Substitution point** | `moduleParamValues[]` array (lines 115-125) — wrap `record` entry with `new Proxy()` |
| **Field capture** | `getFields()` + `getValue()`/`getText()` on real Record instance (Level 2) |
| **Token validation** | Server-side only; RESTlet echoes token |
| **Governance safety** | Abort at <200 remaining units; return partial result |
| **New Express endpoints** | POST `/dry-run`, POST `/execute` |
| **Backward compatibility** | Additive actions; existing `run`/`logs` unchanged |
| **Dependencies** | None new; pure JS + built-in ES6 Proxy |
| **Blocking unknown** | ES6 Proxy on GraalJS Java-backed N/* module objects — requires runtime test |
| **Fallback** | Monkey-patching individual methods on shallow clone (deferred unless Proxy fails) |

## Open Risks

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | **ES6 Proxy may not work on GraalJS Java-backed N/* module objects** — this is a Java-to-JS interop edge case that could cause the `get` trap to not fire or to throw | **High** | Run a minimal Proxy verification test via ns-gm CLI BEFORE building full handler. Fallback to monkey-patching if needed. |
| 2 | Record instance methods may be on the prototype rather than own properties, affecting whether Level 2 Proxy `get` trap correctly intercepts `.save()` | Medium | Proxy `get` trap fires for all property access regardless of own vs prototype. `Reflect.get` handles prototype chain correctly. Low actual risk. |
| 3 | N/* module objects may be frozen/sealed by GraalJS host interop | Low | Does not affect Proxy wrapping (Proxy creates a new object; original is untouched). Only affects monkey-patching fallback. |
| 4 | Sublist field capture incomplete without known sublist IDs | Medium | Agent hints in context; common sublist enumeration; future metadata table |
| 5 | RESTlet deployment coordination — dry-run called before RESTlet updated | Medium | Handle "Unknown action" gracefully; deploy RESTlet first |
| 6 | `record.create()` placeholder ID may confuse downstream code that checks record IDs | Low | Use negative IDs; document in change summary |
| 7 | Production NS role is VIEW-only — execute-approved in production needs role changes | Medium | Sandbox-first (FULL permissions); production role review separate |
| 8 | Some N/record methods may return non-Proxied internal objects (e.g., `getSubrecord()`) that bypass interception | Low | Document as known limitation; expand Proxy coverage iteratively |

## APL Statement Reference

See `tech-research/apl.json` for structured questions, answers, and evidence.

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| `ticket.md` (ns-gm) | Research scope — user's refined question about deeper interception | User wants real module preserved, intercept at write boundary |
| User continuation context | Exact user ask driving architecture evolution | "Keep the NetSuite module, not our own version, all the code that actually runs, but just hijack it at the end" |
| `diagnosis/diagnosis-statement.md` (ns-gm) | ES6 Proxy wrapping analysis, three interception levels | Proxy confirmed available in SuiteScript 2.1 (GraalJS); Level 2 capture validated; strict improvement over module replacement |
| `diagnosis/apl.json` (ns-gm) | Structured Q&A on Proxy feasibility with evidence | Five questions answered: Proxy wrapping works, Level 2 captured without side effects, no clean Level 3 mechanism |
| `product/product.md` (ns-gm) | MVP scope, use cases, success criteria | ES6 Proxy wrapping features; runtime validation required; dry-run + execute-approved flow |
| `scout/scout-summary.md` (ns-gm) | Three interception depth levels; architectural boundaries | N/* modules make JVM calls (no HTTP transport to intercept); beforeSubmit UES is only Level 3 native mechanism |
| `scout/reference-map.json` (ns-gm) | File inventory, facts, unknowns | 24 pre-loaded modules; Proxy availability unknown at scout time (now resolved); method wrapping feasibility unknown |
| `ns_gm_restlet.js` (direct read, full file) | Verify module injection pattern, action dispatcher, execution model | Lines 7-16 AMD define; 71-96 moduleMap; 115-125 array build; 163-169 safeExecute; confirmed substitution point |
| `server/app.js` (direct read) | Express endpoint pattern for new dry-run/execute endpoints | POST `/run` pattern (lines 35-86): validate → `nsapi.REST.post()` → structured response |
| `server/auth.js` (direct read, lines 172-182) | OAuth 2.0 M2M `postToRestlet()` — reusable for new actions | Bearer token auth, 30s timeout, JSON content-type — all reusable |
| `diagnosis/diagnosis-statement.md` (helix-global-server) | Server role assessment | Server unchanged by Proxy approach; duplicate RESTlet sync required; credentials reusable |
| `product/product.md` (helix-global-server) | Server-side MVP scope | RESTlet sync only; no server logic changes for Proxy mechanism |
| `repo-guidance.json` | Repo intent classification | ns-gm = primary target, helix-global-server = secondary (file sync only) |
| Runtime inspection (helix-global-server DB) | Verify credential infrastructure | 10 NsGmCredential records across 5 organizations confirmed |
| Web search (via diagnosis): SuiteScript 2.1 GraalJS | ES6 Proxy availability confirmation | GraalJS supports ES2023; Marty Y. Chang article confirms Proxy usage in SuiteScript 2.1 |
| Prior tech-research (this run, ns-gm) | Baseline from prior iteration | Approach B (module replacement) established; this update evolves to ES6 Proxy wrapping |
