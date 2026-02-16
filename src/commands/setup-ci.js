const fs = require('fs');
const path = require('path');
const { EXIT_CODES, exitWithCode } = require('../utils/exitCodes');
const {
    saveProfile,
    setActiveAlias,
    STORE_PATH
} = require('../utils/profileStore');

const RESTLET_URL_REGEX = /^https:\/\/.+\/app\/site\/hosting\/restlet\.nl\?.+/;

function requireTrimmedValue(value, label) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        exitWithCode(EXIT_CODES.VALIDATION_ERROR, `${label} is required`);
    }
    return value.trim();
}

function resolveAndValidatePrivateKeyPath(privateKeyPathInput) {
    const resolvedPath = path.resolve(privateKeyPathInput.trim());
    if (!fs.existsSync(resolvedPath)) {
        exitWithCode(EXIT_CODES.VALIDATION_ERROR, `File does not exist: ${resolvedPath}`);
    }
    return resolvedPath;
}

function validateRestletUrl(restletUrl) {
    if (!RESTLET_URL_REGEX.test(restletUrl)) {
        exitWithCode(EXIT_CODES.VALIDATION_ERROR, 'Invalid RESTlet URL');
    }
}

async function setupCiCommand(options) {
    try {
        const alias = requireTrimmedValue(options.alias, 'Alias');
        const accountId = requireTrimmedValue(options.account, 'Account ID');
        const clientId = requireTrimmedValue(options.clientid, 'Client ID');
        const certificateId = requireTrimmedValue(options.certificateid, 'Certificate ID');
        const privateKeyPathInput = requireTrimmedValue(options.privatekeypath, 'Private key path');
        const restletUrl = requireTrimmedValue(options.restleturl, 'RESTlet URL');
        const scopeInput = typeof options.scope === 'string' ? options.scope.trim() : '';

        const privateKeyPath = resolveAndValidatePrivateKeyPath(privateKeyPathInput);
        validateRestletUrl(restletUrl);

        const profile = {
            accountId,
            clientId,
            certificateId,
            privateKeyPath,
            restletUrl,
            scope: scopeInput || 'restlets'
        };

        saveProfile(alias, profile);
        setActiveAlias(alias);

        console.log(`Saved profile "${alias}" and set it as active.`);
        console.log(`Credentials store: ${STORE_PATH}`);
    } catch (error) {
        exitWithCode(EXIT_CODES.GENERAL_ERROR, `Setup CI error: ${error.message}`);
    }
}

module.exports = setupCiCommand;
