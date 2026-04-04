# Implementation Plan: Script-Scoped Permission Elevation for ns-gm

## Overview

Add a permission elevation flow to ns-gm so that when an agent (Claude Code) submits a SuiteScript containing write operations, a human must approve the execution before ns-gm temporarily switches to a write-capable OAuth profile for exactly one run, then immediately reverts to read-only. All changes are in the CLI layer only — zero proxy or RESTlet changes.

The solution has four parts: (1) a write-operation detector module, (2) elevated profile support in the profile store, (3) approval gating in the run command, and (4) elevated profile registration in setup.

## Implementation Principles

- **Safe by default**: Read-only remains the permanent default. Write access requires explicit human approval every time.
- **Single execution, not single session**: Elevation is bounded to one `ns-gm run` call, enforced by a try/finally block.
- **Leverage existing infrastructure**: The profile system already supports multi-alias switching. Build on it, don't replace it.
- **Zero new dependencies**: The `prompts` library, `commander`, `axios` are all existing deps. No new npm packages.
- **Zero proxy/RESTlet changes**: The proxy reads the active profile per request — switching aliases between CLI invocations changes the OAuth token without touching the proxy.

## Implementation Steps Summary

| Step | Goal | Deliverable |
|------|------|-------------|
| 1 | Add write-operation detection utility | `src/utils/writeDetector.js` (new file) |
| 2 | Add ELEVATION_DENIED exit code | `src/utils/exitCodes.js` (modified) |
| 3 | Add elevated alias support to profile store | `src/utils/profileStore.js` (modified) |
| 4 | Add approval gating to the run command | `src/commands/run.js` (modified) |
| 5 | Add elevated profile registration to setup | `src/commands/setup.js` (modified) |

## Detailed Implementation Steps

### Step 1: Add Write-Operation Detection Utility

**Goal**: Create a module that scans a code string for known NetSuite write method patterns and returns whether writes are detected plus which patterns matched.

**What to Build**:
- New file `src/utils/writeDetector.js`
- Export `detectWriteOperations(code)` returning `{ hasWrites: boolean, detected: string[] }`
- Regex patterns for the known write methods:
  - `record\.(save|delete|submitFields|create)\b`
  - `file\.(create|delete|write|append)\b`
  - `transaction\.(save|create|delete)\b`
  - `task\.(create|submit)\b`
  - `workflow\.(initiate|trigger)\b`
  - `email\.(send)\b`
  - `redirect\.(save|toRecord|toTaskLink)\b`
- Each match records the matched text for display to the approver
- Deduplicate matches so the same pattern isn't listed twice

**Verification (AI Agent Runs)**:
1. Create a temp file with test code containing `record.save` and `file.create` — call `detectWriteOperations()` and confirm `hasWrites === true` and `detected` contains both patterns.
2. Create a temp file with read-only code (`search.create`, `query.runSuiteQL`) — confirm `hasWrites === false`.
3. Edge case: code with `record.save` in a string literal or comment — confirm it still matches (conservative recall is intentional).

**Success Criteria**:
- `detectWriteOperations()` returns correct boolean and detected list for write-containing code
- Returns `hasWrites: false` for read-only code
- Module is importable with `require('../utils/writeDetector')`

### Step 2: Add ELEVATION_DENIED Exit Code

**Goal**: Add exit code 7 for elevation denial so agents get a machine-readable signal distinct from execution or config errors.

**What to Build**:
- In `src/utils/exitCodes.js`, add `ELEVATION_DENIED: 7` to `EXIT_CODES`
- No changes to `exitWithCode()` — it already handles any numeric code

**Verification (AI Agent Runs)**:
1. Run `node -e "const {EXIT_CODES} = require('./src/utils/exitCodes'); console.log(EXIT_CODES.ELEVATION_DENIED)"` — confirm output is `7`.
2. Confirm existing codes (0-6) are unchanged.

**Success Criteria**:
- `EXIT_CODES.ELEVATION_DENIED === 7`
- All existing exit codes preserved

### Step 3: Add Elevated Alias Support to Profile Store

**Goal**: Extend the credentials store to track which alias is the elevated (write-capable) profile, with backward-compatible storage.

