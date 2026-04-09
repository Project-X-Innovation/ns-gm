# Scout Summary — ns-gm (Proxy Module Research — Deeper Interception)

## Problem

The user's refined question (from continuation context) goes beyond the prior research's proxy wrapper approach. Prior research established that we can replace the `N/record` module with a proxy wrapper in `moduleParamValues[]` (lines 115-125 of `ns_gm_restlet.js`). The user now asks: **can we keep the REAL NetSuite module running — not our own version — and intercept at the end when it sends data to NetSuite?** The goal is to capture what NetSuite actually receives after the module runs its own internal processing, not just the in-memory field state at the time of the API call.

This is a question about **interception depth**: user input capture (Level 1) vs. module API boundary proxy (Level 2, prior research) vs. transport/commit boundary interception (Level 3, user's current ask).

## Analysis Summary

### Three Interception Depth Levels

1. **Level 1 — User Input Capture**: Log what the user's code calls (e.g., `setValue('memo', 'X')`). This is what the ticket originally asked about avoiding. Insufficient because it doesn't reflect what NetSuite actually processes.

2. **Level 2 — Module API Proxy (Prior Research)**: Replace the `N/record` module object in `moduleParamValues[]` with a proxy wrapper. Reads delegate to the real module; writes are intercepted before the real module's save code runs. Captures the record's in-memory field state (all `getValue()`/`getText()` results) at the moment of the write call. **Limitation**: Misses any processing that `record.save()`'s internal logic applies (field validation, defaults, sourcing, formula recalcs).

3. **Level 3 — Transport/Commit Interception (User's Ask)**: Keep the real module intact, let its methods execute fully, but intercept at the boundary where it sends processed data to the NetSuite database. This would capture post-validation, post-sourcing state — "what NetSuite actually gets."

### Key Architectural Boundaries

- **N/* modules make internal JVM calls, not HTTP calls.** The RESTlet runs inside NetSuite's Java-based server. When `record.save()` executes, it calls into NetSuite's Java backend directly. There is no HTTP transport layer between the SuiteScript module and the database that could be intercepted from SuiteScript.

- **The only NetSuite-native Level 3 interception point is the `beforeSubmit` UserEventScript (UES).** This fires after the record is assembled for save but before database commit. It receives the 'new record' context with post-validation field state. Prior research rejected this as the primary approach (Approach A) due to governance chaining risk (RESTlet -> save() -> UES -> N/https.post()).

- **Whether the real module objects can be observed without replacement is an open question.** Two mechanisms exist in JavaScript:
  - **ES6 Proxy**: Wraps the real object transparently — all operations pass through to the real object, with handler traps for observation. Whether SuiteScript 2.1's engine supports `Proxy` is unverified.
  - **Method wrapping (monkey-patching)**: Replace individual methods (e.g., `record.save`) with wrappers that call the original. Whether N/* module methods are writable (not frozen/sealed) is unverified.

- **The `new Function()` execution scope (line 166) is isolated.** User code can only access modules via positional parameters. If we pass the real module (wrapped with Proxy or with patched methods), user code interacts with the real module's logic, with observation hooks attached.

### What the Proxy Approach Captures vs. What the User Wants

| Aspect | Level 2 (Proxy, prior research) | Level 3 (Transport interception, user's ask) |
|--------|-------------------------------|----------------------------------------------|
| Read operations | Real data from N/record | Real data from N/record |
| setValue/getText calls | Real (in-memory record) | Real (in-memory record) |
| Field validation/defaults | NOT captured (intercepted before save) | Captured (save executes fully) |
| Sourcing (dependent fields) | NOT captured | Captured |
| Formula recalculations | NOT captured | Captured |
| Database commit | Prevented | Would need prevention mechanism |
| Side effects (workflows, UES) | Prevented | Would fire unless prevented |

### Possible Approaches for Level 3

1. **ES6 Proxy around real module**: If `Proxy` is available in SuiteScript 2.1, wrap the real `N/record` module in a Proxy. Read/write methods execute on the real module. A handler trap on `.save()` could allow the save to execute, then immediately read back the record to capture post-processing state. **Risk**: real save happens (side effects, data mutation).

2. **Method wrapping on real module**: Replace `record.save` with a function that captures pre-save state, calls the original `record.save.call(this)`, captures post-save state (via reload), and returns. Same side-effect risk.

3. **Save + immediate read-back**: Let the real save execute, then immediately `record.load()` the saved record to see what NetSuite actually persisted. **Problem**: real data is mutated; workflows/UES fire; no rollback mechanism in RESTlet context.

4. **beforeSubmit UES as companion**: Deploy a UES that fires on saves from the integration role. The UES captures the post-validation 'new record' state and logs it or sends it to an endpoint. The RESTlet retrieves this captured state after save. **Problem**: governance chaining, deployment complexity (previously rejected).

5. **Hybrid**: Use Level 2 proxy for write interception (prevent actual save), but ALSO call the real module's read/validation methods to simulate what processing would occur. For example, after intercepting save, call `record.getFields()` to capture all field IDs and values — this already reflects any in-memory processing the module applied.

## Relevant Files

| File | Relevance |
|------|-----------|
| `ns_gm_restlet.js` | Core RESTlet. Module injection at lines 115-125. Execution at lines 163-169. This is where any interception mechanism would be implemented. |
| `server/app.js` | Express proxy. POST /run pattern (lines 35-86). New endpoints follow this pattern. |
| `server/auth.js` | OAuth 2.0 M2M. postToRestlet() at lines 172-182 is the HTTP boundary. |
| `package.json` | v1.0.5. No test/lint/typecheck scripts. Pure JS. |
| `src/commands/run.js` | CLI run command. Backward-compatibility boundary. |
| `CLAUDE.md` | Architecture guide. Confirms three-tier architecture. |

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md (ns-gm) | Research scope and user's refined question | User wants real module behavior preserved, not just proxy wrapper replacement |
| ns_gm_restlet.js (direct read, full file) | Map the module injection mechanism and identify interception boundaries | Lines 7-16: AMD define loads real modules. Lines 115-125: array build. Line 166: new Function. Line 169: execution with real values. Isolated scope prevents bypass. |
| server/app.js (direct read) | Express proxy endpoint pattern and HTTP boundary | Pure JSON pass-through; cannot intercept N/* module internals from this layer |
| server/auth.js (direct read) | Auth chain and the only HTTP call in the pipeline | postToRestlet() at lines 172-182 sends JSON to RESTlet URL via Bearer auth |
| package.json (direct read) | Build/quality signals | No test framework or quality gates; pure JS + Express |
| CLAUDE.md (direct read) | Architecture overview | CLI -> Express proxy -> RESTlet three-tier; OAuth 2.0 M2M |
| Prior run report.md (helix-global-server, run cmns1zxjz007rex0vfclv9r7i) | Prior proxy research conclusions | Approach B (module proxy) chosen; read-through/write-intercept; UES approach rejected due to governance chaining |
| Prior tech-research.md (ns-gm, run cmns1zxjz007rex0vfclv9r7i) | Technical architecture decisions from prior research | Proxy substitution point at moduleParamValues; only N/record needs proxying for MVP; approval token server-side only |
| Prior tech-research.md (helix-global-server, run cmns1zxjz007rex0vfclv9r7i) | Server role in proxy modules | Orchestration + deployment + credential provision; credential chain reusable; RESTlet sync required |
| repo-guidance.json | Repo intent classification | ns-gm = target (primary), helix-global-server = target (secondary) |
