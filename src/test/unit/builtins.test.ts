import * as assert from 'assert';
import * as path from 'path';
import { ROOT, tokenize } from './helpers/textmate';

interface Builtin {
  name: string;
  category: string;
  deprecated: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { transform } = require(path.join(ROOT, 'scripts', 'update-builtins.js')) as {
  transform: (capabilities: unknown, metadata: unknown) => Builtin[];
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const data = require(path.join(ROOT, 'scripts', 'grammar', 'opa-builtins.json')) as {
  opaVersion: string;
  builtins: Builtin[];
};

suite('Built-ins: extraction from OPA capabilities', () => {
  test('drops operators and internal built-ins, flags deprecated ones, uses official categories', () => {
    const capabilities = {
      builtins: [
        { name: 'plus', infix: '+' },
        { name: 'internal.member_2', infix: 'in' },
        { name: 'internal.print' },
        { name: 'count' },
        { name: 'any', deprecated: true },
        { name: 'print' },
      ],
    };
    const metadata = { _categories: { aggregates: ['count'], numbers: ['plus'] } };
    assert.deepStrictEqual(transform(capabilities, metadata), [
      { name: 'any', category: 'builtin', deprecated: true },
      { name: 'count', category: 'aggregates', deprecated: false },
      { name: 'print', category: 'builtin', deprecated: false },
    ]);
  });

  test('a built-in listed in several categories keeps the first one', () => {
    const result = transform(
      { builtins: [{ name: 'x' }] },
      { _categories: { first: ['x'], second: ['x'] } }
    );
    assert.strictEqual(result[0].category, 'first');
  });

  test('the committed data file is well formed', () => {
    assert.match(data.opaVersion, /^v\d+\.\d+\.\d+$/);
    const names = data.builtins.map((b) => b.name);
    assert.deepStrictEqual(
      names,
      [...names].sort((a, b) => a.localeCompare(b)),
      'sorted'
    );
    assert.strictEqual(new Set(names).size, names.length, 'unique');
    assert.ok(names.length > 150, `only ${names.length} built-ins`);
    assert.ok(!names.some((n) => n.startsWith('internal.')));
    for (const operator of ['plus', 'minus', 'eq', 'equal', 'assign', 'neq', 'and', 'or']) {
      assert.ok(!names.includes(operator), `${operator} is an operator, not a callable built-in`);
    }
    for (const b of data.builtins) {
      assert.match(b.category, /^[a-z][a-z0-9.]*$/, `${b.name} category`);
    }
  });
});

suite('Built-ins: every built-in is highlighted when called, and only then', () => {
  for (const b of data.builtins) {
    const expected = b.deprecated
      ? 'invalid.deprecated.builtin.rego'
      : `support.function.${b.category}.rego`;

    test(`${b.name}`, async () => {
      const { tokens } = await tokenize(
        [`x := ${b.name}(a)`, `y := input.${b.name}`, `z := data.lib.${b.name}(a)`].join('\n')
      );
      const called = tokens.find((t) => t.line === 1 && t.text === b.name);
      assert.ok(called, `${b.name}(a) should be a single token`);
      assert.ok(called.scopes.includes(expected), `${b.name}(a): ${called.scopes.join(' ')}`);

      const field = tokens.filter(
        (t) => t.line === 2 && t.scopes.some((s) => s.startsWith('support.function'))
      );
      assert.deepStrictEqual(field, [], `input.${b.name} must not be a built-in`);

      const namespaced = tokens.filter((t) => t.line === 3 && t.scopes.includes(expected));
      assert.deepStrictEqual(namespaced, [], `data.lib.${b.name}(a) is a user function`);
    });
  }
});
