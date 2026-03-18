# Scout Summary

## Problem

ns-gm is a CLI tool that executes arbitrary SuiteScript against NetSuite via a local Express proxy and deployed RESTlet. Today it has **no concept of read-only vs write mode** -- every `ns-gm run` invocation has full access to all 24 injected N/* modules including write-capable ones (N/record, N/transaction, N/email, N/workflow, N/task, etc.). The ticket requests a mechanism for AI agents (Claude Code) to operate in a default read-only mode and temporarily request write permissions for a single script, with human approval via a pop-up/UI, scoped strictly to that one script execution.

## Analysis Summary

### Architecture Layers

The execution flow has three layers where permission gating could be introduced:

1. **CLI client** (`src/commands/run.js`): Sends code to proxy. Could gate execution before sending by requiring approval.
2. **Local Express proxy** (`server/app.js`): Receives code, authenticates with NetSuite, forwards to RESTlet. Could enforce mode and require approval tokens.
3. **NetSuite RESTlet** (`ns_gm_restlet.js`): Executes code via `new Function()` with injected modules. Could selectively inject only read-safe modules or add a sandbox/interception layer.

### Current Permission Surface

- **OAuth scope** (`restlets`) is set at the profile level and controls NetSuite API access type, not read/write granularity.
- **Integration record role** in NetSuite controls what the RESTlet can do. This is configured in NetSuite UI, not in ns-gm code.
- **Profile store** (`~/.ns-gm/credentials.json`) has no mode/permission fields.
- **product.md** explicitly listed "No advanced profile permissions model" as a non-goal. This ticket reverses that.

### Boundary Observations

- The RESTlet's `new Function()` execution model (line 166) gives injected code full access to all modules passed as arguments. There is no interception layer.
- The proxy is a thin passthrough - it adds authentication but does not inspect or filter the code being executed.
- The `prompts` library is already a dependency, enabling terminal-based interactive approval flows.
- No GUI/desktop framework dependencies exist; a "pop-up window" would require new infrastructure.
- helix-ns-server demonstrates a pattern of managing two credential sets (PRODUCTION read-only for scout/diagnosis, SANDBOX read-write for implementation) that is architecturally relevant.

### Key Constraints from Ticket

- Default mode must remain read-only (production safety).
- Write permissions must be temporary (single script only).
- Human must approve each write-capable script execution.
- Approval UI should show the script and needed permissions.
- Permissions must not persist beyond the single script execution.

## Relevant Files

| File | Role | Key Lines |
|------|------|-----------|
| `src/cli.js` | CLI entry, command registration | 14-92 |
| `src/commands/run.js` | Run command client, sends code to proxy | 58-116 |
| `server/app.js` | Express proxy, /run and /logs endpoints | 35-86 |
| `server/auth.js` | OAuth 2.0 M2M, token management, RESTlet calls | 70-207 |
| `ns_gm_restlet.js` | NetSuite RESTlet, code execution with N/* modules | 45-169 |
| `src/utils/profileStore.js` | Credential alias persistence | 45-97 |
| `src/commands/setup.js` | Interactive credential setup | - |
| `src/commands/setup-ci.js` | Non-interactive CI setup | 33-63 |
| `src/commands/init.js` | Proxy server startup (detached process) | 59-105 |
| `config.json` | Proxy port & timeout config | 1-5 |
| `src/utils/exitCodes.js` | Semantic CLI exit codes | 8-16 |
| `src/commands/help.js` | Help system (JSON + text) | - |
| `Blueprints/product.md` | Product scope; line 71 non-goal re: permissions | 71 |
| `CLAUDE.md` | AI agent guidance | - |
| `package.json` | Dependencies, node >=24.0.0 | - |

### Context-Only Reference (helix-ns-server)

| File | Role |
|------|------|
| `src/helix-workflow/orchestrator/credentials.ts` | Shows PRODUCTION vs SANDBOX credential selection pattern |
| `src/helix-workflow/ns-gm-credentials.ts` | ns-gm credential preparation with encryption |
| `src/helix-workflow/orchestrator/native-phase.ts` | ns-gm setup:ci integration, temp key lifecycle |

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md (ns-gm) | Primary problem statement and requirements | Need temporary per-script write permissions with human approval; work is ns-gm only; helix-ns-server is reference |
| CLAUDE.md (ns-gm) | Architecture and file map for the repo | Three-layer architecture (CLI -> proxy -> RESTlet); alias-based credential model |
| Blueprints/product.md (ns-gm) | Product scope and non-goals | Line 71 explicitly stated "No advanced profile permissions model in this phase" as non-goal; ticket changes this |
| ns_gm_restlet.js | Understand server-side execution model | `new Function()` with all 24 N/* modules injected; no permission filtering |
| server/app.js | Understand proxy layer | Thin passthrough; no code inspection or permission enforcement |
| server/auth.js | Understand auth model | OAuth M2M with profile-scoped tokens; no read/write distinction |
| src/utils/profileStore.js | Understand credential shape | Profile has no mode/permission fields; only auth credentials |
| src/commands/run.js | Understand client execution flow | Direct POST to proxy /run with code; no permission gating |
| helix-ns-server credentials.ts | Reference pattern for env-scoped credentials | PRODUCTION for read-only steps, SANDBOX for write steps; demonstrates dual-credential pattern |
| helix-ns-server native-phase.ts | Reference pattern for ns-gm setup lifecycle | Shows temp key write, ns-gm setup:ci, init, env validation flow |
| package.json (ns-gm) | Dependencies and runtime constraints | Node >=24.0.0; has `prompts` for terminal UI; no GUI framework |
