# ns-gm

NetSuite CLI for running SuiteScript snippets and fetching logs through a local proxy + RESTlet.

## Install

```bash
npm install
npm link
```

Then use:

```bash
ns-gm --help
```

## NetSuite Setup (OAuth 2.0 M2M)

### 1) Integration Record

Create/update your integration record and enable only what is needed:

- `Client Credentials (Machine To Machine) Grant`: enabled
- Scopes: `RESTlets` and `REST Web Services`
- Nothing else required on that page for this CLI flow

### 2) M2M Mapping

In NetSuite OAuth 2.0 Client Credentials (M2M) setup, map:

- Entity
- Role
- Application (integration record above)
- Public certificate

After saving, copy:

- `Client ID` (from integration record)
- `Certificate ID` (kid from M2M mapping)

## Certificates

Generate keypair (PowerShell example):

```powershell
$dir = "C:\Users\simos\Documents\ns-gm-certs"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
openssl req -new -x509 -nodes -days 365 -newkey rsa:4096 -keyout "$dir\private_key.pem" -out "$dir\public_key.pem" -subj "/CN=ns-gm-oauth"
```

- Upload `public_key.pem` to NetSuite M2M mapping
- Use `private_key.pem` in `ns-gm setup`

## RESTlet

Deploy `ns_gm_restlet.js` to NetSuite and copy the deployment URL:

`https://<account>.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=<id>&deploy=<id>`

## CLI Setup

Run:

```bash
ns-gm setup
```

Setup is alias-based. It lets you pick an existing alias or create `new`.

### Example values to enter in setup prompts

- `alias`: `prod-main`
- `accountId`: `1234567_SB1`
- `clientId`: `6f8d...` (OAuth 2.0 Client ID from integration record)
- `certificateId`: `custcertificate_oauth2_prod` (kid from M2M mapping)
- `privateKeyPath`: `C:\Users\simos\Documents\ns-gm-certs\private_key.pem`
- `restletUrl`: `https://1234567-sb1.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=customscript_ns_gm_restlet&deploy=1`
- `scope`: `restlets`

Show active profile/config:

```bash
ns-gm setup --show
```

Credentials are stored at:

`~/.ns-gm/credentials.json`

## Usage

Start proxy:

```bash
ns-gm init
```

Run inline code:

```bash
ns-gm run --code "return 2 + 2"
```

Run from file:

```bash
ns-gm run --file script.js
```

Get environment type:

```bash
ns-gm env
```

Get logs:

```bash
ns-gm logs --type error --page-size 10
```

Stop proxy:

```bash
ns-gm stop
```
