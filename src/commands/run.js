const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { EXIT_CODES, exitWithCode } = require('../utils/exitCodes');
const config = require('../utils/config');

const PORT = config.proxyPort;
const PROXY_URL = `http://localhost:${PORT}`;

/**
 * Format and display execution results
 */
function displayResults(response) {
    const { success, result, executionTime, governance, logs, error } = response;

    if (success) {
        console.log('\n✓ Execution successful\n');
        console.log('Result:', result);
        console.log(`\nExecution time: ${executionTime}ms`);

        if (governance) {
            console.log('\nGovernance:');
            console.log(`  Initial:   ${governance.initial}`);
            console.log(`  Remaining: ${governance.remaining}`);
            console.log(`  Used:      ${governance.used}`);
        }

        if (logs && logs.length > 0) {
            console.log('\nLogs:');
            logs.forEach(log => console.log(`  ${log}`));
        }
    } else {
        console.error('\n✗ Execution failed\n');
        console.error('Error:', error || 'Unknown error');

        if (logs && logs.length > 0) {
            console.log('\nLogs:');
            logs.forEach(log => console.log(`  ${log}`));
        }
    }
}

/**
 * Check if proxy server is running
 */
async function checkProxyHealth() {
    try {
        const response = await axios.get(`${PROXY_URL}/health`, { timeout: 2000 });
        return response.data.status === 'ok';
    } catch (error) {
        return false;
    }
}

/**
 * Execute code command
 */
async function runCommand(options) {
    try {
        const { code, file } = options;

        // Validate input
        if (!code && !file) {
            console.error('Error: Must provide either --code or --file');
            console.error('Usage: ns-gm run --code "return 2+2"');
            console.error('   or: ns-gm run --file script.js');
            exitWithCode(EXIT_CODES.VALIDATION_ERROR);
        }

        if (code && file) {
            exitWithCode(EXIT_CODES.VALIDATION_ERROR, 'Error: Cannot use both --code and --file. Choose one.');
        }

        // Get code to execute
        let codeToExecute = code;
        if (file) {
            const filePath = path.resolve(file);
            if (!fs.existsSync(filePath)) {
                exitWithCode(EXIT_CODES.VALIDATION_ERROR, `Error: File not found: ${filePath}`);
            }
            codeToExecute = fs.readFileSync(filePath, 'utf8');
        }

        // Check if proxy is running
        const proxyHealthy = await checkProxyHealth();
        if (!proxyHealthy) {
            console.error('Error: Proxy server is not running.');
            exitWithCode(EXIT_CODES.NETWORK_ERROR, 'Start it with: ns-gm init');
        }

        // Execute code
        console.log('Executing code...');
        const response = await axios.post(`${PROXY_URL}/run`, {
            code: codeToExecute
        }, {
            timeout: 30000 // 30 second timeout
        });

        // Display results
        displayResults(response.data);

    } catch (error) {
        if (error.response) {
            // Server responded with error
            console.error('\n✗ Execution failed\n');
            const errorMsg = error.response.data.error || error.message;
            console.error('Error:', errorMsg);
            exitWithCode(EXIT_CODES.EXECUTION_ERROR);
        } else if (error.code === 'ECONNREFUSED') {
            console.error('Error: Cannot connect to proxy server.');
            exitWithCode(EXIT_CODES.NETWORK_ERROR, 'Start it with: ns-gm init');
        } else {
            exitWithCode(EXIT_CODES.GENERAL_ERROR, `Error: ${error.message}`);
        }
    }
}

module.exports = runCommand;
