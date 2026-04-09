# Tech Research: NetSuite Execute Mode With Approval — ns-gm

## Technology Foundation

- **Architecture**: CLI -> local Express proxy (port 9292) -> NetSuite RESTlet
- **RESTlet**: SuiteScript 2.1 `@NScriptType Restlet` with `@NModuleScope Public`. Executes arbitrary code via `new Function(...moduleNames, userCode)` with 24 injected N/* modules.
- **Current actions**: `run` (execute code) and `getscriptexecutionlogs` (retrieve logs)
- **Auth**: OAuth 2.0 Client Credentials (M2M) with JWT client assertion (PS256)
- **Proxy**: Express with CORS, 50MB JSON body limit
- **No build step**, no database, no ORM. Pure JS + Express.

## Architecture Decision

### Options Considered

**Option 1: Deploy a separate UserEventScript (Approach A)**

Deploy a new `beforeSubmit` UES alongside the existing RESTlet. The UES fires on every Helix-initiated record save and makes an N/https.post call to Helix mainland to check approval status.

- *Pros*: Captures exact final record state at the point of commit; leverages NetSuite's save lifecycle.
- *Cons*: Governance chaining risk is the primary concern. RESTlet code calls `record.submit()`, which triggers the UES, which calls `N/https.post()` — governance units compound across script contexts. Oracle best practice: "keep beforeSubmit lean." External HTTP latency in beforeSubmit may cause timeouts. Requires deploying a new script to customer accounts (new operational pattern — current ns-gm only deploys the RESTlet). Needs a new NS-to-Helix auth mechanism.

**Option 2: Extend RESTlet with Module Proxy (RECOMMENDED — Approach B)**

Add new actions to the existing RESTlet: `dry-run` and `execute-approved`. The `dry-run` action wraps N/record with a proxy that intercepts write operations (save, submit, submitFields, delete) and captures before/after state without committing. The `execute-approved` action validates an HMAC approval token then runs the script with real modules.

- *Pros*: No new NetSuite script deployment. No governance chaining — stays within the RESTlet's 5000-unit context. Architecturally natural: `new Function()` already receives modules as arguments (line 166) — passing proxied modules requires no fundamental change. Reuses the existing pipeline.
- *Cons*: Cannot capture NetSuite-side effects (workflows, other UES triggers, formula fields). Proxy must handle the full N/record API surface that agent scripts might use.

**Option 3: New companion Suitelet**

Deploy a Suitelet within NetSuite that provides an approval UI.

- *Pros*: Native NetSuite UI.
- *Cons*: Explicitly out of scope per product spec ("Approval happens in Helix mainland, not via a NetSuite-native Suitelet interface"). Fractures UX.

### Chosen Option: Extend RESTlet with Module Proxy (Approach B)

**Rationale:**
1. The `new Function(...moduleNames, userCode)` pattern at line 166 of `ns_gm_restlet.js` already passes modules as function arguments. Swapping in a proxied `record` module for the `dry-run` action requires no architectural change.
2. No governance chaining — all operations stay within the single RESTlet execution context (5000 units).
3. No new script deployment to customer accounts.
4. The proxy only needs to intercept a bounded API surface: the N/record module's write methods.

## Core API/Methods

### RESTlet `post()` Handler Extension

The existing `post()` function at line 23 handles action routing. Two new actions are added:

**`dry-run` action:**
- Accepts same payload as `run`: `{ action: "dry-run", data: { code, modules, context } }`
- `context` contains metadata: `{ targetRecordTypes, description }` for logging/tracking
- Creates a proxied `record` module that intercepts write operations
- Passes the proxied module (and all other modules unmodified) to `new Function()`
- Returns: `{ success, recordChanges[], governance }` where `recordChanges` is an array of captured operations

**`execute-approved` action:**
- Accepts: `{ action: "execute-approved", data: { code, modules, approvalToken, approvalId } }`
- Validates the `approvalToken` (HMAC signature check — token contains approval ID, script hash, expiration)
- If valid: executes the script with real (non-proxied) modules, identical to the existing `run` action
- If invalid/expired: returns error without executing
- Returns: standard execution response (same format as `run`)

### Module Proxy Design (within RESTlet)

The proxy wraps the N/record module for the `dry-run` action. The key design principle: **intercept write operations, allow read operations.**

**Methods to proxy on the N/record module:**

| Method | Proxy Behavior |
|--------|---------------|
| `record.load(options)` | Passes through to real module. Also captures loaded record's field values as "before state" (iterates body fields and sublists). |
| `record.create(options)` | Passes through to real module (creates in-memory record object). |
| `record.copy(options)` | Passes through to real module. Captures source record state. |
| `record.transform(options)` | Passes through to real module. Captures source record state. |
| `record.delete(options)` | Intercepted: captures the delete intent with record type and ID. Returns without deleting. |
| `record.submitFields(options)` | Intercepted: captures the type, id, and values from options. Returns the record ID without saving. |
| `Record.prototype.save()` | Intercepted: captures all field values on the record object as "after state". Returns a placeholder ID (negative number to avoid collision). |

**Methods passed through unmodified:**

All read methods on Record instances (`getValue`, `getText`, `getSublistValue`, `getLineCount`, `getField`, etc.) and all other N/* modules (`N/search`, `N/query`, `N/https`, `N/log`, etc.).

**Capturing field state:**

For a loaded/created record, capture state by iterating known fields:
1. Use `record.getFields()` to get body field IDs
2. For each field: `{ fieldId, value: record.getValue({fieldId}), text: record.getText({fieldId}) }`
3. For each sublist (discoverable via record type metadata or by trying common sublist IDs): iterate lines with `getSublistValue()` for known column field IDs

### Proxy Express Endpoints

New endpoints in `server/app.js` corresponding to the new RESTlet actions:

```
POST /dry-run    → sends { action: "dry-run", data: { code, modules, context } } to RESTlet
POST /execute    → sends { action: "execute-approved", data: { code, modules, approvalToken, approvalId } } to RESTlet
```

These follow the existing `/run` endpoint pattern: validate input, get active profile, call `nsapi.REST.post()`, return structured response.

### HMAC Token Validation (in RESTlet)

The RESTlet validates the approval token without making external HTTP calls:

1. Token format: `base64(JSON({ approvalId, scriptHash, expiresAt }))` + `.` + `HMAC-SHA256(payload, sharedSecret)`
2. The shared secret is embedded in the RESTlet's script parameters (configured during deployment) or passed as part of the request header
3. Validation: compute HMAC of the base64 payload, compare to signature, check expiration
4. No network call needed — self-contained verification

**Trade-off**: The shared secret must be securely provisioned to the RESTlet. Options:
- **Script parameter** (preferred): Set via SDF deployment or manual configuration. Already used for other script-level settings in NetSuite.
- **Request header**: Passed from the proxy on each execute-approved call. Simpler but relies on transport security (HTTPS, already in place for RESTlet communication).

**Decision**: Use request header for MVP. The proxy already has access to the server's signing secret; it generates and validates tokens server-side, only passing the pre-validated flag via a secure header. This avoids requiring SDF deployment to provision secrets.

Actually, a simpler and more secure approach: **server-side token validation only.** The Helix server generates the HMAC token and includes it in the `execute-approved` RESTlet call. The RESTlet does NOT validate the token itself — it simply passes the token back in its response. The Helix server validates the response includes the correct token, confirming the right script ran. This removes the need to embed secrets in the RESTlet entirely.

**Final decision**: Server-side validation only. The RESTlet's `execute-approved` action is functionally identical to `run` but includes the `approvalToken` in the request and echoes it in the response. The security gate is the Helix server's `NsExecuteService`, which is the sole code path that can invoke `execute-approved`. This keeps the RESTlet simple and the security boundary clear.

## Technical Decisions

### Proxy Implementation Location

The module proxy is implemented **within the RESTlet** (`ns_gm_restlet.js`), not in the local proxy (`server/app.js`). Rationale:
- The RESTlet is where modules are instantiated and passed to `new Function()`.
- Proxy objects wrapping N/record must be created in the NetSuite execution context where the real modules are available.
- The local proxy is a pass-through; it sends the action and receives results.

### Record Field Discovery Challenge

Capturing "before state" requires knowing which fields a record has. NetSuite's N/record module provides `Record.getFields()` which returns body field IDs. For sublists, there is no equivalent discovery method — sublist IDs and column field IDs must be known.

**Mitigation strategy (progressive):**
1. **Body fields**: Use `getFields()` on loaded records. This captures all body-level fields.
2. **Common sublists**: For transaction records, attempt to read standard sublists (`item`, `expense`, `line`, `partner`, `salesteam`). Catch errors silently for sublists that don't exist on the record type.
3. **Script analysis hint**: The `dry-run` request context can include `targetSublistIds` if the agent knows which sublists the script will modify. The proxy prioritizes these sublists for capture.
4. **Future**: Maintain a record-type-to-sublist mapping table derived from NetSuite record browser metadata.

### Governance Budget Management

The dry-run action consumes governance units from the same RESTlet invocation. Key considerations:

- **Budget**: RESTlet has 5000 governance units.
- **N/record.load**: 5-10 units per record type.
- **N/search.create + run**: 10 units per search.
- **N/query.runSuiteQL**: 10 units per query.
- **Safety threshold**: If remaining governance drops below 200 units during dry-run, abort and return a partial result with a governance warning. This is implementable using `runtime.getCurrentScript().getRemainingUsage()` (already used in the existing `handleRunAction` at lines 47-48).

### Error Handling for Dry-Run

If the user's script encounters an error during dry-run (e.g., an invalid field ID, a missing record), the proxy should:
1. Catch the error (already handled by `safeExecute` at line 163).
2. Return any partial capture (records loaded before the error) along with the error message.
3. Set `success: false` in the response so the server can create a `DRY_RUN_FAILED` status.

## Cross-Platform Considerations

### RESTlet Deployment

The modified RESTlet must be re-deployed to all customer NetSuite accounts that use ns-gm. This uses the existing SDF deployment pipeline managed by `ns-deployment-service.ts` in the server.

**Risk**: Existing RESTlet deployment is a single script file. Adding new actions extends the same file, so the deployment mechanism doesn't change. But the deployment must be coordinated: new server code that calls `dry-run` must only be deployed after the RESTlet update, or it will get "Unknown action" errors.

### Backward Compatibility

The new `dry-run` and `execute-approved` actions are additive. The existing `run` and `getscriptexecutionlogs` actions are unchanged. Any version of the server/CLI that only uses `run` will continue to work with the updated RESTlet.

### N/transaction Module

The `N/transaction` module provides `transaction.void()` which is a write operation. The proxy should also intercept this if it's included in the injected modules. For MVP, focus on N/record methods; N/transaction interception is a Round 2 item.

## Performance Expectations

| Operation | Expected Latency | Governance Cost |
|-----------|-----------------|-----------------|
| `dry-run` with 1 record load + capture | 2-5 seconds | ~20-50 units |
| `dry-run` with 3 record loads + captures | 5-10 seconds | ~60-150 units |
| `execute-approved` (identical to `run`) | 2-10 seconds | Depends on script |
| Module proxy overhead | <10ms | 0 units (pure JS wrapping) |

## Dependencies

No new dependencies. ns-gm remains pure JS + Express:
- RESTlet changes: Pure SuiteScript 2.1 (no new N/* modules needed — `N/crypto` is already available for HMAC if needed, though final design uses server-side validation)
- Proxy changes: Express endpoints following existing `/run` pattern

## Deferred to Round 2

| Item | Rationale |
|------|-----------|
| N/transaction proxy (void, transform) | Focus on N/record for MVP; expand proxy surface iteratively |
| Comprehensive sublist discovery | Start with common sublists + agent hints; full metadata mapping later |
| BeforeSubmit safety net (Approach A) | Layer as defense-in-depth after Approach B is proven |
| RESTlet script parameter for shared secret | MVP uses server-side token validation only; no secret in RESTlet |
| Governance budget alerting | Track governance metrics; alerting thresholds in Round 2 |

## Summary Table

| Dimension | Decision |
|-----------|----------|
| **Change scope** | Extend existing RESTlet + proxy; no new NetSuite scripts |
| **New RESTlet actions** | `dry-run` (proxied modules) + `execute-approved` (real modules with token) |
| **Module proxy target** | N/record write methods: save, submit, submitFields, delete |
| **Module proxy passthrough** | All read methods + all other N/* modules |
| **Token validation** | Server-side only; RESTlet echoes token, server verifies |
| **Governance management** | Safety threshold at 200 remaining units; abort and return partial |
| **Field discovery** | getFields() for body; common sublists + agent hints for sublists |
| **New proxy endpoints** | POST /dry-run, POST /execute |
| **Backward compatibility** | New actions additive; existing run + logs unchanged |

## Open Risks

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | Module proxy may miss edge-case N/record methods that agent scripts use | Medium | Start with core methods; log unproxied write attempts; expand iteratively |
| 2 | Sublist field capture requires knowledge of sublist column IDs | Medium | Agent hints in context; common sublist enumeration; future metadata table |
| 3 | RESTlet deployment coordination: new server must only call dry-run after RESTlet is updated | Medium | Version check: new RESTlet reports capabilities in /health or a ping action; server checks before calling dry-run |
| 4 | Proxy overhead for complex scripts with many record operations | Low | Proxy is pure JS wrapping; overhead is negligible compared to NetSuite API call latency |
| 5 | N/record.load in dynamic mode may behave differently than standard mode for proxy capture | Low | Test both modes; proxy captures field values regardless of mode |

## APL Statement Reference

See `tech-research/apl.json` for structured questions, answers, and evidence.

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md | Ticket owner's beforeSubmit proposal as baseline; requirement for deterministic execution | Approach A is the owner's idea; we need to evaluate alternatives; all changes must be human-approved |
| diagnosis/diagnosis-statement.md (ns-gm) | Root cause analysis of ns-gm architectural gaps | Fire-and-forget RESTlet; no intercept hooks; no Helix callback channel; governance chaining risk |
| diagnosis/apl.json (ns-gm) | Structured evidence on ns-gm constraints | beforeSubmit governance risk validated; module proxy opportunity identified; six approaches mapped to ns-gm capabilities |
| scout/scout-summary.md (ns-gm) | ns-gm architecture and execution model | CLI -> proxy -> RESTlet; new Function() with module injection; OAuth 2.0 M2M; fire-and-forget |
| scout/reference-map.json (ns-gm) | File-level mapping and unknowns | RESTlet at ns_gm_restlet.js; proxy at server/app.js; governance chaining flagged as unknown |
| ns_gm_restlet.js | Direct code inspection of execution model | Line 166: new Function(...moduleNames, userCode) — confirms module injection pattern; lines 70-96: moduleMap with all 24 modules |
| server/app.js | Proxy endpoint patterns | POST /run pattern (lines 35-86) for new dry-run and execute endpoints |
| product/product.md | Scope constraints relevant to ns-gm | Suitelet out of scope; sandbox-first out of scope; deterministic execution required |
| NetSuite SuiteScript docs (Context7 + Web) | Governance units, beforeSubmit limits, N/record API surface | Governance chaining risk confirmed; record.getFields() available; beforeSubmit should be lean |
| repo-guidance.json | Repository intent: ns-gm is a target repo | RESTlet extension is the primary ns-gm change |
