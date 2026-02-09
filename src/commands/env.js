const { EXIT_CODES, exitWithCode } = require('../utils/exitCodes');
const runCommand = require('./run');

async function envCommand() {
    try {
        await runCommand({ code: 'return runtime.envType' });
    } catch (error) {
        exitWithCode(EXIT_CODES.GENERAL_ERROR, `Env command failed: ${error.message}`);
    }
}

module.exports = envCommand;
