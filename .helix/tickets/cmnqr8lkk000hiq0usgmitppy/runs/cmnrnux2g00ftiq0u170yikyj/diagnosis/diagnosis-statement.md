# Diagnosis Statement: NetSuite Execute Mode With Approval Research

## Problem Summary

This is a greenfield research ticket requiring the architectural design of an approval-gated "execute mode" for Helix NetSuite. Users should be able to describe desired NetSuite record changes in natural language; the agent researches and proposes a script; changes go through a dry-run/approval/execution cycle; and only approved changes are committed to production NetSuite. The core challenge is designing this approval mechanism to navigate NetSuite governance constraints while providing a frictionless UX for non-technical NetSuite admins.

Zero approval infrastructure exists today. The EXECUTE enum value is defined in TicketMode (Prisma and client types) but has no specialized workflow behavior — it is treated identically to AUTO mode.

## Root Cause Analysis

The "root cause" for this research ticket is an **architectural gap**: there is no mechanism in the current Helix + NetSuite stack to intercept, preview, and gate ns-gm script execution on human approval. Specifically:

1. **No approval data model** — No Prisma models, database tables, or API endpoints exist for tracking approval requests, script proposals, or execution state. Runtime DB queries confirmed zero tables matching "approv" or "execut" patterns.

2. **Fire-and-forget execution** — The ns-gm RESTlet (`ns_gm_restlet.js`) executes arbitrary SuiteScript via `new Function()` and returns results immediately. It supports only two actions: `run` and `getscriptexecutionlogs`. There is no concept of staged execution, dry runs, or approval gates.

3. **No reverse communication channel** — ns-gm communicates only outbound (Helix -> NetSuite via RESTlet). There is no mechanism for NetSuite to call back to Helix mainland, which the ticket owner's beforeSubmit approach would require.

4. **EXECUTE mode has no workflow differentiation** — Unlike RESEARCH mode (which marks all workflow steps as non-implementation via `isNonImplementationStep`), EXECUTE mode falls through to default AUTO behavior in `workflow-step-chain.ts` line 56-58.

5. **No change-capture mechanism** — No tooling exists to capture the before/after state of NetSuite record changes for user review prior to commitment.

### Six Competing Approaches Identified

The ticket requests brainstorming of 5-6 approaches. Based on the current architecture, these are:

