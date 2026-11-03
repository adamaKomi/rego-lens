import * as assert from 'assert';
import { checkGroup, parseOpaVersion, Runner, runProcess, versionFlags } from '../../embedded/check';
import { EmbeddedGroup, extractConstraintTemplates } from '../../embedded/extract';

function yaml(...lines: string[]): string {
  return lines.join('\n') + '\n';
}

suite('Rego embedded in Gatekeeper ConstraintTemplates', () => {
  test('legacy spec.targets[].rego and libs: one Rego v0 group, with line and indent mapping', () => {
    const groups = extractConstraintTemplates(
      yaml(
        'apiVersion: templates.gatekeeper.sh/v1',
        'kind: ConstraintTemplate',
        'spec:',
        '  targets:',
        '    - target: admission.k8s.gatekeeper.sh',
        '      rego: |',
        '        package k8srequiredlabels',
        '',
        '        violation[{"msg": msg}] {',
        '          msg := "x"',
        '        }',
        '      libs:',
        '        - |',
        '          package lib.helpers',
        '        - |-',
        '          package lib.more'
      )
    );
    assert.strictEqual(groups.length, 1);
    const [g] = groups;
    assert.strictEqual(g.version, 'v0');
    assert.deepStrictEqual(
      g.modules.map((m) => [m.kind, m.firstLine, m.indent, m.text.split('\n')[0]]),
      [
        ['rego', 6, 8, 'package k8srequiredlabels'],
        ['lib', 13, 10, 'package lib.helpers'],
        ['lib', 15, 10, 'package lib.more'],
      ]
    );
    assert.strictEqual(g.modules[0].text, 'package k8srequiredlabels\n\nviolation[{"msg": msg}] {\n  msg := "x"\n}\n');
  });

  test('code[] with engine Rego: source.version v1 is honored, and missing means v0', () => {
    const groups = extractConstraintTemplates(
      yaml(
        'kind: ConstraintTemplate',
        'spec:',
        '  targets:',
        '    - target: admission.k8s.gatekeeper.sh',
        '      code:',
        '        - engine: K8sNativeValidation',
        '          source:',
        '            validations: []',
        '        - engine: Rego',
        '          source:',
        '            version: "v1"',
        '            rego: |',
        '              package v1policy',
        '            libs:',
        '              - |',
        '                package lib.v1',
        '    - target: other',
        '      code:',
        '        - engine: Rego',
        '          source:',
        '            rego: |',
        '              package v0policy'
      )
    );
    assert.deepStrictEqual(
      groups.map((g) => [g.version, g.modules.map((m) => m.text.trim())]),
      [
        ['v1', ['package v1policy', 'package lib.v1']],
        ['v0', ['package v0policy']],
      ]
    );
  });

  test('two legacy targets are two groups', () => {
    const groups = extractConstraintTemplates(
      yaml(
        'kind: ConstraintTemplate',
        'spec:',
        '  targets:',
        '    - target: a',
        '      rego: |',
        '        package a',
        '    - target: b',
        '      rego: |',
        '        package b'
      )
    );
    assert.deepStrictEqual(
      groups.map((g) => g.modules.map((m) => m.text.trim())),
      [['package a'], ['package b']]
    );
  });

  test('only ConstraintTemplate documents count, in a multi-document file', () => {
    const groups = extractConstraintTemplates(
      yaml(
        'apiVersion: v1',
        'kind: ConfigMap',
        'data:',
        '  rego: |',
        '    package not.a.template',
        '---',
        'kind: ConstraintTemplate',
        'spec:',
        '  targets:',
        '    - target: t',
        '      rego: |',
        '        package template'
      )
    );
    assert.deepStrictEqual(
      groups.map((g) => [g.modules[0].firstLine, g.modules[0].text.trim()]),
      [[11, 'package template']]
    );
  });

  test('block scalar variants: explicit indentation, comments, CRLF; folded scalars are skipped', () => {
    const crlf = [
      'kind: "ConstraintTemplate"',
      'spec:',
      '  targets:',
      '    - target: t',
      '      rego: |2 # an explicit indentation indicator',
      '          indented line kept',
      '        package p',
      '      libs:',
      '        - >',
      '          folded lines cannot be mapped',
      '        - |+',
      '          package lib.kept',
    ].join('\r\n');
    const groups = extractConstraintTemplates(crlf + '\r\n');
    assert.strictEqual(groups.length, 1);
    assert.deepStrictEqual(
      groups[0].modules.map((m) => [m.kind, m.indent, m.text]),
      [
        ['rego', 8, '  indented line kept\npackage p\n'],
        ['lib', 10, 'package lib.kept\n'],
      ]
    );
  });

  test('no template, no Rego: nothing', () => {
    assert.deepStrictEqual(extractConstraintTemplates('kind: Deployment\nspec: {}\n'), []);
    assert.deepStrictEqual(
      extractConstraintTemplates(yaml('kind: ConstraintTemplate', 'spec:', '  targets:', '    - target: t', '      rego: |')),
      []
    );
  });
});

