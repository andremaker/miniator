'use strict';

const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Construct the deprecated project token without adding it to engine sources.
const forbidden = String.fromCharCode(98, 101, 97, 110);
const names = execFileSync('git', ['ls-files', '-z'], {encoding: 'utf8'}).split('\0').filter(Boolean);
const violations = [];
for (const name of names) {
  if (name.toLowerCase().includes(forbidden)) {
    violations.push(`${name}: filename`);
    continue;
  }
  const file = path.resolve(__dirname, '..', name);
  const content = fs.readFileSync(file);
  if (content.includes(0)) continue;
  const text = content.toString('utf8');
  const hit = text.toLowerCase().indexOf(forbidden);
  if (hit !== -1) {
    const line = text.slice(0, hit).split('\n').length;
    violations.push(`${name}:${line}`);
  }
}
if (violations.length) {
  console.error('Deprecated project namespace found in Miniator:\n' + violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Miniator namespace check OK (${names.length} tracked files).`);
}
