# Changelog

All notable changes to the "Rego Syntax Support" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- The description starts with "Open Policy Agent (OPA)", so the extension is easier to find in Marketplace search.
- New icon: curly braces around a check mark, for Rego code and policies that pass their tests. Its source
  is `resources/icon.svg`; `npm run build:icon` renders the PNG.

## [0.2.1]

### Changed
- Updated release workflow to publish through trusted publishing (OIDC) on the VS Code Marketplace and Open VSX.

## [0.2.0] - 2026-11-01

### Added
- **Rego embedded in YAML**: literal block scalars (`key: |`) under `rego` and `libs`
  (OPA Gatekeeper `ConstraintTemplate`, also used by Azure Policy for AKS and GKE Policy
  Controller) and under any key ending in `.rego` (ConfigMaps for kube-mgmt, opa-envoy, ...).
  Works with both YAML grammars shipped by VS Code (1.85 to 1.91, and 1.92 and later).
- **Rego in Markdown**: ```` ```rego ```` and `~~~rego` fenced code blocks.
- String interpolation `$"... {expr} ..."` and `` $`...` `` (OPA 1.12), including `\{` escapes.
- `and` / `or` keywords (`import future.keywords.and|or`, `import rego.v2`).
- `# METADATA` annotation blocks: the marker and the YAML keys are highlighted.
- All 186 built-in functions of OPA v1.22.0, generated from OPA's `capabilities` and
  `builtin_metadata.json` (`npm run update:builtins` refreshes them). Built-ins are only
  highlighted when called, so a field such as `input.count` is not colored.
- Deprecated built-ins removed from Rego v1 (`any`, `all`, `re_match`, `set_diff`, `cast_*`,
  `net.cidr_overlap`) are scoped `invalid.deprecated`.
- Calls to user-defined functions (`entity.name.function.call.rego`), the `_` wildcard,
  `set()`, comprehension separators, illegal escapes and illegal numbers (`0x1F`, `0a2b`).
- Snippets: `impas`, `impv2`, `meta`, `func`, `tmpl`.
- Works in VS Code for the Web (vscode.dev, github.dev): the extension is now purely declarative.

### Fixed
- `==`, `!=`, `<=`, `>=` were tokenized as two operators.
- String escapes (`\"`, `\n`, `\/`, `\u00e9`, ...) were not highlighted.
- Exponents without a fraction (`1e10`) were split.
- Local variables, object keys and array items at the start of a line were highlighted as rule names.
- Keywords used as ref segments (`input.in`, `x.contains`, allowed since OPA 1.0) were highlighted.
- `contains(...)` the built-in is no longer confused with the `contains` keyword.
- Snippets: `testm` evaluated the rule twice (once without the mocked input); `deny` now produces
  messages with `contains`; bodies have valid default values.
- Repository, issues and homepage links pointed to another repository.

### Changed
- Scope names follow OPA's official categories: `support.function.aggregates.rego`,
  `support.function.strings.rego`, `support.function.types.rego`, ... (previously `aggregate`,
  `string`, `type`, ...). `=` is `keyword.operator.unification.rego`; `&` and `|` are
  `keyword.operator.set.rego`.
- Snippets no longer import `future.keywords.if/in/every/contains`, which are no-ops in Rego v1.
  `impf` now offers the v1 future keywords `not`, `and`, `or`; `impfa` was removed (use `impv2`).

### Removed
- The `Rego: Show Rego Extension Version` command and the `rego.trace.server` and
  `rego.formatting.enabled` settings, which had no effect. The "Formatters" category.

### Development
- The grammars are generated from `scripts/grammar/*.js`; CI fails if `syntaxes/` is stale.
- Grammar assertions now really run (vscode-tmgrammar-test, with the vscode-textmate and
  vscode-oniguruma versions shipped by VS Code), including against VS Code's own YAML and
  Markdown grammars.
- Unit tests: every regex compiles with Oniguruma, every include resolves, every built-in,
  fixtures never flagged invalid, snippets expand to Rego that `opa parse` accepts (in CI).
- Integration tests inspect the tokens computed by a real VS Code instance (Linux, Windows, macOS, and
  VS Code 1.85, the oldest supported version).

## [0.1.0] - 2026-01-17

### Added
- **Syntax Highlighting** for Rego policy files
  - Keywords: `package`, `import`, `if`, `else`, `not`, `with`, `as`, `default`, `some`, `every`, `in`, `contains`
  - Comments: line comments with `#`
  - Strings: double-quoted and raw strings
  - Numbers: integers and floats
  - Operators: comparison, assignment, arithmetic, logical
  - Built-in functions: 50+ OPA built-in functions
  - Special variables: `input`, `data`
  
- **Code Snippets** for common patterns
  - Package and import declarations
  - Rule templates (allow, deny, default)
  - Iteration patterns (some, every)
  - Comprehensions (set, array, object)
  - Policy templates (RBAC, ABAC)
  - Test templates
  
- **Language Configuration**
  - Bracket matching and auto-closing
  - Comment toggling with `#`
  - Code folding support
  - Word pattern recognition
  - Indentation rules

- **File Association**
  - Automatic recognition of `.rego` files

### Technical
- TypeScript-based extension architecture
- TextMate grammar for syntax highlighting
- ESLint and Prettier configuration
- Test infrastructure setup

---

[Unreleased]: https://github.com/adamaKomi/rego-syntax-support/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/adamaKomi/rego-syntax-support/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/adamaKomi/rego-syntax-support/releases/tag/v0.1.0
