import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ROOT, tokenize } from './helpers/textmate';

const FIXTURES = path.join(ROOT, 'test', 'fixtures');

/**
 * The fixtures are valid Rego v1 (CI checks them with `opa parse`), so the grammar must not
 * flag anything as invalid in them and must be back at the root state at the end of the file
 * (no string, block or comprehension left open).
 */
suite('Fixtures: valid Rego is never flagged invalid', () => {
  for (const file of fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.rego'))) {
    test(file, async () => {
      const { tokens, finalDepth } = await tokenize(
        fs.readFileSync(path.join(FIXTURES, file), 'utf8')
      );
      const invalid = tokens.filter((t) => t.scopes.some((s) => s.startsWith('invalid')));
      assert.deepStrictEqual(
        invalid.map((t) => `line ${t.line}: ${JSON.stringify(t.text)} ${t.scopes.join(' ')}`),
        []
      );
      assert.strictEqual(
        finalDepth,
        1,
        'a region (string, brackets, ...) is still open at the end of the file'
      );
    });
  }
});
