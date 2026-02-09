const { spawn } = require('child_process');
const axios = require('axios');
const path = require('path');
const net = require('net');
const { EXIT_CODES, exitWithCode } = require('../utils/exitCodes');
const config = require('../utils/config');
const { loadConfigWithWarning } = require('../utils/config');

const PORT = config.proxyPort;
const PROXY_URL = `http://localhost:${PORT}`;

/**
 * Check if a port is in use
 */
function isPortInUse(port) {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(true); // Port is in use
            } else {
                resolve(false);
            }
        });

        server.once('listening', () => {
            server.close();
            resolve(false); // Port is available
        });

        server.listen(port);
    });
}

/**
 * Wait for proxy server to become healthy
 */
async function waitForHealth(maxAttempts = 10, delayMs = 500) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await axios.get(`${PROXY_URL}/health`, { timeout: 1000 });
            if (response.data.status === 'ok') {
                return true;
            }
        } catch (error) {
            // Server not ready yet, wait and retry
        }

        await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    return false;
}

/**
 * Start the proxy server
 */
async function initCommand() {
    try {
        // Load config with warning (shows warning if config.json not found)
        loadConfigWithWarning();

        // Check if proxy is already running
        const portInUse = await isPortInUse(PORT);

        if (portInUse) {
            // Verify it's our proxy by checking /health
            try {
                const response = await axios.get(`${PROXY_URL}/health`, { timeout: 2000 });
                if (response.data.status === 'ok') {
                    console.log(`Proxy server is already running on port ${PORT}`);
                    console.log(`Health check: ${PROXY_URL}/health`);
                    return;
                }
            } catch (error) {
                exitWithCode(EXIT_CODES.CONFIG_ERROR, `Port ${PORT} is in use by another process. Please stop it or choose a different port.`);
            }
        }

        // Start proxy server as detached process
        const serverPath = path.join(__dirname, '../../server/app.js');
        const child = spawn('node', [serverPath], {
            detached: true,
            stdio: 'ignore'
        });

        child.unref(); // Allow parent to exit independently

        console.log('Starting proxy server...');

        // Wait for server to become healthy
        const healthy = await waitForHealth();

        if (healthy) {
            console.log(`✓ Proxy server started successfully on port ${PORT}`);
            console.log(`Health check: ${PROXY_URL}/health`);
        } else {
            exitWithCode(EXIT_CODES.CONFIG_ERROR, 'Failed to start proxy server. Check your ns-gm configuration.');
        }

    } catch (error) {
        exitWithCode(EXIT_CODES.GENERAL_ERROR, `Error starting proxy server: ${error.message}`);
    }
}

module.exports = initCommand;
