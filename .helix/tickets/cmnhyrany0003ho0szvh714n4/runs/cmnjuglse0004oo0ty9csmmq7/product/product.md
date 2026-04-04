# Product: ns-gm Script-Scoped Permission Elevation

## Problem Statement

NSGM runs in read-only mode against production NetSuite by default, which is correct and safe. But when Claude Code (or any agent) diagnoses a problem and produces a SuiteScript that needs write access — e.g., `record.save`, `record.delete`, `file.create` — there is no way to grant permission for that single execution without manually changing OAuth role configuration in the NetSuite UI. This breaks the agent workflow entirely: the human has to leave the tool, reconfigure credentials, run the script, then revert. The permission model is binary (role-wide read or role-wide write) with no middle ground.

## Product Vision

A permission elevation flow in NSGM where an agent can request temporary write access for one specific script execution, a human approves or denies through a simple interactive prompt, and permissions automatically revert after that single execution — without ever permanently changing the credential configuration.

## Users

- **Primary**: Claude Code (AI agent) — runs read-only NSGM by default, occasionally needs write access for a diagnosed fix
- **Secondary**: Human developer — receives approval requests, reviews the script and its write operations, approves or denies
- **Tertiary**: helix-ns-server — future consumer for predeploy scripts that require write access (e.g., sandbox-to-prod record ID resolution)

## Use Cases

1. **Agent diagnoses and proposes a fix**: Claude Code identifies a data issue, writes a SuiteScript to fix it, detects it needs write access, requests elevation, human approves, script runs once with write permissions, permissions revert.

2. **Human denies unsafe script**: Agent requests elevation for a script that would delete records. Human sees the detected write operations in the approval prompt and denies. Agent receives a clear denial error and can propose alternatives.

3. **Predeploy automation (future)**: helix-ns-server needs to run a write-capable script before deploying. It calls the elevation flow programmatically rather than interactively.

## Core Workflow

```
Agent runs ns-gm run --file fix.js
  → NSGM detects write operations in the code (record.save, etc.)
  → NSGM presents approval prompt to human: script contents + detected writes
  → Human approves
  → NSGM switches active profile to elevated (write-capable role)
  → Script executes once against NetSuite
  → NSGM immediately reverts active profile to read-only
  → Agent receives result
```

## Essential Features (MVP)

1. **Write-operation detection**: Before submitting code to the proxy, scan the script string for known write patterns (record.save, record.delete, record.submitFields, file.create, file.delete, transaction.save, task.create, workflow.initiate, etc.) and surface them to the approver.

2. **Approval prompt**: Interactive CLI prompt (using the existing `prompts` library) that shows the full script code, lists detected write operations, and asks the human to approve or deny.

3. **Single-execution profile switching**: On approval, switch the active alias to an elevated profile (write-capable OAuth role). Execute exactly one `ns-gm run` call. Immediately revert to the read-only profile. This leverages the existing `profileStore.setActiveAlias()` mechanism.

4. **Elevated profile setup guidance**: A new command or extension to `ns-gm setup` that helps the user configure a second profile alias mapped to a write-capable NetSuite Integration/role. The read-only profile stays as default.

5. **Safety guardrails**: If no elevated profile is configured, elevation request fails with a clear message. If the approval is denied, execution is blocked and the agent receives an explicit denial error. The elevated profile is never left active after execution.

## Features Explicitly Out of Scope (MVP)

- **Browser-based approval UI**: MVP uses CLI prompts only. A browser-based approval page can come later.
- **Time-based permission expiry**: MVP uses single-execution scope, not timed windows.
- **Code sandboxing or module restriction at the RESTlet level**: The RESTlet continues to execute code as-is. Permission gating is at the OAuth role level.
- **Audit logging of approvals**: Not in MVP. Can be added later for compliance.
- **Programmatic approval API for helix-ns-server**: MVP is interactive CLI only. Programmatic approval (non-interactive) is a future enhancement for the predeploy use case.
- **Per-method permission granularity**: MVP treats elevation as all-or-nothing for the execution. Finer-grained allowlisting (e.g., allow record.save but not file.delete) is a future consideration.

## Success Criteria

