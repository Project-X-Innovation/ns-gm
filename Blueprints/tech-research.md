# tech-research.md

**Project:** ns-gm (NetSuite God Mode)
**Date:** 2026-02-09
**Purpose:** Technical decisions and rationale

## 1. Authentication Strategy (Selected)

### Decision

Use NetSuite OAuth 2.0 Client Credentials (M2M) with JWT client assertion.

### Why

- Publicly documented and standards-based.
- Removes custom/proprietary OAuth 1.0 request-signing liability.
- Better maintainability with common JWT/OAuth libraries.

### Official References

- Setting up OAuth 2.0 for RESTlet integrations:
  - https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_158263562006.html
- OAuth 2.0 Client Credentials flow:
  - https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_162730264820.html
- POST token endpoint and response:
  - https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_162755359851.html
- JWT request token structure:
  - https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_162790605110.html
- OAuth 2.0 for RESTlets:
  - https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_157780293862.html

## 2. Runtime Auth Flow

1. Build JWT client assertion with configured certificate key and claims.
2. Call token endpoint:
   - `https://<accountID>.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`
3. Send `application/x-www-form-urlencoded` body:
   - `grant_type=client_credentials`
   - `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`
   - `client_assertion=<jwt>`
4. Use returned bearer token for RESTlet calls.
5. Refresh token on expiration window (access token lifetime is 3600 seconds per docs).

## 3. Libraries

### Selected

- `axios`: HTTP requests.
- `jose`: JWT creation/signing for client assertion.
- `prompts`: interactive setup flows.
- `commander`: CLI command parsing.

### Why this set

- Eliminates custom signature code.
- Uses widely adopted, auditable libraries.
- Keeps implementation small and readable.

## 4. Credential Profile Storage

### Decision

Store credential groups as named aliases in a dedicated config file.

### Proposed path

- `~/.ns-gm/credentials.json`

### Data shape

```json
{
  "activeAlias": "prod-main",
  "profiles": {
    "prod-main": {
      "accountId": "1234567",
      "clientId": "...",
      "certificateId": "...",
      "privateKeyPath": "C:/keys/ns-prod.pem",
      "restletUrl": "https://.../restlet.nl?script=...&deploy=...",
      "scope": "restlets"
    }
  }
}
```

### Security rules

- Store key file path, not raw private key text.
- Keep file permissions user-restricted where possible.
- Never print secret values in logs.

## 5. Setup UX Decisions

### Decision

`ns-gm setup` is alias-first.

### Flow

1. Read stored aliases.
2. Prompt selection list containing:
   - each saved alias
   - `new`
3. If user selects saved alias:
   - set as active profile.
4. If user selects `new`:
   - prompt alias + credentials fields.
   - save to profile store.
   - set as active profile.

## 6. `ns-gm env` Command

### Decision

Implement `env` as a first-class command that internally runs the same code expression:

- `return runtime.envType`

### Rationale

- Very common diagnostic call.
- Reduces typing and removes user error.

## 7. Command Surface

- `ns-gm setup`
- `ns-gm init`
- `ns-gm run`
- `ns-gm logs`
- `ns-gm env`
- `ns-gm stop`
- `ns-gm help`

## 8. Risks and Mitigations

### Risk

OAuth setup in NetSuite account may be incomplete.

### Mitigation

- Add setup validation and focused error messages for:
  - invalid token endpoint audience
  - invalid certificate id (`kid`)
  - missing scope authorization

### Risk

Key files moved or deleted.

### Mitigation

- Validate `privateKeyPath` existence during setup and before token request.

## 9. Out of Scope for this cycle

- Multi-user shared credential vault.
- Cloud-hosted credential broker.
- Non-NetSuite auth providers.