suite('Checking embedded Rego with opa check', () => {
  const group: EmbeddedGroup = {
    version: 'v0',
    modules: [
      { kind: 'rego', text: 'package p\n\nviolation[{"msg": msg}] {\n  msg := y\n}\n', firstLine: 10, indent: 8 },
      { kind: 'lib', text: 'package lib.x\n', firstLine: 20, indent: 10 },
    ],
  };

  test('version flags follow the OPA major version', () => {
    assert.deepStrictEqual(versionFlags(1, 'v0'), ['--v0-compatible']);
    assert.deepStrictEqual(versionFlags(1, 'v1'), []);
    assert.deepStrictEqual(versionFlags(0, 'v0'), []);
    assert.deepStrictEqual(versionFlags(0, 'v1'), ['--v1-compatible']);
    assert.strictEqual(parseOpaVersion('Version: 1.21.3\nBuild Commit: x\n'), 1);
    assert.strictEqual(parseOpaVersion('Version: 0.70.0\n'), 0);
    assert.strictEqual(parseOpaVersion('something else'), undefined);
  });

  test('errors map to YAML lines and columns; an error at the end of a module stays on its last line', async () => {
    const calls: string[][] = [];
    const run: Runner = (_file, args) => {
      calls.push(args);
      const files = args.filter((a) => a.endsWith('.rego'));
      const stderr = JSON.stringify({
        errors: [
          { code: 'rego_unsafe_var_error', message: 'var y is unsafe', location: { file: files[0], row: 4, col: 10 } },
          { code: 'rego_parse_error', message: 'unexpected eof token', location: { file: files[1], row: 2, col: 0 } },
          { code: 'rego_compile_error', message: 'error limit reached' },
        ],
      });
      return Promise.resolve({ stdout: '', stderr, code: 1 });
    };
    const findings = await checkGroup(group, { path: 'opa', major: 1 }, run);
    assert.deepStrictEqual(calls[0].slice(0, 4), ['check', '--format', 'json', '--v0-compatible']);
    assert.deepStrictEqual(findings, [
      { line: 13, column: 17, message: 'var y is unsafe', code: 'rego_unsafe_var_error' },
      { line: 20, column: 10, message: 'unexpected eof token', code: 'rego_parse_error' },
      { line: 10, column: 8, message: 'error limit reached', code: 'rego_compile_error' },
    ]);
  });

  test('a clean check reports nothing', async () => {
    const run: Runner = () => Promise.resolve({ stdout: '', stderr: '', code: 0 });
    assert.deepStrictEqual(await checkGroup(group, { path: 'opa', major: 1 }, run), []);
  });

  // Runs the real opa binary when there is one (CI installs it in the OPA job and sets REQUIRE_OPA=1).
  test('with the real opa binary', async function () {
    let major: number | undefined;
    try {
      major = parseOpaVersion((await runProcess('opa', ['version'], 10000)).stdout);
    } catch {
      major = undefined;
    }
    if (major === undefined) {
      if (process.env.REQUIRE_OPA === '1') {
        assert.fail('REQUIRE_OPA=1 but opa is not on the PATH');
      }
      this.skip();
    }
    const groups = extractConstraintTemplates(
      yaml(
        'kind: ConstraintTemplate',
        'spec:',
        '  targets:',
        '    - target: t',
        '      rego: |',
        '        package p',
        '',
        '        violation[{"msg": msg}] {',
        '          msg := y',
        '        }',
        '    - target: u',
        '      code:',
        '        - engine: Rego',
        '          source:',
        '            version: v1',
        '            rego: |',
        '              package q',
        '',
        '              violation contains {"msg": "ok"} if input.review.object.kind == "Pod"'
      )
    );
    const findings = await Promise.all(groups.map((g) => checkGroup(g, { path: 'opa', major })));
    // The v0 module has an unsafe variable on YAML line 9 (0-based 8); the v1 module is valid.
    assert.deepStrictEqual(
      findings.map((f) => f.map((x) => [x.line, x.code])),
      [[[8, 'rego_unsafe_var_error']], []]
    );
  });
});
