#!/usr/bin/env node

const { Command } = require('commander');
const packageJson = require('../package.json');
const initCommand = require('./commands/init');
const runCommand = require('./commands/run');
const envCommand = require('./commands/env');
const logsCommand = require('./commands/logs');
const stopCommand = require('./commands/stop');
const setupCommand = require('./commands/setup');
const setupCiCommand = require('./commands/setup-ci');
const helpCommand = require('./commands/help');

const program = new Command();

program
    .name('ns-gm')
    .version(packageJson.version)
    .description('NetSuite GM - Execute SuiteScript code from command line');

// Init command - Start the proxy server
program
    .command('init')
    .description('Start the proxy server')
    .action(initCommand);

// Run command - Execute code against NetSuite
program
    .command('run')
    .description('Execute SuiteScript code')
    .option('-c, --code <code>', 'Inline code to execute')
    .option('-f, --file <path>', 'File containing code to execute')
    .action(runCommand);

// Env command - Shortcut for runtime.envType
program
    .command('env')
    .description('Get current NetSuite environment type')
    .action(envCommand);

// Logs command - Retrieve execution logs
program
    .command('logs')
    .description('Retrieve script execution logs')
    .option('-s, --script-id <scriptId>', 'Script ID to retrieve logs for (defaults to RESTlet script)')
    .option('--date-from <date>', 'Start date (YYYY-MM-DD)')
    .option('--date-to <date>', 'End date (YYYY-MM-DD)')
    .option('-t, --type <type>', 'Log type (DEBUG, AUDIT, ERROR, EMERGENCY)')
    .option('-p, --page <number>', 'Page number', '0')
    .option('--page-size <number>', 'Number of logs per page', '20')
    .action(logsCommand);

// Stop command - Stop the proxy server
program
    .command('stop')
    .description('Stop the proxy server')
    .action(stopCommand);

// Setup command - Interactive credential configuration
program
    .command('setup')
    .description('Interactive credential configuration')
    .option('--show', 'Show current configuration (secrets masked)')
    .action(setupCommand);

// Setup CI command - Non-interactive credential configuration
program
    .command('setup:ci')
    .description('Non-interactive credential configuration for CI/sandbox')
    .option('--alias <alias>', 'Profile alias to create/update and activate')
    .option('--account <accountId>', 'NetSuite Account ID')
    .option('--clientid <clientId>', 'OAuth 2.0 Client ID')
    .option('--certificateid <certificateId>', 'Certificate ID (kid)')
    .option('--privatekeypath <path>', 'Private key path (.pem)')
    .option('--restleturl <url>', 'RESTlet URL')
    .option('--scope <scope>', 'OAuth scope (defaults to restlets)')
    .action(setupCiCommand);

// Help command - Show command documentation
program
    .command('help [command]')
    .description('Show help information for commands')
    .option('--format <format>', 'Output format: json (default) or text', 'json')
    .action(helpCommand);

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
