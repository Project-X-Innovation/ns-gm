# Diagnosis Statement

## Problem Summary

ns-gm (NetSuite God Mode) is a CLI tool used by AI agents (Claude Code) to execute SuiteScript against production NetSuite. Today, every `ns-gm run` invocation has unrestricted access to all 24 injected N/* modules, including write-capable ones like `N/record`, `N/transaction`, and `N/email`. There is no concept of read-only mode, write mode, or permission levels anywhere in the codebase. The ticket requests a mechanism for agents operating in read-only mode to temporarily request write permissions for a single script, with human approval via a pop-up window, scoped strictly to that one execution.

## Root Cause Analysis

This is a **missing feature**, not a bug. The root cause has three layers:

### 1. No mode concept in the profile or runtime model
The credential profile shape (`profileStore.js` lines 59-66) has no `mode` field. The proxy has no mode-aware routing. The CLI sends all scripts identically regardless of intent.

### 2. No module filtering at the CLI layer (despite RESTlet support)
**Critical finding**: The RESTlet already supports selective module injection via a `modules` parameter in the request payload (`ns_gm_restlet.js` line 63: `const requestedModules = requestBody.data.modules || [full default list]`). The proxy already destructures and forwards this parameter (`server/app.js` line 37: `const { code, modules } = req.body`). However, the CLI's `run.js` (line 93-94) only sends `{ code: codeToExecute }` and never provides a `modules` array. This means the RESTlet always falls back to injecting all 24 modules. **The enforcement plumbing exists end-to-end but is unused.**

### 3. No human approval workflow
There is no mechanism for an agent to request elevated permissions and have a human review and approve before execution. The `prompts` library is available for terminal UI, but the ticket specifically calls for a "window" -- implying a visual approval interface.

## Evidence Summary

| Evidence | Location | Significance |
|----------|----------|-------------|
| RESTlet accepts `modules` parameter | `ns_gm_restlet.js:63` | Module filtering already works server-side; only listed modules are injected (lines 114-125) |
| Proxy passes `modules` through | `server/app.js:37,53` | `{ code, modules }` destructured and forwarded to RESTlet |
| CLI never sends `modules` | `src/commands/run.js:93-94` | Only sends `{ code }` -- root of the "all modules injected" behavior |
| Profile has no mode field | `src/utils/profileStore.js:59-66` | No read-only/read-write distinction in credentials |
| Product non-goal | `Blueprints/product.md:71` | "No advanced profile permissions model in this phase" -- ticket changes this scope |
| Proxy is a running Express server | `server/app.js` on `localhost:9292` | Can serve an approval web page without new infrastructure |
| `prompts` library available | `package.json:44` | Terminal-based approval possible as fallback |
| 24 modules injected by default | `ns_gm_restlet.js:7-11,63-68` | Full module list includes write-capable: record, transaction, email, file, task, workflow |
| helix-ns-server dual credential pattern | `credentials.ts:11-12,19-24` | PRODUCTION for read-only (scout/diagnosis), SANDBOX for write -- relevant design pattern |
| `new Function()` execution model | `ns_gm_restlet.js:166` | User code gets exactly the modules passed as arguments, nothing more |

## Proposed Approach

### Module Classification (Read-safe vs Write-capable)
- **Read-safe**: `log`, `search`, `query`, `runtime`, `format`, `error`, `url`, `encode`, `crypto`, `currency`, `render`, `xml`, `config`
- **Write-capable**: `record`, `transaction`, `email`, `file`, `https`, `http`, `task`, `workflow`, `redirect`, `cache`, `certificateControl`

### Architecture (4 changes across 3 layers)

1. **CLI layer** (`run.js`, `cli.js`): Add mode awareness. In read-only mode (default), construct a `modules` array with only read-safe modules. Add script analysis to detect when write modules are needed. Add a new command or flag to initiate the approval flow.

2. **Proxy layer** (`app.js`): Add an approval endpoint that serves a browser-based approval page. Add in-memory approval token store (one-time tokens scoped to script hash + module set). Validate that read-only mode requests don't include write modules.

3. **Profile layer** (`profileStore.js`): Add optional `mode` field to profile shape (default: `"read-only"`). This persists the default mode per profile.

4. **Configuration** (`config.json`, `exitCodes.js`): Add module classification lists. Add `PERMISSION_DENIED` exit code.

### Approval Flow
1. Agent runs `ns-gm run --file script.js` in read-only mode
2. CLI detects script needs write modules (static analysis of module references)
3. CLI sends a permission request to proxy with script content, needed modules, and a request ID
4. Proxy stores pending request in memory, opens browser to approval page
5. Human reviews script + permissions in browser, approves or denies
6. On approval, proxy marks token as approved (one-time)
7. CLI executes script with approved modules via normal `/run` endpoint with approval token
8. Proxy validates token, deletes it after use, executes with write modules
9. Mode remains read-only for subsequent executions

### Temporariness Enforcement
- Approval tokens live in proxy memory only (never persisted to disk)
- Tokens are single-use (deleted after execution)
- Tokens are scoped to specific script hash + module set
- Profile `mode` field is never changed by the approval flow
- Proxy process restart clears all tokens

## Success Criteria

1. `ns-gm run` in default mode restricts execution to read-safe modules only
2. When a script needs write modules, the CLI detects this and initiates an approval flow
3. A browser-based approval page opens showing the script code and required write permissions
4. Human can approve or deny individual permissions
5. On approval, the script executes with the approved modules only
6. After execution, write permissions are reverted -- no persistent state change
7. Subsequent `ns-gm run` commands remain in read-only mode
8. A `PERMISSION_DENIED` exit code is returned when write-capable scripts are run without approval

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md (ns-gm) | Primary problem statement and requirements | Need temporary per-script write permissions with human approval; work is ns-gm only |
| scout/reference-map.json (ns-gm) | File map with line references and facts/unknowns | RESTlet already supports `modules` param; no mode concept exists; 24 modules injected by default |
| scout/scout-summary.md (ns-gm) | Architecture summary and constraint analysis | Three-layer architecture; module filtering exists but unused; `prompts` available; product.md non-goal |
| src/commands/run.js | CLI execution path | Confirms only `code` is sent (line 93-94), never `modules` |
| server/app.js | Proxy endpoint analysis | Confirms `modules` is destructured (line 37) and forwarded (line 53) but unused |
| ns_gm_restlet.js | RESTlet execution model | `new Function()` with selective module injection (line 63, 114-125, 166) |
| server/auth.js | OAuth auth model | Single credential profile per request; no permission-level distinction |
| src/utils/profileStore.js | Profile shape | No mode/permission fields; needs extension |
| src/cli.js | Command registration | New commands/flags needed for approval flow |
| Blueprints/product.md | Product scope | Line 71 non-goal "No advanced profile permissions model" is being reversed |
| package.json | Dependencies | `prompts` available; `express` already running; Node >=24.0.0 |
| config.json | Proxy config | Port 9292; no permission config exists |
| exitCodes.js | Exit code model | No PERMISSION_DENIED exit code |
| helix-ns-server credentials.ts | Reference: dual credential pattern | PRODUCTION for read-only, SANDBOX for write; demonstrates env-scoped credential switching |
| helix-ns-server native-phase.ts | Reference: ns-gm integration | Temp key lifecycle; setup:ci flow |
