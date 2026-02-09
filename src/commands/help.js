const { EXIT_CODES } = require('../utils/exitCodes');

/**
 * Help data structure with all commands
 */
const helpData = {
    commands: {
        init: {
            brief: "Start the local NetSuite proxy server",
            syntax: "ns-gm init",
            description: "Starts the Express proxy server used by ns-gm commands. The server runs on port 9292 (configurable in config.json) as a detached background process.",
            options: [],
            examples: ["ns-gm init"],
            clarifications: [
                "Server runs as detached process (continues after CLI exits)",
                "Auto-stops after 15 minutes of inactivity (configurable)",
                "Only one instance can run at a time",
                "Check server status with: curl http://localhost:9292/health"
            ]
        },
        run: {
            brief: "Execute SuiteScript 2.1 code against NetSuite",
            syntax: "ns-gm run --code <code> | --file <path>",
            description: "Executes arbitrary SuiteScript 2.1 code against your NetSuite account via the runner RESTlet. Code runs in NetSuite's SuiteScript runtime with access to all N/* modules.",
            options: [
                { flag: "--code <code>", description: "Inline SuiteScript code to execute (for short snippets)" },
                { flag: "--file <path>", description: "Path to file containing SuiteScript code (for longer scripts)" }
            ],
            examples: [
                'ns-gm run --code "return 2 + 2"',
                'ns-gm run --code "const rec = record.load({type: \'customer\', id: 123}); return rec.getValue({fieldId: \'entityid\'});"',
                "ns-gm run --file script.js"
            ],
            clarifications: [
                "Output is the return value of the executed code (what you return from the function)",
                "Errors include stack trace, line numbers, and error type",
                "Requires proxy running (run 'ns-gm init' first)",
                "Governance usage is tracked and returned in response",
                "Use log.debug(), log.audit(), log.error() for logging - retrieve with 'ns-gm logs'",
                "Supports all N/* modules (search, record, query, runtime, format, etc.)"
            ]
        },
        env: {
            brief: "Get the current NetSuite environment type",
            syntax: "ns-gm env",
            description: "Runs the equivalent of: ns-gm run --code \"return runtime.envType\".",
            options: [],
            examples: [
                "ns-gm env"
            ],
            clarifications: [
                "Requires proxy running (run 'ns-gm init' first)",
                "Requires an active profile (run 'ns-gm setup' first)"
            ]
        },
        logs: {
            brief: "Retrieve script execution logs from NetSuite",
            syntax: "ns-gm logs [--script-id <scriptId>] [options]",
            description: "Retrieves execution logs from NetSuite's Script Execution Log for any deployed script. Useful for debugging code executed via 'ns-gm run' or any other script.",
            options: [
                { flag: "--script-id <scriptId>", description: "Script ID to retrieve logs for (e.g., customscript_my_script)" },
                { flag: "--date-from <date>", description: "Start date in YYYY-MM-DD format" },
                { flag: "--date-to <date>", description: "End date in YYYY-MM-DD format" },
                { flag: "--type <type>", description: "Log type: DEBUG, AUDIT, ERROR, EMERGENCY" },
                { flag: "--page <number>", description: "Page number for pagination (default: 0)" },
                { flag: "--page-size <number>", description: "Number of logs per page (default: 20)" }
            ],
            examples: [
                "ns-gm logs --script-id customscript_ns_gm_",
                "ns-gm logs --script-id customscript_sync_handler --type ERROR",
                "ns-gm logs --script-id customscript_my_script --date-from 2025-12-01 --date-to 2025-12-15"
            ],
            clarifications: [
                "Script ID is converted to internal ID automatically",
                "Returns logs in reverse chronological order (newest first)",
                "Default date range is last 7 days if not specified",
                "Pagination starts at page 0",
                "Governance cost: ~10 units per query (SuiteQL search)",
                "Use this to see logs from code executed via 'ns-gm run'"
            ]
        },
        stop: {
            brief: "Stop the local NetSuite proxy server",
            syntax: "ns-gm stop",
            description: "Gracefully stops the local Express proxy server by finding the process using port 9292 and terminating it.",
            options: [],
            examples: ["ns-gm stop"],
            clarifications: [
                "Finds process by port number (9292 by default)",
                "Sends termination signal to the process",
                "Verifies server stopped via health check",
                "Safe to run even if server not running (no error)"
            ]
        },
        setup: {
            brief: "Interactive credential configuration",
            syntax: "ns-gm setup [options]",
            description: "Interactive wizard for profile alias setup. Lets you select an existing alias or create a new one, then stores credentials in ~/.ns-gm/credentials.json.",
            options: [
                { flag: "--show", description: "Display current configuration with secrets masked" }
            ],
            examples: [
                "ns-gm setup",
                "ns-gm setup --show"
            ],
            clarifications: [
                "Prompts show existing aliases plus 'new'",
                "Choosing existing alias only switches active profile",
                "Private key path is validated during setup",
                "Press Ctrl+C to cancel without saving",
                "Credentials are stored in ~/.ns-gm/credentials.json",
                "Private key material is not stored in the credentials file"
            ]
        },
        help: {
            brief: "Show help information for commands",
            syntax: "ns-gm help [command] [options]",
            description: "Displays help information for all commands or a specific command. Output format can be JSON (default, for AI agents) or plain text (for humans).",
            options: [
                { flag: "[command]", description: "Optional command name to get detailed help for (init, run, env, logs, stop, setup)" },
                { flag: "--format <format>", description: "Output format: json (default) or text" }
            ],
            examples: [
                "ns-gm help",
                "ns-gm help run",
                "ns-gm help --format text",
                "ns-gm help logs --format json"
            ],
            clarifications: [
                "JSON format is default for AI agent consumption",
                "Use --format text for human-readable output",
                "Without [command] argument, shows all commands with brief descriptions",
                "With [command] argument, shows detailed help for that command"
            ]
        }
    },
    exitCodes: {
        "0": "SUCCESS - Command completed successfully",
        "1": "GENERAL_ERROR - Unknown or general error",
        "2": "CONFIG_ERROR - Configuration error (port conflict, missing profile/config)",
        "3": "NETWORK_ERROR - Network error (proxy unreachable, connection failed)",
        "4": "VALIDATION_ERROR - Validation error (missing parameters, file not found)",
        "5": "EXECUTION_ERROR - Code execution failed in NetSuite",
        "6": "AUTH_ERROR - OAuth authentication failed"
    }
};

