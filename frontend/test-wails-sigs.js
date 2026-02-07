#!/usr/bin/env node
/**
 * Quick test script to verify Wails signature extraction
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function extractFunctionSignatures(content) {
    const regex = /^export function (\w+)\s*\(([^)]*)\)/gm;
    const signatures = {};
    let match;
    while ((match = regex.exec(content)) !== null) {
        const name = match[1];
        const params = match[2].trim();
        const paramCount = params ? params.split(',').length : 0;
        signatures[name] = paramCount;
    }
    return signatures;
}

const wailsAppPath = join(__dirname, 'wailsjs/go/main/App.js');
const wailsContent = readFileSync(wailsAppPath, 'utf-8');
const signatures = extractFunctionSignatures(wailsContent);

console.log('Found', Object.keys(signatures).length, 'functions');
console.log('\nSample signatures:');
console.log('Connect:', signatures['Connect']);
console.log('FindDocuments:', signatures['FindDocuments']);
console.log('UpdateDocument:', signatures['UpdateDocument']);
console.log('ListDatabases:', signatures['ListDatabases']);
console.log('SaveConnection:', signatures['SaveConnection']);

console.log('\nAll signatures:');
Object.entries(signatures).sort().forEach(([name, count]) => {
    console.log(`  ${name}: ${count}`);
});
