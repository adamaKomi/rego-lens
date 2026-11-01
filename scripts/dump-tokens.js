#!/usr/bin/env node
/**
 * Debug helper: prints the TextMate tokens of a file as VS Code computes them
 * (same vscode-textmate / vscode-oniguruma versions, same injection mechanism).
 * Requires `npm run compile` first.
 *
 *   node scripts/dump-tokens.js <file> [scopeName]
 *
 * scopeName defaults from the extension: .rego -> source.rego, .yaml/.yml -> source.yaml,
 * .md -> text.html.markdown. Host grammars (YAML, Markdown) come from test/vendor/vscode-grammars.
 */
'use strict';

const fs = require('fs');
const path = require('path');

async function main() {
  const [file, scopeArg] = process.argv.slice(2);
  if (!file) {
    console.error('usage: node scripts/dump-tokens.js <file> [scopeName]');
    process.exit(2);
  }
  const ext = path.extname(file).toLowerCase();
  const scope =
    scopeArg ||
    { '.rego': 'source.rego', '.yaml': 'source.yaml', '.yml': 'source.yaml', '.md': 'text.html.markdown' }[ext];
  if (!scope) {
    throw new Error(`Cannot infer the scope of ${file}; pass it explicitly.`);
  }

  const { tokenize } = require('../out/test/unit/helpers/textmate');
  const { tokens } = await tokenize(fs.readFileSync(file, 'utf8'), scope);
  let current = 0;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const t of tokens) {
    if (t.line !== current) {
      current = t.line;
      console.log(`${String(current).padStart(4)}: ${lines[current - 1]}`);
    }
    console.log(`      ${JSON.stringify(t.text)}  ${t.scopes.slice(1).join(' ')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