**What to Build**:
- In `src/utils/profileStore.js`:
  - Update `normalizeStore()` to preserve an optional `elevatedAlias` field (currently it strips unknown keys — only preserves `activeAlias` and `profiles`)
  - Add `getElevatedAlias()` — reads `elevatedAlias` from the store, returns `null` if not set
  - Add `setElevatedAlias(alias)` — validates the alias exists in profiles, writes `elevatedAlias` to the store
  - Add `clearElevatedAlias()` — removes the `elevatedAlias` field (sets to `null`)
  - Export all new functions

**Verification (AI Agent Runs)**:
1. Run `node -e "const ps = require('./src/utils/profileStore'); console.log(typeof ps.getElevatedAlias, typeof ps.setElevatedAlias)"` — confirm both are `function`.
2. Create a test credentials.json with two profiles and `elevatedAlias` set — confirm `getElevatedAlias()` returns the correct alias.
3. Call `setElevatedAlias()` with a non-existent alias — confirm it throws.
4. Verify backward compatibility: load a store without `elevatedAlias` — confirm `getElevatedAlias()` returns `null` and no errors.

**Success Criteria**:
- `getElevatedAlias()` returns the elevated alias or `null`
- `setElevatedAlias(alias)` persists the field and validates the alias exists
- `normalizeStore()` preserves `elevatedAlias` from existing files
- Old credentials files (without `elevatedAlias`) load without error

### Step 4: Add Approval Gating to the Run Command

**Goal**: When `ns-gm run` receives code containing write operations, block execution, show the detected writes and full code to a human, and only proceed (with temporary elevated profile) if approved.

**What to Build**:
- In `src/commands/run.js`:
  - Import `detectWriteOperations` from `../utils/writeDetector`
  - Import `getElevatedAlias`, `setActiveAlias`, `getActiveProfile` from `../utils/profileStore`
  - Import `prompts` library
  - After reading the code string (line ~82, after the `if (file)` block), insert the approval gate:
    1. Call `detectWriteOperations(codeToExecute)`
    2. If `hasWrites === false` → proceed normally (no behavior change)
    3. If `hasWrites === true`:
       a. Check `getElevatedAlias()` — if null, `exitWithCode(CONFIG_ERROR, "...No elevated profile configured. Run: ns-gm setup...")`
       b. Show detected write operations in the console
       c. Show script preview (first 30 lines, with "..." if longer)
       d. Use `prompts({ type: 'confirm', name: 'approved', message: 'Approve write execution?' })`
       e. If not approved → `exitWithCode(ELEVATION_DENIED, "...Human denied elevation request")`
       f. If approved:
          - Save `originalAlias = getActiveProfile().alias`
          - Call `setActiveAlias(elevatedAlias)`
          - Wrap the existing HTTP POST + display in a `try {} finally { setActiveAlias(originalAlias) }`
          - Also add `process.on('exit')` handler to revert as extra safety
  - No changes to the proxy call itself, `displayResults()`, or error handling for non-write scripts

**Verification (AI Agent Runs)**:
1. Read the modified `run.js` — confirm `detectWriteOperations` is called before the proxy POST.
2. Trace the approval flow: confirm that `setActiveAlias(elevatedAlias)` is called before POST and `setActiveAlias(originalAlias)` is in the finally block.
3. Confirm that non-write code (no detected writes) bypasses the approval gate entirely.
4. Confirm the `CONFIG_ERROR` path when no elevated profile is configured.

**Success Criteria**:
- Non-write scripts execute exactly as before (zero behavior change)
- Write-containing scripts trigger the approval prompt
- Approval switches profile, executes, reverts in finally
- Denial exits with code 7
- Missing elevated profile exits with CONFIG_ERROR

### Step 5: Add Elevated Profile Registration to Setup

**Goal**: When creating a new profile alias via `ns-gm setup`, offer the option to mark it as the elevated (write-capable) profile.

