# Tech Research — ns-gm

## Technology Foundation

- **Language**: Plain JavaScript (no TypeScript, no build step)
- **Runtime**: Node.js >= 24 (package.json engine requirement)
- **Server**: Express (local proxy on port 9292)
- **NetSuite**: SuiteScript 2.1 RESTlet (@NApiVersion 2.1)
- **Auth**: OAuth 2.0 M2M JWT with PS256 signing (jose library)
- **Dependencies**: axios, commander, express, jose, cors
- **Quality gates**: None (no test framework, no lint, no typecheck). Validation is manual.

## Architecture Decision

### Options Considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. BeforeSubmit UserEvent** | Deploy a UserEventScript that captures field state in beforeSubmit | Standard NetSuite pattern; captures server-side defaults | Requires SDF deployment per record type; cannot preview without committing; doesn't capture multi-record scripts |
| **B. Two-Phase RESTlet with Module Proxy** | Proxy N/record in the RESTlet to intercept writes during dry-run | Runs any user code; no extra deployments; captures all record operations in a single invocation | Cannot capture NetSuite-side effects (workflows, UE scripts); sublist discovery needs agent hints |
| **C. Snapshot Comparison** | Save record state before execution, diff after | Captures real NetSuite-side effects | Commits changes to get the diff; requires rollback (fragile); not a true dry-run |

### Chosen Option: B — Two-Phase RESTlet with Module Proxy

**Rationale**: Option B is the only approach that provides a true dry-run (no data committed) while supporting arbitrary user code execution. The RESTlet's `new Function(...moduleNames, userCode)` injection pattern at line 166 of `ns_gm_restlet.js` makes proxy substitution straightforward — the proxy wrapper replaces the `record` entry in the `moduleParamValues` array before it reaches `safeExecute()`. The known limitations (no server-side effect prediction, sublist hints required) are acceptable for MVP and documented to users.

## Core API/Methods

### RESTlet Actions (ns_gm_restlet.js)

**New action: `dry-run`** — `handleDryRunAction(requestBody)`
- Accepts: `{action: 'dry-run', data: {code, modules?, targetSublistIds?}}`
- Reuses the module loading pattern from `handleRunAction()` (lines 63-125)
- After building `moduleParamNames[]`/`moduleParamValues[]`, locates the `'record'` entry and replaces it with the proxy wrapper object
- Calls `safeExecute(userCode, moduleParamNames, moduleParamValues)` with the proxied module array
- Returns: `{execution, changeSummary, governance, executionTime}`

**New action: `execute-approved`** — `handleExecuteApprovedAction(requestBody)`
- Accepts: `{action: 'execute-approved', data: {code, modules?, approvalToken?}}`
- Functionally identical to `handleRunAction()` — real N/record module, no proxy
- The `approvalToken` is passed through in the response for audit; the RESTlet does NOT validate it (validation is server-side in helix-global-server)
- Returns: same shape as `handleRunAction()` plus `approvalToken` echo

### Proxy N/record Wrapper

The proxy wrapper object exposes the same API surface as N/record:

| Method | Dry-Run Behavior |
|--------|-----------------|
| `record.load(options)` | Delegates to real `record.load()`. Captures field values via `getFields()` as "before" state. Returns a wrapped record object that intercepts `.save()` |
| `record.create(options)` | Returns a wrapped record object that tracks `.setValue()` calls. On `.save()`, captures all set values as "after" state, returns placeholder ID (e.g., `'dry-run-new-1'`) |
| `record.submitFields(options)` | Calls real `record.load()` to get "before" state. Captures submitted field values as "after" state. Does NOT call real `submitFields()` |
| `record.delete(options)` | Calls real `record.load()` to capture full state as "before". Marks as deletion. Does NOT call real `delete()` |
| `record.copy(options)` | Delegates to real `record.copy()`. Returns wrapped record that intercepts `.save()` |
| `record.transform(options)` | Delegates to real `record.transform()`. Returns wrapped record (note: nested operations inside transform callbacks may not be fully captured — known limitation) |

**Body field discovery**: `getFields()` returns an array of body field IDs on a loaded record. The proxy iterates these to capture before/after values.

