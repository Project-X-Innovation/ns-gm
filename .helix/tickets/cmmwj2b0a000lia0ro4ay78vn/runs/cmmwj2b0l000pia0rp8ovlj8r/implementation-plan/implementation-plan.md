# Implementation Plan: Temporary Per-Script Write Permissions for ns-gm

## Overview

Add a permission-gated execution model to ns-gm so that `ns-gm run` defaults to injecting only read-safe N/* modules into the RESTlet. When a script needs write-capable modules, the CLI detects this, opens a browser-based approval window served by the Express proxy, and waits for human approval before executing with the approved modules. Approval tokens are single-use, in-memory, and scoped to one script. No new npm dependencies. No RESTlet changes. All work is in ns-gm only.

## Implementation Principles

1. **Leverage existing plumbing** — The RESTlet already accepts a `modules` parameter (`ns_gm_restlet.js:63`); the proxy already forwards it (`server/app.js:37,53`). The CLI just needs to send it.
2. **Safe by default** — Read-only mode is the default. Write access requires explicit human approval each time.
3. **Minimal footprint** — New files are limited to `moduleClassification.js`, `approvalStore.js`, and `approvalPage.js`. Existing files receive targeted edits.
4. **Zero new dependencies** — Uses built-in `crypto` and `child_process`; existing `express`, `axios`, `prompts`, `commander`.
5. **No RESTlet changes** — `ns_gm_restlet.js` remains unchanged.

## Implementation Steps Summary

| Step | Goal | Deliverable |
|------|------|-------------|
| 1 | Define module classification | `src/utils/moduleClassification.js` |
| 2 | Add PERMISSION_DENIED exit code | Updated `src/utils/exitCodes.js` |
| 3 | Add profile mode field support | Updated `src/utils/profileStore.js` |
| 4 | Create in-memory approval store | `server/approvalStore.js` |
| 5 | Create approval HTML page generator | `server/approvalPage.js` |
| 6 | Add approval endpoints to proxy | Updated `server/app.js` |
| 7 | Add write-module detection and approval flow to CLI run command | Updated `src/commands/run.js` |
| 8 | Add --mode and --terminal-approve CLI flags | Updated `src/cli.js` |
| 9 | Update help system | Updated `src/commands/help.js` |
| 10 | Update CLAUDE.md and Blueprints/product.md | Documentation |
| 11 | End-to-end manual verification | Verification pass |

## Detailed Implementation Steps

### Step 1: Create Module Classification (`src/utils/moduleClassification.js`)

**Goal**: Define a single source of truth for which N/* modules are read-safe vs write-capable.

**What to Build**:
- Create new file `src/utils/moduleClassification.js`
- Export two constant arrays:
  - `READ_SAFE_MODULES`: `['log', 'search', 'query', 'runtime', 'format', 'error', 'url', 'encode', 'crypto', 'currency', 'render', 'xml', 'config']` (13 modules)
  - `WRITE_CAPABLE_MODULES`: `['record', 'transaction', 'email', 'file', 'https', 'http', 'task', 'workflow', 'redirect', 'cache', 'certificateControl']` (11 modules)
- Export `ALL_MODULES`: spread of both arrays (24 total, matching `ns_gm_restlet.js` lines 63-68)
- Export a function `detectWriteModules(scriptCode)` that takes a script string and returns an array of write-capable module names found via regex word-boundary matching (`/\bmoduleName\b/`). Also detect `require(` patterns as a bypass warning.

**Verification (AI Agent Runs)**:
```bash
node -e "
const mc = require('./src/utils/moduleClassification');
console.assert(mc.READ_SAFE_MODULES.length === 13, 'Expected 13 read-safe modules');
console.assert(mc.WRITE_CAPABLE_MODULES.length === 11, 'Expected 11 write-capable modules');
console.assert(mc.ALL_MODULES.length === 24, 'Expected 24 total modules');
const detected = mc.detectWriteModules('const r = record.load({type: \"customer\", id: 1}); email.send({});');
console.assert(detected.includes('record'), 'Should detect record');
console.assert(detected.includes('email'), 'Should detect email');
console.assert(!detected.includes('search'), 'Should not detect search');
const none = mc.detectWriteModules('return search.create({type: \"customer\"}).run().getRange({start:0,end:10})');
console.assert(none.length === 0, 'Should detect no write modules');
console.log('Step 1 PASSED');
"
```

**Success Criteria**:
- All 24 modules accounted for (matching RESTlet `ns_gm_restlet.js:63-68`)
- `detectWriteModules` correctly identifies write module references and returns only write-capable modules
- `detectWriteModules` returns empty array for read-only scripts

---

### Step 2: Add PERMISSION_DENIED Exit Code (`src/utils/exitCodes.js`)

**Goal**: Add exit code 7 for permission-denied scenarios so agents can programmatically detect this state.

**What to Build**:
- Add `PERMISSION_DENIED: 7` to the `EXIT_CODES` object in `src/utils/exitCodes.js` (after `AUTH_ERROR: 6`)

**Verification (AI Agent Runs)**:
```bash
node -e "
const { EXIT_CODES } = require('./src/utils/exitCodes');
console.assert(EXIT_CODES.PERMISSION_DENIED === 7, 'Expected PERMISSION_DENIED = 7');
console.assert(EXIT_CODES.AUTH_ERROR === 6, 'AUTH_ERROR should remain 6');
console.log('Step 2 PASSED');
"
```

**Success Criteria**:
- `EXIT_CODES.PERMISSION_DENIED` equals 7
- Existing exit codes unchanged

---

### Step 3: Add Profile Mode Field Support (`src/utils/profileStore.js`)

**Goal**: Extend the profile shape with an optional `mode` field (default: `"read-only"`) so profiles can persist their default execution mode.

**What to Build**:
- In `saveProfile()` (line 59-66): add `mode` field to the stored profile, defaulting to `"read-only"` if not provided. Valid values: `"read-only"`, `"read-write"`.
- In `getActiveProfile()`: return the `mode` field with the profile (it will come through naturally via spread, but ensure the default is applied if missing for backward-compat with existing profiles).
- Add a helper function `getProfileMode(profile)` that returns `profile.mode || 'read-only'` for safe access.
- Export `getProfileMode`.

**Verification (AI Agent Runs)**:
```bash
node -e "
const ps = require('./src/utils/profileStore');
// Verify getProfileMode handles missing mode
console.assert(ps.getProfileMode({}) === 'read-only', 'Default should be read-only');
console.assert(ps.getProfileMode({ mode: 'read-write' }) === 'read-write', 'Should return read-write');
console.assert(ps.getProfileMode({ mode: 'read-only' }) === 'read-only', 'Should return read-only');
console.log('Step 3 PASSED');
"
```

**Success Criteria**:
- Existing profiles without `mode` default to `"read-only"`
- `saveProfile` persists the `mode` field
- `getProfileMode` returns correct mode for all cases

---

### Step 4: Create In-Memory Approval Store (`server/approvalStore.js`)

**Goal**: Provide an in-memory store for pending approval requests with automatic expiration and single-use enforcement.

**What to Build**:
- Create new file `server/approvalStore.js`
- Use a `Map<requestId, ApprovalRecord>` as the backing store
- `ApprovalRecord` shape: `{ requestId, scriptHash, scriptCode, requestedModules, approvedModules, status ('pending'|'approved'|'denied'|'expired'), createdAt, expiresAt, consumed }`
- Export functions:
  - `createApproval(scriptCode, requestedModules)` — generates `requestId` via `crypto.randomUUID()`, computes `scriptHash` via `crypto.createHash('sha256')`, sets 5-minute TTL, stores record, returns `{ requestId, expiresAt }`
  - `getApproval(requestId)` — returns the record or null; auto-expires if past TTL
  - `respondToApproval(requestId, approved, approvedModules)` — sets status to 'approved' or 'denied'; validates requestId exists and is pending
  - `consumeApproval(requestId, scriptHash)` — validates status is 'approved', script hash matches, not yet consumed. Sets `consumed: true`. Returns `approvedModules`. Throws on any mismatch.
  - `cleanupExpired()` — removes expired records from the Map

**Verification (AI Agent Runs)**:
```bash
node -e "
const store = require('./server/approvalStore');
// Create
const { requestId, expiresAt } = store.createApproval('return record.load({type:\"customer\",id:1})', ['record']);
console.assert(requestId, 'Should have requestId');
console.assert(expiresAt > Date.now(), 'Should expire in the future');
// Get
const rec = store.getApproval(requestId);
console.assert(rec.status === 'pending', 'Should be pending');
console.assert(rec.requestedModules[0] === 'record', 'Should have record module');
// Approve
store.respondToApproval(requestId, true, ['record']);
const approved = store.getApproval(requestId);
console.assert(approved.status === 'approved', 'Should be approved');
// Consume
const modules = store.consumeApproval(requestId, approved.scriptHash);
console.assert(modules[0] === 'record', 'Should return approved modules');
const consumed = store.getApproval(requestId);
console.assert(consumed.consumed === true, 'Should be consumed');
// Double-consume should throw
try { store.consumeApproval(requestId, approved.scriptHash); console.assert(false, 'Should throw'); } catch(e) { /* expected */ }
console.log('Step 4 PASSED');
"
```

**Success Criteria**:
- Approval lifecycle works: create → get → respond → consume
- Double-consume throws
- Script hash mismatch in consume throws
- Auto-expiration works (TTL check in `getApproval`)

---

### Step 5: Create Approval HTML Page Generator (`server/approvalPage.js`)

**Goal**: Generate a self-contained HTML page for the browser-based approval UI.

**What to Build**:
- Create new file `server/approvalPage.js`
- Export a function `generateApprovalHTML(approval, proxyPort)` that returns a complete HTML string containing:
  - Title: "ns-gm Write Permission Request"
  - Display: the full script code in a `<pre><code>` block
  - List of requested write modules as toggleable checkboxes (all checked by default)
  - A warning about `require()` bypass potential if `require(` appears in the script code
  - "Approve" button — POSTs to `/approve/respond` with `{ requestId, approved: true, approvedModules: [checked modules] }`
  - "Deny" button — POSTs to `/approve/respond` with `{ requestId, approved: false, approvedModules: [] }`
  - Status feedback area (shows "Approved!" or "Denied" after response)
  - Inline CSS (no external stylesheets). Clean, readable design.
  - Inline JS using `fetch()` for the POST calls
- The page should auto-close or show a "You can close this tab" message after responding

**Verification (AI Agent Runs)**:
```bash
node -e "
const { generateApprovalHTML } = require('./server/approvalPage');
const html = generateApprovalHTML({
  requestId: 'test-123',
  scriptCode: 'return record.load({type: \"customer\", id: 1});',
  requestedModules: ['record', 'email'],
  status: 'pending'
}, 9292);
console.assert(html.includes('test-123'), 'Should contain requestId');
console.assert(html.includes('record'), 'Should contain record module');
console.assert(html.includes('email'), 'Should contain email module');
console.assert(html.includes('<pre'), 'Should have pre tag for code');
console.assert(html.includes('Approve'), 'Should have Approve button');
console.assert(html.includes('Deny'), 'Should have Deny button');
console.assert(html.includes('approve/respond'), 'Should reference respond endpoint');
console.log('Step 5 PASSED');
"
```

**Success Criteria**:
- HTML contains script code display, module checkboxes, approve/deny buttons
- HTML includes fetch calls to `/approve/respond`
- Self-contained (no external dependencies)

---

### Step 6: Add Approval Endpoints to Proxy (`server/app.js`)

**Goal**: Add four new endpoints to the Express proxy for the approval workflow.

**What to Build**:
- Import `approvalStore` and `generateApprovalHTML` at the top of `server/app.js`
- Import `moduleClassification` for module validation
- Add these endpoints (after existing `/health` and before `/run`):

  1. **`POST /approve/request`** — Receives `{ code, writeModules }`, creates an approval record, returns `{ requestId, expiresAt }`.
  2. **`GET /approve/ui`** — Receives `?requestId=XXX`, looks up the approval record, returns the HTML approval page via `generateApprovalHTML()`. Returns 404 if not found or expired.
  3. **`POST /approve/respond`** — Receives `{ requestId, approved, approvedModules }`, updates the approval record status. Returns `{ success: true }`.
  4. **`GET /approve/status`** — Receives `?requestId=XXX`, returns `{ status, approvedModules? }` for CLI polling.

- Add validation to the existing `POST /run` endpoint: if the request includes an `approvalToken` field, validate it via `consumeApproval()` before execution. If the request includes `modules` that contain write-capable modules but no `approvalToken`, and the profile mode is `"read-only"`, reject with 403.
- Run `cleanupExpired()` periodically (e.g., every 60 seconds via `setInterval`).

**Verification (AI Agent Runs)**:
```bash
# Verify the proxy starts without errors and the new endpoints are registered
node -e "
const { app } = require('./server/app');
const routes = [];
app._router.stack.forEach(r => { if (r.route) routes.push(r.route.path); });
console.assert(routes.includes('/approve/request'), 'Should have /approve/request');
console.assert(routes.includes('/approve/ui'), 'Should have /approve/ui');
console.assert(routes.includes('/approve/respond'), 'Should have /approve/respond');
console.assert(routes.includes('/approve/status'), 'Should have /approve/status');
console.assert(routes.includes('/health'), 'Should still have /health');
console.assert(routes.includes('/run'), 'Should still have /run');
console.log('Step 6 PASSED');
"
```

**Success Criteria**:
- All four approval endpoints registered and respond correctly
- Existing `/health`, `/run`, `/logs` endpoints still work
- Expired approvals return appropriate errors
- Cleanup interval runs without errors

---

### Step 7: Update CLI Run Command (`src/commands/run.js`)

**Goal**: Add mode awareness, write-module detection, and the approval flow to the run command.

**What to Build**:
- Import `moduleClassification` (for `detectWriteModules`, `READ_SAFE_MODULES`)
- Import `profileStore` (for `getProfileMode`)
- Import `crypto` (for script hash computation)
- Import `child_process` (for `exec` to open browser)
- Modify `runCommand(options)` to accept `options.mode` and `options.terminalApprove` from CLI flags
- New flow in `runCommand`:
  1. Read the script code (existing logic)
  2. Determine effective mode: `options.mode || getProfileMode(activeProfile)` — default `"read-only"`
  3. If mode is `"read-write"`: send with all modules (existing behavior, no `modules` field — RESTlet defaults to all)
  4. If mode is `"read-only"`:
     a. Call `detectWriteModules(codeToExecute)` to get needed write modules
     b. If no write modules detected: send with `modules: READ_SAFE_MODULES`
     c. If write modules detected:
        - POST to `${PROXY_URL}/approve/request` with `{ code, writeModules }`
        - Open browser to `${PROXY_URL}/approve/ui?requestId=XXX` (or use terminal prompts if `--terminal-approve`)
        - Poll `${PROXY_URL}/approve/status?requestId=XXX` every 1s for up to 5 minutes
        - On approval: send to `/run` with `modules: [...READ_SAFE_MODULES, ...approvedModules]` and `approvalToken: requestId`
        - On denial: exit with `PERMISSION_DENIED` (code 7)
        - On timeout: exit with `PERMISSION_DENIED` with timeout message
- Add helper functions:
  - `openBrowser(url)` — platform-specific browser opening via `child_process.exec()`
  - `pollApprovalStatus(requestId, timeoutMs)` — axios GET polling loop
  - `requestApproval(code, writeModules)` — axios POST to `/approve/request`
  - `terminalApproval(scriptCode, writeModules)` — uses `prompts` library for terminal-based approval as fallback

**Verification (AI Agent Runs)**:
```bash
# Verify the module can be required and the new functions exist
node -e "
const runCommand = require('./src/commands/run');
console.assert(typeof runCommand === 'function', 'runCommand should be a function');
console.log('Step 7 PASSED - module loads');
"
```

**Success Criteria**:
- Read-only scripts execute with only read-safe modules (no approval flow triggered)
- Write-capable scripts trigger the approval flow
- Approved scripts execute with the approved module set
- Denied scripts exit with code 7
- `--terminal-approve` flag uses prompts instead of browser
- Mode override via `--mode read-write` skips filtering entirely

---

### Step 8: Add CLI Flags to Commander (`src/cli.js`)

**Goal**: Register `--mode` and `--terminal-approve` options on the `run` command.

**What to Build**:
- Add to the `run` command definition (line 28-33):
  - `.option('-m, --mode <mode>', 'Execution mode: read-only (default) or read-write')`
  - `.option('--terminal-approve', 'Use terminal prompts instead of browser for write approval')`

**Verification (AI Agent Runs)**:
```bash
node -e "
const { Command } = require('commander');
// Re-parse the CLI module to check options are registered
const cliSource = require('fs').readFileSync('./src/cli.js', 'utf8');
console.assert(cliSource.includes('--mode'), 'Should have --mode option');
console.assert(cliSource.includes('--terminal-approve'), 'Should have --terminal-approve option');
console.log('Step 8 PASSED');
"
```

**Success Criteria**:
- `ns-gm run --mode read-write --file x.js` accepted
- `ns-gm run --terminal-approve --file x.js` accepted
- Existing flags (`--code`, `--file`) unchanged

---

### Step 9: Update Help System (`src/commands/help.js`)

**Goal**: Document the new flags, exit code, and approval workflow in the help output.

**What to Build**:
- Add `--mode <mode>` and `--terminal-approve` to the `run` command's `options` array in `helpData`
- Add clarifications about the approval flow to the `run` command
- Add exit code `"7": "PERMISSION_DENIED - Write-capable script run without approval"` to `helpData.exitCodes`
- Add `mode` field documentation to `setup` and `setup:ci` command clarifications

**Verification (AI Agent Runs)**:
```bash
node -e "
const helpSource = require('fs').readFileSync('./src/commands/help.js', 'utf8');
console.assert(helpSource.includes('PERMISSION_DENIED'), 'Help should mention PERMISSION_DENIED');
console.assert(helpSource.includes('--mode'), 'Help should mention --mode flag');
console.assert(helpSource.includes('--terminal-approve'), 'Help should mention --terminal-approve');
console.log('Step 9 PASSED');
"
```

**Success Criteria**:
- `ns-gm help run` shows `--mode` and `--terminal-approve` options
- Exit code 7 documented
- Approval flow explained in clarifications

---

### Step 10: Update Documentation (`CLAUDE.md`, `Blueprints/product.md`)

**Goal**: Update the AI agent guidance and product documentation to reflect the new permission model.

**What to Build**:
- **`CLAUDE.md`**:
  - Add section on "Permission Model" describing read-only default, module classification, approval flow
  - Update "Command Surface" to show new `run` options (`--mode`, `--terminal-approve`)
  - Add `server/approvalStore.js`, `server/approvalPage.js`, `src/utils/moduleClassification.js` to "Active Files To Know"
  - Note the approval endpoints (`/approve/*`) in the architecture section
- **`Blueprints/product.md`**:
  - Remove/update line 71 non-goal about "No advanced profile permissions model" since this ticket implements it
  - Add a section describing the implemented permission model

**Verification (AI Agent Runs)**:
```bash
node -e "
const claude = require('fs').readFileSync('./CLAUDE.md', 'utf8');
console.assert(claude.includes('moduleClassification'), 'CLAUDE.md should mention moduleClassification');
console.assert(claude.includes('approvalStore'), 'CLAUDE.md should mention approvalStore');
console.assert(claude.includes('read-only'), 'CLAUDE.md should mention read-only mode');
console.log('Step 10 PASSED');
"
```

**Success Criteria**:
- CLAUDE.md reflects the new permission model and new files
- Blueprints/product.md non-goal updated

---

### Step 11: End-to-End Verification

**Goal**: Verify the complete flow works end-to-end through manual/agent testing.

**What to Build**: Nothing — this is a verification-only step.

**Verification (AI Agent Runs)**:

1. **Verify module loads without errors**:
```bash
node -e "
require('./src/utils/moduleClassification');
require('./server/approvalStore');
require('./server/approvalPage');
require('./src/utils/exitCodes');
require('./src/utils/profileStore');
require('./server/app');
require('./src/commands/run');
console.log('All modules load successfully');
"
```

2. **Verify approval flow lifecycle in isolation**:
```bash
node -e "
const store = require('./server/approvalStore');
const { generateApprovalHTML } = require('./server/approvalPage');
const { detectWriteModules, READ_SAFE_MODULES, WRITE_CAPABLE_MODULES, ALL_MODULES } = require('./src/utils/moduleClassification');

// Test: read-only script detection
const readScript = 'return search.create({type: \"customer\"}).run().getRange({start:0,end:10});';
const readWriteModules = detectWriteModules(readScript);
console.assert(readWriteModules.length === 0, 'Read-only script should need no write modules');

// Test: write script detection
const writeScript = 'var rec = record.load({type: \"customer\", id: 1}); rec.setValue({fieldId: \"companyname\", value: \"Test\"}); rec.save(); return rec.id;';
const writeModules = detectWriteModules(writeScript);
console.assert(writeModules.includes('record'), 'Should detect record module');

// Test: full approval lifecycle
const { requestId } = store.createApproval(writeScript, writeModules);
const approval = store.getApproval(requestId);
const html = generateApprovalHTML(approval, 9292);
console.assert(html.includes(requestId), 'HTML should contain requestId');
store.respondToApproval(requestId, true, ['record']);
const approved = store.getApproval(requestId);
console.assert(approved.status === 'approved', 'Should be approved');
const consumedModules = store.consumeApproval(requestId, approved.scriptHash);
console.assert(consumedModules.includes('record'), 'Should get record back');

console.log('E2E verification PASSED');
"
```

3. **Verify proxy starts with all endpoints**:
```bash
node -e "
const { app } = require('./server/app');
const routes = [];
app._router.stack.forEach(r => { if (r.route) routes.push(r.route.method + ' ' + r.route.path); });
const required = ['/health', '/run', '/logs', '/approve/request', '/approve/ui', '/approve/respond', '/approve/status'];
required.forEach(r => {
  const found = routes.some(route => route.includes(r));
  console.assert(found, 'Missing route: ' + r);
});
console.log('All proxy routes registered');
"
```

**Success Criteria**:
- All modules load without errors
- Module classification correctly categorizes scripts
- Approval store lifecycle (create → approve → consume) works
- Approval HTML generates correctly
- Proxy has all required endpoints

## Success Metrics

| # | Metric | How to Verify |
|---|--------|---------------|
| 1 | Read-only default: `ns-gm run` sends only read-safe modules | Step 7 verification; `run.js` constructs `modules: READ_SAFE_MODULES` array |
| 2 | Write detection works | Step 1 verification; `detectWriteModules()` returns correct modules |
| 3 | Approval UI opens in browser | Step 5, 6 verification; HTML generated; `/approve/ui` serves it |
| 4 | Human can approve/deny with granular toggles | Step 5 verification; checkboxes in HTML page |
| 5 | Single-use tokens | Step 4 verification; double-consume throws |
| 6 | No persistent state change after execution | Step 4 verification; tokens are in-memory; profile mode untouched |
| 7 | PERMISSION_DENIED exit code on denial | Step 2, 7 verification; exit code 7 returned |
| 8 | Zero new npm dependencies | Check `package.json` unchanged |
| 9 | RESTlet unchanged | `ns_gm_restlet.js` not modified |

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| `ticket.md` (ns-gm) | Primary requirements and scope | Temporary per-script write permissions; human approval via pop-up; ns-gm only; helix-ns-server reference only |
| `scout/reference-map.json` (ns-gm) | File map, facts, unknowns | RESTlet supports `modules` param (line 63); proxy forwards it (line 37); CLI never sends it (line 93); 24 modules |
| `scout/scout-summary.md` (ns-gm) | Architecture layers and boundary analysis | Three enforcement layers; `prompts` available; Express proxy already running; product.md non-goal reversal |
| `diagnosis/apl.json` (ns-gm) | Resolved questions with evidence | Module classification; browser UI via Express; in-memory tokens; `require()` bypass risk; existing module filtering plumbing |
| `diagnosis/diagnosis-statement.md` (ns-gm) | Root cause and proposed approach | CLI never sends `modules` is root cause; 4-component architecture; approval flow design |
| `diagnosis/repo-change-scope.json` (ns-gm) | Confirmed allowed repos | Only ns-gm changes; helix-ns-server is reference-only |
| `product/product.md` (ns-gm) | MVP features, out-of-scope, success criteria | 8 success criteria; essential features list; explicitly out-of-scope items |
| `tech-research/tech-research.md` (ns-gm) | Architecture decision, API design, risks | Option C chosen; endpoint contracts; token design; cross-platform browser opening; performance expectations |
| `tech-research/apl.json` (ns-gm) | Resolved technical questions | `require()` bypass confirmed; browser via child_process; polling over SSE; regex over AST; zero new deps |
| `src/commands/run.js` (repo) | Current CLI execution flow | Line 93-94: only sends `{ code }`, never `modules`; axios.post to proxy |
| `server/app.js` (repo) | Current proxy endpoints | Line 37: destructures `modules`; Line 53: forwards to RESTlet; Express on 9292 |
| `ns_gm_restlet.js` (repo) | RESTlet module filtering behavior | Line 63: `modules` param with all-module fallback; Lines 114-125: selective injection |
| `src/utils/exitCodes.js` (repo) | Exit code model | Codes 0-6 defined; needs code 7 for PERMISSION_DENIED |
| `src/utils/profileStore.js` (repo) | Profile shape | Lines 59-66: no mode field; needs `mode` addition |
| `src/cli.js` (repo) | Command registration | Lines 28-33: run command definition; needs `--mode` and `--terminal-approve` |
| `src/commands/help.js` (repo) | Help data structure | helpData object; needs new options, exit code, clarifications |
| `config.json` (repo) | Proxy config | Port 9292; no permission config needed |
| `package.json` (repo) | Dependencies and engine | Node >=24; express, axios, commander, prompts, cors all available; no new deps needed |
