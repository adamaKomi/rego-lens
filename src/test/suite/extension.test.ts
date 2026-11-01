/**
 * Integration tests: run inside a real VS Code instance (npm run test:integration).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURES = path.join(ROOT, 'test', 'integration');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  publisher: string;
  name: string;
};

/** Token as returned by VS Code's `_workbench.captureSyntaxTokens` (used by VS Code's own colorizer tests). */
interface CapturedToken {
  c: string;
  t: string;
}

async function captureTokens(fixture: string): Promise<CapturedToken[]> {
  const tokens = await vscode.commands.executeCommand<CapturedToken[]>(
    '_workbench.captureSyntaxTokens',
    vscode.Uri.file(path.join(FIXTURES, fixture))
  );
  assert.ok(Array.isArray(tokens) && tokens.length > 0, `no tokens captured for ${fixture}`);
  return tokens;
}

function find(tokens: CapturedToken[], text: string, scope: string): CapturedToken | undefined {
  return tokens.find((t) => t.c.trim() === text && t.t.split(' ').includes(scope));
}

suite('Extension', () => {
  test('is installed under its marketplace identifier', () => {
    assert.ok(vscode.extensions.getExtension(`${pkg.publisher}.${pkg.name}`));
  });

  test('registers the rego language for .rego files', async () => {
    assert.ok((await vscode.languages.getLanguages()).includes('rego'));
    const doc = await vscode.workspace.openTextDocument(path.join(FIXTURES, 'policy.rego'));
    assert.strictEqual(doc.languageId, 'rego');
  });
});

suite('Highlighting in the editor', () => {
  test('.rego files use the Rego grammar', async () => {
    const tokens = await captureTokens('policy.rego');
    assert.ok(find(tokens, 'package', 'keyword.control.package.rego'), 'package keyword');
    assert.ok(find(tokens, 'allow', 'entity.name.function.rule.rego'), 'rule name');
    assert.ok(find(tokens, 'METADATA', 'storage.type.metadata.rego'), 'METADATA block');
    assert.ok(find(tokens, '$', 'punctuation.definition.template-string.rego'), 'template string');
    assert.ok(find(tokens, 're_match', 'invalid.deprecated.builtin.rego'), 'deprecated built-in');
  });

  test('Rego inside a Gatekeeper ConstraintTemplate is highlighted', async () => {
    const tokens = await captureTokens('constraint-template.yaml');
    const packages = tokens.filter(
      (t) =>
        t.c.trim() === 'package' &&
        t.t.split(' ').includes('meta.embedded.block.rego') &&
        t.t.split(' ').includes('keyword.control.package.rego')
    );
    assert.strictEqual(packages.length, 2, 'rego: | and libs: - | blocks');
    assert.ok(find(tokens, 'count', 'support.function.aggregates.rego'), 'built-in inside YAML');
    const kind = tokens.find((t) => t.c === 'kind');
    assert.ok(kind && !kind.t.includes('rego'), 'YAML outside the block is untouched');
  });

  test('Rego fenced code blocks in Markdown are highlighted', async () => {
    const tokens = await captureTokens('README.md');
    assert.ok(find(tokens, 'package', 'keyword.control.package.rego'));
    const after = tokens.find((t) => t.c.includes('Not Rego anymore'));
    assert.ok(after && !after.t.includes('rego'), 'Markdown resumes after the fence');
  });
});

suite('Editing', () => {
  async function openRego(content: string): Promise<vscode.TextEditor> {
    const doc = await vscode.workspace.openTextDocument({ language: 'rego', content });
    return vscode.window.showTextDocument(doc);
  }

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('contributed snippets can be inserted by name', async () => {
    const editor = await openRego('');
    await vscode.commands.executeCommand('editor.action.insertSnippet', {
      langId: 'rego',
      name: 'Default rule',
    });
    assert.strictEqual(editor.document.getText(), 'default allow := false');
  });

  test('toggling a line comment uses #', async () => {
    const editor = await openRego('allow := true');
    await vscode.commands.executeCommand('editor.action.commentLine');
    assert.strictEqual(editor.document.getText(), '# allow := true');
  });
});
