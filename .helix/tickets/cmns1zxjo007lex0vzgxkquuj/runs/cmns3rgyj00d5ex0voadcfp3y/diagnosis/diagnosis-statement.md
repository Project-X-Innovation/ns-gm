# Diagnosis Statement — ns-gm (Proxy Module Research: Deeper Interception via ES6 Proxy)

## Problem Summary

The user asks: can we keep the REAL NetSuite module running — not replace it with our own version — and intercept at the point where it sends data to NetSuite? The goal is to see what NetSuite actually receives after the real module runs its internal processing, not just the user's raw input or a simulated proxy's view.

This refines the prior research (which proposed replacing the module with a custom proxy wrapper) into a higher-fidelity approach: **ES6 Proxy wrapping of the real module**.

## Root Cause Analysis

The core finding is that **ES6 Proxy IS available in SuiteScript 2.1** and can be used to transparently wrap the real N/record module without replacing it.

### 1. ES6 Proxy Availability — CONFIRMED

SuiteScript 2.1 runs on **GraalJS** (ES2019+/ES2023). ES6 Proxy was introduced in ES2015 and is fully supported by GraalJS. Real-world confirmation: developer Marty Y. Chang's article describes wrapping `context.newRecord` and `context.oldRecord` inside Proxy objects in SuiteScript 2.1 User Event Scripts. No NetSuite documentation restricts Proxy usage in server-side scripts.

