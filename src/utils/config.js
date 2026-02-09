const fs = require('fs');
const path = require('path');

/**
 * Load configuration from config.json
 * @param {boolean} showWarning - Whether to show warning if config not found
 * @returns {Object} Configuration object
 */
function loadConfig(showWarning = false) {
    try {
        const configPath = path.join(__dirname, '../../config.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        // Return default configuration if file doesn't exist or is invalid
        if (showWarning) {
            console.warn('Warning: Could not load config.json, using defaults');
        }
        return {
            proxyPort: 9292,
            proxyInactivityTimeout: 900000,
            defaultLogCount: 20
        };
    }
}

/**
 * Load configuration with warning (for init command)
 * @returns {Object} Configuration object
 */
function loadConfigWithWarning() {
    return loadConfig(true);
}

// Load and cache configuration (without warning)
const config = loadConfig(false);

module.exports = config;
module.exports.loadConfigWithWarning = loadConfigWithWarning;
