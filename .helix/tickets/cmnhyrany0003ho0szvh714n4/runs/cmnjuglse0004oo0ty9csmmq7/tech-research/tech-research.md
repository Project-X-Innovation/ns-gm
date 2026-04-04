# Tech Research: ns-gm Script-Scoped Permission Elevation

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md | Problem statement and user intent | Agent needs write access for single scripts without permanent permission changes |
| diagnosis/diagnosis-statement.md | Root cause and recommended approach | Binary OAuth role model; dual-profile single-execution elevation recommended |
| diagnosis/apl.json | Detailed architectural answers | Profile system is the lever; RESTlet is permission-agnostic; regex detection feasible |
| product/product.md | Feature scope and success criteria | 5 MVP features, 6 deferred; approval gate must be interactive CLI |
| scout/scout-summary.md | Architecture overview | Three-layer arch (CLI → proxy → RESTlet); zero permission enforcement today |
| scout/reference-map.json | File-level evidence | 10 confirmed facts about RESTlet, proxy, auth, profiles |
| src/commands/run.js | Current execution flow | Code read as string, then POSTed to proxy — ideal intercept point |
| src/utils/profileStore.js | Profile switching mechanism | setActiveAlias() writes credentials.json; proxy reads per request |
| server/app.js | Proxy request handling | requireActiveProfile() reads active alias at request time — no stale cache |
| server/auth.js | Token caching model | Token cache keyed by profile fields — no cross-profile collision |
| src/commands/setup.js | Prompts library usage pattern | Confirms `prompts` dependency for interactive CLI flows |
| src/utils/exitCodes.js | Current exit code convention | Codes 0-6 used; code 7 available for ELEVATION_DENIED |
| CLAUDE.md | Architecture reference | Confirms credential model, command surface, key files |
| package.json | Dependencies and constraints | Node >=24, prompts already available, no test framework |

---

## Technology Foundation

**Runtime:** Node.js >= 24 (existing constraint)
**CLI Framework:** Commander.js (existing)
**Interactive Prompts:** `prompts` npm package (existing dependency, v2.4.2)
**HTTP Client:** axios (existing)
**Auth:** OAuth 2.0 Client Credentials (M2M) via `jose` JWT signing (existing)

No new dependencies are required. All needed libraries are already in `package.json`.

---

## Architecture Decision

### Options Considered

**Option A: CLI-gated elevation (chosen)**
The `ns-gm run` command detects write operations in the submitted code, shows an interactive approval prompt, switches the active profile alias, executes, and reverts. All logic lives in the CLI layer. Zero changes to the proxy or RESTlet.

**Option B: Proxy-gated elevation**
Add an `/elevate` endpoint to the proxy that returns detected write operations. The CLI calls `/elevate` first, shows the prompt, then calls `/run` with an elevation token. The proxy manages the elevation lifecycle.

