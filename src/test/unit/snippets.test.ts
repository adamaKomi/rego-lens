import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { expandSnippet } from './helpers/snippets';
import { ROOT, tokenize } from './helpers/textmate';

interface Snippet {
  prefix: string;
  body: string[];
  description: string;
}

const snippets = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'snippets', 'rego.snippets.json'), 'utf8')
) as Record<string, Snippet>;

/** Expanded snippets are written here so that CI can run `opa parse` on them. */
const OUTPUT_DIR = path.join(ROOT, 'out', 'snippets-check');

/**
 * Wraps a snippet into a complete module so the OPA parser can check it:
 * module snippets are kept as is, rule snippets get a package, body snippets also get a rule.
 */
function asModule(prefix: string, expanded: string): string {
  if (/^package /m.test(expanded)) {
    return expanded;
  }
  const pkg = `package snippets.${prefix.replace(/\W/g, '_')}\n\n`;
  if (/^(import |# METADATA)/.test(expanded)) {
    // An annotation must be followed by a package or a rule.
    return /^# METADATA/.test(expanded)
      ? `${pkg}${expanded}\nannotated := true\n`
      : `${pkg}${expanded}\n`;
  }
  const isRule =
    /^(default |test_|[a-z_][a-z0-9_]*(\[[^\]]*\]|\([^)]*\))?\s*(:=|if\b|contains\b))/.test(
      expanded
    );
  if (isRule) {
    return `${pkg}${expanded}\n`;
  }
  // Expression or statement: put it in a rule body.
  const statement = /^(some |every |print\()/.test(expanded) ? expanded : `value := ${expanded}`;
  return `${pkg}snippet if {\n${statement.replace(/^/gm, '\t')}\n}\n`;
}

suite('Snippets', () => {
  suiteSetup(() => {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  test('every snippet has a prefix, a body and a description; prefixes are unique', () => {
    const prefixes = new Set<string>();
    for (const [name, s] of Object.entries(snippets)) {
      assert.ok(typeof s.prefix === 'string' && s.prefix.length > 0, `${name}: prefix`);
      assert.ok(
        Array.isArray(s.body) && s.body.every((l) => typeof l === 'string'),
        `${name}: body`
      );
      assert.ok(
        typeof s.description === 'string' && s.description.length > 0,
        `${name}: description`
      );
      assert.ok(!prefixes.has(s.prefix), `duplicate prefix ${s.prefix}`);
      prefixes.add(s.prefix);
    }
  });

  test('no snippet imports keywords that are built into Rego v1', () => {
    for (const [name, s] of Object.entries(snippets)) {
      const expanded = expandSnippet(s.body.join('\n'));
      assert.doesNotMatch(expanded, /future\.keywords\.(if|in|every|contains)\b/, name);
      assert.doesNotMatch(expanded, /import future\.keywords\s*$/m, name);
    }
  });

  for (const [name, s] of Object.entries(snippets)) {
    test(`${s.prefix}: expands to Rego that the grammar does not flag`, async () => {
      const expanded = expandSnippet(s.body.join('\n'));
      assert.doesNotMatch(expanded, /\$\{|\$\d/, 'unexpanded tabstop');
      const module = asModule(s.prefix, expanded);
      fs.writeFileSync(path.join(OUTPUT_DIR, `${s.prefix}.rego`), module);

      const { tokens, finalDepth } = await tokenize(module);
      const invalid = tokens.filter((t) => t.scopes.some((sc) => sc.startsWith('invalid')));
      assert.deepStrictEqual(invalid, [], `${name}:\n${module}`);
      assert.strictEqual(finalDepth, 1, `${name}: unbalanced\n${module}`);
    });
  }
});

suite('Snippet expander', () => {
  const cases: Array<[string, string]> = [
    ['plain', 'plain'],
    ['$1 and $0', ' and '],
    ['${1:a${2:b}c}', 'abc'],
    ['${1|one,two|}', 'one'],
    ['${1|a\\,b,c|}', 'a,b'],
    ['\\$"x"', '$"x"'],
    ['${1:{"a": 1\\}}', '{"a": 1}'],
    ['{x | y}', '{x | y}'],
    ['a \\\\ b', 'a \\ b'],
  ];
  for (const [input, expected] of cases) {
    test(JSON.stringify(input), () => {
      assert.strictEqual(expandSnippet(input), expected);
    });
  }

  test('rejects variables and unterminated placeholders', () => {
    assert.throws(() => expandSnippet('$TM_FILENAME'));
    assert.throws(() => expandSnippet('${1:abc'));
  });
});
