import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as oniguruma from 'vscode-oniguruma';
import { getOnigLib, readPackageJson, ROOT } from './helpers/textmate';

interface Rule {
  name?: string;
  contentName?: string;
  match?: string;
  begin?: string;
  end?: string;
  while?: string;
  include?: string;
  patterns?: Rule[];
  captures?: Record<string, Rule>;
  beginCaptures?: Record<string, Rule>;
  endCaptures?: Record<string, Rule>;
  whileCaptures?: Record<string, Rule>;
  repository?: Record<string, Rule>;
}

interface Grammar extends Rule {
  scopeName: string;
  injectionSelector?: string;
}

const contributions = readPackageJson().contributes.grammars;
const grammars = contributions.map((c) => ({
  contribution: c,
  grammar: JSON.parse(fs.readFileSync(path.join(ROOT, c.path), 'utf8')) as Grammar,
}));

/** Visits every rule of a grammar, including repository entries and capture rules. */
function visit(rule: Rule, where: string, fn: (rule: Rule, where: string) => void): void {
  fn(rule, where);
  rule.patterns?.forEach((p, i) => visit(p, `${where}.patterns[${i}]`, fn));
  for (const key of ['captures', 'beginCaptures', 'endCaptures', 'whileCaptures'] as const) {
    for (const [k, c] of Object.entries(rule[key] ?? {})) {
      visit(c, `${where}.${key}[${k}]`, fn);
    }
  }
  for (const [k, r] of Object.entries(rule.repository ?? {})) {
    visit(r, `${where}.repository.${k}`, fn);
  }
}

function scopesOf(rule: Rule): string[] {
  return [rule.name, rule.contentName]
    .filter((s): s is string => !!s)
    .flatMap((s) => s.split(/\s+/));
}

suite('Grammars: structure', () => {
  test('generated grammars are in sync with scripts/grammar/*.js', () => {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-grammars.js'), '--check'], {
      stdio: 'pipe',
    });
  });

  for (const { contribution, grammar } of grammars) {
    suite(contribution.path, () => {
      test('scopeName matches package.json', () => {
        assert.strictEqual(grammar.scopeName, contribution.scopeName);
      });

      test('every regular expression compiles with Oniguruma (the engine VS Code uses)', async () => {
        await getOnigLib();
        const errors: string[] = [];
        visit(grammar, 'grammar', (rule, where) => {
          for (const key of ['match', 'begin', 'end', 'while'] as const) {
            const source = rule[key];
            if (source === undefined) {
              continue;
            }
            try {
              new oniguruma.OnigScanner([source]).dispose();
            } catch (e) {
              errors.push(`${where}.${key}: ${(e as Error).message}`);
            }
          }
        });
        assert.deepStrictEqual(errors, []);
      });

      test('every include resolves', () => {
        const knownScopes = new Set(contributions.map((c) => c.scopeName));
        const repositoryKeys = new Set(Object.keys(grammar.repository ?? {}));
        const errors: string[] = [];
        visit(grammar, 'grammar', (rule, where) => {
          const inc = rule.include;
          if (!inc || inc === '$self' || inc === '$base') {
            return;
          }
          if (inc.startsWith('#')) {
            if (!repositoryKeys.has(inc.slice(1))) {
              errors.push(`${where}: ${inc}`);
            }
          } else if (!knownScopes.has(inc.split('#')[0])) {
            errors.push(`${where}: ${inc} (scope not contributed by this extension)`);
          }
        });
        assert.deepStrictEqual(errors, []);
      });

      test('every repository entry is used', () => {
        const used = new Set<string>();
        visit(grammar, 'grammar', (rule) => {
          if (rule.include?.startsWith('#')) {
            used.add(rule.include.slice(1));
          }
        });
        const unused = Object.keys(grammar.repository ?? {}).filter((k) => !used.has(k));
        assert.deepStrictEqual(unused, []);
      });

      test('begin rules have an end or a while, never both', () => {
        const errors: string[] = [];
        visit(grammar, 'grammar', (rule, where) => {
          if (rule.begin !== undefined && (rule.end === undefined) === (rule.while === undefined)) {
            errors.push(where);
          }
        });
        assert.deepStrictEqual(errors, []);
      });
    });
  }

  test('every scope of the Rego grammar ends with .rego', () => {
    const rego = grammars.find((g) => g.grammar.scopeName === 'source.rego');
    assert.ok(rego);
    const bad: string[] = [];
    visit(rego.grammar, 'grammar', (rule, where) => {
      if (rule === rego.grammar) {
        return; // the root `name` is the display name of the grammar, not a scope
      }
      for (const scope of scopesOf(rule)) {
        if (!scope.endsWith('.rego')) {
          bad.push(`${where}: ${scope}`);
        }
      }
    });
    assert.deepStrictEqual(bad, []);
  });

  test('injections declare the embedded Rego language and stay out of strings, comments and their own content', () => {
    const injections = grammars.filter((g) => g.contribution.injectTo);
    assert.ok(injections.length >= 3);
    for (const { contribution, grammar } of injections) {
      assert.deepStrictEqual(contribution.embeddedLanguages, {
        'meta.embedded.block.rego': 'rego',
      });
      const selector = grammar.injectionSelector ?? '';
      assert.match(
        selector,
        /-meta\.embedded\.block\.rego|-markup\.fenced_code\.block\.markdown/,
        contribution.path
      );
      if (contribution.injectTo?.includes('source.yaml')) {
        assert.match(selector, /-string\b/, contribution.path);
        assert.match(selector, /-comment\b/, contribution.path);
      }
    }
  });

  test('YAML injections: the key rules win ties (L:), the column-0 rules must not', () => {
    // vscode-textmate gives a tie to an injection only when its selector starts with L:.
    // The line-start rules must lose ties so that older YAML grammars keep block scalar content as strings.
    const selector = (scope: string): string =>
      grammars.find((g) => g.grammar.scopeName === scope)?.grammar.injectionSelector ?? '';
    assert.ok(selector('rego-syntax-support.injection.yaml').startsWith('L:'));
    assert.ok(!/^[LR]:/.test(selector('rego-syntax-support.injection.yaml.line-start')));
    assert.ok(selector('rego-syntax-support.injection.markdown').startsWith('L:'));
  });
});
