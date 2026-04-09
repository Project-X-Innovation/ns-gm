# Product — Proxy Module Research (ns-gm)

## Problem Statement

When Helix's AI agent generates SuiteScript code to modify NetSuite records, the code currently executes immediately with no way to preview what changes will be made before they are committed. Users have no visibility into what the agent's code will actually do to their data — they must trust-and-run, or not run at all. This creates a fundamental safety gap for an AI-driven automation platform operating on production business systems.

The ticket asks three specific research questions:
1. Can we dig further into the proxy modules?
2. Do we have to implement modules that just capture user input (without real results)?
3. Can we hijack what actually gets sent to NetSuite — do we have access to the modules?

## Product Vision

Enable a "dry-run" capability where Helix can execute agent-generated SuiteScript against real NetSuite data but intercept all write operations, producing a human-readable change summary before anything is committed. This gives users confidence and control over AI-generated modifications to their NetSuite accounts.

## Users

| User | Need |
|------|------|
| **Helix platform users** (NetSuite admins/developers) | See what AI-generated code will change before it touches their data |
| **Helix AI agent (automated)** | Operate in a two-phase flow: generate code, show changes, execute only after approval |
| **Organization admins** | Trust that Helix respects data integrity by requiring approval for write operations |

## Use Cases

1. **Dry-run preview**: Agent generates SuiteScript, Helix runs it in dry-run mode against real data, user reviews a "before → after" change summary, then approves or rejects.
2. **Approved execution**: After user approves the change summary, the same code is re-executed with real write operations enabled.
3. **Transparent reads**: During dry-run, all read operations (e.g., `record.load`) return real NetSuite data so the change summary reflects actual current state.

## Core Workflow

1. Agent generates SuiteScript code for a task
2. Helix sends the code to the RESTlet with a `dry-run` action
3. RESTlet substitutes proxy module wrappers for write-capable modules (e.g., `N/record`)
4. User code executes normally — reads return real data, writes are intercepted
5. Proxy captures before/after field state for every write operation
6. Change summary is returned to the user for review
7. On approval, code is re-sent with an `execute-approved` action for real execution

## Essential Features (MVP)

- **Proxy N/record module** that transparently wraps the real `N/record` module
  - Read-through: `load`, `getFields`, `copy` delegate to real module, return real data
  - Write-intercept: `save`, `submitFields`, `delete` capture before/after field state without committing
  - `create` + `save` captures all set field values with a placeholder ID
- **Dry-run RESTlet action** (`dry-run`) as a new additive branch in the action dispatcher
- **Execute-approved RESTlet action** for running approved code with real writes
- **Change summary output**: structured before/after data for each intercepted write operation
- **Express proxy endpoints** (`/dry-run`, `/execute`) following the existing `/run` pattern

## Features Explicitly Out of Scope (MVP)

- **N/transaction.void() proxy** — deferred to Round 2 per prior research
- **Sublist field auto-discovery** — requires known sublist IDs; agent-provided hints accepted but completeness not guaranteed
- **NetSuite side-effect capture** — workflows, UserEventScripts, formula recalculations triggered by record changes cannot be previewed
- **record.transform() callback interception** — nested operations within transform callbacks are not proxied
- **Client-side approval UI** — the client may eventually show dry-run results, but UI is not in scope for this research/implementation cycle
- **Production role write permissions** — production NS role is VIEW-only; any execute-approved in production environments requires separate role review

## Success Criteria

1. **Research questions answered**: Confirm that proxy modules can intercept real NetSuite operations (not just user input) via the `moduleParamValues` substitution pattern in `ns_gm_restlet.js` lines 115-125/166-169
2. **Approach validated**: Two-Phase RESTlet with Module Proxy (Approach B) is confirmed architecturally sound by code inspection and two prior research tickets (cmnqr8lkk, cmnrx64kr)
3. **Implementation scope defined**: ns-gm (RESTlet proxy logic + Express endpoints) and helix-global-server (duplicate RESTlet sync + orchestrator EXECUTE-mode branching)
4. **Backward compatibility confirmed**: New actions/endpoints are additive; existing `run`/`logs` paths remain untouched
5. **Known limitations documented**: Explicitly catalogue what the proxy can and cannot capture

## Key Design Principles

- **Transparency**: User code must not be able to detect it is running against proxied modules
- **Read-through, write-intercept**: Only mutating operations are intercepted; reads always return real data
- **Additive-only changes**: New RESTlet actions and Express endpoints; no modification to existing `run`/`logs` paths
- **Minimal module surface**: Only `N/record` (and optionally `N/transaction`) need proxying; the remaining 22 pre-loaded modules pass through unmodified

