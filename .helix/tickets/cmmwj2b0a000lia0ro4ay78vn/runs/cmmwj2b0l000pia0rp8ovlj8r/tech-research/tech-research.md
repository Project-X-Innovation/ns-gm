# Tech Research: Temporary Per-Script Write Permissions for ns-gm

## Technology Foundation

| Component | Technology | Version/Constraint |
|-----------|-----------|-------------------|
| Runtime | Node.js | >= 24.0.0 |
| CLI framework | commander | ^12.0.0 |
| HTTP server (proxy) | express | ^4.18.0 |
| HTTP client | axios | ^1.6.0 |
| Terminal prompts (fallback) | prompts | ^2.4.2 |
| Auth | jose (JWT/OAuth 2.0 M2M) | ^5.10.0 |
| NetSuite RESTlet | SuiteScript 2.1 | @NModuleScope Public |
| Browser opening | Node.js built-in child_process | No new dependency |
| Token generation | Node.js built-in crypto.randomUUID() | No new dependency |
| Script hashing | Node.js built-in crypto.createHash() | No new dependency |

**No new npm dependencies are required.** All new functionality is built on existing dependencies (express, axios, commander, prompts) and Node.js built-in modules (child_process, crypto).

## Architecture Decision

### Options Considered

#### Option A: Dual RESTlet Deployments (Read-Only RESTlet + Read-Write RESTlet)
Deploy two separate RESTlets to NetSuite — one connected to a read-only role, one connected to a read-write role. The CLI switches between them based on approval.

- **Pro**: Server-side enforcement at the NetSuite role level; impossible to bypass via code.
- **Con**: Requires NetSuite admin to create a second Integration record + role + RESTlet deployment. Doubles the operational surface. Requires managing two `restletUrl` values per profile. Out of scope per product spec ("No changes to the NetSuite RESTlet deployment model").
- **Rejected**: Too much NetSuite-side operational overhead; product explicitly excludes this.

#### Option B: Proxy-Level Code Inspection (Block Write Patterns in Proxy)
The proxy parses the script code and rejects requests containing write API calls (e.g., `record.save()`, `record.delete()`).

- **Pro**: Central enforcement point.
- **Con**: Brittle — must maintain an exhaustive list of write operations across all modules. Easily bypassed via obfuscation (`record['sa' + 've']()`). Operation-level granularity is explicitly out of scope for MVP.
- **Rejected**: Fragile, incomplete, and out of MVP scope.