**What to Build**:
- In `src/commands/setup.js`:
  - Import `getElevatedAlias`, `setElevatedAlias` from `../utils/profileStore`
  - After `createNewAlias()` completes (line ~123, after "Saved profile..."), add a prompt:
    - `prompts({ type: 'confirm', name: 'isElevated', message: 'Set this as the write-capable (elevated) profile?' })`
    - If yes, call `setElevatedAlias(alias)` and print confirmation
  - In `showConfig()`, display the current elevated alias (or "(not set)")
  - In `selectAlias()`, optionally annotate the elevated alias in the choices list

**Verification (AI Agent Runs)**:
1. Read the modified `setup.js` — confirm the elevated prompt appears after profile creation.
2. Confirm `showConfig()` displays the elevated alias.
3. Confirm that declining the elevated prompt leaves `elevatedAlias` unchanged.

**Success Criteria**:
- New profiles can be marked as elevated during setup
- `ns-gm setup --show` displays the elevated alias
- Existing setup flow (selecting an alias, non-elevated creation) works unchanged

## Verification Plan

### Pre-conditions

| Dependency | Status | Source/Evidence | Affects Checks |
|------------|--------|-----------------|----------------|
| Node.js >= 24 installed | available | `package.json` engines field | CHK-01 through CHK-08 |
| ns-gm npm dependencies installed (`npm install`) | unknown | `package.json` dependencies | CHK-01 through CHK-08 |
| `prompts` library available (existing dep) | available | `package.json` line 44 | CHK-04, CHK-06 |
| Test credentials.json with two profiles (read-only + elevated) | unknown — must be created for verification | User must configure two NetSuite Integrations | CHK-06, CHK-07 |
| Proxy server running (`ns-gm init`) | unknown — must be started for runtime checks | Dev machine | CHK-06, CHK-07 |
| NetSuite RESTlet deployed and reachable | unknown — requires production/sandbox NetSuite | External service | CHK-06, CHK-07 |

### Required Checks

**[CHK-01]** Verify writeDetector module loads and detects write operations
- Action: Run `node -e "const d = require('./src/utils/writeDetector'); const r = d.detectWriteOperations('record.save();'); console.log(JSON.stringify(r))"` from the ns-gm directory
- Expected Outcome: Output contains `{"hasWrites":true,"detected":["record.save"]}`
- Required Evidence: Command output showing correct detection

**[CHK-02]** Verify writeDetector returns false for read-only code
- Action: Run `node -e "const d = require('./src/utils/writeDetector'); const r = d.detectWriteOperations('search.create({type:\"customer\"})'); console.log(JSON.stringify(r))"` from the ns-gm directory
- Expected Outcome: Output contains `{"hasWrites":false,"detected":[]}`
- Required Evidence: Command output showing no detections

**[CHK-03]** Verify ELEVATION_DENIED exit code is 7
- Action: Run `node -e "const {EXIT_CODES} = require('./src/utils/exitCodes'); console.log(EXIT_CODES.ELEVATION_DENIED)"`
- Expected Outcome: Output is `7`
- Required Evidence: Command output `7`

**[CHK-04]** Verify profileStore exports new elevated alias functions
- Action: Run `node -e "const ps = require('./src/utils/profileStore'); console.log(typeof ps.getElevatedAlias, typeof ps.setElevatedAlias, typeof ps.clearElevatedAlias)"`
- Expected Outcome: Output is `function function function`
- Required Evidence: Command output showing all three are functions

**[CHK-05]** Verify profileStore backward compatibility — loading store without elevatedAlias
- Action: Run a Node script that creates a minimal credentials.json without `elevatedAlias`, loads it via `loadStore()`, and calls `getElevatedAlias()` — confirm returns `null` without errors
- Expected Outcome: `getElevatedAlias()` returns `null`, no exceptions thrown
- Required Evidence: Command output showing `null` and no error stack traces

**[CHK-06]** Verify approval flow blocks write code and approves with profile switch
- Action: With proxy running and two profiles configured (read-only active, elevated registered), run `ns-gm run --code "return record.save({type:'customer', id:1})"` and approve the prompt. Observe that the profile switches to elevated, executes, and reverts.
- Expected Outcome: The approval prompt appears showing detected write operations. On approval, the script executes with the elevated profile's OAuth token. After execution, the active profile reverts to read-only.
- Required Evidence: Terminal output showing approval prompt, detected writes, successful execution result, and confirmation that `~/.ns-gm/credentials.json` activeAlias is back to the read-only profile after completion

