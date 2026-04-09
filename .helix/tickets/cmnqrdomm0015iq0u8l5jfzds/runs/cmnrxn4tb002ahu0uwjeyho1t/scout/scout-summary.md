# Scout Summary — ns-gm

## Problem

ns-gm (NetSuite God Mode) is the runtime inspection tool for NetSuite environments. For the "Monitoring with Auto Solve" feature, ns-gm provides the mechanism through which the monitoring agent will probe NetSuite production environments — executing SuiteScript to check record states and querying script execution logs to verify expected behavior patterns.

## Analysis Summary

### Current Capabilities Relevant to Monitoring

1. **Code Execution** (`run` command / `/run` endpoint) — Execute arbitrary SuiteScript against a NetSuite environment with full module injection (search, query, record, runtime, log, etc.). The monitoring agent can run custom checks like searching for specific records, querying transaction states, or verifying workflow conditions.

2. **Log Retrieval** (`logs` command / `/logs` endpoint) — Retrieve script execution logs with filtering by date range, log type (DEBUG, AUDIT, ERROR, EMERGENCY), script ID, and pagination. The monitoring agent can search for expected success logs or error patterns.

3. **Environment Detection** (`env` command) — Verify the target environment type (SANDBOX vs PRODUCTION). Critical for ensuring monitoring checks target the correct environment.

4. **Governance Tracking** — Every response includes governance unit tracking (initial, remaining, used). Important for monitoring agents to stay within NetSuite limits.

5. **Multi-Profile Support** — Credential profiles allow switching between sandbox and production environments. The server manages these credentials via the `NsGmCredential` model.

### Integration With Helix Server

The helix-global-server already has:
- `NsGmCredential` model in Prisma for storing per-org, per-environment ns-gm credentials (encrypted)
- `prepareNsGmCredential` function for preparing credentials for sandbox execution
- `installNsGmCli` and `runNsGmSetupAndValidateEnv` in `orchestrator/native-phase.ts` for setting up ns-gm inside sandboxes

This means ns-gm is already integrated into the Helix workflow pipeline. The monitoring agent would use the same credential preparation and CLI setup patterns.

### Limitations

- **Stateless CLI** — No scheduling, persistence, or agent infrastructure. All monitoring orchestration must live in helix-global-server.
- **Plain JavaScript** — No TypeScript, no build system, no linting. Changes are simpler but less type-safe.
- **No tests** — No test infrastructure exists.

## Relevant Files

| File | Role |
|------|------|
| `ns_gm_restlet.js` | NetSuite RESTlet — run code + retrieve logs |
| `server/app.js` | Express proxy — /run, /logs, /health endpoints |
| `server/auth.js` | OAuth 2.0 M2M authentication |
| `src/commands/logs.js` | Log retrieval with filtering |
| `src/commands/run.js` | SuiteScript code execution |
| `src/commands/env.js` | Environment type detection |
| `src/utils/profileStore.js` | Credential storage |
| `package.json` | Dependencies and scripts |
| `CLAUDE.md` | Agent guidance |

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md | Feature requirements | Monitoring must cover NetSuite environments. ns-gm and Helix CLI provide runtime inspection. |
| ns_gm_restlet.js | Understand NetSuite runtime capabilities | Two actions: run (execute SuiteScript) and getscriptexecutionlogs (retrieve logs). Full module injection available. |
| server/app.js | Understand proxy architecture | Express proxy routes /run and /logs to NetSuite RESTlet via OAuth 2.0. Health endpoint at /health. |
| CLAUDE.md | Agent guidance and architecture overview | CLI + proxy → RESTlet architecture. Alias-based credential profiles. OAuth 2.0 M2M authentication. |
| package.json | Verify tech stack | Zero build tooling. Dependencies: axios, commander, express, jose. |
