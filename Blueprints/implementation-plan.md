# implementation-plan.md

**Project:** ns-gm (NetSuite God Mode)
**Date:** 2026-02-09
**Purpose:** Atomic implementation plan with verification

## Success Criteria

- No old command naming remains in CLI UX.
- Authentication no longer uses proprietary request-signing flow.
- `ns-gm setup` shows aliases + `new`.
- New alias persists and is listed in future setup runs.
- `ns-gm env` works and returns `runtime.envType`.

## Step Plan

### Step 1: Rebrand CLI command surface

- Update package metadata and command name to `ns-gm`.
- Update built-in help text and examples to `ns-gm`.
- Remove old command naming references from user-facing CLI messages.

Verification:
- `node src/cli.js --help`
- Confirm displayed command examples use `ns-gm` only.

### Step 2: Create profile store utility

- Add utility module for reading/writing `~/.ns-gm/credentials.json`.
- Implement helpers:
  - `loadStore()`
  - `saveStore()`
  - `listAliases()`
  - `setActiveAlias(alias)`
  - `saveProfile(alias, profile)`
  - `getActiveProfile()`

Verification:
- Unit-level dry run with Node script to save and reload a test alias.

### Step 3: Add alias-aware setup flow

- Update `setup` command:
  - Load aliases.
  - Prompt select list with aliases plus `new`.
  - For `new`, prompt alias + credentials.
  - Persist profile and set active alias.
  - For existing alias, set active alias.

Verification:
- Run `ns-gm setup` and confirm `new` is listed.
- Create alias and rerun `ns-gm setup`; confirm alias appears.

### Step 4: Implement OAuth 2.0 client-credentials auth module

- Replace proprietary auth module with OAuth 2.0 M2M implementation.
- Use `jose` to generate JWT client assertion.
- Use `axios` to request bearer token.
- Inject `Authorization: Bearer <token>` for RESTlet requests.
- Add token cache with expiry handling.

Verification:
- Token request function returns token payload for valid test credentials.
- Expired token path triggers refresh.

### Step 5: Wire server runtime to active alias profile

- Server reads active profile from store.
- All run/log calls use active profile auth + RESTlet URL.
- Clear errors when no active profile exists.

Verification:
- Start server and run a lightweight call with configured alias.
- Validate failure message when profile store is empty.

### Step 6: Add `env` command

- Add `ns-gm env` command handler.
- Internally execute same flow as:
  - `run --code "return runtime.envType"`
- Print concise result.

Verification:
- `ns-gm env` returns same output as manual run expression.

### Step 7: Update docs and examples

- Update README command examples to `ns-gm`.
- Add OAuth 2.0 setup prerequisites and required fields.
- Document alias model and `env` shortcut command.

Verification:
- Grep docs for stale old command naming and remove occurrences.

### Step 8: Regression checks

- Validate command behavior:
  - `setup`, `init`, `run`, `logs`, `env`, `stop`, `help`
- Validate exit codes remain coherent.
- Validate no secrets are printed in normal logs.

Verification:
- Execute command smoke tests and confirm expected output/error structure.

## Implementation Notes

- Keep profile storage backward-compatible only if explicitly required later.
- Prefer pure utility modules for store/auth logic to keep commands thin.
- Validate inputs early in setup to reduce runtime auth errors.

## Public Documentation Alignment Checklist

- Token endpoint URL format matches official docs.
- Form fields for token request match official docs.
- JWT claims and header (`kid`, `iss`, `scope`, `aud`, `exp`, `iat`) match official docs.
- Access token lifecycle handling aligns with documented 3600-second validity.

## Dependencies to Add

- `jose`

Existing dependencies retained:

- `axios`
- `commander`
- `prompts`
