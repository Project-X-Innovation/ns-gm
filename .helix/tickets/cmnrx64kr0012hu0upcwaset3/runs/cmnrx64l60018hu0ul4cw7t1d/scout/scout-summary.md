# Scout Summary — ns-gm

## Problem

ns-gm is a CLI + local Express proxy + NetSuite RESTlet tool for executing arbitrary SuiteScript 2.1 code. Currently it operates in a fire-and-forget model: code is sent to the RESTlet and executed immediately with no approval gate, change preview, or dry-run capability. The ticket requires extending ns-gm with a two-phase execution model (Approach B from prior research ticket cmnqr8lkk000hiq0usgmitppy) that adds:

1. A **dry-run** action where N/record write methods are intercepted by proxy wrappers to capture before/after state without committing changes
2. An **execute-approved** action that runs the script with real modules after approval token validation
3. New proxy endpoints (`POST /dry-run`, `POST /execute`) in the Express server

The critical constraint is that ns-gm must remain fully functional for standalone (non-Helix) users—existing `run`, `logs`, `env`, `setup` commands must not regress.

## Analysis Summary

### Current Architecture
- **CLI** (`src/cli.js`) registers commands via Commander
- **Express proxy** (`server/app.js`) on port 9292 handles `/run` and `/logs` endpoints
- **Auth module** (`server/auth.js`) manages OAuth 2.0 M2M JWT tokens with certificate-based signing
- **RESTlet** (`ns_gm_restlet.js`) deployed in NetSuite, dispatches on `action` field: `run` or `getscriptexecutionlogs`
- Code execution uses `new Function(...moduleNames, userCode)` with 24 pre-loaded N/* modules injected as arguments

### What "Proxy Modules" Means
The term "proxy modules" refers to JavaScript wrapper objects that mimic NetSuite N/* module APIs during dry-run execution. Specifically:
- A **proxied N/record** module intercepts write operations (`save()`, `submitFields()`, `delete()`) to capture intended changes without committing them to NetSuite
- Read operations (`load()`, `getFields()`) pass through to the real N/record module to capture current state
- All other N/* modules (search, query, log, etc.) are passed through unmodified since they are read-only in typical usage
- This proxy is implemented **inside the RESTlet** (server-side in NetSuite), not in the local Express proxy

### Key Boundaries
- The RESTlet's `post()` function (line 23) is the action dispatcher — new actions slot in alongside existing ones
- The module map (lines 71-96) defines all available modules — the proxy wraps the `record` entry for dry-run
- `safeExecute()` (lines 163-188) executes user code — dry-run uses the same pattern but with proxied modules
- The Express proxy endpoints (lines 34-86) are the template for new `/dry-run` and `/execute` endpoints
- Non-Helix users interact only with existing endpoints — new endpoints are additive

### Two Copies of the RESTlet
The RESTlet exists in two places:
1. `ns-gm/ns_gm_restlet.js` — the standalone repo copy
2. `helix-global-server/netsuite-setup/FileCabinet/SuiteScripts/ns_gm_restlet.js` — the SDF-deployed copy

Both must be extended with the new actions.

### Quality Gates
- No test framework configured
- No lint/typecheck scripts in package.json
- Plain JavaScript (not TypeScript)
- Manual testing is the validation method

## Relevant Files

| File | Purpose |
|------|---------|
| `ns_gm_restlet.js` | RESTlet deployed to NetSuite — primary change target for dry-run/execute-approved actions and proxy module implementation |
| `server/app.js` | Express proxy — needs `/dry-run` and `/execute` endpoints |
| `server/auth.js` | OAuth 2.0 M2M auth — reused by new endpoints, likely no changes |
| `src/commands/run.js` | CLI run command — must not regress |
| `src/cli.js` | CLI entry point — no changes expected |
| `src/utils/profileStore.js` | Credential management — used by all proxy endpoints |
| `config.json` | Proxy config (port 9292, timeouts) |
| `package.json` | v1.0.5, no quality gate scripts |

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md (ns-gm run root) | Understand the build ticket requirements | Must implement recommended approach (Approach B), verify proxy module viability, preserve non-Helix user functionality |
| CLAUDE.md (ns-gm) | Repository architecture and command surface | Three-tier architecture: CLI -> Express proxy -> RESTlet. OAuth 2.0 M2M auth. Alias-based credentials |
| ns_gm_restlet.js | Current RESTlet implementation | 2 actions (run, getscriptexecutionlogs), 24 pre-loaded modules, new Function() execution, governance tracking |
| server/app.js | Current proxy endpoints | /run and /logs endpoints with nsapi.REST.post() pattern |
| Prior research ticket (cmnqr8lkk000hiq0usgmitppy) tech-research.md | Detailed technical specification for execute mode | Approach B recommended: dry-run with proxied N/record, execute-approved with HMAC token, field discovery via getFields() |
| Prior research ticket diagnosis-statement.md | Six competing approaches analysis | Approach B (Two-Phase RESTlet) recommended over BeforeSubmit (A), Snapshot (C), Sandbox-First (D), Suitelet (E), Simulation (F) |
| Prior research ticket product.md | Product requirements for execute mode | MVP: approval-gated execution, change preview, human-readable summary, approval UI. Out of scope: autonomous execution, sandbox-first |
| Runtime inspection (production DB) | Validate current state of EXECUTE mode | 0 EXECUTE tickets exist. 5 NsGmCredential records across 3 orgs. NsDeployment pattern available as reference |
