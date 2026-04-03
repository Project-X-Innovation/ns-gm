# Diagnosis: ns-gm give permissions for one script

## Problem Summary

NSGM (NetSuite God Mode) has no permission gating mechanism. The RESTlet (`ns_gm_restlet.js`) executes arbitrary SuiteScript via `new Function()` with all 23 N/* modules injected. The Express proxy (`server/app.js`) passes code through with zero validation. The CLI (`src/commands/run.js`) performs no pre-flight permission checks. Security relies entirely on the NetSuite OAuth role mapped to the Integration record.

When Claude Code diagnoses a problem and produces a script that needs write access (e.g., `record.save`, `transaction.create`), there is no mechanism to temporarily elevate permissions for that single execution. The human must manually reconfigure in the NetSuite UI, breaking the agent workflow.

## Root Cause Analysis

The root cause is architectural: **NSGM delegates all authorization to the NetSuite OAuth role and enforces nothing at its own layers.** This creates a binary permission model — either the role can write (always) or it cannot (never). There is no middle ground for "write for one script, read for everything else."

Three contributing factors:

1. **NetSuite's permission model is role-wide.** Permissions attach to the OAuth Integration → Role, not to individual script executions. "Per-script permissions" cannot be enforced by NetSuite; they must be enforced by NSGM.

2. **The RESTlet is permission-unaware.** It receives code as a string, injects all modules, and executes. It has no concept of "read-only mode" or module restrictions. The `modules` parameter in the request payload defaults to all 23 modules but could theoretically be restricted.

3. **No approval workflow exists.** The CLI and proxy have no concept of a "permission request" or "elevation request." The agent posts code, the proxy forwards it, the RESTlet runs it. There is no intercept point for human approval.

The solution lever is the **existing profile system** (`src/utils/profileStore.js`), which already supports multiple credential aliases with one active at a time. Each alias maps to a different OAuth Integration record (and thus a different role). A dual-profile approach — read-only (default) + elevated (on approval) — is the most natural fit.

## Evidence Summary

| Layer | Current State | Evidence |
|-------|--------------|----------|
| RESTlet | All 23 N/* modules injected, no filtering | `ns_gm_restlet.js` lines 71-96, 163-166 |
| Proxy | Pass-through, no auth or validation | `server/app.js` lines 35-56 |
| CLI | No pre-flight checks | `src/commands/run.js` lines 58-97 |
| Profile system | Multi-alias, one active | `src/utils/profileStore.js` lines 20-97 |
| Auth | Token cached per profile credentials | `server/auth.js` lines 46-53, 135-162 |
| NetSuite permissions | Role-wide, not script-scoped | RESTlet uses `new Function()` with role-determined access |
| helix-ns-server | Credential materialization pattern | `orchestrator/credentials.ts`, `deploy-phase.ts` |

## Recommended Solution Approach

**Dual-profile single-execution elevation with approval gate:**

1. **Two profiles in credentials.json**: `prod-readonly` (default active) and `prod-elevated` (write-capable role, dormant by default). Both point to the same RESTlet URL but different OAuth Integration records with different roles.

2. **Approval gate in the proxy or CLI**: Before executing code that requires elevation, the system:
   - Scans the code for write operations (record.save, record.delete, file.create, etc.)
   - Presents the detected write operations and the full code to a human approver
   - If approved, temporarily switches the active alias to the elevated profile
   - Executes the single request
   - Immediately reverts to the read-only profile

3. **Scoping enforcement**: The elevation is bounded to one `ns-gm run` call. The proxy could enforce this by tracking "elevation tokens" that expire after one use.

4. **helix-ns-server integration**: For the predeploy use case, helix-ns-server already manages ns-gm credentials per step/environment. The approval gate could be exposed as a CLI command (`ns-gm approve`) that helix-ns-server calls when it needs write access.

## Success Criteria

- Default NSGM behavior remains read-only with no changes to existing workflows
- Claude Code can request elevation and present code + detected write operations to a human
- Human can approve or deny via an interactive prompt or UI
- Elevation applies to exactly one script execution, then reverts automatically
- No permanent changes to the permission model or credentials
- The same RESTlet deployment works with both read-only and elevated OAuth tokens

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| `ns_gm_restlet.js` | Understand code execution boundary | `new Function()` with all 23 modules, no permission gating — the RESTlet is permission-unaware |
| `server/app.js` | Understand proxy layer | /run passes code through with zero validation; reads active profile per request |
| `server/auth.js` | Understand auth model | OAuth 2.0 M2M, token cached per profile; different profiles = different roles |
| `src/utils/profileStore.js` | Understand profile switching | Multi-alias store at ~/.ns-gm/credentials.json, one active — the key architectural lever |
| `src/commands/run.js` | Understand execution client | No pre-flight checks; code is a string that could be analyzed before posting |
| `package.json` | Understand dependencies | commander, express, jose, prompts, axios — no test framework |
| `CLAUDE.md` | Architecture overview | Confirms three-layer architecture and credential model |
| `scout/reference-map.json` | Prior analysis | 10 facts, 6 unknowns — confirmed all facts, resolved unknowns |
| `scout/scout-summary.md` | Prior scout analysis | Identified profile system as natural lever; confirmed RESTlet permission model |
| helix-ns-server `orchestrator/credentials.ts` | Credential pattern reference | Pre/post-product credential separation by step type |
| helix-ns-server `native-phase.ts` | ns-gm invocation pattern | setup:ci → init → env flow for headless credential setup |