**Sublist field discovery**: `getFields()` does NOT return sublist field IDs. Sublist capture relies on `targetSublistIds` provided in the request payload (agent hint). For each hinted sublist, the proxy iterates lines and captures sublist field values. If no hints are provided, a warning is included in the changeSummary.

### changeSummary Response Shape

```
{
  "operations": [
    {
      "type": "update" | "create" | "delete" | "submitFields",
      "recordType": "salesorder",
      "recordId": "12345",
      "fields": [
        { "id": "entity", "before": "1234", "after": "5678" },
        { "id": "memo", "before": "old memo", "after": "new memo" }
      ],
      "sublists": [
        {
          "id": "item",
          "lines": [
            {
              "line": 0,
              "fields": [
                { "id": "item", "before": "100", "after": "200" },
                { "id": "quantity", "before": "5", "after": "10" }
              ]
            }
          ]
        }
      ]
    }
  ],
  "warnings": []
}
```

### Express Proxy Endpoints (server/app.js)

**New: `POST /dry-run`** — follows existing `POST /run` pattern (lines 35-86):
- Validates `code` field
- Calls `requireActiveProfile()`
- Sends `{action: 'dry-run', data: {code, modules, targetSublistIds}}` via `nsapi.REST.post()`
- Returns structured response with `changeSummary`

**New: `POST /execute`** — follows existing `POST /run` pattern:
- Validates `code` and `approvalToken` fields
- Calls `requireActiveProfile()`
- Sends `{action: 'execute-approved', data: {code, modules, approvalToken}}` via `nsapi.REST.post()`
- Returns structured response identical to `/run`

## Technical Decisions

### Decision: RESTlet does NOT validate approval tokens
- **Chosen**: Token passthrough — RESTlet includes token in response for audit but does not validate
- **Rejected**: RESTlet-side validation — would require storing secrets in NetSuite and adds complexity for no security benefit (the server controls both sides)
- **Rationale**: The helix-global-server is the only caller of `execute-approved` and already validates the HMAC token before making the RESTlet call. The RESTlet is a dumb executor.

### Decision: Only N/record is proxied (not N/transaction)
- **Chosen**: Proxy N/record only for MVP
- **Rejected**: Also proxying N/transaction
- **Rationale**: N/transaction module methods are less commonly used in the scripts this feature targets. N/record covers the vast majority of write operations (save, submitFields, delete). N/transaction can be added in a future iteration if needed.

### Decision: Additive-only changes to existing code
- **Chosen**: New `else if` branches in the RESTlet dispatcher, new `app.post()` registrations in Express
- **Rejected**: Refactoring the dispatcher to a strategy pattern or router
- **Rationale**: Minimal impact. The existing `if/else` chain (lines 23-37) and Express route pattern are simple and effective. Adding 2 more branches does not warrant restructuring. This guarantees zero regression for non-Helix users.

### Decision: Proxy wrapper is a plain object, not a Proxy/class
- **Chosen**: Plain JavaScript object literal with method properties
- **Rejected**: ES6 Proxy, ES6 class
- **Rationale**: SuiteScript 2.1 supports ES2020+ but NetSuite's runtime has quirks with advanced metaprogramming. A plain object with explicit method definitions is the most reliable and debuggable approach. It also makes the API surface explicit — only the methods we define exist on the wrapper.

## Cross-Platform Considerations

### Two RESTlet Copies Must Stay Identical
The RESTlet exists in two locations:
1. `ns-gm/ns_gm_restlet.js` — standalone repo copy, deployed manually by CLI users
2. `helix-global-server/netsuite-setup/FileCabinet/SuiteScripts/ns_gm_restlet.js` — SDF copy deployed via SuiteApp to customer NetSuite accounts

Both must receive identical changes. The SDF copy update requires customers to redeploy the SuiteApp.

### Non-Helix User Safety
| Component | Regression Risk | Reason |
|-----------|----------------|--------|
| RESTlet `run` action | NONE | Untouched `if` branch (line 26) |
| RESTlet `getscriptexecutionlogs` | NONE | Untouched `else if` branch (line 29) |
| Express `/run` endpoint | NONE | Untouched `app.post()` handler (line 35) |
| Express `/logs` endpoint | NONE | Untouched `app.post()` handler (line 89) |
| CLI commands (run, logs, env, setup) | NONE | Only interact with existing endpoints |

