const axios = require('axios');
const { EXIT_CODES, exitWithCode } = require('../utils/exitCodes');
const config = require('../utils/config');

const PORT = config.proxyPort;
const PROXY_URL = `http://localhost:${PORT}`;

/**
 * Format and display logs
 */
function displayLogs(response) {
    const { success, logs, governance, error } = response;

    // Handle case where query succeeded but no logs found (success: false, error: null)
    if (!success && !error) {
        console.log('\nNo logs found for the specified criteria.');
        if (governance) {
            console.log(`Governance used: ${governance.initial - governance.remaining} units`);
        }
        return;
    }

    if (!success) {
        console.error('\n✗ Failed to retrieve logs\n');
        console.error('Error:', error || 'Unknown error');
        return;
    }

    if (!logs || logs.length === 0) {
        console.log('\nNo logs found for the specified criteria.');
        return;
    }

    console.log(`\nFound ${logs.length} log entries:\n`);
    console.log('─'.repeat(80));

    logs.forEach((log, index) => {
        console.log(`\n[${index + 1}] ${log.date || 'Unknown Date'}`);
        console.log(`    Type: ${log.type || 'N/A'}`);
        console.log(`    Title: ${log.title || 'N/A'}`);
        if (log.details) {
            console.log(`    Details: ${log.details}`);
        }
        if (log.scriptType) {
            console.log(`    Script Type: ${log.scriptType}`);
        }
    });

    console.log('\n' + '─'.repeat(80));

    if (governance) {
        console.log(`\nGovernance used: ${governance.initial - governance.remaining} units`);
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
 * Retrieve logs command
 */
async function logsCommand(options) {
    try {
        const { scriptId, dateFrom, dateTo, type, page, pageSize } = options;

        // Check if proxy is running
        const proxyHealthy = await checkProxyHealth();
        if (!proxyHealthy) {
            console.error('Error: Proxy server is not running.');
            exitWithCode(EXIT_CODES.NETWORK_ERROR, 'Start it with: ns-gm init');
        }

        // Build request payload
        const payload = {};

        if (scriptId) payload.scriptId = scriptId;
        if (dateFrom) payload.dateFrom = dateFrom;
        if (dateTo) payload.dateTo = dateTo;
        if (type) payload.type = type.toUpperCase();
        if (page) payload.pageIndex = parseInt(page);
        if (pageSize) payload.pageSize = parseInt(pageSize);

        // Retrieve logs
        const targetScript = scriptId ? scriptId : 'RESTlet runner';
        console.log(`Retrieving logs for ${targetScript}...`);
        const response = await axios.post(`${PROXY_URL}/logs`, payload, {
            timeout: 30000 // 30 second timeout
        });

        // Display logs
        displayLogs(response.data);

    } catch (error) {
        if (error.response) {
            // Server responded with error
            console.error('\n✗ Failed to retrieve logs\n');
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

module.exports = logsCommand;
