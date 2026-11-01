#!/usr/bin/env node
/**
 * Debug helper: prints the TextMate tokens of a file exactly as VS Code would compute them
 * (same vscode-textmate / vscode-oniguruma versions, same injection mechanism).
 *
 *   node scripts/dump-tokens.js <file> [scopeName]
 *
 * scopeName defaults from the extension: .rego -> source.rego, .yaml/.yml -> source.yaml,
 * .md -> text.html.markdown. Host grammars (YAML, Markdown) come from test/vendor/vscode-grammars.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { createRegistry } = require('./lib/textmate');

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

  const registry = createRegistry();
  const grammar = await registry.loadGrammar(scope);
  let stack = null;
  fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((line, i) => {
      const { tokens, ruleStack } = grammar.tokenizeLine(line, stack);
      stack = ruleStack;
      console.log(`${String(i + 1).padStart(3)}: ${line}`);
      for (const t of tokens) {
        const text = line.substring(t.startIndex, t.endIndex);
        console.log(`       [${t.startIndex}-${t.endIndex}] ${JSON.stringify(text)}  ${t.scopes.slice(1).join(' ')}`);
      }
    });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
