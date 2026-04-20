# Scout Summary: ns-gm — RSH-286 (Deploy Objects Continuation)

## Problem

RSH-286 explicitly asks whether ns-gm (NSGM) can surface missing IDs caused by SDF "account specific value" replacement during object exports. It also asks about object definitions being fetched/updated via NSGM during ticket flows. This summary maps ns-gm's current capabilities relative to these questions.

## Analysis Summary

### Current Capabilities
- **CLI**: 8 commands (init, run, env, logs, stop, setup, setup:ci, help). No deploy, object, or SDF commands.
- **RESTlet**: 3 actions (run, getscriptexecutionlogs, getScriptId). The `run` action executes arbitrary SuiteScript 2.1 with 23 injected modules.
- **SuiteScript modules available**: N/record, N/search, N/workflow, N/query, N/config, N/runtime, N/format, and 16 others.

### Relevance to SDF Account-Specific Values
The ticket asks "Whether NSGM can surface those missing IDs." Current assessment:
- **Potentially yes via `ns-gm run`**: The RESTlet can execute SuiteScript that uses `N/record.load()` and `N/search.create()` to look up internal IDs, names, and references. When SDF replaces a record reference with `account specific value`, a SuiteScript query could resolve the actual ID by searching for the record by name or type.
- **Not directly**: ns-gm has no built-in object management, SDF integration, or ID resolution commands. Any ID resolution would require crafting SuiteScript code and executing it via `ns-gm run`.
- **Governance limits apply**: RESTlet tracks governance units per execution. Batch ID resolution for many account-specific values might require multiple calls.

### ns-gm's Role in the Broader Feature
- **Onboarding**: ns-gm is not involved in onboarding object sync. SuiteCloud CLI handles object:list + object:import.
- **Runtime checks**: The server orchestrator already uses `ns-gm setup:ci` to configure ns-gm in sandboxes for runtime checks during ticket flows.
- **ID resolution tool**: ns-gm could serve as a runtime tool for resolving SDF account-specific values by querying NetSuite at deploy time, but this would be a new usage pattern.

### No Code Changes Expected in ns-gm (Context-Only)
ns-gm appears to be a context-only repo for this ticket. The existing `run` command + RESTlet already provide the SuiteScript execution capability needed. Any ID resolution logic would be SuiteScript code executed via the existing infrastructure, not new ns-gm features.

## Relevant Files

| File | Why |
|------|-----|
| `ns_gm_restlet.js` | RESTlet with N/record, N/search modules for potential ID resolution |
| `server/app.js` | Proxy endpoints; /run is the execution path |
| `server/auth.js` | OAuth 2.0 auth; relevant for understanding execution cost |
| `src/cli.js` | CLI commands; confirms no deploy/object capabilities |

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| `ticket.md` | Problem statement | Asks whether NSGM can surface missing IDs from SDF account-specific values |
| `ns_gm_restlet.js` (via agent, 453 lines) | RESTlet capabilities | run action with N/record, N/search, N/workflow modules; governance tracking |
| `server/app.js` (via agent, 155 lines) | Proxy endpoints | /run accepts code + modules; no object-specific endpoints |
| `src/cli.js` (via agent, 93 lines) | CLI command surface | 8 commands; no deploy/object/SDF capability |
| `CLAUDE.md` | Repo identity and architecture | CLI -> proxy -> RESTlet architecture; OAuth 2.0 M2M auth |
| RSH-276 `tech-research.md` (server) | Prior research | ns-gm v1.0.5 limited to setup commands; stale detection via hash comparison instead |
