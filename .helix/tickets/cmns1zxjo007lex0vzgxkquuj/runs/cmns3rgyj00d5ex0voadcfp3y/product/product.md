# Product — Proxy Module Research: ES6 Proxy Wrapping of Real NetSuite Modules (ns-gm)

## Problem Statement

When ns-gm executes user SuiteScript code in the RESTlet sandbox, the system needs to observe what the code does to NetSuite records before allowing database writes. Prior research proposed replacing NetSuite's `N/record` module with a custom proxy object that mimics its API. This captures what the user's code *calls* (Level 1 — user input), but misses what the real module *processes internally* — field sourcing, dependent field population, and in-memory validation that the real `N/record` module performs are lost because the real module never runs.

The user's refined ask: **can we keep the real NetSuite module running — not our own replacement — and intercept only at the write boundary?** The goal is to see what NetSuite actually receives after the real module runs its own processing, not just a shallow echo of what user code explicitly set.

## Product Vision

Enable ns-gm to observe the full in-memory state of NetSuite records — including fields auto-populated by the real `N/record` module (sourcing, dependent fields, in-memory validation) — without executing database writes or triggering side effects. Users and the approval workflow get a high-fidelity view of "what NetSuite would actually get" rather than just what the user's code explicitly set.

## Users

| User | Need |
|------|------|
| **Helix platform users** (NetSuite admins/developers) | See what AI-generated code will change — including auto-populated fields — before it touches their data |
| **Helix AI agent (automated)** | Operate in a two-phase flow: generate code, show high-fidelity changes, execute only after approval |
| **Developers using ns-gm** | Test SuiteScript code against real module behavior without risking live data mutations |

## Use Cases

1. **High-fidelity dry-run**: User code creates a Sales Order and sets the `entity` field. The system shows not just that one field, but all auto-populated fields (billing address, terms, tax code) that the real N/record module sourced in memory — because the real module ran.
2. **Write-boundary interception**: When user code calls `record.save()`, the system captures a complete field dump of the record's in-memory state and blocks the actual save, returning the captured state for review.
3. **Transparent operation**: User code cannot distinguish a Proxy-wrapped module from the real one. All reads, creates, loads, and field manipulations work identically.
4. **Approved execution**: After user approves the captured state, the same code is re-executed with real write operations enabled.

## Core Workflow

1. User submits SuiteScript code via ns-gm CLI
2. RESTlet receives the code and requested modules
3. For `N/record`, the RESTlet wraps the **real** module object in an ES6 Proxy before passing it to user code (at the `moduleParamValues` injection point, lines 115-125)
4. User code executes against the real module — all reads, creates, loads, and field operations are real
5. When user code calls a write-boundary method (`save`, `submitFields`, `delete`), the Proxy interceptor:
   - Captures a comprehensive field dump from the live Record instance
   - Blocks the actual write (dry-run) or allows it (approved execute)
   - Returns the captured state as part of the execution result
6. Change summary is returned for review; on approval, code re-runs with writes enabled

## Essential Features (MVP)

