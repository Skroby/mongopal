/**
 * Integration test for Wails API binding validation
 *
 * Validates that all calls to Wails API functions use the correct number of arguments.
 * This prevents runtime errors from argument count mismatches between frontend and backend.
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'acorn';
import { simple as walk } from 'acorn-walk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(__dirname, '..');
const srcRoot = join(frontendRoot, 'src');

/**
 * Extracts exported function names and their parameter counts from App.js.
 * Matches patterns like: export function FunctionName(arg1, arg2) {
 */
function extractFunctionSignatures(content) {
    const regex = /^export function (\w+)\s*\(([^)]*)\)/gm;
    const signatures = {};
    let match;
    while ((match = regex.exec(content)) !== null) {
        const name = match[1];
        const params = match[2].trim();
        // Count parameters by splitting on commas
        // arg1, arg2, arg3 = 3 parameters
        const paramCount = params ? params.split(',').length : 0;
        signatures[name] = paramCount;
    }
    return signatures;
}

/**
 * Recursively find all .js and .jsx files in a directory
 */
function findSourceFiles(dir, files = []) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
            // Skip node_modules, test files, and wailsjs
            if (!entry.includes('node_modules') && !entry.includes('wailsjs')) {
                findSourceFiles(fullPath, files);
            }
        } else if (entry.endsWith('.js') || entry.endsWith('.jsx')) {
            // Skip test files
            if (!entry.includes('.test.') && !entry.includes('.int.test.')) {
                files.push(fullPath);
            }
        }
    }
    return files;
}

/**
 * Find all calls to Wails API functions in a source file.
 * Returns array of { function, argCount, line, column }
 */
function findWailsCalls(content, filePath, wailsFunctions) {
    const calls = [];

    try {
        const ast = parse(content, {
            ecmaVersion: 'latest',
            sourceType: 'module',
            locations: true,
        });

        walk(ast, {
            CallExpression(node) {
                let funcName = null;

                // Direct call: FunctionName(...)
                if (node.callee.type === 'Identifier') {
                    funcName = node.callee.name;
                }
                // Member call: go.FunctionName(...)
                else if (node.callee.type === 'MemberExpression' &&
                         node.callee.property.type === 'Identifier') {
                    funcName = node.callee.property.name;
                }

                if (funcName && wailsFunctions.has(funcName)) {
                    calls.push({
                        function: funcName,
                        argCount: node.arguments.length,
                        line: node.loc.start.line,
                        column: node.loc.start.column,
                    });
                }
            }
        });
    } catch (e) {
        // JSX files may fail to parse with acorn - use regex fallback
        const wailsFuncNames = Array.from(wailsFunctions);
        for (const funcName of wailsFuncNames) {
            // Match function calls: go.FunctionName( or FunctionName(
            const callRegex = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
            let match;
            while ((match = callRegex.exec(content)) !== null) {
                // Find the matching closing paren and count arguments
                // Track depth of (), {}, and [] to only count top-level commas
                const startIdx = match.index + match[0].length;
                let parenDepth = 1;
                let braceDepth = 0;
                let bracketDepth = 0;
                let argCount = 0;
                let hasContent = false;

                for (let i = startIdx; i < content.length && parenDepth > 0; i++) {
                    const char = content[i];
                    if (char === '(') parenDepth++;
                    else if (char === ')') parenDepth--;
                    else if (char === '{') braceDepth++;
                    else if (char === '}') braceDepth--;
                    else if (char === '[') bracketDepth++;
                    else if (char === ']') bracketDepth--;
                    // Only count commas at the top level (not inside objects/arrays)
                    else if (char === ',' && parenDepth === 1 && braceDepth === 0 && bracketDepth === 0) {
                        argCount++;
                    }
                    else if (!char.match(/\s/) && parenDepth === 1) hasContent = true;
                }

                // If we found content, there's at least 1 argument
                if (hasContent) argCount++;

                // Calculate line number
                const linesBefore = content.substring(0, match.index).split('\n');
                const line = linesBefore.length;

                calls.push({
                    function: funcName,
                    argCount,
                    line,
                    column: 0,
                });
            }
        }
    }

    return calls;
}

/**
 * Functions that are known to have special handling or are excluded from validation.
 * Add entries here with justification if needed.
 */
const EXCLUDED_FUNCTIONS = new Set([
    // Example: 'SpecialFunction' - has variadic arguments
]);

describe('Wails API Call Validation', () => {
    // Load function signatures from Wails App.js
    const wailsAppPath = join(__dirname, '../wailsjs/go/main/App.js');
    const wailsContent = readFileSync(wailsAppPath, 'utf-8');
    const signatures = extractFunctionSignatures(wailsContent);
    const wailsFunctions = new Set(Object.keys(signatures));

    it('should call all Wails API functions with correct number of arguments', () => {
        const sourceFiles = findSourceFiles(srcRoot);
        const violations = [];

        for (const filePath of sourceFiles) {
            const content = readFileSync(filePath, 'utf-8');

            // Skip files that don't use Wails API (no 'go.' calls or direct function imports)
            // Most files use: const go = window.go?.main?.App
            if (!content.includes('window.go') && !content.includes('go.main.App')) {
                continue;
            }

            const calls = findWailsCalls(content, filePath, wailsFunctions);

            for (const call of calls) {
                if (EXCLUDED_FUNCTIONS.has(call.function)) continue;

                const expectedArgs = signatures[call.function];
                if (call.argCount !== expectedArgs) {
                    const relativePath = relative(frontendRoot, filePath);
                    violations.push({
                        file: relativePath,
                        line: call.line,
                        function: call.function,
                        expected: expectedArgs,
                        actual: call.argCount,
                    });
                }
            }
        }

        if (violations.length > 0) {
            const report = violations.map(v =>
                `  ${v.file}:${v.line} - ${v.function}() called with ${v.actual} args, expected ${v.expected}`
            ).join('\n');

            expect(violations,
                `Found ${violations.length} Wails API call(s) with wrong number of arguments:\n\n${report}\n\n` +
                `Check the function signatures in wailsjs/go/main/App.js and update the calls.`
            ).toHaveLength(0);
        }
    });

    it('should have parsed Wails function signatures', () => {
        // Sanity check that we're actually parsing signatures
        expect(Object.keys(signatures).length).toBeGreaterThan(20);

        // Verify some known functions have expected param counts
        expect(signatures['Connect']).toBe(1); // connectionId
        expect(signatures['Disconnect']).toBe(1); // connectionId
        expect(signatures['FindDocuments']).toBe(5); // connectionId, database, collection, filter, projection
        expect(signatures['ListDatabases']).toBe(1); // connectionId
        expect(signatures['ListCollections']).toBe(2); // connectionId, database
        expect(signatures['GetDocument']).toBe(4); // connectionId, database, collection, documentId
        expect(signatures['InsertDocument']).toBe(4); // connectionId, database, collection, document
        expect(signatures['UpdateDocument']).toBe(5); // connectionId, database, collection, documentId, document
        expect(signatures['DeleteDocument']).toBe(4); // connectionId, database, collection, documentId
        expect(signatures['DropDatabase']).toBe(2); // connectionId, database
        expect(signatures['DropCollection']).toBe(3); // connectionId, database, collection
        expect(signatures['SaveConnection']).toBe(2); // connection, password
        expect(signatures['DeleteSavedConnection']).toBe(1); // connectionId
        expect(signatures['TestConnection']).toBe(1); // connection
    });
});
