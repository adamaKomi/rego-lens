import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { readPackageJson, ROOT } from './helpers/textmate';

const pkg = readPackageJson() as ReturnType<typeof readPackageJson> & {
  main?: string;
  icon?: string;
  categories: string[];
  engines: { vscode: string };
  repository: { url: string };
  bugs: { url: string };
  homepage: string;
  devDependencies: Record<string, string>;
  contributes: {
    languages: Array<{
      id: string;
      extensions: string[];
      configuration: string;
      icon?: { light: string; dark: string };
    }>;
    snippets: Array<{ language: string; path: string }>;
    configuration?: unknown;
    commands?: unknown;
  };
};

function exists(relative: string): boolean {
  return fs.existsSync(path.join(ROOT, relative));
}

suite('Extension manifest (package.json)', () => {
  test('every contributed file exists', () => {
    const files = [
      pkg.icon,
      ...pkg.contributes.grammars.map((g) => g.path),
      ...pkg.contributes.snippets.map((s) => s.path),
      ...pkg.contributes.languages.flatMap((l) => [l.configuration, l.icon?.light, l.icon?.dark]),
    ].filter((f): f is string => !!f);
    assert.deepStrictEqual(
      files.filter((f) => !exists(f)),
      []
    );
  });

  test('a desktop entry point and a web entry point, so VS Code for the Web keeps the grammars', () => {
    // https://code.visualstudio.com/api/extension-guides/web-extensions: "Extensions that have only a `main`
    // entry point, but no `browser` are not web extensions", and they are ignored by the web extension host.
    // "Extensions can have both `browser` and `main` entry points".
    const raw = pkg as Record<string, unknown>;
    assert.strictEqual(pkg.main, './out/extension.js');
    assert.strictEqual(raw.browser, './out/web.js');
    // The web entry runs as a single file in the browser: it must not import anything.
    const web = fs.readFileSync(path.join(ROOT, 'src', 'web.ts'), 'utf8');
    assert.ok(!/^\s*import\s/m.test(web) && !/require\(/.test(web), 'src/web.ts must not import modules');
  });

  test('every contributed command is registered by the extension', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    const commands = (pkg.contributes.commands ?? []) as Array<{ command: string }>;
    assert.ok(commands.length > 0);
    for (const { command } of commands) {
      assert.ok(source.includes(`'${command}'`), `${command} is not registered in src/extension.ts`);
    }
  });

  test('the setting that names a binary is restricted in untrusted workspaces', () => {
    // https://code.visualstudio.com/api/extension-guides/workspace-trust: settings used to run a CLI can be an
    // attack vector if a workspace overrides them; restrictedConfigurations keeps only the user value.
    const caps = (pkg as Record<string, unknown>).capabilities as {
      untrustedWorkspaces: { supported: string; restrictedConfigurations: string[] };
    };
    assert.strictEqual(caps.untrustedWorkspaces.supported, 'limited');
    assert.deepStrictEqual(caps.untrustedWorkspaces.restrictedConfigurations, ['regoSyntaxSupport.opa.path']);
    const properties = (pkg.contributes.configuration as { properties: Record<string, unknown> }).properties;
    assert.ok('regoSyntaxSupport.opa.path' in properties);
  });

  test('categories only advertise what the extension provides', () => {
    assert.ok(!pkg.categories.includes('Formatters'), 'no formatter is contributed');
    assert.ok(!pkg.categories.includes('Linters'), 'no linter is contributed');
  });

  test('repository, bugs and homepage point to the same GitHub repository', () => {
    const repo = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
    assert.match(repo, /^https:\/\/github\.com\/[^/]+\/[^/]+$/);
    assert.strictEqual(pkg.bugs.url, `${repo}/issues`);
    assert.ok(pkg.homepage.startsWith(repo), pkg.homepage);
  });

  test('@types/vscode is not newer than engines.vscode (vsce refuses to package otherwise)', () => {
    const engine = /\d+\.\d+/.exec(pkg.engines.vscode)?.[0];
    const types = /\d+\.\d+/.exec(pkg.devDependencies['@types/vscode'])?.[0];
    assert.ok(engine && types);
    const [em, en] = engine.split('.').map(Number);
    const [tm, tn] = types.split('.').map(Number);
    assert.ok(
      tm < em || (tm === em && tn <= en),
      `@types/vscode ${types} > engines.vscode ${engine}`
    );
  });

  test('the CHANGELOG documents the current version', () => {
    const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
    assert.ok(changelog.includes(`## [${pkg.version}]`), `no "## [${pkg.version}]" section`);
  });

  test('.vscodeignore keeps sources and tests out of the published package', () => {
    const ignore = fs.readFileSync(path.join(ROOT, '.vscodeignore'), 'utf8').split(/\r?\n/);
    for (const entry of ['src/**', 'test/**', 'scripts/**', 'out/test/**', 'out/**/*.map', 'out/**/*.d.ts']) {
      assert.ok(ignore.includes(entry), `${entry} missing from .vscodeignore`);
    }
    // The compiled extension itself is published.
    assert.ok(!ignore.includes('out/**'), 'out/** would leave the extension out of the package');
  });
});

