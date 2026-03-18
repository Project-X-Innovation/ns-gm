# Product: Temporary Per-Script Write Permissions for ns-gm

## Problem Statement

ns-gm (NetSuite God Mode) is used by AI agents (Claude Code) to research, diagnose, and report on production NetSuite data in **read-only mode**. When an agent identifies a fix and produces a script to resolve it, the agent cannot execute that script because ns-gm has no mechanism to temporarily grant write access. The human operator must then manually apply the fix through the NetSuite UI, negating the efficiency gains the agent provides.

Today, every `ns-gm run` invocation injects all 24 N/* modules (including write-capable ones like `N/record`, `N/transaction`, `N/email`) with no distinction between read and write operations. There is no mode concept, no permission gating, and no approval workflow anywhere in the codebase.

## Product Vision

Enable AI agents to operate safely in read-only mode by default while allowing a human to grant temporary, single-script write permissions through a visual approval interface. The human stays in control; the agent stays productive.

## Users

| User | Context |
|------|---------|
| **AI Agent (Claude Code)** | Primary consumer of ns-gm. Runs scripts against production NetSuite for research/diagnosis. Occasionally needs to execute a write script to apply a fix. |
| **Human Operator** | Supervises the agent. Must approve any write operation before it runs. Needs to see exactly what the script does and which permissions it requires. |

## Use Cases

1. **Default read-only execution** — Agent runs diagnostic scripts freely. Write-capable modules are not available. No interruptions.
2. **Write permission request** — Agent produces a fix script, detects it needs write modules, and initiates an approval request.
3. **Human review and approval** — A window opens showing the script code and the specific write permissions needed. Human can approve or deny.
4. **One-time write execution** — On approval, the script runs once with the approved permissions. Permissions are immediately revoked afterward.
5. **Denial** — Human denies the request. Agent receives a clear permission-denied signal and can report back or adjust.

## Core Workflow

1. Agent runs `ns-gm run` with a script (default: read-only mode).
2. ns-gm detects the script references write-capable modules.
3. ns-gm opens a visual approval window showing:
   - The full script code
   - The specific write permissions required (e.g., `N/record`, `N/email`)
4. Human reviews, toggles individual permissions, and approves or denies.
5. On approval: script executes once with approved modules only. Approval is consumed (single-use).
6. On denial: script does not execute. CLI returns a permission-denied exit code.
7. Subsequent `ns-gm run` calls remain in read-only mode. No permissions persist.

## Essential Features (MVP)

- **Read-only default mode**: `ns-gm run` sends only read-safe modules to the RESTlet. Write-capable modules are withheld.
- **Module classification**: A defined split of the 24 N/* modules into read-safe and write-capable categories.
- **Write-need detection**: Static analysis of script code to determine which write-capable modules are referenced.
- **Approval UI**: A visual interface (browser-based window served by the local Express proxy) displaying the script and required write permissions for human review.
- **Single-use approval tokens**: Approval is scoped to one specific script + module set. Tokens are in-memory only, never persisted, and deleted after use.
- **Permission-denied exit code**: A distinct CLI exit code when a write-capable script is run without approval.
- **Profile mode field**: An optional `mode` field on credential profiles (default: `read-only`) to persist the default behavior per profile.

## Features Explicitly Out of Scope (MVP)

- Persistent read-write mode (always-on write access for a profile).
- Automatic script execution without human approval.
- Undo/rollback of executed write operations.
- Multi-script batch approval (each script requires its own approval).
- Remote/network-based approval (approval is local only).
- Changes to helix-ns-server (reference only; no modifications).
- Changes to the NetSuite RESTlet deployment model (single RESTlet serves both modes).
- Granular operation-level filtering within a module (e.g., allowing `record.load()` but blocking `record.save()`).

## Success Criteria

| # | Criterion |
|---|-----------|
| 1 | `ns-gm run` in default mode restricts execution to read-safe modules only. |
| 2 | When a script needs write modules, ns-gm detects this and initiates the approval flow instead of failing silently or executing. |
| 3 | A browser-based approval window opens showing the script code and the specific write permissions requested. |
| 4 | Human can approve or deny individual write permissions through the UI. |
| 5 | On approval, the script executes once with only the approved modules. |
| 6 | After execution, write permissions are immediately revoked — no persistent state change. |
| 7 | Subsequent `ns-gm run` commands remain in read-only mode without further configuration. |
| 8 | A `PERMISSION_DENIED` exit code is returned when a write-capable script is run without approval. |

## Key Design Principles

- **Safe by default**: Read-only is the default. Write access requires explicit human action every time.
- **Temporary and scoped**: Write permissions last for exactly one script execution. They are never persisted to disk.
- **Transparent**: The human sees the full script and exact permissions before approving. No hidden escalation.
- **Minimal disruption**: Read-only scripts run without interruption. The approval flow only triggers when write modules are detected.
- **Leverage existing plumbing**: The RESTlet already supports a `modules` parameter for selective injection (`ns_gm_restlet.js:63`). The proxy already forwards it (`server/app.js:37`). The CLI just needs to use it.

## Scope & Constraints

- **Repo scope**: ns-gm only. helix-ns-server is reference/context only.
- **Existing infrastructure**: The Express proxy (`localhost:9292`) is already running and can serve approval pages. The `prompts` npm package is available as a terminal fallback.
- **NetSuite limitation**: NetSuite OAuth tokens are role-scoped, not per-script or per-operation. Granular enforcement must happen at the ns-gm layer (CLI + proxy + RESTlet module filtering), not at the NetSuite API level.
- **RESTlet module filtering exists but is unused**: The RESTlet accepts a `modules` parameter and only injects listed modules. The proxy passes it through. The CLI currently never sends it. This is the key enabler.
- **Product.md non-goal reversal**: `Blueprints/product.md` line 71 listed "No advanced profile permissions model in this phase" as a non-goal. This ticket explicitly changes that scope.

## Future Considerations

- Operation-level filtering within modules (e.g., allow `record.load` but block `record.save`).
- Persistent "trusted scripts" list for pre-approved repeat executions.
- Audit log of approved and executed write operations.
- Remote approval workflow (e.g., Slack notification + approval for team-based oversight).
- Integration with helix-ns-server for automated pipeline write approval.
- Undo/rollback support for write operations.

## Open Questions / Risks

| # | Question / Risk |
|---|----------------|
| 1 | **SuiteScript `require()` bypass**: Can code executed via `new Function()` use `require('N/record')` to load write modules that were withheld from injection? The RESTlet uses `@NModuleScope Public`. This is a defense-in-depth concern that needs investigation. |
| 2 | **Module classification edge cases**: `N/https` and `N/http` can make outbound POST requests (side effects) but are also used for read-only API calls. Should they be classified as write-capable or conditionally allowed? |
| 3 | **Browser availability**: The approval UI assumes a browser is available on the host machine. In headless/CI environments, a terminal-based fallback (via `prompts`) may be needed. |
| 4 | **Proxy restart clears tokens**: Since approval tokens are in-memory, a proxy restart during an approval flow would invalidate pending approvals. Is this acceptable, or does the proxy need token persistence? |
| 5 | **Script hash stability**: If the CLI hashes the script to scope the approval token, minor whitespace or comment changes would require re-approval. What level of script identity is appropriate? |
| 6 | **Second credential set**: Does the operator need a separate NetSuite Integration record with a write-capable role, or can the existing read-only role already perform writes (with module filtering being the only gate)? |

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| `ns-gm/.helix/.../ticket.md` | Primary problem statement and requirements | Need temporary per-script write permissions with human approval; work is ns-gm only; helix-ns-server is reference |
| `ns-gm/.helix/.../scout/reference-map.json` | File map with facts and unknowns | RESTlet already supports `modules` param (line 63); no mode concept exists; 24 modules injected by default |
| `ns-gm/.helix/.../scout/scout-summary.md` | Architecture summary and constraint analysis | Three-layer architecture; module filtering exists but unused; `prompts` available; product.md non-goal reversal |
| `ns-gm/.helix/.../diagnosis/diagnosis-statement.md` | Root cause analysis and proposed approach | CLI never sends `modules` (run.js:93-94); module filtering wired end-to-end but unused; browser-based approval via Express proxy |
| `ns-gm/.helix/.../diagnosis/apl.json` | Diagnosis Q&A with evidence | Detailed module classification; approval token lifecycle; bypass risk via `require()`; browser as approval UI |
| `ns-gm/.helix/.../diagnosis/repo-change-scope.json` | Repo change scope | Confirmed: changes scoped to ns-gm only; helix-ns-server is reference only |
