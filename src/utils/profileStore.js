const fs = require('fs');
const os = require('os');
const path = require('path');

const STORE_DIR = path.join(os.homedir(), '.ns-gm');
const STORE_PATH = path.join(STORE_DIR, 'credentials.json');
const EMPTY_STORE = { activeAlias: null, profiles: {} };

function normalizeStore(store) {
    if (!store || typeof store !== 'object') {
        return { ...EMPTY_STORE };
    }

    const activeAlias = typeof store.activeAlias === 'string' ? store.activeAlias : null;
    const profiles = store.profiles && typeof store.profiles === 'object' ? store.profiles : {};

    return { activeAlias, profiles };
}

function loadStore() {
    try {
        if (!fs.existsSync(STORE_PATH)) {
            return { ...EMPTY_STORE };
        }

        const raw = fs.readFileSync(STORE_PATH, 'utf8');
        return normalizeStore(JSON.parse(raw));
    } catch (error) {
        return { ...EMPTY_STORE };
    }
}

function saveStore(store) {
    const normalized = normalizeStore(store);
    fs.mkdirSync(STORE_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(normalized, null, 2), 'utf8');
    return normalized;
}

function listAliases() {
    const store = loadStore();
    return Object.keys(store.profiles).sort();
}

function saveProfile(alias, profile) {
    const cleanAlias = typeof alias === 'string' ? alias.trim() : '';
    if (!cleanAlias) {
        throw new Error('Alias is required');
    }

    const requiredFields = ['accountId', 'clientId', 'certificateId', 'privateKeyPath', 'restletUrl'];
    for (const field of requiredFields) {
        if (!profile[field] || !String(profile[field]).trim()) {
            throw new Error(`Missing required profile field: ${field}`);
        }
    }

    const store = loadStore();
    store.profiles[cleanAlias] = {
        accountId: String(profile.accountId).trim(),
        clientId: String(profile.clientId).trim(),
        certificateId: String(profile.certificateId).trim(),
        privateKeyPath: String(profile.privateKeyPath).trim(),
        restletUrl: String(profile.restletUrl).trim(),
        scope: profile.scope && String(profile.scope).trim() ? String(profile.scope).trim() : 'restlets'
    };

    saveStore(store);
    return store.profiles[cleanAlias];
}

function setActiveAlias(alias) {
    const cleanAlias = typeof alias === 'string' ? alias.trim() : '';
    if (!cleanAlias) {
        throw new Error('Alias is required');
    }

    const store = loadStore();
    if (!store.profiles[cleanAlias]) {
        throw new Error(`Alias not found: ${cleanAlias}`);
    }

    store.activeAlias = cleanAlias;
    saveStore(store);
}

function getActiveProfile() {
    const store = loadStore();
    if (!store.activeAlias || !store.profiles[store.activeAlias]) {
        return null;
    }

    return {
        alias: store.activeAlias,
        ...store.profiles[store.activeAlias]
    };
}

module.exports = {
    STORE_PATH,
    loadStore,
    saveStore,
    listAliases,
    saveProfile,
    setActiveAlias,
    getActiveProfile
};
