# Scout Summary — RSH-212: Explanation for Verification Failure (ns-gm)

## Problem

A prior ticket's verification CHK-06 required runtime NetSuite SuiteQL access to confirm 7 orphaned records (units 1159, 1579, 1613, 1761) would be matched by corrected scripts. ns-gm is the CLI tool that provides NetSuite connectivity, but it has no `repositoryInspectionCredential` configured in the Helix runtime inspection system.

## Analysis Summary

ns-gm provides the core capability (SuiteQL query execution via NetSuite RESTlet) that CHK-06 needed but could not access. The tool is functional — it supports arbitrary SuiteScript execution and log retrieval — but there is no integration path from the Helix sandbox's runtime inspection system to ns-gm's NetSuite connectivity.

The server does maintain `NsGmCredential` records (separate from `repositoryInspectionCredential`) and has `ns-gm-credentials.ts` for orchestrator use, but these are not wired into the `/tmp/helix-inspect/manifest.json` generation that the verification agent checks.

## Relevant Files

| File | Relevance |
|------|-----------|
| `ns_gm_restlet.js` | NetSuite RESTlet with SuiteQL support — the runtime capability CHK-06 needed |
| `src/commands/run.js` | CLI for executing SuiteScript — could manually verify orphaned records |
| `server/app.js` | Local Express proxy to NetSuite RESTlet |
| `server/auth.js` | OAuth 2.0 M2M authentication for NetSuite |

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| Screenshot (Screenshot_20260410_192416_Chrome.jpg) | Primary evidence of verification failure | CHK-06 needed SuiteQL to verify orphaned records; remediation options reference NetSuite access |
| CLAUDE.md (ns-gm) | Repository structure and purpose | CLI + local proxy for SuiteScript execution via OAuth 2.0 M2M |
| Blueprints/implementation-actual.md | ns-gm implementation status | RESTlet supports 'run' and 'getscriptexecutionlogs' actions with SuiteQL |
| /tmp/helix-inspect/manifest.json | Current runtime inspection config | ns-gm absent — only helix-global-server has inspection credentials |
| orchestrator.ts (server, lines 1260-1353) | Inspection manifest generation | Only repos with repositoryInspectionCredential records get manifest entries |
