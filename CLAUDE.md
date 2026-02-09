# CLAUDE.md

Guidance for AI coding agents working in this repository.

## Project Identity

- Project name: `ns-gm` (NetSuite God Mode)
- Type: CLI + local proxy for executing SuiteScript and reading logs through a deployed RESTlet
- Current status: active implementation

## Core Architecture

`ns-gm CLI` -> `local Express proxy (server/app.js)` -> `NetSuite RESTlet (ns_gm_restlet.js)`

Authentication is OAuth 2.0 Client Credentials (M2M) with JWT client assertion:

- Auth module: `server/auth.js`
- JWT signing: `jose`
- HTTP: `axios`

Legacy OAuth 1.0 signing flow is not part of active code.

## Credential Model

Credentials are alias-based and stored at:

- `~/.ns-gm/credentials.json`

Store shape:

```json
{
  "activeAlias": "prod-main",
  "profiles": {
    "prod-main": {
      "accountId": "1234567_SB1",
      "clientId": "...",
      "certificateId": "...",
      "privateKeyPath": "C:/keys/private_key.pem",
      "restletUrl": "https://.../restlet.nl?script=...&deploy=...",
      "scope": "restlets"
    }
  }
}
```

Never store raw private key text in this file.

## NetSuite Integration Requirements

For the Integration record used by this CLI:

- Enable `Client Credentials (Machine To Machine) Grant`
- Scopes required: `RESTlets` and `REST Web Services`
- No additional integration toggles are required for this flow

## Setup Flow

`ns-gm setup` is alias-first:

1. Shows existing aliases plus `new`
2. Selecting existing alias sets active alias
3. Selecting `new` prompts for:
   - `alias`
   - `accountId`
   - `clientId`
   - `certificateId`
   - `privateKeyPath` (must exist)
   - `restletUrl`
   - `scope` (default `restlets`)

`ns-gm setup --show` displays active alias and masked values.

## Command Surface

- `ns-gm setup`
- `ns-gm init`
- `ns-gm run --code "..."`
- `ns-gm run --file <path>`
- `ns-gm env`
- `ns-gm logs [options]`
- `ns-gm stop`
- `ns-gm help`

## Active Files To Know

- `src/cli.js` - CLI command registration
- `src/commands/setup.js` - alias/profile setup flow
- `src/commands/run.js` - run command client
- `src/commands/logs.js` - logs command client
- `src/commands/env.js` - env shortcut command
- `src/utils/profileStore.js` - credentials store operations
- `server/app.js` - local proxy endpoints (`/health`, `/run`, `/logs`)
- `server/auth.js` - OAuth 2.0 token + bearer auth logic
- `ns_gm_restlet.js` - NetSuite RESTlet script

## Documentation Workflow

Blueprint source docs:

- `Blueprints/product.md`
- `Blueprints/tech-research.md`
- `Blueprints/implementation-plan.md`
- `Blueprints/implementation-actual.md`

When completing atomic work, append progress to `Blueprints/implementation-actual.md`.
