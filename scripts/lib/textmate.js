'use strict';

/**
 * Builds a vscode-textmate Registry that mirrors how VS Code wires grammars:
 * every grammar contributed in package.json (including `injectTo` injections),
 * plus the built-in YAML and Markdown grammars vendored in test/vendor/vscode-grammars.
 */

const fs = require('fs');
const path = require('path');
const vsctm = require('vscode-textmate');
const oniguruma = require('vscode-oniguruma');

const ROOT = path.resolve(__dirname, '..', '..');
const VENDOR = path.join(ROOT, 'test', 'vendor', 'vscode-grammars');

let onigLib;
function getOnigLib() {
  if (!onigLib) {
    const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer;
    onigLib = oniguruma.loadWASM(wasm).then(() => ({
      createOnigScanner: (sources) => new oniguruma.OnigScanner(sources),
      createOnigString: (s) => new oniguruma.OnigString(s),
    }));
  }
  return onigLib;
}

function collectGrammars() {
  const byScope = new Map();
  const injections = new Map();

  for (const file of fs.readdirSync(VENDOR).filter((f) => f.endsWith('.json'))) {
    const fullPath = path.join(VENDOR, file);
    const { scopeName } = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    byScope.set(scopeName, fullPath);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const g of pkg.contributes.grammars) {
    byScope.set(g.scopeName, path.join(ROOT, g.path));
    for (const target of g.injectTo || []) {
      if (!injections.has(target)) {
        injections.set(target, []);
      }
      injections.get(target).push(g.scopeName);
    }
  }
  return { byScope, injections };
}

function createRegistry() {
  const { byScope, injections } = collectGrammars();
  return new vsctm.Registry({
    onigLib: getOnigLib(),
    loadGrammar: async (scopeName) => {
      const file = byScope.get(scopeName);
      if (!file) {
        return null;
      }
      return vsctm.parseRawGrammar(fs.readFileSync(file, 'utf8'), file);
    },
    // Same lookup as VS Code's TMGrammarFactory: injections registered for every prefix of the scope.
    getInjections: (scopeName) => {
      const parts = scopeName.split('.');
      const result = [];
      for (let i = 1; i <= parts.length; i++) {
        result.push(...(injections.get(parts.slice(0, i).join('.')) || []));
      }
      return result;
    },
  });
}

module.exports = { createRegistry, getOnigLib, ROOT };
