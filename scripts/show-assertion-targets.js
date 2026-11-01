#!/usr/bin/env node
/**
 * Dev helper for vscode-tmgrammar-test files: prints, for every `^^^` / `<-` assertion,
 * the exact source text it points at, so misaligned carets are easy to spot.
 *
 *   node scripts/show-assertion-targets.js test/grammar/literals.test.rego
 */
'use strict';

const fs = require('fs');

for (const file of process.argv.slice(2)) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const header = /^(.+?)\s*SYNTAX TEST\s+"/.exec(lines[0]);
  if (!header) {
    console.error(`${file}: missing SYNTAX TEST header`);
    process.exitCode = 1;
    continue;
  }
  const comment = header[1];
  let source = null;
  lines.forEach((line, i) => {
    const rest = line.startsWith(comment) ? line.slice(comment.length) : null;
    const caret = rest !== null && /^\s*\^/.test(rest);
    const arrow = rest !== null && /^\s*<[~]*-+/.test(rest);
    if (!caret && !arrow) {
      source = line;
      return;
    }
    let from;
    let to;
    let scopes;
    if (caret) {
      const m = /^(\s*)(\^+)\s*(.*)$/.exec(rest);
      from = comment.length + m[1].length;
      to = from + m[2].length;
      scopes = m[3];
    } else {
      const m = /^\s*<(~*)(-+)\s*(.*)$/.exec(rest);
      from = m[1].length;
      to = from + m[2].length;
      scopes = m[3];
    }
    console.log(`${file}:${i + 1}  ${JSON.stringify(source.slice(from, to))}  ->  ${scopes}`);
  });
}
