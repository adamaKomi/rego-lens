#!/usr/bin/env node
/**
 * Builds the TextMate grammars shipped in syntaxes/ from their sources in scripts/grammar/.
 *
 *   node scripts/build-grammars.js           write syntaxes/*.json
 *   node scripts/build-grammars.js --check   exit 1 if syntaxes/*.json are out of date (used in CI)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const OUTPUTS = {
  'syntaxes/rego.tmLanguage.json': './grammar/rego',
  'syntaxes/rego.injection.yaml.json': './grammar/injection-yaml',
  'syntaxes/rego.injection.markdown.json': './grammar/injection-markdown',
};

function render(modulePath) {
  return JSON.stringify(require(modulePath), null, 2) + '\n';
}

function main() {
  const check = process.argv.includes('--check');
  const stale = [];

  for (const [output, source] of Object.entries(OUTPUTS)) {
    const target = path.join(ROOT, output);
    const content = render(source);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (current === content) {
      continue;
    }
    if (check) {
      stale.push(output);
    } else {
      fs.writeFileSync(target, content);
      console.log(`wrote ${output}`);
    }
  }

  if (stale.length > 0) {
    console.error(`Out of date: ${stale.join(', ')}\nRun \`npm run build:grammars\` and commit the result.`);
    process.exit(1);
  }
  if (check) {
    console.log('Grammars are up to date.');
  }
}

main();