- Default NSGM behavior is unchanged — `ns-gm run` continues to work read-only with no extra prompts when the submitted code contains no write operations.
- When write operations are detected, the agent is blocked and a human approval prompt appears automatically.
- The human can see the full script and the specific write operations detected before deciding.
- After approval, the script executes exactly once with write permissions, then permissions revert.
- After denial, the agent receives a clear error and can adapt.
- No permanent changes to credentials or the permission model — the elevated profile is only activated transiently.
- The same RESTlet deployment works with both read-only and elevated OAuth tokens (no RESTlet redeployment needed).

## Key Design Principles

- **Safe by default**: Read-only is the permanent default. Write access requires explicit human approval every time.
- **Single execution, not single session**: Elevation is bounded to one script run, not a time window.
- **Leverage existing infrastructure**: The profile system (`profileStore.js`) already supports multi-alias switching. Build on it, don't replace it.
- **Transparency over convenience**: The approver sees the full code and all detected writes. No silent elevation.

## Scope & Constraints

- **NetSuite limitation**: Permissions are role-wide, not script-scoped. "Per-script permissions" must be enforced by NSGM (single-execution switching), not by NetSuite.
- **Two OAuth Integrations required**: The user must set up two NetSuite Integration records — one mapped to a read-only role, one to a write-capable role. NSGM cannot create these; it can only use them.
- **Interactive requirement**: The approval flow requires a human at a terminal. Fully autonomous elevation is intentionally not supported in MVP.
- **No test framework in ns-gm**: Package.json has no test script. Testing will be manual integration testing.

## Future Considerations

- **helix-ns-server integration**: Expose elevation as a programmatic API or CLI flag (`ns-gm run --elevated --approve-key <key>`) so helix-ns-server can invoke write-capable scripts during predeploy.
- **Browser approval UI**: Serve an approval page on the existing Express proxy port (9292) so the human can approve from a browser instead of the terminal.
- **Audit trail**: Log every elevation request, approval/denial decision, and script hash for compliance.
- **Module-level restriction**: Allow the RESTlet to receive a module allowlist parameter, restricting which N/* modules are available per execution.
- **Code analysis improvements**: Move from regex-based write detection to AST-based analysis for more accurate results.

## Open Questions / Risks

| ID | Question | Risk |
|----|----------|------|
| Q1 | Can the user actually create two separate NetSuite Integration records with different roles pointing to the same RESTlet? | High — if NetSuite doesn't allow this, the dual-profile approach fails. |
| Q2 | Does switching the active alias mid-session invalidate the cached OAuth token for the old profile, or does token caching interfere? | Medium — `server/auth.js` caches tokens by profile. Need to verify reversion works cleanly. |
| Q3 | What if the agent tries to sneak write operations into code that looks read-only? Regex detection is imperfect. | Medium — false negatives could allow unapproved writes. Mitigated by showing full code to approver. |
| Q4 | How does the approval prompt interact with agent automation? If Claude Code calls `ns-gm run` programmatically, who is the human at the terminal? | High — the agent workflow may not have a live terminal. May need a proxy-level approval mechanism. |
| Q5 | Should there be a `--force-readonly` flag to suppress the approval prompt entirely for CI/agent contexts that should never write? | Low — nice-to-have for safety. |

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md | Problem statement and user intent | User wants temporary per-script write permission with human approval; brainstorming, no fixed solution |
| scout/scout-summary.md | Architecture overview and codebase mapping | Three-layer architecture (CLI → proxy → RESTlet); profile system is the natural lever; zero permission enforcement today |
| scout/reference-map.json | File-level evidence and facts | 10 confirmed facts about RESTlet, proxy, auth, profile system; key files and their roles |
| diagnosis/diagnosis-statement.md | Root cause and recommended approach | Binary permission model is the root cause; dual-profile single-execution elevation is recommended |
| diagnosis/apl.json | Detailed answers to architectural questions | NetSuite permissions are role-wide; same RESTlet works with different tokens; static analysis can detect writes |
| CLAUDE.md | Architecture and credential model reference | Confirms profile store shape, command surface, and OAuth flow |
| repo-guidance.json | Repo scope confirmation | ns-gm is the target repo; helix-ns-server is context only |
