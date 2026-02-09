const express = require('express');
const cors = require('cors');
const nsapi = require('./auth');
const config = require('../src/utils/config');
const { getActiveProfile } = require('../src/utils/profileStore');

const PORT = config.proxyPort;

const app = express();
let server;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
nsapi.init();

function requireActiveProfile() {
    const activeProfile = getActiveProfile();
    if (!activeProfile) {
        throw new Error('No active profile configured. Run: ns-gm setup');
    }
    return activeProfile;
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        port: PORT
    });
});

// Run endpoint - Execute code in NetSuite
app.post('/run', async (req, res) => {
    try {
        const { code, modules } = req.body;

        // Validate required fields
        if (!code) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: code'
            });
        }

        const activeProfile = requireActiveProfile();

        // Execute code via NetSuite RESTlet
        const startTime = Date.now();
        const response = await nsapi.REST.post({
            action: 'run',
            data: { code, modules },
            credentials: activeProfile
        });
        const executionTime = Date.now() - startTime;

        // Return structured response
        res.json({
            success: response.execution === 'Success',
            result: response.result,
            executionTime,
            governance: response.governance,
            logs: response.logs,
            error: response.execution === 'Error' ? response.result : null
        });
    } catch (error) {
        if (error.message && error.message.includes('Run: ns-gm setup')) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        console.error('Error in /run endpoint:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            response: error.response?.data
        });
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});

// Logs endpoint - Retrieve script execution logs
app.post('/logs', async (req, res) => {
    try {
        const { scriptId, dateFrom, dateTo, type, pageIndex, pageSize } = req.body;
        const activeProfile = requireActiveProfile();

        // Note: scriptId is optional - RESTlet will default to its own script ID if not provided

        // Retrieve logs via NetSuite RESTlet
        const response = await nsapi.REST.post({
            action: 'getscriptexecutionlogs',
            data: { scriptId, dateFrom, dateTo, logType: type, pageIndex, pageSize },
            credentials: activeProfile
        });

        // Return structured response
        // Note: getscriptexecutionlogs returns 'results' not 'logs', and 'success' not 'execution'
        res.json({
            success: response.success,
            logs: response.results || [],
            governance: response.governance,
            error: response.error || null,
            totalRecords: response.totalRecords,
            totalPages: response.totalPages,
            pageIndex: response.pageIndex,
            pageSize: response.pageSize
        });
    } catch (error) {
        if (error.message && error.message.includes('Run: ns-gm setup')) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});

// Start server
function startServer() {
    server = app.listen(PORT, () => {
        console.log(`Proxy server running on http://localhost:${PORT}`);
        console.log(`Health check: http://localhost:${PORT}/health`);
    });
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    if (server) {
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    }
});

// Start if executed directly
if (require.main === module) {
    startServer();
}

module.exports = { app, startServer };
