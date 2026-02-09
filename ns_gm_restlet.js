/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope Public
 * @description RESTlet for NetSuite GM - Execute code and retrieve logs with all modules
 */
define([
    'N/runtime', 'N/search', 'N/query', 'N/record', 'N/format', 'N/transaction',
    'N/log', 'N/file', 'N/https', 'N/http', 'N/email', 'N/error', 'N/url',
    'N/encode', 'N/crypto', 'N/currency', 'N/render', 'N/xml', 'N/config',
    'N/task', 'N/redirect', 'N/cache', 'N/certificateControl', 'N/workflow'
],
    function (runtime, search, query, record, format, transaction,
        log, file, https, http, email, error, url,
        encode, crypto, currency, render, xml, config,
        task, redirect, cache, certificateControl, workflow) {

        /**
         * POST handler
         * @param {Object} requestBody - Request payload
         * @returns {Object} Response object
         */
        function post(requestBody) {
            const action = requestBody.action;

            if (action === 'run') {
                return handleRunAction(requestBody);
            }
            else if (action === 'getscriptexecutionlogs') {
                return handleGetLogsAction(requestBody);
            }
            else {
                return {
                    success: false,
                    error: 'Unknown action: ' + action
                };
            }
        }

        /**
         * Handle 'run' action - Execute arbitrary SuiteScript code
         * @param {Object} requestBody
         * @returns {Object}
         */
        function handleRunAction(requestBody) {
            // Track governance before execution
            const currentScript = runtime.getCurrentScript();
            const initialGovernance = currentScript.getRemainingUsage();

            // Validate payload
            if (!requestBody.data || !requestBody.data.code) {
                return {
                    execution: 'Failure',
                    error: 'Missing code in data payload for action "run".',
                    governance: {
                        initial: initialGovernance,
                        remaining: currentScript.getRemainingUsage()
                    }
                };
            }

            const userCode = requestBody.data.code;
            const requestedModules = requestBody.data.modules || [
                'log', 'search', 'record', 'runtime', 'format', 'query', 'transaction',
                'file', 'https', 'http', 'email', 'error', 'url', 'encode', 'crypto',
                'currency', 'render', 'xml', 'config', 'task', 'redirect', 'cache',
                'certificateControl', 'workflow'
            ];

            // Map of all available NetSuite modules (all pre-loaded)
            const moduleMap = {
                'log': log,
                'search': search,
                'record': record,
                'runtime': runtime,
                'format': format,
                'query': query,
                'transaction': transaction,
                'file': file,
                'https': https,
                'http': http,
                'email': email,
                'error': error,
                'url': url,
                'encode': encode,
                'crypto': crypto,
                'currency': currency,
                'render': render,
                'xml': xml,
                'config': config,
                'task': task,
                'redirect': redirect,
                'cache': cache,
                'certificateControl': certificateControl,
                'workflow': workflow
            };

            // Dynamically load modules if not already loaded
            const loadModule = function (moduleName) {
                try {
                    if (moduleMap[moduleName] === null) {
                        moduleMap[moduleName] = require('N/' + moduleName);
                    }
                    return moduleMap[moduleName];
                } catch (e) {
                    log.error({
                        title: 'MODULE LOAD ERROR',
                        details: 'Failed to load module N/' + moduleName + ': ' + e.toString()
                    });
                    return null;
                }
            };

            // Build execution scope with requested modules
            const moduleParamNames = [];
            const moduleParamValues = [];

            for (var i = 0; i < requestedModules.length; i++) {
                var moduleName = requestedModules[i];
                var moduleObj = loadModule(moduleName);
                if (moduleObj) {
                    moduleParamNames.push(moduleName);
                    moduleParamValues.push(moduleObj);
                }
            }

            // Track execution time
            const executionStartTime = new Date().getTime();

            // Execute the code
            const executionOutput = safeExecute(userCode, moduleParamNames, moduleParamValues);

            const executionEndTime = new Date().getTime();
            const executionTimeMs = executionEndTime - executionStartTime;

            // Get final governance
            const finalGovernance = currentScript.getRemainingUsage();

            // Return response
            return {
                execution: executionOutput.success ? 'Success' : 'Error',
                result: executionOutput.success ? executionOutput.result : null,
                error: executionOutput.success ? null : executionOutput.error,
                executionTime: {
                    netsuiteMs: executionTimeMs
                },
                governance: {
                    initial: initialGovernance,
                    remaining: finalGovernance,
                    used: initialGovernance - finalGovernance
                },
                logs: []
            };
        }

        /**
         * Safely execute user code with injected modules
         * @param {string} userCode
         * @param {Array} moduleNames
         * @param {Array} moduleValues
         * @returns {Object}
         */
        function safeExecute(userCode, moduleNames, moduleValues) {
            try {
                // Create function with variable number of parameters
                const executionFunction = new Function(...moduleNames, userCode);

                // Execute the function, passing the required modules as arguments
                const finalResult = executionFunction(...moduleValues);

                // Stringify the result for JSON transport
                var resultString = typeof finalResult !== 'undefined' ? JSON.stringify(finalResult) : 'undefined';

                return {
                    success: true,
                    result: resultString
                };
            } catch (e) {
                log.error({
                    title: 'EXECUTION ERROR',
                    details: e.toString()
                });

                return {
                    success: false,
                    error: e.toString()
                };
            }
        }

        /**
         * Handle 'getscriptexecutionlogs' action - Retrieve script execution logs with filters
         * @param {Object} requestBody
         * @returns {Object}
         */
        function handleGetLogsAction(requestBody) {
            // Track governance before execution
            const currentScript = runtime.getCurrentScript();
            const initialGovernance = currentScript.getRemainingUsage();

            try {
                // Get scriptId parameter, default to current script's ID if not provided
                var scriptId = requestBody.data && requestBody.data.scriptId ? requestBody.data.scriptId : currentScript.id;

                // Convert script ID to internal ID if needed
                // scriptnote.scripttype expects internal numeric ID, not string ID
                var scriptInternalId = scriptId;

                // If scriptId looks like a string ID (starts with 'customscript_'), convert it
                if (scriptId.toString().indexOf('customscript_') === 0) {
                    try {
                        var scriptLookup = search.create({
                            type: 'script',
                            filters: [['scriptid', 'is', scriptId]],
                            columns: ['internalid']
                        });

                        var scriptResult = scriptLookup.run().getRange({ start: 0, end: 1 });

                        if (scriptResult && scriptResult.length > 0) {
                            scriptInternalId = scriptResult[0].id;
                            log.debug('Script ID conversion', {
                                stringId: scriptId,
                                internalId: scriptInternalId
                            });
                        } else {
                            return {
                                success: false,
                                error: 'Script not found: ' + scriptId,
                                governance: {
                                    initial: initialGovernance,
                                    remaining: currentScript.getRemainingUsage()
                                }
                            };
                        }
                    } catch (lookupError) {
                        log.error('Script ID lookup failed', lookupError);
                        return {
                            success: false,
                            error: 'Failed to lookup script: ' + lookupError.toString(),
                            governance: {
                                initial: initialGovernance,
                                remaining: currentScript.getRemainingUsage()
                            }
                        };
                    }
                }

                // Get optional parameters
                const dateFrom = requestBody.data && requestBody.data.dateFrom ? requestBody.data.dateFrom : null;
                const dateTo = requestBody.data && requestBody.data.dateTo ? requestBody.data.dateTo : null;
                const logType = requestBody.data && requestBody.data.logType ? requestBody.data.logType : null;
                const pageIndex = requestBody.data && requestBody.data.pageIndex !== undefined ? requestBody.data.pageIndex : 0;
                const pageSize = requestBody.data && requestBody.data.pageSize !== undefined ? requestBody.data.pageSize : 20;

                // Execute logs query with internal ID
                const logsData = getScriptExecutionLogs(scriptInternalId, dateFrom, dateTo, logType, pageIndex, pageSize);

                // Get final governance
                const finalGovernance = currentScript.getRemainingUsage();

                // Return response with governance tracking
                return {
                    success: true,
                    results: logsData.results,
                    governance: {
                        initial: initialGovernance,
                        remaining: finalGovernance,
                        used: initialGovernance - finalGovernance
                    },
                    pageIndex: logsData.pageIndex,
                    pageSize: logsData.pageSize,
                    totalRecords: logsData.totalRecords,
                    totalPages: logsData.totalPages
                };

            } catch (error) {
                log.error({
                    title: 'Error getting script execution logs',
                    details: error.toString()
                });

                return {
                    success: false,
                    error: error.toString(),
                    governance: {
                        initial: initialGovernance,
                        remaining: currentScript.getRemainingUsage()
                    }
                };
            }
        }

        /**
         * Query script execution logs with filters
         * @param {string} scriptId - Script internal ID
         * @param {string|null} dateFrom - Start date (YYYY-MM-DD)
         * @param {string|null} dateTo - End date (YYYY-MM-DD)
         * @param {string|null} logType - Log type filter (DEBUG, AUDIT, ERROR, EMERGENCY)
         * @param {number} pageIndex - Page number (0-based)
         * @param {number} pageSize - Number of results per page
         * @returns {Object}
         */
        function getScriptExecutionLogs(scriptId, dateFrom, dateTo, logType, pageIndex, pageSize) {
            // Calculate offset for pagination
            var offset = pageIndex * pageSize;

            // Build SuiteQL query with dynamic date range
            var sqlQuery = `
                SELECT
                    scriptnote.internalid,
                    scriptnote.date,
                    scriptnote.type,
                    scriptnote.title,
                    scriptnote.detail,
                    scriptnote.scripttype
                FROM
                    scriptnote
                WHERE
                    scriptnote.scripttype = ?
            `;

            var params = [scriptId];

            // Add date range filter if provided
            if (dateFrom && dateTo) {
                sqlQuery += " AND scriptnote.date BETWEEN TO_DATE(?, 'YYYY-MM-DD') AND TO_DATE(?, 'YYYY-MM-DD')";
                params.push(dateFrom);
                params.push(dateTo);
            } else if (dateFrom) {
                sqlQuery += " AND scriptnote.date >= TO_DATE(?, 'YYYY-MM-DD')";
                params.push(dateFrom);
            } else if (dateTo) {
                sqlQuery += " AND scriptnote.date <= TO_DATE(?, 'YYYY-MM-DD')";
                params.push(dateTo);
            } else {
                // Default: last 7 days if no date range specified
                sqlQuery += " AND scriptnote.date >= BUILTIN.RELATIVE_RANGES('DAGO7', 'START')";
            }

            // Add log type filter if provided
            if (logType) {
                sqlQuery += " AND UPPER(scriptnote.type) = ?";
                params.push(logType.toUpperCase());
            }

            // Add ordering and pagination
            sqlQuery += `
                ORDER BY
                    scriptnote.date DESC
                OFFSET ${offset} ROWS
                FETCH FIRST ${pageSize} ROWS ONLY
            `;

            log.debug({
                title: 'Executing SuiteQL for Script Logs',
                details: {
                    scriptId: scriptId,
                    dateFrom: dateFrom,
                    dateTo: dateTo,
                    logType: logType,
                    pageIndex: pageIndex,
                    pageSize: pageSize,
                    offset: offset
                }
            });

            // Execute query
            const resultSet = query.runSuiteQL({
                query: sqlQuery,
                params: params
            });

            const results = resultSet.asMappedResults();

            // Get total count for pagination
            var countQuery = `
                SELECT
                    COUNT(*) as total
                FROM
                    scriptnote
                WHERE
                    scriptnote.scripttype = ?
            `;

            var countParams = [scriptId];

            if (dateFrom && dateTo) {
                countQuery += " AND scriptnote.date BETWEEN TO_DATE(?, 'YYYY-MM-DD') AND TO_DATE(?, 'YYYY-MM-DD')";
                countParams.push(dateFrom);
                countParams.push(dateTo);
            } else if (dateFrom) {
                countQuery += " AND scriptnote.date >= TO_DATE(?, 'YYYY-MM-DD')";
                countParams.push(dateFrom);
            } else if (dateTo) {
                countQuery += " AND scriptnote.date <= TO_DATE(?, 'YYYY-MM-DD')";
                countParams.push(dateTo);
            } else {
                countQuery += " AND scriptnote.date >= BUILTIN.RELATIVE_RANGES('DAGO7', 'START')";
            }

            if (logType) {
                countQuery += " AND UPPER(scriptnote.type) = ?";
                countParams.push(logType.toUpperCase());
            }

            const countResultSet = query.runSuiteQL({
                query: countQuery,
                params: countParams
            });

            const countResults = countResultSet.asMappedResults();
            const totalRecords = countResults[0].total;

            log.audit({
                title: 'Script Execution Logs Retrieved',
                details: {
                    scriptId: scriptId,
                    pageIndex: pageIndex,
                    pageSize: pageSize,
                    recordCount: results.length,
                    totalRecords: totalRecords
                }
            });

            // Map results to clean format
            var cleanResults = [];
            results.forEach(function (logEntry) {
                cleanResults.push({
                    internalId: logEntry.internalid,
                    title: logEntry.title,
                    type: logEntry.type,
                    date: logEntry.date,
                    scriptType: logEntry.scripttype,
                    details: logEntry.detail
                });
            });

            return {
                results: cleanResults,
                pageIndex: pageIndex,
                pageSize: pageSize,
                totalRecords: totalRecords,
                totalPages: Math.ceil(totalRecords / pageSize)
            };
        }

        return {
            post: post
        };
    }
);
