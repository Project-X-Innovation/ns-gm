# Scout Summary — ns-gm (Proxy Module Research)

## Problem

The ticket asks whether proxy modules can intercept what actually gets sent to NetSuite, or whether they are limited to capturing user input without getting real results. It asks: "Can we somehow hijack what actually gets sent to NetSuite? We must have access to the modules."

## Analysis Summary

**Yes, proxy modules can intercept what gets sent to NetSuite.** The ns-gm RESTlet uses a dynamic module injection pattern that makes this architecturally viable without modifying the core execution model:

1. **Injection mechanism**: `ns_gm_restlet.js` line 166 creates execution functions via `new Function(...moduleNames, userCode)`, then passes real module objects as arguments at line 169: `executionFunction(...moduleValues)`. User code receives modules as positional parameters.

2. **Substitution point**: Lines 115-125 build `moduleParamNames[]` and `moduleParamValues[]` arrays dynamically. For a dry-run action, the `record` entry in `moduleParamValues` can be replaced with a proxy wrapper object before calling `safeExecute()`.

3. **Proxy behavior**: The proxy does NOT just capture user input. Read operations (`load`, `getFields`, `copy`) delegate to the real N/record module and return real data. Write operations (`save`, `submitFields`, `delete`) are intercepted to capture before/after field state without committing to the database. The user code is unaware it's operating on proxied modules.

4. **Prior research**: Two prior tickets (cmnqr8lkk and cmnrx64kr) have already established Approach B (Two-Phase RESTlet with Module Proxy) as the recommended implementation path over Approach A (UserEventScript beforeSubmit hooks), primarily due to governance chaining risk.

5. **Current state**: The RESTlet currently has only two actions (`run`, `getscriptexecutionlogs`). No proxy modules are implemented yet. The EXECUTE ticket mode is defined in the Prisma schema but has zero production usage. 10 NsGmCredential records exist across organizations.

## Relevant Files

| File | Relevance |
|------|-----------|
| `ns_gm_restlet.js` | Core RESTlet with module injection pattern (lines 115-125, 163-169). This is where proxy substitution would occur. |
| `server/app.js` | Express proxy with /run and /logs endpoints. Pattern for new /dry-run and /execute endpoints. |
| `server/auth.js` | OAuth 2.0 M2M auth. nsapi.REST.post() reused for all new endpoints. |
| `package.json` | v1.0.5, Node >=24. No test framework or quality gates. |
| `src/commands/run.js` | CLI run command — backward compatibility boundary. |
| `src/cli.js` | CLI entry point, command registrations. |

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md | Understand the three research questions about proxy modules | Questions: can we intercept NetSuite calls, do we just capture input, do we have module access |
| ns_gm_restlet.js (direct read) | Verify the module injection pattern and substitution point | new Function(...moduleNames, userCode) at line 166; moduleParamValues array at lines 115-125 is the swap point |
| server/app.js (direct read) | Understand proxy endpoint pattern | POST /run (lines 35-86) shows the pattern for new endpoints |
| package.json (direct read) | Quality gates and dependencies | No test/lint/typecheck scripts; pure JS + Express |
| Prior diagnosis (cmnrx64kr) | Proxy module viability already analyzed | Confirmed viable; detailed before/after capture spec; LOW regression risk |
| Prior tech-research (cmnqr8lkk) | Architecture decision on proxy approach | Approach B (module proxy) recommended over Approach A (beforeSubmit UES) |
| Prior scout reference-map (cmnrx64kr) | File inventory and architectural facts | Two RESTlet copies; 24 pre-loaded modules; module injection at line 166 |
| Production DB (runtime inspection) | Current EXECUTE mode usage | 0 EXECUTE tickets; 10 NsGmCredential records |
| Production logs (runtime inspection) | Any proxy/dry-run activity | No proxy or dry-run activity in production logs |