**Approach A: BeforeSubmit Intercept (Ticket Owner's Proposal)**
- Deploy a new UserEventScript that fires on beforeSubmit for all Helix-initiated record saves
- UES makes N/https.post call to Helix mainland to check approval status
- First run always fails (captures changes), user approves, second run succeeds
- **Pros**: Captures exact final record state; leverages NetSuite's built-in save lifecycle; changes are guaranteed accurate at submit time
- **Cons**: Governance chaining risk (RESTlet -> record.submit -> beforeSubmit -> N/https costs compound); requires deploying new SuiteScript to customer accounts; external HTTP latency in beforeSubmit may cause timeouts; needs new NS->Helix auth mechanism; first-run failure is janky UX

**Approach B: Two-Phase RESTlet (Recommended for deeper evaluation)**
- Extend the existing RESTlet with new actions: `dry-run` (captures before/after without commit) and `execute-approved` (commits with approval token)
- Dry-run phase: agent's script is modified to load current record state and compute proposed changes without calling record.submit()
- Server stores the change snapshot and presents it for approval
- On approval, `execute-approved` runs the original script
- **Pros**: No new NetSuite script deployment needed; no governance chaining; reuses existing RESTlet pipeline; dry-run is deterministic; approval token prevents unauthorized execution
- **Cons**: Dry-run simulation may not capture all side effects (workflows, UES triggers, formula fields); change snapshot may become stale between dry-run and execution; requires script transformation logic on the server

**Approach C: Pre-Execution State Snapshot**
- Agent generates two scripts: (1) read-only script that captures current record state, (2) write script that makes changes
- Server analyzes both to generate a diff for approval
- On approval, only the write script is executed
- **Pros**: No NS script changes needed; clean separation of read and write; leverages existing RESTlet
- **Cons**: Predicted changes may not match actual outcome (NetSuite validation rules, workflows, field defaults may alter final state); stale data risk; relies on agent's ability to accurately predict change effects

**Approach D: Sandbox-First Execution**
- Execute the script in the NetSuite sandbox environment first
- Capture the sandbox outcome (before/after record state)
- Present sandbox results for approval
- On approval, re-execute in production
- **Pros**: Most accurate change preview (actually runs in real NS environment); captures all side effects including workflows and UES; existing sandbox NS-GM credentials are already loaded
- **Cons**: Requires sandbox to mirror production data (may not be in sync); sandbox execution costs governance; dual-environment complexity; sandbox state drift from production

**Approach E: Suitelet-Based Approval UI**
- Deploy a Suitelet within NetSuite that serves as an approval interface
- Changes are proposed and displayed within NetSuite's native UI
- User approves/rejects within NetSuite, which triggers execution
- **Pros**: Native NetSuite UX; no external approval system needed; works within NS governance model; familiar to NS admins
- **Cons**: Requires deploying new Suitelet to customer accounts; fractures UX between Helix mainland and NetSuite; harder to integrate with Helix workflow; limited UI customization within Suitelet; NS admins may not have Suitelet access

**Approach F: Server-Side Script Simulation**
- Helix server analyzes the proposed SuiteScript statically to predict which records/fields will be changed
- Combines with read-only NS-GM queries to fetch current state
- Generates a predicted diff for approval
- **Pros**: No NS execution needed for preview; fastest approval cycle; no governance cost for preview
- **Cons**: Least accurate — cannot predict NetSuite-side effects (validation, workflows, field defaults, formula recalculations); may miss complex scripting patterns; high implementation complexity for reliable prediction

### Preliminary Recommendation

**Approach B (Two-Phase RESTlet)** is recommended as the primary approach for deeper research, with elements of **Approach A (BeforeSubmit)** as a safety-net enhancement for later phases. Rationale:

1. It avoids governance chaining risks that plague Approach A
2. It requires no new NetSuite script deployment (unlike A, E)
3. It reuses the existing ns-gm CLI -> proxy -> RESTlet pipeline
4. It provides deterministic change capture without environment complexity (unlike D)
5. It can be enhanced later with a beforeSubmit safety check once the core flow is proven

## Evidence Summary

| Evidence | Source | Finding |
|----------|--------|---------|
| EXECUTE mode enum | `prisma/schema.prisma` lines 99-105 | Exists but has zero specialized behavior |
| Production ticket modes | Runtime DB query | 0 EXECUTE tickets created (207 total: AUTO=196, FIX=6, RESEARCH=4, BUILD=1) |
| Approval tables | Runtime DB query | No tables matching 'approv' or 'execut' exist in production |
| Organization platforms | Runtime DB query | 4 NETSUITE orgs, 2 GENERAL orgs |
| NS deployments | Runtime DB query | 22 total, most recent 2026-04-02; all SDF file-based deploys |
| RESTlet actions | `ns_gm_restlet.js` lines 23-37 | Only 'run' and 'getscriptexecutionlogs' supported |
| Code execution | `ns_gm_restlet.js` line 166 | `new Function()` with 24 injected N/* modules |
| NS-GM credentials | `orchestrator.ts` lines 588-609 | SANDBOX and PRODUCTION credentials loaded per org |
| Workflow mode handling | `workflow-step-chain.ts` lines 56-58 | RESEARCH mode special-cased; EXECUTE has no differentiation |
| Client UI state | Client scout reference-map | ExecuteIcon exists; no approval UI components, API hooks, or types |
| NS governance | Web search + NetSuite docs | beforeSubmit should be lean; N/https calls cost governance units; chaining is risky |
| helix-cli relevance | Agent exploration | No execute/approval commands; repo has minimal source code |

## Success Criteria

Since this is a RESEARCH ticket, success means:
1. All six competing approaches are fully analyzed with pros, cons, and technical feasibility grounded in the actual codebase
2. A clear recommendation emerges for which approach (or combination) best balances safety, accuracy, UX quality, and implementation complexity
3. The approval data model design is specified with enough detail for future implementation
4. Cross-repo scope is clearly delineated (what changes in server, client, ns-gm)
5. NetSuite governance constraints are explicitly addressed with evidence from documentation
6. The approval UX concept addresses non-technical admin users with human-readable change summaries

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md | Understand execute mode concept, approval requirements, ticket owner's baseline approach | EXECUTE mode needs dry-run capture, human approval UX, deterministic execution; owner proposes beforeSubmit intercept; wants 5-6 competing approaches |
| helix-global-client scout/reference-map.json | Map client-side existing infrastructure and gaps | EXECUTE mode selectable in UI but no approval types, API hooks, or components exist; TanStack Query v5, polling-based updates |
| helix-global-client scout/scout-summary.md | Understand client architecture constraints | React 19 + Vite 7 + Tailwind v4; existing multi-step wizard and deployment detail patterns for UI reference |
| helix-global-server scout/reference-map.json | Map server-side data models, workflow, and NS infrastructure | Zero EXECUTE tickets in production; NsDeployment pattern exists; workflow treats EXECUTE as AUTO; ns-gm RESTlet is fire-and-forget |
| helix-global-server scout/scout-summary.md | Understand deployment pipeline and architectural boundaries | SDF file deploys separate from record manipulation; one-way NS communication; 40+ Prisma migrations |
| ns-gm scout/reference-map.json | Understand NS execution vehicle capabilities and constraints | RESTlet executes arbitrary SuiteScript; 24 N/* modules; no approval hooks; OAuth 2.0 M2M auth; no Helix callback |
| ns-gm scout/scout-summary.md | Understand ns-gm architecture and competing approach feasibility | CLI -> proxy -> RESTlet pipeline; four approaches mapped to ns-gm capabilities |
| prisma/schema.prisma | Verify data model state | TicketMode.EXECUTE exists; NsDeployment/NsGmCredential models provide patterns; no approval models |
| ns_gm_restlet.js | Verify execution mechanism | new Function() with module injection; governance tracking; only run + logs actions |
| workflow-step-chain.ts | Verify mode-specific handling | RESEARCH mode special-cased; EXECUTE has no differentiation |
| orchestrator.ts | Verify credential loading | Both SANDBOX and PRODUCTION NS-GM creds loaded for NS orgs |
| Runtime DB (helix-global-server) | Confirm production state | 0 EXECUTE tickets; 4 NS orgs; no approval tables; 22 NS deployments |
| NetSuite SuiteScript docs (Context7 + Web) | Verify beforeSubmit capabilities and governance | beforeSubmit fires before record write; N/https available but governance-constrained; best practice is lean beforeSubmit |
