/**
 * vscode-textmate registry wired the way VS Code wires grammars:
 * - every grammar contributed in package.json, including `injectTo` injections
 *   (looked up for every prefix of a scope, like VS Code's TMGrammarFactory)
 * - the built-in YAML and Markdown grammars vendored in test/vendor/vscode-grammars
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vsctm from 'vscode-textmate';
import * as oniguruma from 'vscode-oniguruma';

export const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const VENDOR = path.join(ROOT, 'test', 'vendor', 'vscode-grammars');

interface GrammarContribution {
  language?: string;
  scopeName: string;
  path: string;
  injectTo?: string[];
  embeddedLanguages?: Record<string, string>;
}

export interface PackageJson {
  name: string;
  publisher: string;
  version: string;
  [key: string]: unknown;
  contributes: {
    grammars: GrammarContribution[];
    [key: string]: unknown;
  };
}

export function readPackageJson(): PackageJson {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as PackageJson;
}

let onigLib: Promise<vsctm.IOnigLib> | undefined;

export function getOnigLib(): Promise<vsctm.IOnigLib> {
  if (!onigLib) {
    const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer;
    onigLib = oniguruma.loadWASM(wasm).then(() => ({
      createOnigScanner: (sources: string[]): vsctm.OnigScanner =>
        new oniguruma.OnigScanner(sources),
      createOnigString: (s: string): vsctm.OnigString => new oniguruma.OnigString(s),
    }));
  }
  return onigLib;
}

export function createRegistry(): vsctm.Registry {
  const byScope = new Map<string, string>();
  const injections = new Map<string, string[]>();

  for (const file of fs.readdirSync(VENDOR).filter((f) => f.endsWith('.json'))) {
    const fullPath = path.join(VENDOR, file);
    const { scopeName } = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as { scopeName: string };
    byScope.set(scopeName, fullPath);
  }
  for (const g of readPackageJson().contributes.grammars) {
    byScope.set(g.scopeName, path.join(ROOT, g.path));
    for (const target of g.injectTo ?? []) {
      injections.set(target, [...(injections.get(target) ?? []), g.scopeName]);
    }
  }

  return new vsctm.Registry({
    onigLib: getOnigLib(),
    loadGrammar: (scopeName: string): Promise<vsctm.IRawGrammar | null> => {
      const file = byScope.get(scopeName);
      if (!file) {
        return Promise.resolve(null);
      }
      return Promise.resolve(vsctm.parseRawGrammar(fs.readFileSync(file, 'utf8'), file));
    },
    getInjections: (scopeName: string): string[] => {
      const parts = scopeName.split('.');
      const result: string[] = [];
      for (let i = 1; i <= parts.length; i++) {
        result.push(...(injections.get(parts.slice(0, i).join('.')) ?? []));
      }
      return result;
    },
  });
}

export interface Token {
  line: number;
  text: string;
  scopes: string[];
}

export interface TokenizeResult {
  tokens: Token[];
  /** Depth of the rule stack after the last line (1 = back at the grammar root). */
  finalDepth: number;
}

const registry = createRegistry();

export async function tokenize(text: string, scopeName = 'source.rego'): Promise<TokenizeResult> {
  const grammar = await registry.loadGrammar(scopeName);
  if (!grammar) {
    throw new Error(`grammar ${scopeName} not found`);
  }
  let stack: vsctm.StateStack = vsctm.INITIAL;
  const tokens: Token[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const result = grammar.tokenizeLine(line, stack);
    for (const t of result.tokens) {
      tokens.push({
        line: i + 1,
        text: line.substring(t.startIndex, t.endIndex),
        scopes: t.scopes,
      });
    }
    stack = result.ruleStack;
  });
  return { tokens, finalDepth: (stack as unknown as { depth: number }).depth };
}
