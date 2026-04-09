# Diagnosis Statement — ns-gm

## Problem Summary

ns-gm operates in a fire-and-forget execution model: user code is sent to the NetSuite RESTlet and executed immediately with no approval gate, dry-run, or change preview. The ticket requires extending ns-gm with Approach B (Two-Phase RESTlet with Module Proxy) to add dry-run and execute-approved capabilities while preserving full functionality for standalone non-Helix users.

## Root Cause Analysis

The core issue is that the RESTlet action dispatcher (`ns_gm_restlet.js` lines 23-37) only handles two actions (`run` and `getscriptexecutionlogs`), and the Express proxy (`server/app.js` lines 35-128) only exposes two endpoints (`/run` and `/logs`). There is no mechanism for previewing write operations before committing them.

**Proxy Module Viability (Confirmed):**
The RESTlet's module injection pattern makes proxy modules highly viable:

1. **Injection mechanism** (line 166): `new Function(...moduleNames, userCode)` creates a function with module names as parameter names. Module objects are passed as arguments at line 169: `executionFunction(...moduleValues)`.
2. **Substitution point** (lines 115-125): The `moduleParamNames`/`moduleParamValues` arrays are built dynamically from the `requestedModules` list via `loadModule()`. For dry-run, the `record` entry in this array can be replaced with a proxy wrapper object before being passed to `safeExecute()`.
3. **Proxy implementation**: The wrapper object exposes the same N/record API surface. Read methods (`load()`, `getFields()`, `copy()`) delegate to the real N/record module. Write methods (`save()`, `submitFields()`, `delete()`) capture the intended operation and before/after field state without committing to the database.
4. **SuiteScript 2.1 compatibility**: The `@NApiVersion 2.1` header (line 2) confirms modern JavaScript support including object spread, destructuring, and closures needed for clean proxy implementation.

**What the proxy captures during dry-run:**
- For `record.load()` → passes through to real module, captures current field values via `getFields()` as "before" state
- For `record.save()` on modified record → captures modified field values as "after" state, returns the existing record ID without committing
- For `record.create()` + `.save()` → captures all set field values as "after" state (no "before"), returns a placeholder ID
- For `record.submitFields()` → loads the target record to get "before" state, captures the submitted values as "after" state, does not commit
- For `record.delete()` → loads the target record to capture full state as "before", marks as deletion operation

**What the proxy cannot capture:**
- NetSuite-side effects: workflow triggers, UserEventScripts, formula field recalculations, validation rules
- Sublist fields without explicit hints (getFields() returns body fields only; sublists require agent-provided `targetSublistIds`)
- Nested operations inside `record.transform()` callbacks

**Non-Helix regression risk: LOW**
- New RESTlet actions (`dry-run`, `execute-approved`) are additive `else if` branches in the dispatcher — existing `run` and `getscriptexecutionlogs` paths are untouched
- New Express endpoints (`/dry-run`, `/execute`) are separate `app.post()` registrations — existing `/run` and `/logs` endpoints are untouched
- Existing CLI commands (`run`, `logs`, `env`, `setup`) interact only with existing endpoints

## Evidence Summary

| Evidence | Finding |
|----------|---------|
| `ns_gm_restlet.js` lines 23-37 | Action dispatcher uses if/else chain; new actions slot in as new branches |
| `ns_gm_restlet.js` line 166 | `new Function(...moduleNames, userCode)` — parameter-based module injection enables proxy substitution |
| `ns_gm_restlet.js` lines 71-96 | Module map with 23 N/* modules; only `record` (and optionally `transaction`) need proxying |
| `ns_gm_restlet.js` lines 115-125 | Dynamic module array construction — proxy swaps into this array for dry-run |
| `server/app.js` lines 35-86 | `/run` endpoint pattern: validate profile → nsapi.REST.post() → structured response |
| `server/auth.js` lines 184-207 | nsapi.REST.post() handles OAuth, retry on 401, error wrapping — reusable for new endpoints |
| Production DB | 0 EXECUTE tickets exist; 8 NsGmCredential records across 4 organizations |
| Prior research (cmnqr8lkk000hiq0usgmitppy) | Approach B recommended; detailed proxy module spec; field discovery via getFields() + agent hints |
| RESTlet header `@NApiVersion 2.1` | Confirms modern JavaScript support for proxy implementation |

## Success Criteria

1. RESTlet supports `dry-run` action that returns structured before/after state for all record write operations without committing changes
2. RESTlet supports `execute-approved` action that executes the original script with real modules (identical to `run` but triggered via approval flow)
3. Express proxy exposes `/dry-run` and `/execute` endpoints following the existing `/run` endpoint pattern
4. Existing `run`, `getscriptexecutionlogs` actions and `/run`, `/logs` endpoints remain completely unchanged
5. All existing CLI commands (`ns-gm run`, `ns-gm logs`, `ns-gm env`, `ns-gm setup`) continue to function identically
6. Both RESTlet copies (ns-gm root and helix-global-server netsuite-setup) are updated identically

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md | Understand build requirements | Must implement Approach B, verify proxy module viability, preserve non-Helix functionality |
| scout/scout-summary.md (ns-gm) | Architecture analysis | Three-tier architecture; two RESTlet copies; 24 pre-loaded modules; no test framework |
| scout/reference-map.json (ns-gm) | File inventory and facts | Key files: ns_gm_restlet.js, server/app.js, server/auth.js; module injection at line 166 |
| ns_gm_restlet.js (direct read) | Verify proxy module viability | new Function() pattern with positional module injection; dynamic module array; safeExecute wrapper |
| server/app.js (via scout) | Endpoint pattern analysis | POST /run pattern with profile validation, nsapi.REST.post(), structured response |
| Prior research tech-research.md | Approach B specification | Two-phase RESTlet, proxy N/record, getFields() for body fields, agent hints for sublists |
| Production DB (runtime inspection) | Confirm zero EXECUTE usage | 0 EXECUTE tickets; 8 NsGmCredentials across 4 orgs |