/**
 * Format help output as JSON
 */
function formatJSON(data) {
    return JSON.stringify(data, null, 2);
}

/**
 * Format help output as plain text
 */
function formatText(data) {
    let output = '';

    if (data.command) {
        // Detailed help for specific command
        output += `Command: ${data.command}\n`;
        output += `Brief: ${data.brief}\n`;
        output += `Syntax: ${data.syntax}\n\n`;

        if (data.description) {
            output += `Description:\n${data.description}\n\n`;
        }

        if (data.options && data.options.length > 0) {
            output += `Options:\n`;
            data.options.forEach(opt => {
                output += `  ${opt.flag.padEnd(30)} ${opt.description}\n`;
            });
            output += '\n';
        }

        if (data.examples && data.examples.length > 0) {
            output += `Examples:\n`;
            data.examples.forEach(ex => {
                output += `  ${ex}\n`;
            });
            output += '\n';
        }

        if (data.clarifications && data.clarifications.length > 0) {
            output += `Clarifications:\n`;
            data.clarifications.forEach(cl => {
                output += `  - ${cl}\n`;
            });
            output += '\n';
        }

        if (data.exitCodes) {
            output += `Exit Codes:\n`;
            Object.keys(data.exitCodes).forEach(code => {
                output += `  ${code}: ${data.exitCodes[code]}\n`;
            });
        }
    } else {
        // Overview of all commands
        output += `NetSuite GM - Help\n`;
        output += `${'='.repeat(50)}\n\n`;
        output += `Available Commands:\n\n`;

        Object.keys(data.commands).forEach(cmd => {
            const cmdData = data.commands[cmd];
            output += `  ${cmd.padEnd(12)} ${cmdData.brief}\n`;
        });

        output += `\n\nExit Codes:\n`;
        Object.keys(data.exitCodes).forEach(code => {
            output += `  ${code}: ${data.exitCodes[code]}\n`;
        });

        output += `\n\nFor detailed help: ns-gm help <command>\n`;
    }

    return output;
}

/**
 * Help command implementation
 */
async function helpCommand(commandName, options) {
    try {
        const format = options.format || 'json';

        if (!commandName) {
            // Show overview of all commands
            const data = {
                commands: {},
                exitCodes: helpData.exitCodes
            };

            // Include brief descriptions only
            Object.keys(helpData.commands).forEach(cmd => {
                data.commands[cmd] = {
                    brief: helpData.commands[cmd].brief,
                    syntax: helpData.commands[cmd].syntax
                };
            });

            const output = format === 'text' ? formatText(data) : formatJSON(data);
            console.log(output);
        } else {
            // Show detailed help for specific command
            const cmdData = helpData.commands[commandName];

            if (!cmdData) {
                console.error(`Unknown command: ${commandName}`);
                console.error(`Available commands: ${Object.keys(helpData.commands).join(', ')}`);
                process.exit(EXIT_CODES.VALIDATION_ERROR);
            }

            const data = {
                command: commandName,
                ...cmdData,
                exitCodes: helpData.exitCodes
            };

            const output = format === 'text' ? formatText(data) : formatJSON(data);
            console.log(output);
        }

        process.exit(EXIT_CODES.SUCCESS);
    } catch (error) {
        console.error(`Help error: ${error.message}`);
        process.exit(EXIT_CODES.GENERAL_ERROR);
    }
}

module.exports = helpCommand;