## Performance Expectations

| Metric | Expectation | Basis |
|--------|-------------|-------|
| Dry-run governance cost | ~10 units per `record.load()` + negligible for `getFields()` | NetSuite governance docs; typical scripts load 1-5 records |
| Dry-run RESTlet timeout | Same as `run` (default 300s) | Uses same `safeExecute()` wrapper |
| Execute-approved performance | Identical to `run` | Same code path with real modules |
| Governance budget per invocation | 5000 units | Each RESTlet POST gets fresh budget |

## Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| express | existing | Local proxy server |
| cors | existing | CORS middleware |
| jose | existing | OAuth 2.0 M2M JWT signing |
| axios | existing | HTTP client (used by auth module) |
| Node.js | >= 24 | Runtime |

No new dependencies are needed for ns-gm changes.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Proxy cannot capture NetSuite-side effects (workflows, UE scripts, formula recalculations) | Medium | Document limitation clearly in changeSummary warnings and UI |
| `record.create()` + `.save()` returns placeholder ID, not real NetSuite ID | Low | Consumer (UI) shows "New Record" label for placeholders |
| Sublist field capture incomplete without `targetSublistIds` hints | Medium | Warning in changeSummary; agent should provide hints when generating scripts |
| `record.transform()` callbacks may contain nested operations not fully captured | Low | Rare in typical scripts; add warning for transform operations |
| RESTlet changes require SDF redeployment for customers | Low | Operational communication; not a code risk |

## Deferred to Round 2

- Proxying N/transaction module for transaction-level operations
- Sublist field discovery without agent hints (potential SuiteScript introspection API)
- `record.transform()` deep proxy for nested callbacks
- Dry-run governance budget monitoring and early abort
- RESTlet copy consolidation (single source of truth for both copies)

## Summary Table

| Aspect | Decision |
|--------|----------|
| Approach | Two-Phase RESTlet with Module Proxy (Approach B) |
| New RESTlet actions | `dry-run`, `execute-approved` |
| New Express endpoints | `POST /dry-run`, `POST /execute` |
| Proxy target | N/record only (MVP) |
| Field discovery | `getFields()` for body; `targetSublistIds` hints for sublists |
| Token validation | Server-side only (RESTlet passthrough) |
| Change type | Additive only — zero modification to existing paths |
| Non-Helix regression risk | None |

## APL Statement Reference

The ns-gm RESTlet's parameter-based module injection (new Function at line 166) enables reliable proxy N/record substitution for dry-run. Two new additive RESTlet actions (dry-run, execute-approved) and two new Express proxy endpoints (POST /dry-run, POST /execute) are needed. The proxy module captures before/after field state via getFields() for body fields and agent-provided targetSublistIds for sublists. All changes are additive — existing run/logs actions and CLI commands are untouched, ensuring zero regression for non-Helix users.

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md | Requirements | Verify proxy module viability; preserve non-Helix functionality |
| scout/scout-summary.md (ns-gm) | Architecture overview | Three-tier architecture; two RESTlet copies; module injection pattern |
| scout/reference-map.json (ns-gm) | File inventory | 8 key files; ns_gm_restlet.js is primary change target |
| diagnosis/diagnosis-statement.md (ns-gm) | Proxy viability confirmation | Module injection at line 166 enables proxy substitution; write methods intercepted |
| diagnosis/apl.json (ns-gm) | Detailed Q&A | Proxy confirmed viable; 5000 gov units sufficient; regression risk LOW |
| ns_gm_restlet.js (direct read) | Code verification | Verified new Function() at line 166, module array at lines 115-125, action dispatcher at lines 23-37 |
| server/app.js (direct read) | Endpoint pattern | POST /run pattern at lines 35-86 for new endpoint template |
| product/product.md | Product scope | Additive-only; non-Helix safety; known limitations documented |
| CLAUDE.md (ns-gm) | Repository standards | Command surface; no test framework; plain JavaScript |
