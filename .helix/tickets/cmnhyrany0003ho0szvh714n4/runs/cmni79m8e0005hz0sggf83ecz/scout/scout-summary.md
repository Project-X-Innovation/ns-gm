# Scout Summary: ns-gm give permissions for one script

## Problem

NSGM executes arbitrary SuiteScript through a RESTlet with no permission gating. The OAuth role determines what's possible, and the current production setup uses a read-only role for safety. When Claude Code (the agent user) diagnoses a problem and produces a script that needs write access, there is no mechanism to temporarily elevate permissions for that single script execution. The human must manually change configuration in the NetSuite UI, breaking the agent workflow.

The ticket asks for a solution where:
1. Agent runs in read-only mode by default
2. When a script needs elevated permissions, an approval flow is triggered
3. A human sees what permissions are needed and approves/denies
4. Elevated permissions apply only to that one script execution
5. Permissions revert immediately after

## Analysis Summary

NSGM's architecture has three layers — CLI, local Express proxy, and NetSuite RESTlet. Currently there is **zero permission enforcement** in any layer. The RESTlet (`ns_gm_restlet.js`) runs `new Function()` with all 23 N/* modules injected. The proxy (`server/app.js`) passes requests through with no filtering. The CLI (`src/commands/run.js`) does no pre-flight permission checks.

The most natural architectural lever is the **profile system** (`src/utils/profileStore.js`), which already supports multiple OAuth credential profiles with one active at a time. Each profile maps to a different NetSuite Integration record, which maps to a different role with different permissions. This means:

- **Read-only profile**: OAuth integration mapped to a read-only NetSuite role (default)
- **Elevated profile**: OAuth integration mapped to a write-capable NetSuite role (activated on approval)

The RESTlet itself is a single deployment that executes whatever code it receives. The permissions come from the OAuth token's role, not from the RESTlet. This means **permission elevation = switching OAuth credentials**, not modifying the RESTlet.

Key architectural constraint: NetSuite's permission model is role-wide, not script-specific. "Per-script permissions" would need to be enforced at the NSGM layer, not by NetSuite. Possible approaches include: (a) single-execution profile switching where the elevated profile is used for exactly one `ns-gm run` call then reverted, (b) a separate RESTlet or wrapper that audits which script is being run, or (c) code-level analysis to detect write operations before execution.

The helix-ns-server reference shows how sibling tooling handles ns-gm invocation: `ns-gm setup:ci` to register credentials, then `ns-gm init` and `ns-gm env` for environment verification. It already separates pre-product (PRODUCTION) and post-product (SANDBOX) credentials by step type.

## Relevant Files

| File | Role |
|------|------|
| `ns_gm_restlet.js` | NetSuite-side code execution boundary — all 23 modules injected, no filtering |
| `server/app.js` | Local proxy — /run endpoint passes code through with no checks |
| `server/auth.js` | OAuth 2.0 M2M auth — token per profile credentials |
| `src/cli.js` | CLI entry — Commander.js with 8 commands |
| `src/commands/run.js` | Run command — posts code to proxy, no permission awareness |
| `src/utils/profileStore.js` | Profile management — multi-alias credential store, one active |
| `src/commands/setup.js` | Interactive profile setup |
| `config.json` | Proxy port 9292, timeout config |
| `package.json` | Dependencies and scripts — no test framework |
| `CLAUDE.md` | AI agent architecture guidance |

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| `ns_gm_restlet.js` | Understand code execution boundary | `new Function()` with all 23 modules, no permission gating |
| `server/app.js` | Understand proxy layer | /run and /logs pass-through with zero validation |
| `server/auth.js` | Understand auth model | OAuth 2.0 M2M, token cached per profile, role determined by Integration record |
| `src/utils/profileStore.js` | Understand profile switching | Multi-alias store at ~/.ns-gm/credentials.json, one active alias |
| `src/commands/run.js` | Understand execution client | No pre-flight checks, posts code directly |
| `src/cli.js` | Understand command surface | 8 commands, Commander.js, new commands added here |
| `package.json` | Understand build/deps | No tests, Node >=24, express/jose/commander/prompts/axios |
| `ticket.md` | Problem statement | Brainstorm ticket — no fixed solution, asks for permission elevation with approval UI |
| helix-ns-server `orchestrator/credentials.ts` | Reference context | Pre/post-product credential separation by step type |
| helix-ns-server `native-phase.ts` | Reference context | ns-gm CLI invocation pattern (setup:ci, init, env) |
