const axios = require('axios');
const { exec } = require('child_process');
const { EXIT_CODES, exitWithCode } = require('../utils/exitCodes');
const config = require('../utils/config');

const PORT = config.proxyPort;
const PROXY_URL = `http://localhost:${PORT}`;

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
 * Find and kill the process using the proxy port
 */
function killProcessOnPort(port) {
    return new Promise((resolve, reject) => {
        // Use netstat to find the process ID
        exec(`netstat -ano | findstr :${port}`, (error, stdout, stderr) => {
            if (error || !stdout) {
                reject(new Error('No process found on port ' + port));
                return;
            }

            // Parse the PID from netstat output
            const lines = stdout.split('\n');
            const listening = lines.find(line => line.includes('LISTENING'));

            if (!listening) {
                reject(new Error('No listening process found on port ' + port));
                return;
            }

            // Extract PID (last column)
            const parts = listening.trim().split(/\s+/);
            const pid = parts[parts.length - 1];

            if (!pid || pid === '0') {
                reject(new Error('Could not determine process ID'));
                return;
            }

            // Kill the process (use /F /PID without doubling slashes)
            exec(`taskkill /F /PID ${pid}`, (killError, killStdout, killStderr) => {
                if (killError) {
                    reject(new Error(`Failed to kill process ${pid}: ${killError.message}`));
                    return;
                }
                resolve(pid);
            });
        });
    });
}

/**
 * Stop the proxy server
 */
async function stopCommand() {
    try {
        // Check if proxy is running
        const isRunning = await checkProxyHealth();

        if (!isRunning) {
            console.log('Proxy server is not running.');
            return;
        }

        console.log('Stopping proxy server...');

        // Kill the process
        const pid = await killProcessOnPort(PORT);

        // Wait a moment for the process to fully stop
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify it stopped
        const stillRunning = await checkProxyHealth();

        if (stillRunning) {
            exitWithCode(EXIT_CODES.GENERAL_ERROR, 'Failed to stop proxy server. It may still be running.');
        }

        console.log(`✓ Proxy server stopped successfully (PID: ${pid})`);

    } catch (error) {
        exitWithCode(EXIT_CODES.GENERAL_ERROR, `Error stopping proxy server: ${error.message}`);
    }
}

module.exports = stopCommand;
