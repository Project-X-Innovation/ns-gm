const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const tokenCache = new Map();
const tokenRequestInflight = new Map();
const privateKeyCache = new Map();
let joseImportPromise;

function getJose() {
    if (!joseImportPromise) {
        joseImportPromise = import('jose');
    }
    return joseImportPromise;
}

function normalizeAccountForDomain(accountId) {
    return String(accountId).trim().replace(/_/g, '-').toLowerCase();
}

function buildTokenEndpoint(accountId) {
    const normalizedAccount = normalizeAccountForDomain(accountId);
    return `https://${normalizedAccount}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`;
}

function validateProfile(profile) {
    if (!profile || typeof profile !== 'object') {
        throw new Error('Missing active profile. Run: ns-gm setup');
    }

    const requiredFields = ['accountId', 'clientId', 'certificateId', 'privateKeyPath', 'restletUrl'];
    for (const field of requiredFields) {
        if (!profile[field] || !String(profile[field]).trim()) {
            throw new Error(`Active profile is missing "${field}". Run: ns-gm setup`);
        }
    }

    const privateKeyPath = path.resolve(String(profile.privateKeyPath).trim());
    if (!fs.existsSync(privateKeyPath)) {
        throw new Error(`Private key file not found: ${privateKeyPath}. Run: ns-gm setup`);
    }
}

function profileCacheKey(profile) {
    return [
        profile.accountId,
        profile.clientId,
        profile.certificateId,
        profile.scope || 'restlets'
    ].join('|');
}

function loadPrivateKey(privateKeyPathInput) {
    const privateKeyPath = path.resolve(String(privateKeyPathInput).trim());
    const stat = fs.statSync(privateKeyPath);
    const cached = privateKeyCache.get(privateKeyPath);

    if (cached && cached.mtimeMs === stat.mtimeMs) {
        return cached.key;
    }

    const keyPem = fs.readFileSync(privateKeyPath, 'utf8');
    const key = crypto.createPrivateKey(keyPem);
    privateKeyCache.set(privateKeyPath, { mtimeMs: stat.mtimeMs, key });
    return key;
}

async function createClientAssertion(profile, tokenEndpoint) {
    const { SignJWT } = await getJose();
    const now = Math.floor(Date.now() / 1000);
    const scope = profile.scope || 'restlets';
    const privateKey = loadPrivateKey(profile.privateKeyPath);

    return new SignJWT({ scope })
        .setProtectedHeader({
            alg: 'PS256',
            typ: 'JWT',
            kid: String(profile.certificateId).trim()
        })
        .setIssuer(String(profile.clientId).trim())
        .setAudience(tokenEndpoint)
        .setIssuedAt(now)
        .setExpirationTime(now + (55 * 60))
        .sign(privateKey);
}

function isCachedTokenUsable(cachedToken) {
    if (!cachedToken || !cachedToken.accessToken || !cachedToken.expiresAtMs) {
        return false;
    }
    return Date.now() + TOKEN_REFRESH_BUFFER_MS < cachedToken.expiresAtMs;
}

function createTokenRequestError(error) {
    const responseBody = error.response?.data;
    const responseText = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody || {});
    const status = error.response?.status;
    const suffix = status ? ` (HTTP ${status})` : '';
    return new Error(`OAuth token request failed${suffix}: ${responseText || error.message}`);
}

async function requestAccessToken(profile) {
    const tokenEndpoint = buildTokenEndpoint(profile.accountId);
    const clientAssertion = await createClientAssertion(profile, tokenEndpoint);
    const requestBody = new URLSearchParams({
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: clientAssertion
    });

    const response = await axios.post(tokenEndpoint, requestBody.toString(), {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 15000
    }).catch((error) => {
        throw createTokenRequestError(error);
    });

    const accessToken = response.data?.access_token;
    const expiresInSec = Number(response.data?.expires_in || 3600);

    if (!accessToken) {
        throw new Error('OAuth token response did not include access_token');
    }

    return {
        accessToken,
        expiresAtMs: Date.now() + (expiresInSec * 1000)
    };
}

async function getAccessToken(profile, options = {}) {
    validateProfile(profile);
    const forceRefresh = options.forceRefresh === true;
    const cacheKey = profileCacheKey(profile);
    const cached = tokenCache.get(cacheKey);

    if (!forceRefresh && isCachedTokenUsable(cached)) {
        return cached.accessToken;
    }

    if (tokenRequestInflight.has(cacheKey)) {
        return tokenRequestInflight.get(cacheKey);
    }

    const inflightPromise = requestAccessToken(profile)
        .then((newToken) => {
            tokenCache.set(cacheKey, newToken);
            tokenRequestInflight.delete(cacheKey);
            return newToken.accessToken;
        })
        .catch((error) => {
            tokenRequestInflight.delete(cacheKey);
            throw error;
        });

    tokenRequestInflight.set(cacheKey, inflightPromise);
    return inflightPromise;
}

function createRestletError(action, error) {
    const status = error.response?.status;
    const responseBody = error.response?.data;
    const responseText = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody || {});
    const suffix = status ? ` (HTTP ${status})` : '';
    return new Error(`NetSuite request failed for action "${action}"${suffix}: ${responseText || error.message}`);
}

async function postToRestlet(restletUrl, payload, token) {
    const response = await axios.post(restletUrl, payload, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        timeout: 30000
    });

    return response.data;
}

const REST = {
    async post({ action, data = {}, credentials }) {
        if (!credentials) {
            throw new Error('Missing active profile credentials. Run: ns-gm setup');
        }

        validateProfile(credentials);
        const payload = { action, data };

        try {
            const token = await getAccessToken(credentials);
            return await postToRestlet(credentials.restletUrl, payload, token);
        } catch (error) {
            if (error.response?.status === 401) {
                const cacheKey = profileCacheKey(credentials);
                tokenCache.delete(cacheKey);
                const refreshedToken = await getAccessToken(credentials, { forceRefresh: true });
                return postToRestlet(credentials.restletUrl, payload, refreshedToken);
            }

            throw createRestletError(action, error);
        }
    }
};

function init() {
    return true;
}

module.exports = {
    REST,
    init
};