#### Option C: RESTlet Module Filtering + CLI Gating + Browser Approval (Chosen)
Use the existing `modules` parameter in the RESTlet request payload to control which N/* modules are injected into the execution scope. The CLI defaults to read-safe modules only. When write modules are detected, a browser-based approval flow is triggered through the proxy. On approval, the CLI sends the request with the approved write modules included.

- **Pro**: Leverages existing (but unused) RESTlet plumbing (`ns_gm_restlet.js:63`, `server/app.js:37,53`). No NetSuite-side changes. Module-level granularity is clear and auditable. Human-in-the-loop approval. Zero new dependencies.
- **Con**: Does not prevent `require()` bypass within `new Function()` (see Risks). Module-level granularity, not operation-level.
- **Chosen**: Minimal change, leverages existing infrastructure, matches product requirements exactly.

### Chosen Architecture: Option C

```
                         ┌─────────────────────────────────────────────────────────┐
                         │                     ns-gm CLI                           │
                         │                                                         │
  ns-gm run --file x.js │  1. Read script                                         │
  ─────────────────────► │  2. Detect write modules (static regex)                 │
                         │  3a. No write modules → send with read-safe modules     │
                         │  3b. Write modules detected:                            │
                         │      → POST /approve/request to proxy                   │
                         │      → Open browser to /approve/ui?requestId=XXX        │
                         │      → Poll GET /approve/status?requestId=XXX           │
                         │      → On approval: send with approved modules          │
                         │      → On denial: exit with PERMISSION_DENIED (7)       │
                         └──────────────┬──────────────────────────────────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────────────────────────────────┐
                         │              Express Proxy (localhost:9292)              │
                         │                                                         │
                         │  Existing:                                              │
                         │    POST /run → forward { code, modules } to RESTlet     │
                         │    POST /logs → forward log query to RESTlet            │
                         │    GET /health → health check                           │
                         │                                                         │
                         │  New endpoints:                                         │
                         │    POST /approve/request → store pending approval       │
                         │    GET  /approve/ui      → serve approval HTML page     │
                         │    POST /approve/respond → human approves/denies        │
                         │    GET  /approve/status  → CLI polls for result         │
                         │                                                         │
                         │  In-memory approval store (Map<requestId, ApprovalRec>) │
                         └──────────────┬──────────────────────────────────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────────────────────────────────┐
                         │           NetSuite RESTlet (ns_gm_restlet.js)           │
                         │                                                         │
                         │  UNCHANGED — already supports:                          │
                         │    requestBody.data.modules → selective module injection │
                         │    Falls back to all 24 modules when modules is absent  │
                         └─────────────────────────────────────────────────────────┘
```

## Core API/Methods

### New CLI Flow (src/commands/run.js modifications)

| Step | Method/Function | Description |
|------|----------------|-------------|
| 1 | `detectWriteModules(scriptCode)` | Static regex scan of script code to identify references to write-capable module names. Returns array of detected write module names. |
| 2 | `requestApproval(proxyUrl, scriptCode, writeModules)` | POSTs to proxy `/approve/request` with script content, detected write modules, and a SHA-256 hash of the script. Returns `requestId`. |
| 3 | `openApprovalUI(proxyUrl, requestId)` | Opens browser to `${proxyUrl}/approve/ui?requestId=${requestId}` using platform-specific `child_process.exec()`. |
| 4 | `pollApprovalStatus(proxyUrl, requestId, timeoutMs)` | Polls `GET /approve/status?requestId=${requestId}` every 1s until approved, denied, or timeout (default 5 min). Returns approved module list or throws. |
| 5 | Modified `runCommand(options)` | Orchestrates the above: detect → request → open → poll → execute with approved modules or exit with PERMISSION_DENIED. |

### New Proxy Endpoints (server/app.js additions)

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/approve/request` | POST | `{ code, writeModules, scriptHash }` | `{ requestId, expiresAt }` |
| `/approve/ui` | GET | `?requestId=XXX` | HTML approval page |
| `/approve/respond` | POST | `{ requestId, approved, approvedModules }` | `{ success }` |
| `/approve/status` | GET | `?requestId=XXX` | `{ status: "pending"|"approved"|"denied"|"expired", approvedModules? }` |

### In-Memory Approval Store (server/approvalStore.js — new file)

```
ApprovalRecord {
  requestId: string          // crypto.randomUUID()
  scriptHash: string         // SHA-256 of script content
  scriptCode: string         // Full script for display in UI
  requestedModules: string[] // Write modules the script needs
  approvedModules: string[]  // Modules the human approved (subset of requested)
  status: "pending" | "approved" | "denied" | "expired"
  createdAt: number          // Date.now()
  expiresAt: number          // createdAt + 5 minutes
  consumed: boolean          // true after single use
}
```

### Module Classification (src/utils/moduleClassification.js — new file)

| Category | Modules |
|----------|---------|
| **Read-safe** | `log`, `search`, `query`, `runtime`, `format`, `error`, `url`, `encode`, `crypto`, `currency`, `render`, `xml`, `config` |
| **Write-capable** | `record`, `transaction`, `email`, `file`, `https`, `http`, `task`, `workflow`, `redirect`, `cache`, `certificateControl` |

**Rationale for borderline modules:**
- `N/https` and `N/http`: Classified as write-capable because they can make outbound POST/PUT/DELETE requests to external endpoints, which is a side effect. Read-only API calls via GET are a use case, but the module cannot be restricted to GET-only at the module level.
- `N/cache`: Classified as write-capable because it can create/modify/remove cached values (a mutation).
- `N/file`: Classified as write-capable because it can create/modify/delete files in the NetSuite File Cabinet.

### Profile Extension (src/utils/profileStore.js modification)

Add optional `mode` field to profile shape:

```
profile {
  accountId, clientId, certificateId, privateKeyPath, restletUrl, scope,
  mode: "read-only" | "read-write"  // NEW — default: "read-only"
}
```

When `mode` is `"read-write"`, the CLI skips module filtering and sends all modules (existing behavior). When `mode` is `"read-only"` (default), the CLI sends only read-safe modules and triggers the approval flow for write modules.

### New Exit Code (src/utils/exitCodes.js modification)

```
PERMISSION_DENIED: 7  // Write-capable script run without approval
```

## Technical Decisions

### 1. Browser-Based Approval UI (vs Terminal Prompts)

**Chosen**: Browser-based HTML page served by the Express proxy.

**Why**: The ticket explicitly requests "a pop-up window." When Claude Code controls the terminal, a terminal-based prompt via the `prompts` library would compete for stdin/stdout. A browser window is visible independently and matches the ticket's UX intent.

**Rejected alternative**: Terminal-only `prompts` UI. While simpler, it doesn't work when an AI agent controls the terminal (the primary use case). Terminal prompts are retained as a `--terminal-approve` fallback flag for headless environments.

**Implementation**: The proxy serves a self-contained HTML page (inline CSS/JS) at `GET /approve/ui?requestId=XXX`. The page displays the script code (syntax-highlighted via a `<pre>` block) and toggleable checkboxes for each write permission. The page uses `fetch()` to POST the decision to `/approve/respond`. No template engine or build step needed.

**Browser opening**: Uses Node.js built-in `child_process.exec()` with platform detection:
- macOS: `open "${url}"`
- Linux: `xdg-open "${url}"`
- Windows: `start "" "${url}"`

### 2. CLI Polls Proxy for Approval Status (vs WebSocket/SSE)

**Chosen**: HTTP polling at 1-second intervals with a 5-minute timeout.

**Why**: Polling is the simplest approach with zero new dependencies. The `axios` library (already a dependency) handles GET requests natively. Human approval latency is seconds to minutes — 1-second polling is imperceptible. The approval flow is infrequent (only when write modules are detected).

**Rejected alternative**: Server-Sent Events (SSE) push from proxy to CLI. While lower latency, `axios` doesn't natively support SSE, and adding an SSE client library is unnecessary complexity for an infrequent, human-paced operation.

### 3. Static Regex for Write Module Detection (vs AST Parsing)

**Chosen**: Regex matching of write-capable module names as word boundaries (e.g., `/\brecord\b/`, `/\btransaction\b/`).

**Why**: The detection is a UX guide, not a security boundary. It tells the CLI whether to trigger the approval flow. False positives (e.g., a variable named `record`) are acceptable — they just prompt the human to review. The security boundary is the RESTlet's module filtering. AST parsing would require a JavaScript parser dependency and is over-engineering for fragment-style scripts.

**Rejected alternative**: Full AST parsing with `acorn` or similar. Adds a dependency, complexity, and still can't handle dynamic patterns like `eval` or string concatenation.

### 4. In-Memory Approval Tokens (vs Disk-Persisted)

**Chosen**: Tokens stored in a `Map` in the proxy process memory.

**Why**: Tokens are single-use and short-lived (5-minute TTL). Persisting to disk would create a security risk (stale approval tokens surviving proxy restarts) and add file I/O complexity. Proxy restarts during the approval window are rare and acceptable to fail gracefully.

**Rejected alternative**: Token persistence to `~/.ns-gm/approvals.json`. Creates security risk (on-disk approval tokens), adds cleanup complexity, and violates the "temporary, never persisted" product principle.

### 5. Approval Token Scoping (Script Hash + Module Set)

**Chosen**: Token is scoped to a SHA-256 hash of the script content + the set of requested write modules. When the CLI uses the approval to execute, the proxy validates that the script hash and modules match the approved token.

**Why**: Prevents token reuse for a different script. SHA-256 ensures strong identity. Minor whitespace changes will require re-approval — this is acceptable because the human should review any change to a write-capable script.

### 6. Profile Mode Field (vs Global Config vs Flag-Only)

**Chosen**: Optional `mode` field on the profile in `~/.ns-gm/credentials.json` (default: `"read-only"`).

**Why**: Different profiles may connect to different environments (production vs sandbox). Production profiles should default to read-only; sandbox profiles might be set to read-write. Profile-level mode is more flexible than a global setting. The `--mode` CLI flag can override the profile setting for a single invocation.

**Rejected alternative**: Global mode in `config.json`. Too coarse — can't differentiate between production (read-only) and sandbox (read-write) profiles.

### 7. No RESTlet Changes Required

**Chosen**: The RESTlet (`ns_gm_restlet.js`) remains unchanged.

**Why**: The RESTlet already supports the `modules` parameter (line 63). It already only injects the listed modules (lines 114-125). It already falls back to all modules when `modules` is absent. The enforcement plumbing is complete — only the CLI needs to start using it.

## Cross-Platform Considerations

| Platform | Browser Opening Command | Notes |
|----------|------------------------|-------|
| macOS | `open "${url}"` | Default browser |
| Linux | `xdg-open "${url}"` | Requires xdg-utils (standard on desktop Linux) |
| Windows | `start "" "${url}"` | Default browser; empty title param for cmd.exe compatibility |
| Headless/CI | N/A | Falls back to terminal-based `prompts` approval with `--terminal-approve` flag |
| WSL | `xdg-open` or `wslview` | May need WSL-specific handling; deferred to Round 2 |

## Performance Expectations

| Operation | Expected Latency | Notes |
|-----------|-----------------|-------|
| Write module detection (regex) | < 1ms | Simple regex scan of script string |
| Approval request creation | < 5ms | In-memory Map insertion |
| Browser opening | 100-500ms | OS-dependent; async, non-blocking |
| Approval polling | 1s intervals | Human-paced; negligible overhead |
| Approved execution (read-safe modules only) | Same as today | No additional overhead for read-only scripts |
| Approved execution (with write modules) | Same as today + approval latency | The approval adds human wait time, not compute time |

**Key point**: Read-only scripts (the common case) have zero additional latency. The only overhead is constructing the `modules` array in the request body, which is negligible.

## Dependencies

### Existing (No Changes)

| Dependency | Usage |
|-----------|-------|
| `express` ^4.18.0 | Proxy server; new approval endpoints |
| `axios` ^1.6.0 | CLI HTTP client; approval polling |
| `commander` ^12.0.0 | CLI flags (`--mode`, `--terminal-approve`) |
| `prompts` ^2.4.2 | Terminal-based approval fallback |
| `cors` ^2.8.5 | Proxy CORS (approval page fetch requests) |

### Node.js Built-ins (New Usage)

| Module | Usage |
|--------|-------|
| `crypto` | `randomUUID()` for approval tokens; `createHash('sha256')` for script hashing |
| `child_process` | `exec()` for browser opening |

### New npm Dependencies

**None.** All new functionality is built on existing dependencies and Node.js built-ins.

## Risks

### R1: SuiteScript `require()` Bypass (Medium Severity, Low Probability)

**Risk**: Code executed via `new Function()` may call `require('N/record')` to load write-capable modules that were withheld from the function arguments. The `require` function is a global in SuiteScript's AMD runtime and is accessible from `new Function()` scope.

**Evidence**: The RESTlet's own `loadModule` function (line 99) uses `require('N/' + moduleName)`, proving `require` is available in the RESTlet scope. `new Function()` has access to globals.

**Mitigation**:
1. Static analysis: The CLI scans for `require(` patterns in the script code and flags them during detection.
2. Human review: The approval UI shows the full script code — the human can see `require()` calls.
3. Documentation: The approval UI will display a warning about `require()` bypass potential.

**Residual risk**: A determined user could obfuscate a `require` call. This is accepted because: (a) the system is designed for cooperative AI agents, not adversarial users, and (b) the human is the final reviewer.

### R2: Browser Not Available in Headless Environments (Low Severity)

**Risk**: The approval UI requires a browser. In headless servers or CI, no browser is available.

**Mitigation**: The `--terminal-approve` flag falls back to the `prompts` library for terminal-based approval. The CLI detects common headless indicators (no `DISPLAY` on Linux, CI environment variables) and suggests the fallback.

### R3: Proxy Restart During Approval (Low Severity)

**Risk**: If the proxy process restarts while an approval is pending, the in-memory token is lost. The CLI's polling loop will fail.

**Mitigation**: The CLI handles connection errors gracefully with a clear message: "Approval session expired — proxy may have restarted. Re-run the command." The human can simply re-execute.

### R4: CORS and Localhost Security (Low Severity)

**Risk**: The approval endpoints on localhost:9292 are accessible to any local process or browser tab.

**Mitigation**: Approval tokens are cryptographic UUIDs (128 bits of entropy via `crypto.randomUUID()`). An attacker would need to guess the requestId to approve/deny a pending request. Additionally, the human must actively review and click approve — there's no auto-approve endpoint.

### R5: Module Classification Edge Cases (Low Severity)

**Risk**: The read-safe vs write-capable classification may not perfectly match all use cases. For example, `N/https` is classified as write-capable but is often used for read-only API calls.

**Mitigation**: The human can approve `N/https` when they see the script only uses GET requests. The classification list is defined in a single file (`moduleClassification.js`) and is easy to adjust. Future work could allow per-module, per-operation granularity.

## Deferred to Round 2

| Item | Reason |
|------|--------|
| Operation-level filtering (e.g., allow `record.load` but block `record.save`) | Explicitly out of MVP scope; requires runtime interception |
| WSL-specific browser detection | Edge case; needs testing on WSL environments |
| Audit log of approved/executed write operations | Useful but not essential for MVP safety |
| `require()` runtime interception in RESTlet | Would require RESTlet changes; deferred per product spec |
| Persistent "trusted scripts" list | Requires trust model design; future feature |
| Remote approval (Slack/email notification) | Requires external integrations; future feature |
| Undo/rollback of write operations | Complex NetSuite-specific logic; future feature |

## Summary Table

| Decision | Choice | Key Reason |
|----------|--------|------------|
| Enforcement mechanism | RESTlet `modules` parameter (existing) | Already wired end-to-end; zero NetSuite changes needed |
| Approval UI | Browser-based HTML page via Express proxy | Matches "pop-up window" requirement; works when agent controls terminal |
| CLI-proxy communication | HTTP polling (1s interval, 5min timeout) | Simplest; no new dependencies; human-paced |
| Token storage | In-memory Map in proxy process | Single-use, short-lived; no disk persistence risk |
| Token identity | crypto.randomUUID() + SHA-256 script hash | Unguessable; prevents cross-script reuse |
| Write detection | Static regex on module names | UX guide only; security boundary is module filtering |
| Profile mode | Optional `mode` field per profile | Per-environment flexibility (prod read-only, sandbox read-write) |
| New exit code | PERMISSION_DENIED: 7 | Clear signal to agents |
| New dependencies | None | All built on existing deps + Node.js built-ins |
| RESTlet changes | None | Existing `modules` param is sufficient |
| Terminal fallback | `--terminal-approve` flag using `prompts` | Headless/CI support |

## APL Statement Reference

From diagnosis/apl.json: "ns-gm lacks any permission model. All script executions via `ns-gm run` have unrestricted access to all 24 NetSuite N/* modules including write-capable ones. The critical finding is that the RESTlet already supports module-level filtering via a `modules` parameter (ns_gm_restlet.js line 63) and the proxy already passes this through (server/app.js line 37), but the CLI never sends it (run.js line 93). The solution is to: (1) classify modules as read-safe vs write-capable, (2) default to sending only read-safe modules, (3) add a human approval flow (browser-based via the Express proxy) when a script needs write modules, (4) enforce one-time approval via in-memory tokens in the proxy."

This tech-research builds directly on this diagnosis by resolving the "how" questions: browser-based UI via Express (not a native GUI), HTTP polling for communication, static regex for detection, cryptographic tokens for approval identity, and zero new dependencies.

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| `ticket.md` (ns-gm) | Primary requirements and constraints | Temporary per-script write permissions; human approval via "pop-up window"; ns-gm only |
| `scout/reference-map.json` (ns-gm) | File map, facts, and unknowns | RESTlet `modules` param exists (line 63); proxy forwards it (line 37); CLI never sends it (line 93); 24 modules injected by default |
| `scout/scout-summary.md` (ns-gm) | Architecture layers and constraint analysis | Three enforcement layers (CLI/proxy/RESTlet); `prompts` available; no GUI framework; product.md non-goal reversal |
| `diagnosis/apl.json` (ns-gm) | Resolved investigation questions with evidence | Module classification (read-safe vs write-capable); browser UI via Express proxy; in-memory tokens; `require()` bypass risk |
| `diagnosis/diagnosis-statement.md` (ns-gm) | Root cause analysis and proposed approach | CLI never sends `modules` (root cause); module filtering wired end-to-end but unused; 4-layer architecture proposal |
| `diagnosis/repo-change-scope.json` (ns-gm) | Confirmed scope | Changes scoped to ns-gm only; helix-ns-server is reference only |
| `product/product.md` (ns-gm) | MVP features, out-of-scope items, success criteria, open questions | Essential features list; explicit out-of-scope items; 8 success criteria; 6 open questions/risks |
| `ns_gm_restlet.js` (repo) | Verified RESTlet module filtering behavior | Line 63: `modules` parameter with fallback; Lines 114-125: selective injection; Line 166: `new Function()` execution |
| `server/app.js` (repo) | Verified proxy passthrough behavior | Line 37: `modules` destructured; Line 53: forwarded to RESTlet; Express server on port 9292 |
| `src/commands/run.js` (repo) | Verified CLI sends only code | Line 93-94: `{ code: codeToExecute }` — no `modules` field |
| `src/utils/profileStore.js` (repo) | Verified profile shape | Lines 59-66: no mode/permission fields; needs `mode` addition |
| `src/utils/exitCodes.js` (repo) | Verified exit code model | Lines 8-16: codes 0-6 defined; needs code 7 for PERMISSION_DENIED |
| `src/cli.js` (repo) | Verified command registration | Lines 28-33: `run` command definition; needs `--mode` and `--terminal-approve` options |
| `config.json` (repo) | Verified proxy config | Port 9292; no permission config |
| `package.json` (repo) | Verified dependencies and engine | Node >=24.0.0; express, axios, commander, prompts, cors all available |
| Context7 (SuiteScript samples) | Validated SuiteScript module loading behavior | `require()` is standard AMD loader in SuiteScript; `define()` for entry points |
| WebSearch (SuiteScript require + NModuleScope) | Investigated `require()` bypass risk in `new Function()` context | `require` is global in SuiteScript AMD runtime; NModuleScope enforcement inconsistent in 2.1; `new Function` has global scope access |
| WebSearch (Node.js browser opening) | Validated zero-dependency browser opening approach | `child_process.exec()` with platform detection (open/xdg-open/start) works without npm packages |
