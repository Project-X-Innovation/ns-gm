# Scout Summary — ns-gm

## Problem

ns-gm is the runtime SuiteScript execution tool already integrated into the Helix NS workflow. The ticket envisions two roles for ns-gm: (1) creating NetSuite records at runtime in sandbox (custom records, script records, etc. via SuiteScript APIs), and (2) verifying that SDF-deployed customizations are functioning correctly. Currently ns-gm has no SDF awareness, no batch/workflow execution capability, and no concept of multi-step object creation.

## Analysis Summary

### Current Capabilities

ns-gm executes arbitrary SuiteScript code against a NetSuite account through a three-tier architecture: CLI → local Express proxy (port 9292) → deployed RESTlet. The RESTlet provides access to 24+ N/* modules including `record`, `search`, `query`, `file`, and `task`, meaning any SuiteScript operation is theoretically possible.

The tool is already integrated into the helix-global-server orchestrator:
- `installNsGmCli()` — installs ns-gm globally in sandbox
- `runNsGmSetupAndValidateEnv()` — configures credentials and validates environment type
- The `ns-gm` skill is available to the agent for verification steps

### Role in This Ticket

The ticket identifies two approaches for creating customizations:

1. **ns-gm runtime approach**: Use `ns-gm run` with SuiteScript to call `record.create()`, `search.create()`, etc. This works for sandbox creation but customizations created this way are NOT portable via SDF — they exist only in the target account.

2. **SDF declarative approach**: Generate SDF XML object definitions and deploy them via `suitecloud project:deploy`. This is portable between environments.

The ticket specifically calls out that "the challenge with using ns-gm to do it is that it later has to be deployed to production." This suggests the primary approach should be SDF-based, with ns-gm serving as a verification and potentially a fallback/supplementary tool.

### Potential Changes

ns-gm itself may not need significant changes. The existing `run` command already supports any SuiteScript operation. However, potential additions could include:
- Helper commands for common verification patterns
- Batch execution support for multi-step operations
- Object existence checking for verification

## Relevant Files

| File | Relevance |
|------|-----------|
| `ns_gm_restlet.js` | RESTlet with 24+ modules — the execution boundary |
| `src/cli.js` | CLI entry point, command registration |
| `src/commands/run.js` | SuiteScript execution command |
| `src/commands/logs.js` | Log retrieval for verification |
| `server/app.js` | Express proxy endpoints |
| `server/auth.js` | OAuth 2.0 M2M authentication |
| `src/commands/setup-ci.js` | CI setup used by orchestrator |
| `src/utils/profileStore.js` | Credential storage |
| `package.json` | Dependencies, version, Node.js requirement |
| `CLAUDE.md` | Architecture documentation |

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| `ticket.md` | Understand ns-gm's role | ns-gm can create records in sandbox but challenge is production deployment — SDF is the answer |
| `ns_gm_restlet.js` (L63-96) | Map execution capabilities | 24+ N/* modules available for any SuiteScript operation |
| `server/auth.js` | Understand auth model | OAuth 2.0 M2M with JWT, token caching, auto-refresh |
| `CLAUDE.md` | Architecture overview | Three-tier architecture, credential model, command surface |
| `package.json` | Tech stack | Plain JS, Node.js >=24, no test framework, no build step |
| helix-global-server `native-phase.ts` | Integration point | Orchestrator calls installNsGmCli, runNsGmSetupAndValidateEnv |
| `.claude/skills/ns-gm/SKILL.md` | Agent skill definition | ns-gm skill already available for verification use cases |
