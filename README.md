# Rego Syntax Support

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/AdamaKomi.rego-syntax-support?label=VS%20Code%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=AdamaKomi.rego-syntax-support)
[![CI](https://github.com/adamaKomi/rego-lens/actions/workflows/ci.yml/badge.svg)](https://github.com/adamaKomi/rego-lens/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Syntax highlighting and snippets for [Open Policy Agent](https://www.openpolicyagent.org/) **Rego**,
**including Rego embedded in Kubernetes YAML** (Gatekeeper `ConstraintTemplate`, ConfigMaps) and in
**Markdown**.

- Up to date with Rego v1 and OPA 1.22: string interpolation, `and` / `or`, `rego.v2`, METADATA blocks.
- Built-in functions generated from OPA's own capabilities, deprecated ones flagged.
- Purely declarative: no process, no binary, no activation cost, works in [vscode.dev](https://vscode.dev).

## Rego inside YAML

Policies written inside YAML files are usually a single green string. This extension highlights them as Rego:

```yaml
apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
spec:
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |                      # <- highlighted as Rego
        package k8srequiredlabels

        violation contains {"msg": msg} if {
          missing := {l | some l in input.parameters.labels} - {l | input.review.object.metadata.labels[l]}
          count(missing) > 0
          msg := $"missing labels: {missing}"
        }
      libs:
        - |                        # <- highlighted as Rego
          package lib.helpers
```

Recognized literal block scalars (`|`, `|-`, `|+`, `|2`, with an optional trailing comment):

| YAML key | Typical use |
|---|---|
| `rego` | OPA Gatekeeper `ConstraintTemplate` (`spec.targets[].rego`), also used by Azure Policy for AKS and GKE Policy Controller |
| `libs` (list of `- \|` items) | Gatekeeper `spec.targets[].libs` |
| any key ending in `.rego`, quoted or not | ConfigMaps for kube-mgmt, opa-envoy-plugin, ... (`policy.rego: \|`) |

Not highlighted on purpose: folded scalars (`>`), which would join the lines of a policy, and one-line quoted strings.

## Rego inside Markdown

```` ```rego ```` and `~~~rego` fenced code blocks are highlighted, in lists and block quotes too.

## Highlighting

| Element | Example | Scope |
|---|---|---|
| Package / import | `package authz`, `import rego.v1`, `import data.lib as l` | `keyword.control.package.rego`, `entity.name.namespace.rego`, `entity.name.import.rego` |
| Rule heads | `allow if`, `deny contains msg if`, `f(x) := y if`, `a.b.c := 1` | `entity.name.function.rule.rego` |
| Keywords | `if` `else` `not` `some` `every` `in` `contains` `with` `as` `default` | `keyword.control.rego` |
| Logical keywords | `and` `or` (`future.keywords.and/or`, `rego.v2`) | `keyword.operator.logical.rego` |
| Built-in calls | `count(x)`, `io.jwt.decode(t)`, `strings.render_template(...)` | `support.function.<category>.rego` |
| Deprecated built-ins | `any(x)`, `re_match(p, s)` (removed in Rego v1) | `invalid.deprecated.builtin.rego` |
| User function calls | `is_admin(user)`, `data.lib.f(x)` | `entity.name.function.call.rego` |
| Strings | `"a\n"`, `` `raw` ``, `$"Hello {name}"`, `` $`raw {x}` `` | `string.quoted.*`, `string.interpolated.*` |
| Numbers | `42`, `3.14`, `1e10` (and illegal `0x1F`) | `constant.numeric.*` |
| METADATA | `# METADATA` / `# title: ...` | `comment.block.documentation.metadata.rego` |

Built-in categories follow OPA's official ones (`aggregates`, `strings`, `regex`, `tokens`, `time`, ...).
Built-ins are only highlighted when called, so a field like `input.count` keeps its normal color.
See [docs/GRAMMAR.md](docs/GRAMMAR.md) for every scope.

## Snippets

| Prefix | Inserts |
|---|---|
| `pkg`, `imp`, `impas` | package, import, import with alias |
| `impv2`, `impf` | `import rego.v2`, `import future.keywords.not\|and\|or` |
| `meta` | `# METADATA` annotation block |
| `default`, `allow`, `deny` | default value, boolean rule, `deny contains msg if` |
| `rule`, `rulev`, `rules`, `ruleo`, `func` | rule, rule with value, multi-value set / object rule, function |
| `some`, `every`, `ifelse` | iteration, universal quantification, `else` chain |
| `compa`, `comps`, `compo` | array, set, object comprehensions |
| `tmpl` | template string `$"... {expr}"` |
| `test`, `testm`, `print` | tests for `opa test`, debug print |
| `rbac`, `abac` | complete policy templates |

All snippets produce Rego v1 that `opa parse` accepts (checked in CI).

## Using it with the official OPA extension

The [official OPA extension](https://marketplace.visualstudio.com/items?itemName=tsandall.opa) (with the
[Regal](https://github.com/open-policy-agent/regal) language server) provides linting, completion, formatting,
evaluation and debugging. This extension does not try to replace it. It focuses on highlighting:
Rego embedded in YAML, recent syntax, deprecated built-ins.

Both extensions contribute a grammar for the `rego` language (scope `source.rego`). When both are installed,
VS Code uses only one of them for `.rego` files: the last one registered wins
([`TMScopeRegistry.register`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/textMate/common/TMScopeRegistry.ts)).
This order is not configurable. The YAML and Markdown injections of this extension work with either grammar.

## Installation

- **Marketplace**: search for "Rego Syntax Support" in the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`).
- **VSIX**: download it from the [releases](https://github.com/adamaKomi/rego-lens/releases) and run
  `code --install-extension rego-syntax-support-<version>.vsix`.

Requires VS Code 1.85 or later.

## Known limitations

TextMate grammars work line by line with regular expressions, without a parser:

- In a set or object comprehension written directly inside braces, `|` is scoped as the comprehension
  separator. A set union written directly inside a rule body (`x := a | b`) gets the same scope.
- Rego in YAML is recognized by its key (`rego`, `libs`, `*.rego`), not by the kind of the document:
  another YAML file using these keys for literal block scalars is highlighted as Rego as well.
- Helm templates are not covered when they use another language mode than YAML.

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md). In short:

```bash
npm ci
npm run build:grammars   # after editing scripts/grammar/*.js
npm test                 # unit + grammar tests (no VS Code needed)
npm run test:integration # tests inside a real VS Code
```

## License

[MIT](LICENSE)
