const fs = require('fs');
const path = require('path');
const prompts = require('prompts');
const { EXIT_CODES, exitWithCode } = require('../utils/exitCodes');
const {
    loadStore,
    listAliases,
    saveProfile,
    setActiveAlias,
    getActiveProfile,
    STORE_PATH
} = require('../utils/profileStore');

function onCancel() {
    console.log('\nSetup cancelled.');
    process.exit(EXIT_CODES.SUCCESS);
}

function maskValue(value) {
    if (!value) return '(not set)';
    const text = String(value);
    if (text.length <= 8) return '***';
    return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function validateAlias(alias, existingAliases) {
    const cleanAlias = alias.trim();
    if (!cleanAlias) {
        return 'Alias is required';
    }

    if (existingAliases.includes(cleanAlias)) {
        return `Alias "${cleanAlias}" already exists`;
    }

    return true;
}

function validatePrivateKeyPath(privateKeyPathInput) {
    const resolvedPath = path.resolve(privateKeyPathInput.trim());
    if (!fs.existsSync(resolvedPath)) {
        return `File does not exist: ${resolvedPath}`;
    }
    return true;
}

async function selectAlias(aliases, activeAlias) {
    const choices = aliases.map(alias => ({
        title: alias === activeAlias ? `${alias} (active)` : alias,
        value: alias
    }));
    choices.push({ title: 'new', value: 'new' });

    const response = await prompts({
        type: 'select',
        name: 'selectedAlias',
        message: 'Select a profile alias:',
        choices,
        initial: activeAlias && aliases.includes(activeAlias) ? aliases.indexOf(activeAlias) : choices.length - 1
    }, { onCancel });

    return response.selectedAlias;
}

async function createNewAlias(existingAliases) {
    const answers = await prompts([
        {
            type: 'text',
            name: 'alias',
            message: 'Profile alias:',
            validate: value => validateAlias(value, existingAliases)
        },
        {
            type: 'text',
            name: 'accountId',
            message: 'NetSuite Account ID:',
            validate: value => value.trim().length > 0 || 'Account ID is required'
        },
        {
            type: 'text',
            name: 'clientId',
            message: 'OAuth 2.0 Client ID:',
            validate: value => value.trim().length > 0 || 'Client ID is required'
        },
        {
            type: 'text',
            name: 'certificateId',
            message: 'Certificate ID (kid):',
            validate: value => value.trim().length > 0 || 'Certificate ID is required'
        },
        {
            type: 'text',
            name: 'privateKeyPath',
            message: 'Private key path (.pem):',
            validate: validatePrivateKeyPath
        },
        {
            type: 'text',
            name: 'restletUrl',
            message: 'RESTlet URL:',
            validate: value => /^https:\/\/.+\/app\/site\/hosting\/restlet\.nl\?.+/.test(value.trim()) || 'Invalid RESTlet URL'
        },
        {
            type: 'text',
            name: 'scope',
            message: 'OAuth scope:',
            initial: 'restlets',
            validate: value => value.trim().length > 0 || 'Scope is required'
        }
    ], { onCancel });

    const alias = answers.alias.trim();
    const profile = {
        accountId: answers.accountId.trim(),
        clientId: answers.clientId.trim(),
        certificateId: answers.certificateId.trim(),
        privateKeyPath: path.resolve(answers.privateKeyPath.trim()),
        restletUrl: answers.restletUrl.trim(),
        scope: answers.scope.trim()
    };

    saveProfile(alias, profile);
    setActiveAlias(alias);

    console.log(`\nSaved profile "${alias}" and set it as active.`);
    console.log(`Credentials store: ${STORE_PATH}`);
}

async function showConfig() {
    const store = loadStore();
    const activeProfile = getActiveProfile();

    if (!activeProfile) {
        console.log('No active profile configured. Run: ns-gm setup');
        return;
    }

    console.log('\nCurrent ns-gm profile configuration:\n');
    console.log(`Credentials store: ${STORE_PATH}`);
    console.log(`Active alias:      ${store.activeAlias}`);
    console.log(`Account ID:        ${activeProfile.accountId}`);
    console.log(`Client ID:         ${maskValue(activeProfile.clientId)}`);
    console.log(`Certificate ID:    ${maskValue(activeProfile.certificateId)}`);
    console.log(`Private Key Path:  ${activeProfile.privateKeyPath}`);
    console.log(`RESTlet URL:       ${activeProfile.restletUrl}`);
    console.log(`Scope:             ${activeProfile.scope || 'restlets'}`);
    console.log('');
}

async function setupCommand(options) {
    try {
        if (options.show) {
            await showConfig();
            return;
        }

        const store = loadStore();
        const aliases = listAliases();
        console.log('NetSuite GM - Profile Setup\n');

        const selectedAlias = await selectAlias(aliases, store.activeAlias);
        if (!selectedAlias) {
            onCancel();
            return;
        }

        if (selectedAlias !== 'new') {
            setActiveAlias(selectedAlias);
            console.log(`\nActive alias set to "${selectedAlias}".`);
            return;
        }

        await createNewAlias(aliases);
    } catch (error) {
        exitWithCode(EXIT_CODES.GENERAL_ERROR, `Setup error: ${error.message}`);
    }
}

module.exports = setupCommand;