## Scope & Constraints

- **Repos in scope**: `ns-gm` (primary — RESTlet proxy logic, Express proxy, CLI), `helix-global-server` (secondary — duplicate RESTlet sync, orchestrator EXECUTE-mode, credential chain)
- **Repos as context only**: `helix-global-client`, `helix-cli` — no changes needed for this research/implementation cycle
- **SuiteScript version**: 2.1 (`@NApiVersion 2.1`) supports modern JS needed for proxy implementation
- **Governance budget**: 5,000 units per RESTlet call; dry-run must fit within this budget including field enumeration via `getFields()`
- **No test framework**: ns-gm currently has no test framework, lint, or typecheck scripts
- **Credential infrastructure ready**: 10 NsGmCredential records across 5 organizations, OAuth 2.0 M2M chain fully operational

## Future Considerations

- Orchestrator EXECUTE-mode branching in helix-global-server (dry-run → approval pause → execute-approved)
- Prisma model for persisting dry-run results and approval state (e.g., `NsExecuteRequest`)
- Client-side approval UI for reviewing and approving change summaries
- N/transaction.void() proxy (Round 2)
- Sublist field discovery improvements
- RESTlet deployment coordination: ensure updated RESTlet is deployed before server sends new actions
- Auto-sync mechanism between ns-gm root RESTlet and helix-global-server SDF copy

## Open Questions / Risks

| # | Question / Risk | Status |
|---|-----------------|--------|
| 1 | Can `getFields()` enumerate sublist fields, or only body fields? Agent-provided `targetSublistIds` is a workaround but completeness is unverified. | Open |
| 2 | Can proxy accurately capture `record.create()` state before any record ID exists? Placeholder ID approach proposed but not runtime-tested. | Open |
| 3 | How does proxy handle nested operations inside `record.transform()` callbacks? | Open — deferred |
| 4 | Is 5,000 governance units sufficient for dry-run capture AND field enumeration on complex records with many sublists? | Open |
| 5 | Must the ns-gm root RESTlet and helix-global-server netsuite-setup copy be kept in exact sync, or does only the server copy matter for Helix deployments? | Open |
| 6 | RESTlet deployment coordination: if server code sends `dry-run` before RESTlet is updated, it gets "Unknown action" errors. | Risk — needs deployment sequencing |
| 7 | Production NS role is VIEW-only — execute-approved in production environments may need role permission changes. | Open |

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| `ticket.md` (helix-global-server) | Understand the three research questions | Proxy module feasibility, input-only capture concern, module access question |
| `scout/scout-summary.md` (ns-gm) | Architecture analysis of RESTlet module injection | Confirmed proxy substitution viable at `moduleParamValues` array; 24 pre-loaded modules |
| `scout/reference-map.json` (ns-gm) | File inventory, facts, and prior research references | Key files identified; two prior tickets validated Approach B |
| `diagnosis/diagnosis-statement.md` (ns-gm) | Root cause analysis of proxy mechanism | Proxy wraps real N/record; read-through + write-intercept; detailed capture spec |
| `diagnosis/apl.json` (ns-gm) | Structured Q&A with evidence | All six research questions answered with code-line evidence |
| `scout/scout-summary.md` (helix-global-server) | Server-side orchestration context | Duplicate RESTlet; EXECUTE mode defined; credential chain; orchestrator gap |
| `scout/reference-map.json` (helix-global-server) | Server file inventory and unknowns | RESTlet sync requirement; role permission constraints |
| `diagnosis/diagnosis-statement.md` (helix-global-server) | Server role in proxy modules | Credential chain reusable; orchestrator needs EXECUTE branching; sandbox FULL / production VIEW-only |
| `diagnosis/apl.json` (helix-global-server) | Structured Q&A for server context | Server is orchestration + deployment layer; NsGmCredential infrastructure ready |
| `repo-guidance.json` (helix-global-server run root) | Repo intent classification | ns-gm = target, helix-global-server = target, client/cli = context |
| Production DB (via diagnosis runtime inspection) | EXECUTE ticket count, credential records | 0 EXECUTE tickets; 10 NsGmCredential records across 5 orgs |
| Production logs (via diagnosis runtime inspection) | Proxy/dry-run activity check | No proxy activity — feature not yet implemented |