**Caveat**: Not yet empirically verified against N/* module objects specifically (which are Java-backed host objects in GraalJS). This requires a runtime test via ns-gm.

### 2. Proxy Wrapping Approach

Instead of replacing the N/record module with a custom object (prior Approach B), wrap it:

```
// In moduleParamValues construction (lines 115-125):
// Instead of: moduleParamValues.push(moduleObj)
// Do:         moduleParamValues.push(new Proxy(moduleObj, recordHandler))
```

The Proxy handler's `get` trap intercepts:
- **`record.create()`** / **`record.load()`** / **`record.copy()`** → call the REAL method, return the REAL Record instance wrapped in another Proxy
- **`recordInstance.save()`** → intercept: capture comprehensive field dump, then either block (dry-run) or execute (live)
- **`record.submitFields()`** → intercept: capture the submitted field values
- **`record.delete()`** → intercept: capture target record state before deletion
- **All other methods** → pass through to the real module with zero modification

### 3. What This Captures (Three Interception Levels)

| Level | Description | Proxy Approach |
|-------|-------------|----------------|
| **Level 1** — User Input | Only what user code called (setValue, etc.) | Implicitly captured (it's the real module) |
| **Level 2** — Pre-save In-Memory State | All field values after real module's in-memory processing (sourcing, dependent fields, in-memory validation) | **CAPTURED** — getFields()/getValue()/getText() on the real Record instance before save() |
| **Level 3** — Post-commit State | Field values after record.save()'s JVM-internal processing (mandatory checks, formula recalcs, server-side defaults) | Only with real save (side effects) or companion beforeSubmit UES |

**Key insight**: Level 2 is substantially richer than Level 1 because the real module ran its in-memory processing. When user code calls `record.setValue({fieldId: 'entity', value: 123})` on a Sales Order, the real N/record module immediately populates dependent sourced fields (billing address, terms, tax code, etc.) in memory. The Proxy approach captures ALL of this by reading the record's field values before save — without executing the save.

### 4. Why This Is Better Than Module Replacement (Prior Approach B)

| Aspect | Prior Approach B (Module Replacement) | New Approach (ES6 Proxy Wrapping) |
|--------|--------------------------------------|----------------------------------|
| Module behavior | Simulated — custom object mimics N/record API | **Real** — actual N/record module runs |
| Record instances | Custom replicas | **Real** NetSuite Record objects |
| In-memory processing | Not captured (proxy intercepts before it happens) | **Captured** (real module ran sourcing/validation) |
| API surface coverage | Must implement every method | **Automatic** — Proxy passes through all unintercepted methods |
| Maintenance burden | High — must track N/record API changes | **Low** — only write-boundary handlers need maintenance |
| User code transparency | Transparent (same API surface) | Transparent (same object, wrapped) |

### 5. Architectural Boundaries

- **N/* modules make internal JVM calls, not HTTP calls.** There is no HTTP transport layer between the SuiteScript module and the database. The Proxy approach intercepts at the JavaScript API boundary, which is the outermost observable layer.
- **The `beforeSubmit` UES remains the only Level 3 native mechanism.** Prior research rejected this due to governance chaining costs. The Proxy approach gets as close to Level 3 as possible without UES by capturing Level 2 in-memory state.
- **The `new Function()` execution scope (line 166) is isolated.** User code cannot detect Proxy wrapping — it receives modules as positional parameters only.

### 6. Key Unknowns (Require Runtime Testing)

1. **Whether Proxy works on Java-backed N/* module objects in GraalJS.** GraalJS provides transparent interop between Java and JavaScript, but edge cases exist. A simple runtime test would confirm: `new Proxy(record, { get: ... })` and then call `record.create()` through the Proxy.
2. **Whether Record instance methods are on the prototype or own properties.** This affects whether a second-level Proxy on returned Record instances correctly intercepts `.save()`.
3. **Whether N/* module objects are frozen/sealed.** If frozen, method-level monkey-patching (a fallback to Proxy) would fail. But Proxy wrapping doesn't modify the original object, so frozen/sealed status doesn't matter for the Proxy approach.

## Evidence Summary

| Evidence | Finding |
|----------|---------|
| Web search: SuiteScript 2.1 on GraalJS | GraalJS supports ES2019+/ES2023, including ES6 Proxy (ES2015) |
| Web search: Marty Y. Chang article | Proxy used to wrap context.newRecord in SuiteScript 2.1 UES — confirms runtime availability |
| `ns_gm_restlet.js` lines 115-125 | `moduleParamValues[]` array is the injection point — wrap with Proxy before pushing |
| `ns_gm_restlet.js` line 166 | `new Function(...moduleNames, userCode)` — isolated scope, Proxy-wrapped module is indistinguishable |
| `ns_gm_restlet.js` line 169 | `executionFunction(...moduleValues)` — passes module objects as positional args |
| `ns_gm_restlet.js` lines 71-96 | `moduleMap` stores 24 real pre-loaded N/* modules; only `record` needs Proxy wrapping for MVP |
| Scout fact (ns-gm) | 'N/* module methods make internal JVM calls, NOT external HTTP calls' — no transport layer to intercept below JS API |
| Scout fact (ns-gm) | 'beforeSubmit UES is the only Level 3 native mechanism' — rejected due to governance chaining |
| Prior research (cmnqr8lkk) | Approach B proposed module replacement; new Proxy approach is a strict improvement |
| Prior research (cmnrx64kr) | Proxy viability confirmed; this ticket extends from replacement to Proxy wrapping |
| User continuation context | 'Keep the NetSuite module, not our own version, all the code that actually runs, but just hijack it at the end' |

## Success Criteria

1. ES6 Proxy approach validated as architecturally feasible for keeping the real module while observing write boundaries
2. Three interception levels clearly defined with what each captures
3. Proxy approach shown to be a strict improvement over prior module replacement (Approach B)
4. Key unknowns identified with specific runtime tests needed to resolve them
5. Implementation scope narrowed: Proxy handler code in `ns_gm_restlet.js` (lines 115-125), plus SDF copy sync in helix-global-server

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md (ns-gm) | Research scope and user's refined question | User wants real module preserved, not proxy wrapper replacement |
| User continuation context | Refined ask beyond prior research | 'Keep the real module, hijack at the end when it sends to NetSuite' |
| scout/scout-summary.md (ns-gm) | Architecture analysis, interception levels, key unknowns | Three interception levels defined; Phase 1 vs Phase 2 processing distinction |
| scout/reference-map.json (ns-gm) | File inventory, facts, unknowns about Proxy/frozen/sealed | Proxy availability unverified (now resolved); method wrapping feasibility unknown |
| ns_gm_restlet.js (direct read, full file) | Verify module injection mechanism and substitution point | Lines 115-125 build arrays; line 166 creates isolated function; line 169 passes modules |
| Web search: SuiteScript 2.1 GraalJS | Verify ES6 Proxy availability in SuiteScript runtime | GraalJS supports ES2023; SuiteScript 2.1 confirmed on GraalVM |
| Web search: Proxy in SuiteScript 2.1 | Real-world confirmation of Proxy usage | Marty Y. Chang article: Proxy wraps record objects in SuiteScript 2.1 UES |
| scout/scout-summary.md (helix-global-server) | Server-side context for deployment sync | Duplicate RESTlet must stay in sync; credential chain reusable |
| scout/reference-map.json (helix-global-server) | Server file inventory | SDF RESTlet copy; orchestrator gap; role permissions |
| Prior diagnosis artifacts (this run) | Baseline from prior run iteration | Addressed original questions; this update adds ES6 Proxy wrapping approach |
| Prior research (cmnqr8lkk, cmnrx64kr) | Approach B context | Module replacement proposed; new Proxy approach supersedes as strict improvement |