- **ES6 Proxy wrapping of N/record module**: Wrap the real module at `moduleParamValues` in `ns_gm_restlet.js`. All non-write operations pass through to the real module unmodified.
- **Write-boundary interception** for `save()`, `submitFields()`, `delete()`: Capture pre-save record state without committing.
- **Record instance Proxy chaining**: When `record.create()` / `record.load()` / `record.copy()` return a Record instance, wrap it in a second-level Proxy so `.save()` on individual records is intercepted.
- **Comprehensive field dump on interception**: Read all field IDs via `getFields()`, capture `getValue()`/`getText()` for each, capture sublist data via `getLineCount()`/`getSublistValue()`.
- **Runtime validation**: Empirically verify that ES6 Proxy works on GraalJS Java-backed N/* module objects via a test script run through ns-gm.
- **Dry-run RESTlet action** (`dry-run`) as a new additive branch in the action dispatcher.
- **Execute-approved RESTlet action** for running approved code with real writes.
- **Express proxy endpoints** (`/dry-run`, `/execute`) following the existing `/run` pattern.
- **SDF RESTlet copy sync**: Update the duplicate RESTlet in `helix-global-server/netsuite-setup/FileCabinet/SuiteScripts/ns_gm_restlet.js` to match.

## Features Explicitly Out of Scope (MVP)

- **True Level 3 post-commit interception**: Capturing state after `record.save()` actually executes (server-side defaults, formula recalculations). Requires real saves with side effects.
- **Companion `beforeSubmit` UserEventScript (UES)**: Would enable post-validation state capture but introduces governance chaining risk and deployment complexity. Previously rejected; remains out of scope.
- **Proxy wrapping of non-record modules**: `N/email`, `N/https`, `N/file`, `N/transaction` may eventually need interception, but MVP focuses on `N/record` only.
- **Client-side approval UI**: Displaying intercepted record state for human approval in `helix-global-client`.
- **Orchestrator EXECUTE-mode logic**: No EXECUTE-specific branching exists in helix-global-server today; building it is separate.
- **Monkey-patching fallback**: If Proxy fails on Java-backed objects, method wrapping is a potential fallback but is not part of MVP.
- **Sublist field auto-discovery**: Requires known sublist IDs; agent-provided hints accepted but completeness not guaranteed.
- **`record.transform()` callback interception**: Nested operations inside transform callbacks are not proxied.

## Success Criteria

1. **Proxy viability confirmed**: ES6 Proxy wrapping works on real N/* module objects in SuiteScript 2.1 (GraalJS), empirically verified via ns-gm runtime test.
2. **Real module behavior preserved**: User code running through the Proxy-wrapped module produces identical behavior to the unwrapped module for all read and in-memory operations.
3. **Write-boundary interception works**: `save()`, `submitFields()`, `delete()` calls are intercepted and a comprehensive field dump is captured.
4. **In-memory processing captured**: The field dump includes auto-populated fields (sourced/dependent fields set by the real module) — not just fields explicitly set by user code.
5. **No side effects in dry-run**: No database writes, no workflow triggers, no UES firing during dry-run interception.
6. **Backward compatibility**: Existing `run`/`logs` paths remain untouched; new actions/endpoints are additive only.
7. **RESTlet copies in sync**: The duplicate in helix-global-server matches the ns-gm copy.

## Key Design Principles

- **Real module, not a replacement**: User code runs against the actual N/record module. The Proxy adds observation, not simulation. This is the key improvement over prior Approach B (module replacement).
- **Intercept at the boundary, not the internals**: Only write-boundary methods are intercepted. Everything else passes through transparently.
- **Minimal custom code**: The Proxy handler only needs traps for write methods. All other module behavior is automatic passthrough, reducing maintenance burden.
- **Additive-only changes**: New RESTlet actions and Express endpoints; no modification to existing `run`/`logs` paths.
- **Graceful degradation**: If Proxy fails on certain module objects, the system should fall back to module replacement rather than breaking entirely.

## Scope & Constraints

- **Repos in scope**: `ns-gm` (primary — RESTlet Proxy logic, Express proxy, CLI), `helix-global-server` (secondary — duplicate RESTlet sync only)
- **Repos as context only**: `helix-global-client`, `helix-cli` — no changes needed
- **SuiteScript 2.1 on GraalJS**: ES6 Proxy confirmed available by developer community evidence, but empirical verification against Java-backed N/* host objects required
- **Governance budget**: 5,000 units per RESTlet call; field dump adds negligible overhead
- **No rollback**: NetSuite RESTlets have no transaction rollback API; dry-run (blocking save) is the default mode
- **Two RESTlet copies**: Changes must be reflected in both ns-gm root and helix-global-server SDF copy
- **No test framework**: ns-gm has no test framework, lint, or typecheck scripts; validation is manual via CLI
- **Credential infrastructure ready**: 10 NsGmCredential records across 5 organizations, OAuth 2.0 M2M operational

## Future Considerations

- Level 3 interception via companion `beforeSubmit` UES (optional enhancement for post-validation state capture)
- Proxy wrapping for other write-capable modules (`N/email`, `N/https`, `N/file`, `N/transaction`)
- Orchestrator EXECUTE-mode branching in helix-global-server
- Prisma model for persisting dry-run results and approval state
- Client-side approval UI for reviewing change summaries
- Auto-sync mechanism between ns-gm root RESTlet and helix-global-server SDF copy
- Automated test harness for validating Proxy behavior against real NetSuite environment

## Open Questions / Risks

| # | Question / Risk | Impact | Status |
|---|----------------|--------|--------|
| 1 | Does ES6 Proxy work correctly on GraalJS Java-backed N/* module objects? | Blocking — entire approach depends on this | Unverified; requires runtime test via ns-gm |
| 2 | Are Record instance methods on the prototype or own properties? | Affects whether second-level Proxy on returned Record instances correctly intercepts `.save()` | Unverified |
| 3 | Are N/* module objects frozen or sealed? | Does not affect Proxy wrapping, but affects monkey-patching fallback | Unverified |
| 4 | What is the governance cost of the comprehensive field dump? | Could reduce remaining budget for user code execution on complex records | Likely low; needs measurement |
| 5 | Do some N/record methods return non-proxied internal objects that bypass interception? | Could create observation blind spots | Unknown; needs testing |
| 6 | Can `getFields()` enumerate sublist fields, or only body fields? | Affects field dump completeness | Open |
| 7 | RESTlet deployment coordination: if server sends `dry-run` before RESTlet is updated, it gets "Unknown action" errors | Deployment sequencing risk | Risk — needs coordination plan |
| 8 | Production NS role is VIEW-only — execute-approved in production requires role permission changes | Blocks production execution | Open |

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| `ns-gm/ticket.md` | Ticket scope and user's original questions | Proxy module feasibility, input-only capture concern, module access question |
| User continuation context | Refined ask beyond prior research | "Keep the real module, hijack at the end when it sends to NetSuite" — drives shift from module replacement to Proxy wrapping |
| `ns-gm/scout/scout-summary.md` | Architecture analysis, interception levels | Three interception levels defined; in-memory state (Level 2) is substantially richer than user input (Level 1) |
| `ns-gm/scout/reference-map.json` | File inventory, facts, unknowns | Module injection at lines 115-125; N/* modules make JVM calls not HTTP; Proxy availability was key unknown |
| `ns-gm/diagnosis/diagnosis-statement.md` | Core technical analysis | ES6 Proxy confirmed available in SuiteScript 2.1 (GraalJS); Proxy wrapping is strict improvement over module replacement |
| `ns-gm/diagnosis/apl.json` | Structured Q&A with evidence | Proxy availability confirmed; Level 2 capturable without side effects; covers user's refined ask |
| `helix-global-server/scout/scout-summary.md` | Server-side role assessment | Duplicate RESTlet must stay in sync; credential chain reusable; server role unchanged by Proxy approach |
| `helix-global-server/diagnosis/diagnosis-statement.md` | Server impact analysis | Proxy mechanism is internal to RESTlet; server's HTTP interface unchanged; only file sync needed |
| `repo-guidance.json` | Repo intent classification | ns-gm = primary target, helix-global-server = secondary (file sync only) |
