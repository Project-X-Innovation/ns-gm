# Scout Summary — ns-gm

## Problem

ns-gm (NetSuite God Mode) is the execution vehicle for all NetSuite record changes. The ticket requires designing an approval mechanism where scripts prepared by the agent go through a dry-run/approval cycle before being committed. The current RESTlet has no intercept or approval hooks — it executes code and returns results immediately. A new mechanism (beforeSubmit UserEventScript, Suitelet, or alternative) needs to be designed to gate record changes on human approval.

## Analysis Summary

### Current ns-gm Architecture

The ns-gm architecture is a three-tier pipeline:
```
ns-gm CLI -> local Express proxy (port 9292) -> NetSuite RESTlet
```

The RESTlet (`ns_gm_restlet.js`) accepts arbitrary SuiteScript 2.1 code, dynamically constructs a function with injected N/* modules, and executes it. It has full access to 24 NetSuite modules including `N/record`, `N/transaction`, and `N/workflow` — meaning it can create, load, edit, and submit any record type.

The execution model is **fire-and-forget with result capture**: code is sent, executed, and results returned in a single HTTP request/response cycle. There is no concept of staged execution, approval gates, or dry runs.

### What Exists vs What's Needed

| Capability | Current State | Needed for Execute Mode |
|-----------|--------------|----------------------|
| Script execution | `new Function()` in RESTlet | Same, but triggered by deterministic program after approval |
| Record change capture | None — changes committed immediately | Before/after state capture for approval review |
| Approval check | None | BeforeSubmit or equivalent that validates approval with Helix |
| External HTTP | N/https available in RESTlet | Needed in approval script to check Helix mainland |
| Governance tracking | Yes (initial/remaining/used) | Critical constraint for approval HTTP calls |
| Script deployment | Manual RESTlet deploy only | Need deployment path for new UserEventScript(s) |

### Key Technical Observations

1. **Execution via new Function()** (line 166): Code is evaluated dynamically with module arguments. This means the agent's proposed script is just a string that gets executed. The "deterministic program" in the ticket could simply be a service that takes an approved script string and submits it to the RESTlet's /run endpoint.

2. **Module availability**: The RESTlet pre-loads all modules. A beforeSubmit UserEventScript would need its own module imports (defined in its `define()` block) — at minimum `N/https`, `N/record`, `N/runtime` for making approval check HTTP calls and inspecting record state.

3. **No callback channel**: ns-gm currently has no mechanism for NetSuite to communicate back to Helix. A beforeSubmit script that checks approval status would need the Helix mainland server URL and some form of authentication token — this is a new communication pattern.

4. **Governance concerns**: RESTlet has 5000 governance units. A record.submit() inside executed code triggers beforeSubmit hooks. If that hook makes an N/https.post call (10 units per call), governance costs compound. This is a real constraint to investigate.

### ns-gm's Role in Competing Approaches

The ticket asks for 5-6 competing approaches. ns-gm's architecture affects feasibility:

- **Approach A (BeforeSubmit intercept)**: Requires a new UserEventScript deployed alongside RESTlet. ns-gm's code execution triggers record saves -> beforeSubmit fires -> checks Helix for approval.
- **Approach B (Pre-validated scripts)**: ns-gm first runs a read-only script to capture current state, then a write script is validated before submission. No new NetSuite scripts needed.
- **Approach C (Suitelet approval UI)**: A Suitelet within NetSuite shows approval UI. Requires new script deployment but leverages NetSuite's native UI capabilities.
- **Approach D (Two-phase RESTlet)**: Extend RESTlet with new actions: 'dry-run' (simulate changes without commit) and 'execute-approved' (commit with token). No new script types needed.

## Relevant Files

| File | Relevance |
|------|-----------|
| `ns_gm_restlet.js` | Primary execution engine — 452 lines. Handles run + logs. Would need extension or companion scripts. |
| `server/app.js` | Local proxy — /run and /logs endpoints. Execute mode submissions would flow through here. |
| `server/auth.js` | OAuth 2.0 auth. Same pattern needed for any new NS scripts calling Helix. |
| `src/commands/run.js` | CLI execution flow. Pattern for deterministic program's code submission. |
| `CLAUDE.md` | Architecture documentation and project identity. |
| `package.json` | No DB, no ORM, no build step, no tests. Pure JS + Express. |

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|-------------|
| ticket.md | Understand the beforeSubmit intercept approach and alternatives to brainstorm | The owner's baseline approach uses a beforeSubmit UserEventScript that checks Helix mainland for approval before allowing record saves |
| ns_gm_restlet.js | Understand execution mechanism and available modules | Arbitrary SuiteScript via new Function() with 24 N/* modules; fire-and-forget with no approval hooks |
| server/app.js | Understand proxy architecture | Express proxy on 9292; POST /run sends code to NetSuite. Deterministic program could use this same endpoint |
| server/auth.js | Understand authentication model | OAuth 2.0 M2M with JWT assertion. New NS scripts calling Helix would need different auth (API key or token) |
| CLAUDE.md | Project architecture reference | CLI -> proxy -> RESTlet architecture; credential model is alias-based JSON files |