suite('Displayed texts', () => {
  // Pictographic emoji and variation selectors (U+FE0F); typographic symbols such as arrows are allowed.
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]|\u{FE0F}/u;

  const texts: Array<[string, string]> = [
    ['package.json description', pkg.description as string],
    ['package.json displayName', pkg.displayName as string],
    ...[
      'README.md',
      'CHANGELOG.md',
      'SECURITY.md',
      'docs/CONTRIBUTING.md',
      'docs/GRAMMAR.md',
      'docs/PUBLISHING.md',
    ].map((file): [string, string] => [file, fs.readFileSync(path.join(ROOT, file), 'utf8')]),
    ...Object.entries(
      JSON.parse(
        fs.readFileSync(path.join(ROOT, 'snippets', 'rego.snippets.json'), 'utf8')
      ) as Record<string, { description: string }>
    ).map(([name, s]): [string, string] => [`snippet "${name}"`, `${name} ${s.description}`]),
  ];

  for (const [where, text] of texts) {
    test(`${where} contains no emoji`, () => {
      const lines = text
        .split(/\r?\n/)
        .map((line, i) => [i + 1, line] as const)
        .filter(([, line]) => EMOJI.test(line))
        .map(([n, line]) => `${n}: ${line.trim()}`);
      assert.deepStrictEqual(lines, []);
    });
  }
});

suite('Language configuration', () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'languages', 'rego-language-configuration.json'), 'utf8')
  ) as {
    comments: { lineComment: string };
    wordPattern: string;
    indentationRules: Record<string, string>;
    folding: { markers: Record<string, string> };
  };

  test('regular expressions compile (VS Code evaluates them with JavaScript RegExp)', () => {
    for (const source of [
      config.wordPattern,
      ...Object.values(config.indentationRules),
      ...Object.values(config.folding.markers),
    ]) {
      assert.doesNotThrow(() => new RegExp(source), source);
    }
  });

  test('line comments use #', () => {
    assert.strictEqual(config.comments.lineComment, '#');
  });

  test('word pattern selects whole identifiers and numbers', () => {
    const word = new RegExp(config.wordPattern, 'g');
    assert.deepStrictEqual('allow_admin := input.user_1'.match(word), [
      'allow_admin',
      'input',
      'user_1',
    ]);
    assert.deepStrictEqual('x := 3.14'.match(word), ['x', '3.14']);
  });

  test('indentation increases after an opening bracket and decreases on a closing one', () => {
    const increase = new RegExp(config.indentationRules.increaseIndentPattern);
    const decrease = new RegExp(config.indentationRules.decreaseIndentPattern);
    assert.ok(increase.test('allow if {'));
    assert.ok(increase.test('x := ['));
    assert.ok(!increase.test('x := {"a": 1}'));
    assert.ok(decrease.test('}'));
    assert.ok(decrease.test('    ]'));
  });
});