**[CHK-07]** Verify denial blocks execution with exit code 7
- Action: With proxy running and two profiles configured, run `ns-gm run --code "record.delete({type:'customer',id:1})"` and deny the prompt
- Expected Outcome: Process exits with code 7, message indicates elevation was denied
- Required Evidence: Terminal output showing denial message and exit code 7

**[CHK-08]** Verify non-write scripts bypass approval gate
- Action: Run `ns-gm run --code "return search.create({type:'customer', filters:[], columns:[]}).run().getRange({start:0,end:1})"` with proxy running
- Expected Outcome: Code executes immediately with no approval prompt, using the active (read-only) profile
- Required Evidence: Terminal output showing direct execution with no prompt, successful result from NetSuite

**[CHK-09]** Verify setup shows and sets elevated alias
- Action: Run `ns-gm setup --show` after configuring an elevated profile
- Expected Outcome: Output includes the elevated alias name (or "(not set)" if none configured)
- Required Evidence: Terminal output from `--show` displaying the elevated alias field

**[CHK-10]** Verify no elevated profile configured produces CONFIG_ERROR
- Action: With only one profile (no elevatedAlias set), run `ns-gm run --code "record.save({type:'customer',id:1})"`
- Expected Outcome: Process exits with code 2 (CONFIG_ERROR), message tells user to run `ns-gm setup`
- Required Evidence: Terminal output showing CONFIG_ERROR exit and setup guidance message

## Success Metrics

- Zero behavior change for non-write scripts: `ns-gm run` with read-only code works exactly as before
- Write-containing scripts always require human approval before execution
- Elevation is bounded to exactly one execution — `credentials.json` activeAlias is reverted after every approved run
- Denial produces a machine-readable exit code (7) that agents can catch
- No new npm dependencies are added
- No changes to `server/app.js` or `ns_gm_restlet.js`

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md | Problem statement and requirements | Agent needs per-script write permission with human approval; no fixed solution imposed |
| scout/scout-summary.md | Architecture overview and file mapping | Three-layer arch (CLI → proxy → RESTlet); profile system is the natural lever; zero permission enforcement today |
| scout/reference-map.json | File-level evidence | 10 confirmed facts about RESTlet, proxy, auth, profiles |
| diagnosis/diagnosis-statement.md | Root cause and solution approach | Binary OAuth role model is the root cause; dual-profile single-execution elevation recommended |
| diagnosis/apl.json | Architectural answers | Profile system supports multi-alias; RESTlet is permission-agnostic; regex detection feasible |
| product/product.md | Feature scope and success criteria | 5 MVP features; approval gate is interactive CLI; elevated profile setup guidance |
| tech-research/tech-research.md | Technical decisions and implementation details | CLI-gated elevation chosen; regex over AST; try/finally for reversion; no new deps |
| tech-research/apl.json | Detailed technical Q&A | Approval gate in CLI (run.js); regex detection; exit code 7; elevated alias in credentials.json |
| src/commands/run.js | Current execution flow | Code read as string before POST — ideal intercept point for approval gate |
| src/utils/profileStore.js | Profile switching mechanism | `setActiveAlias()` writes credentials.json; `normalizeStore()` needs update to preserve `elevatedAlias` |
| src/utils/exitCodes.js | Exit code convention | Codes 0-6 used; code 7 available for ELEVATION_DENIED |
| src/commands/setup.js | Interactive prompts pattern | Uses `prompts` library with select/text/confirm types; can extend for elevated profile registration |
| server/app.js | Proxy request handling | `requireActiveProfile()` reads active alias at request time — no proxy changes needed |
| server/auth.js | Token caching model | Token cache keyed by profile fields — no cross-profile collision during switching |
| CLAUDE.md | Architecture and credential model | Confirms profile store shape, command surface, OAuth flow |
| repo-guidance.json | Repo scope | ns-gm is target; helix-ns-server is context only |