**Option C: RESTlet-side module restriction**
Pass a `modules` parameter to the RESTlet that limits which N/* modules are injected. Combined with an allowlist, this would restrict capabilities server-side.

### Chosen: Option A — CLI-gated elevation

**Rationale:**

1. **Minimal blast radius.** Zero changes to `server/app.js` or `ns_gm_restlet.js`. The proxy and RESTlet remain untouched, which means the existing read-only deployment is unaffected.

2. **Existing infrastructure is sufficient.** The profile system (`profileStore.js`) already supports multi-alias credential switching. The proxy already reads the active profile at request time (`requireActiveProfile()`). The `prompts` library is already a dependency. No new packages needed.

3. **Single-execution scoping is natural.** The CLI can wrap the HTTP POST in a try/finally: set elevated alias → POST → revert alias. The elevation window is exactly one request because the proxy reads credentials per request.

4. **Human-in-the-loop is at the right layer.** The approval prompt must be interactive (human at terminal). The CLI is the interactive layer. Putting approval in the proxy would require a callback/polling mechanism.

### Why Not Option B (Proxy-gated)
Adds HTTP round-trips and state management (elevation tokens, expiry). The proxy would need to remember elevation state, which conflicts with its current stateless design. Over-engineered for the single-execution use case.

### Why Not Option C (RESTlet-side restriction)
The `modules` parameter already exists but only controls which modules are injected — it doesn't restrict what methods are called on those modules. A user could pass `modules: ['record']` and still call `record.save()`. Module restriction is complementary but insufficient alone. Marked as a future enhancement in the product doc.

---

## Core API/Methods

### Write-Operation Detection

A new module `src/utils/writeDetector.js` exports a function `detectWriteOperations(code: string)` that returns `{ hasWrites: boolean, detected: string[] }`.

Detection uses regex matching against known write patterns:
```
/record\.(save|delete|submitFields|create)\b/
/file\.(create|delete|write|append)\b/
/transaction\.(save|create|delete)\b/
/task\.(create|submit)\b/
/workflow\.(initiate|trigger)\b/
/email\.(send)\b/
/redirect\.(save|toRecord|toTaskLink)\b/
```

The regex set is intentionally conservative (high recall). False positives are harmless — they show the human an operation that is actually read-only, and the human can approve anyway. False negatives are mitigated by showing the full script code to the approver.

### Approval Flow (in `src/commands/run.js`)

```
1. Read code string (existing: --code or --file)
2. Call detectWriteOperations(code)
3. If hasWrites === false → proceed normally (no change to existing behavior)
4. If hasWrites === true:
   a. Check: does elevatedAlias exist in credentials.json?
      - No → exitWithCode(CONFIG_ERROR, "No elevated profile configured...")
   b. Show approval prompt:
      - Display detected write operations
      - Show full script code (truncated preview + option to expand)
      - Confirm: "Approve write execution? (y/n)"
   c. If denied → exitWithCode(ELEVATION_DENIED, "Human denied elevation request")
   d. If approved:
      - const originalAlias = getActiveProfile().alias
      - setActiveAlias(elevatedAlias)
      - try { POST /run } finally { setActiveAlias(originalAlias) }
```

### Elevated Profile Registration

Extend `src/utils/profileStore.js` with:
- `getElevatedAlias()` — reads `elevatedAlias` field from credentials.json
- `setElevatedAlias(alias)` — writes `elevatedAlias` field to credentials.json

Extend `src/commands/setup.js` to ask "Is this a write-capable (elevated) profile?" when creating a new alias. If yes, calls `setElevatedAlias(alias)`.

The `credentials.json` shape becomes:
```json
{
  "activeAlias": "prod-readonly",
  "elevatedAlias": "prod-elevated",
  "profiles": {
    "prod-readonly": { ... },
    "prod-elevated": { ... }
  }
}
```

This is backward-compatible: existing stores without `elevatedAlias` simply have no elevation configured.

---

## Technical Decisions

### Decision 1: Regex over AST for write detection
**Chosen:** Regex pattern matching
**Rejected:** AST parsing (e.g., acorn, @babel/parser)
**Rationale:** The code is a string at the CLI level. Regex is fast, requires no new dependency, and the known write method set is small and stable. AST parsing would add a dependency and complexity for marginal accuracy gains. The product explicitly calls out AST as a future improvement.

### Decision 2: CLI as the approval intercept point
**Chosen:** Approval prompt in `run.js`
**Rejected:** New proxy endpoint, separate approval command
**Rationale:** The CLI is already the interactive layer with the `prompts` library. A separate command would require the agent to orchestrate two CLI calls. A proxy endpoint would require state management. Putting it inline in `run.js` makes the flow atomic: one command, one prompt, one execution.

### Decision 3: try/finally for reversion guarantee
**Chosen:** Synchronous profile switch with try/finally in the CLI process
**Rejected:** Proxy-side elevation tokens, process-level signal handlers
**Rationale:** The CLI process is short-lived (one command execution). A try/finally guarantees reversion even on exceptions. The proxy doesn't need to know about elevation — it just reads whatever alias is active. If the CLI process crashes before finally, the elevated alias stays active in credentials.json, but the next normal run will revert it because the agent workflow runs discrete CLI invocations. A `process.on('exit')` handler can be added as extra safety.

### Decision 4: Full code display in approval prompt
**Chosen:** Show the complete script code in the terminal prompt
**Rejected:** Show only detected write operations, or show a hash
**Rationale:** The product principle is "transparency over convenience." The human approver must see what they are approving. The `prompts` library supports multi-line text display. For very long scripts, show the first 50 lines with a "show more" option.

### Decision 5: New `ELEVATION_DENIED` exit code (7)
**Chosen:** Add `ELEVATION_DENIED: 7` to exitCodes.js
**Rejected:** Reuse `GENERAL_ERROR` or `EXECUTION_ERROR`
**Rationale:** The agent (Claude Code) needs to distinguish "human said no" from "NetSuite errored." A distinct exit code enables the agent to adapt (propose a different approach) rather than retry the same script.

---

## Cross-Platform Considerations

- **File path handling:** `profileStore.js` uses `path.resolve()` and `os.homedir()` which are cross-platform. No changes needed.
- **Terminal prompts:** The `prompts` library works on Windows, macOS, and Linux terminals. No platform-specific issues.
- **credentials.json location:** `~/.ns-gm/credentials.json` — resolves correctly on all platforms via `os.homedir()`.

---

## Performance Expectations

- **Write detection:** Regex scan on typical scripts (<10KB) is <1ms. Negligible overhead.
- **Profile switch:** `setActiveAlias()` is a synchronous `fs.writeFileSync()` on a small JSON file (~1KB). Typical latency <5ms.
- **Token acquisition:** If the elevated profile's OAuth token is not cached, the first elevated execution incurs a 15-second timeout-bound JWT exchange. Cached tokens add zero latency.
- **Overall overhead:** The approval flow adds <10ms to non-write scripts (regex check only). For write scripts, the overhead is the human response time plus one profile switch.

---

## Dependencies

### Existing (no changes needed)
- `prompts` v2.4.2 — interactive CLI prompts
- `commander` v12 — CLI framework
- `axios` v1.6 — HTTP client
- `jose` v5.10 — JWT signing
- Node.js >= 24 — runtime

### New code modules (no new npm packages)
- `src/utils/writeDetector.js` — regex-based write operation detection
- `src/utils/exitCodes.js` — add `ELEVATION_DENIED: 7`
- `src/utils/profileStore.js` — add `getElevatedAlias()`, `setElevatedAlias()`
- `src/commands/run.js` — approval flow integration
- `src/commands/setup.js` — elevated profile registration prompt

### External (user-provided)
- Second NetSuite Integration record mapped to a write-capable role
- Corresponding OAuth credentials (clientId, certificateId, privateKey)

---

## Deferred to Round 2

1. **AST-based write detection** — Regex is sufficient for MVP. AST parsing (acorn) can replace it later for fewer false negatives.
2. **Proxy-side elevation tokens** — Not needed for CLI-driven flow. Required only if a future API approval mode is added.
3. **Audit logging** — Product explicitly defers this. Can add `appendFileSync` to an audit log later.
4. **Browser-based approval UI** — Product defers. Could serve on the Express proxy port (9292) in the future.
5. **Programmatic approval API** — For helix-ns-server predeploy use case. Product defers to future.
6. **`--force-readonly` flag** — Nice-to-have for CI contexts. Product defers.
7. **Per-method permission granularity** — Allow record.save but block file.delete. Product defers.
8. **RESTlet module restriction** — The `modules` parameter exists but doesn't restrict method calls. Complementary but not sufficient alone.

---

## Summary Table

| Decision | Chosen | Rejected | Key Reason |
|----------|--------|----------|------------|
| Approval gate location | CLI (run.js) | Proxy endpoint, RESTlet | CLI is the interactive layer; zero proxy/RESTlet changes |
| Write detection method | Regex | AST parsing | Simple, fast, no new dependency; AST is future work |
| Elevation mechanism | Profile alias switch | Proxy tokens, separate RESTlet | profileStore already supports it; proxy reads per request |
| Reversion strategy | try/finally in CLI | Proxy-side token expiry | Simple, deterministic, single-process guarantee |
| Elevated profile config | Extend setup.js | New standalone command | Reuses existing prompts flow; minimal new code |
| Denial signal | Exit code 7 | Reuse general error codes | Agents need machine-readable denial signal |
| Approval code display | Full code in terminal | Hash or summary only | "Transparency over convenience" — product principle |

---

## APL Statement Reference

From diagnosis/apl.json statement:
> "NSGM has zero permission enforcement across all three layers (CLI, proxy, RESTlet). Security relies entirely on the NetSuite OAuth role. The solution space centers on dual-profile elevation: maintain a read-only profile as default and an elevated profile activated for exactly one execution with human approval."

This tech-research confirms and refines that direction: the implementation is entirely in the CLI layer, leveraging the existing profile system and prompts library, with zero changes to the proxy or RESTlet.
