# Diagnosis Statement — ns-gm (Proxy Module Research)

## Problem Summary

The ticket asks three questions about proxy modules: (1) Can we dig further into them? (2) Do they just capture user input without getting real results? (3) Can we hijack what actually gets sent to NetSuite? The answer to all three is affirmative — the RESTlet's module injection architecture supports transparent proxy substitution that intercepts real NetSuite operations, not just user input.

## Root Cause Analysis

The core architectural feature enabling proxy modules is the RESTlet's dynamic module injection pattern in `ns_gm_restlet.js`:

1. **Module injection mechanism** (line 166): `new Function(...moduleNames, userCode)` creates an execution function where each module name becomes a function parameter. At line 169, `executionFunction(...moduleValues)` passes real module objects as arguments.

2. **Substitution point** (lines 115-125): The `moduleParamNames[]` and `moduleParamValues[]` arrays are built dynamically by iterating `requestedModules` and calling `loadModule()`. For a `dry-run` action, the `record` entry in `moduleParamValues` can be replaced with a proxy wrapper object **before** the arrays are passed to `safeExecute()`.

3. **Proxy behavior — NOT just input capture**: The proxy wraps the real N/record module. Read operations (`load`, `getFields`, `copy`) delegate to the real module and return actual NetSuite data. Write operations (`save`, `submitFields`, `delete`) are intercepted to capture before/after field state without committing to the database. User code is completely unaware it operates on proxied modules.

4. **What the proxy captures during dry-run**:
   - `record.load()` → passes through to real module, captures current field values via `getFields()` as "before" state
   - `record.save()` on modified record → captures modified field values as "after" state, returns existing record ID without committing
   - `record.create()` + `.save()` → captures all set field values as "after" state, returns placeholder ID
   - `record.submitFields()` → loads target record for "before" state, captures submitted values as "after", does not commit
   - `record.delete()` → loads target record for full "before" state, marks as deletion operation

5. **What the proxy cannot capture**:
   - NetSuite-side effects: workflow triggers, UserEventScripts, formula field recalculations
   - Sublist fields without explicit hints (`getFields()` returns body fields only)
   - Nested operations inside `record.transform()` callbacks
   - `N/transaction.void()` (deferred to Round 2)

6. **Prior research confirmation**: Two prior tickets have thoroughly validated this approach:
   - Ticket cmnqr8lkk evaluated six approaches and recommended Approach B (Two-Phase RESTlet with Module Proxy)
   - Ticket cmnrx64kr confirmed proxy viability with detailed implementation specs and LOW regression risk assessment

7. **Current production state**: `TicketMode.EXECUTE` is defined in Prisma schema but unused (0 EXECUTE tickets). 10 NsGmCredential records exist across 5 organizations. No proxy/dry-run code has been implemented in any repository.

## Evidence Summary

| Evidence | Finding |
|----------|---------|
| `ns_gm_restlet.js` line 166 | `new Function(...moduleNames, userCode)` — parameter-based module injection enables transparent proxy substitution |
| `ns_gm_restlet.js` lines 115-125 | `moduleParamValues[]` array built dynamically — proxy swaps into this array for dry-run |
| `ns_gm_restlet.js` lines 71-96 | `moduleMap` contains 24 pre-loaded N/* modules; only `record` (and optionally `transaction`) need proxying |
| `ns_gm_restlet.js` lines 23-37 | Action dispatcher uses if/else chain; `dry-run` and `execute-approved` are additive new branches |
| `server/app.js` lines 35-86 | `/run` endpoint pattern: validate profile → `nsapi.REST.post()` → structured response; new endpoints follow same pattern |
| `server/auth.js` | OAuth 2.0 M2M with JWT. `nsapi.REST.post()` handles token acquisition, retry on 401 — reusable for new endpoints |
| `helix-global-server netsuite-setup/FileCabinet/SuiteScripts/ns_gm_restlet.js` | Duplicate RESTlet copy deployed via SDF — must be updated in sync |
| `prisma/schema.prisma` line 104 | `TicketMode.EXECUTE` defined with migration already deployed |
| Production DB | 0 EXECUTE tickets (221 total: 201 AUTO, 9 RESEARCH, 8 FIX, 3 BUILD); 10 NsGmCredential records across 5 orgs |
| Production logs | No proxy/dry-run activity found — confirms feature is not yet implemented |
| Prior research (cmnqr8lkk) | Approach B recommended over 5 alternatives; detailed proxy module spec produced |
| Prior diagnosis (cmnrx64kr) | Proxy viability confirmed; before/after capture spec; LOW non-Helix regression risk |

## Success Criteria

1. Research questions answered: proxy modules can intercept real NetSuite operations (not just user input) via the `moduleParamValues` substitution pattern
2. Approach B (Two-Phase RESTlet with Module Proxy) is validated as architecturally sound by both code inspection and prior research
3. Implementation scope identified: ns-gm (RESTlet proxy logic + Express endpoints) and helix-global-server (duplicate RESTlet + orchestrator EXECUTE-mode branching)
4. Backward compatibility confirmed: new actions/endpoints are additive; existing `run`/`logs` paths untouched
5. Known limitations documented: NetSuite-side effects, sublist discovery, `N/transaction.void()`, governance budget

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md | Understand the three research questions | Questions about proxy module capability, input-only capture concern, module access |
| scout/scout-summary.md (ns-gm) | Architecture analysis and module injection pattern | Confirmed proxy substitution viability at line 166; 24 pre-loaded modules |
| scout/reference-map.json (ns-gm) | File inventory and prior research references | Key files identified; two prior tickets referenced |
| scout/scout-summary.md (helix-global-server) | Server-side orchestration context | Duplicate RESTlet; TicketMode.EXECUTE defined; NsGmCredential model; no EXECUTE logic in orchestrator |
| scout/reference-map.json (helix-global-server) | Server file inventory and unknowns | RESTlet sync question; orchestrator EXECUTE branching needed |
| ns_gm_restlet.js (direct read, ns-gm) | Verify module injection pattern and substitution point | Lines 115-125 build arrays; line 166 creates function; line 169 passes modules |
| server/app.js (direct read, ns-gm) | Endpoint pattern for new dry-run/execute endpoints | POST /run pattern with profile validation and nsapi.REST.post() |
| helix-global-server RESTlet copy (direct read) | Verify duplicate is identical | Confirmed identical to ns-gm root copy |
| prisma/schema.prisma (helix-global-server) | TicketMode.EXECUTE and NsGmCredential model | EXECUTE defined at line 104; NsGmCredential at line 566 |
| Prior tech-research (cmnqr8lkk) | Approach B specification | Two-phase RESTlet with proxy N/record; field discovery; governance budget |
| Prior diagnosis (cmnrx64kr) | Proxy viability validation | Confirmed viable; detailed capture spec; LOW regression risk |
| Production DB (runtime inspection) | EXECUTE ticket count, NsGmCredential records | 0 EXECUTE tickets; 10 credentials across 5 orgs |
| Production logs (runtime inspection) | Any proxy/dry-run activity | No proxy activity found — feature not yet implemented |
