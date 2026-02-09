/**
 * Semantic exit codes for CLI commands
 *
 * These exit codes provide meaningful information about why the CLI failed,
 * making it easier for scripts and AI agents to handle errors programmatically.
 */

const EXIT_CODES = {
    SUCCESS: 0,              // Command completed successfully
    GENERAL_ERROR: 1,        // General/unknown error
    CONFIG_ERROR: 2,         // Configuration error (missing profile/config, invalid config)
    NETWORK_ERROR: 3,        // Network error (proxy unreachable, NetSuite connection failed)
    VALIDATION_ERROR: 4,     // Validation error (missing required parameters)
    EXECUTION_ERROR: 5,      // Execution error (code execution failed in NetSuite)
    AUTH_ERROR: 6           // Authentication error (OAuth failed)
};

/**
 * Exit the process with a semantic exit code
 * @param {number} code - Exit code from EXIT_CODES
 * @param {string} message - Optional error message to display
 */
function exitWithCode(code, message) {
    if (message) {
        if (code === EXIT_CODES.SUCCESS) {
            console.log(message);
        } else {
            console.error(message);
        }
    }
    process.exit(code);
}

module.exports = {
    EXIT_CODES,
    exitWithCode
};
