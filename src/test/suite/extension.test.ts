/**
 * Integration tests: run inside a real VS Code instance (npm run test:integration).
 */
import * as assert from 'assert';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { installRegodrill } from '../../tools/install';
import { REGODRILL_RELEASE } from '../../tools/regodrill-release';

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

suite('Rego in Gatekeeper templates', () => {
  test('opening a template activates the extension and registers the check command', async () => {
    const doc = await vscode.workspace.openTextDocument(
      path.join(FIXTURES, 'constraint-template.yaml')
    );
    await vscode.window.showTextDocument(doc);
    const ext = vscode.extensions.getExtension(`${pkg.publisher}.${pkg.name}`);
    assert.ok(ext);
    await ext.activate();
    assert.ok(ext.isActive);
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('regoSyntaxSupport.checkEmbeddedRego'));
  });
});

suite('Mutation testing', () => {
  test('opening a Rego file activates the extension and registers the run command', async () => {
    await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(path.join(FIXTURES, 'policy.rego'))
    );
    const ext = vscode.extensions.getExtension(`${pkg.publisher}.${pkg.name}`);
    assert.ok(ext);
    await ext.activate();
    assert.ok(
      (await vscode.commands.getCommands(true)).includes('regoSyntaxSupport.runMutationTesting')
    );
  });

  test('a test file gets a CodeLens that offers mutation testing on its directory', async () => {
    const file = path.join(ROOT, 'test', 'mutation', 'policy_test.rego');
    const doc = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(doc);
    const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
      'vscode.executeCodeLensProvider',
      doc.uri
    );
    const offer = lenses.find((l) =>
      l.command?.title.includes('Check these tests with mutation testing')
    );
    assert.ok(
      offer,
      `no mutation testing CodeLens in ${JSON.stringify(lenses.map((l) => l.command?.title))}`
    );
    assert.strictEqual(offer.range.start.line, 0, 'on the package line');
    assert.strictEqual(offer.command?.command, 'regoSyntaxSupport.runMutationTesting');
    assert.deepStrictEqual(offer.command?.arguments, [{ target: path.dirname(file) }]);
  });

  test('the walkthrough opens', async () => {
    await vscode.commands.executeCommand(
      'workbench.action.openWalkthrough',
      `${pkg.publisher}.${pkg.name}#gettingStarted`,
      false
    );
  });

  // Downloads the regodrill release fixed in the extension for this platform (zip on Windows, tar.gz
  // elsewhere), checks its SHA-256 and runs it, in the extension host. Network: only with TEST_DOWNLOAD=1 (CI).
  test('regodrill downloads, checks and runs on this platform', async function () {
    if (process.env.TEST_DOWNLOAD !== '1') {
      this.skip();
    }
    this.timeout(180000);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rego-syntax-support-download-'));
    const installed = await installRegodrill(dir, REGODRILL_RELEASE);
    const output = await new Promise<string>((resolve, reject) =>
      execFile(installed, ['version'], (err, stdout) =>
        err ? reject(new Error(err.message, { cause: err })) : resolve(stdout)
      )
    );
    assert.ok(output.startsWith(`regodrill ${REGODRILL_RELEASE.version} `), output);
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
