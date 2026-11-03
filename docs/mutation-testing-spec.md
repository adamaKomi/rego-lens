# Mutation testing for Rego: specification

Status: draft, v0.4 (2026-11-03). Engine: `regodrill`. Editor integration: the Rego Syntax Support extension (this repository).

## 1. Goal

Measure whether the tests of a Rego policy would catch a real bug.

`regodrill` makes small, deliberate changes to a policy (mutants), for example `>=` becomes `>`, or a condition is removed. It then runs the policy's own `opa test` suite against each mutant.

- **Killed**: at least one test fails. The tests protect this spot.
- **Survived**: every test still passes. A bug at this spot would go unnoticed. In an authorization policy, that bug is often a privilege escalation.

The result is a **mutation score** and a list of surviving mutants with their exact location. The score replaces line coverage as the measure of test quality. A covered line is not necessarily a tested line.

### Goals

- G1. Find surviving mutants in real Rego code bases (Gatekeeper libraries, application authz policies) in a time compatible with CI.
- G2. Report them where people work: terminal, VS Code, pull requests.
- G3. Be deterministic: the same input gives the same output, so the tool can gate a CI pipeline.

### Non-goals

- No AI or LLM anywhere in the tool or the extension (decision of 2026-11-02, to be revisited only in a later spec).
- No language server features (completion, lint, format). The official OPA extension and Regal provide them.
- No test generation. The tool reports gaps; people write the tests.
- No mutation of non-Rego code (Go, YAML wrappers). Rego embedded in YAML may come later (see §16).

## 2. Glossary

| Term | Meaning |
|---|---|
| Mutant | A copy of the policy with exactly one mutation applied |
| Operator | A rule that produces mutants, for example `COMP_BOUNDARY` (`>=` to `>`) |
| Killed | At least one test fails, errors or times out on the mutant |
| Survived | All tests pass on the mutant, and at least one of them evaluates the mutated location |
| No coverage | All tests pass on the mutant, and none of them evaluates the mutated location |
| Stillborn | The mutant does not compile (type error, unsafe variable). Discarded, not counted |
| Equivalent | The mutant behaves exactly like the original for every input. Cannot be killed; must be ignored |
| Ignored | Excluded by an inline annotation or the config file |

## 3. Architecture

```
            ┌────────────────────────────── regodrill (Go binary) ──────────────────────────────┐
 .rego ───▶ │ load + parse (opa/v1/ast) ─▶ baseline tests + coverage ─▶ generate mutants        │
            │        ─▶ for each mutant: patch source, compile, run covering tests (parallel)   │
            │        ─▶ report: text | JSON v1 | SARIF                                          │
            └──────────────────────────────────────────────────────────────────────────────────┘
                     ▲                                  ▲                          ▲
              CLI / pre-commit                  VS Code extension           GitHub Action
                                               (this repo, thin client)   (SARIF upload + comment)
```

- **Engine**: a separate Go repository, using OPA as a library (`github.com/open-policy-agent/opa/v1/ast`, `.../tester`, `.../cover`). It uses the same parser and compiler as `opa`, so new Rego syntax is supported by bumping one dependency. Every mutant is compiled and tested in memory, without starting a process per mutant.
- **Editor integration**: this extension gains a small runtime that runs the binary and renders the JSON report.
- **Contract**: the versioned JSON report (§9.2) is the only interface between the two repositories.

## 4. Command-line interface

```
regodrill run [paths...] [flags]     run mutation testing (default paths: .)
regodrill list [paths...] [flags]    list the mutants that would be generated, without running tests
regodrill operators                  print the operators with a description and an example
regodrill version
```

`paths` are files or directories, loaded like `opa test` does (`.rego` files, `data.json`/`data.yaml`, bundles). Test files are the files whose name ends with `_test.rego` or that define `test_` rules. They are never mutated, and neither are the fixtures and helpers they contain.

| Flag | Default | Effect |
|---|---|---|
| `--format text\|json\|sarif` | `text` | Report format on stdout |
| `--output FILE` | stdout | Write the report to a file; text summary still goes to stderr |
| `--threshold N` | none | Exit with code 3 if the score is below N (0 to 100) |
| `--since REF` | none | Only mutate lines added or changed since git REF (§8) |
| `--operators A,B` / `--exclude-operators A,B` | all default-on | Select operators |
| `--parallel N` | number of CPUs | Mutants evaluated in parallel |
| `--timeout-factor F` | `5` | A mutant times out when its tests take more than F × baseline duration (minimum 2 s) |
| `--allow-network` | off | Keep `http.send` and `net.lookup_ip_addr` (§10) |
| `--config FILE` | `.regodrill.yaml` if present | Configuration file (§7.2) |
| `--ignore PATTERN` | none | Skip files and directories whose name matches, when loading (same as `opa test --ignore`, repeatable) |
| `--v0-compatible` | off | Parse as Rego v0 (same meaning as in `opa`) |
| `--no-select` | off | Run every test on every mutant (§6); same verdicts, slower |

On a terminal the text report is colored (`NO_COLOR` turns it off) and stderr shows progress. An unknown
operator ID, format or configuration key is a usage error.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Run completed, threshold met or not set |
| 1 | Usage or configuration error |
| 2 | Baseline failed: a file does not parse or load, the unmodified tests do not all pass or do not compile, or there is no test to run. Nothing is mutated. A Rego v0 project loaded without `--v0-compatible` gets a hint |
| 3 | Run completed, score below `--threshold` |

### Text report (example)

```
policies/authz.rego:14:23  COMP_BOUNDARY   input.user.age >= 18  →  input.user.age > 18      SURVIVED
policies/authz.rego:22:5   EXPR_REMOVE     input.user.active                                 SURVIVED
policies/authz.rego:31:5   EXPR_REMOVE     not input.user.suspended                          NO COVERAGE
policies/authz.rego:9:23   DEFAULT_FLIP    default allow := false  →  true                    killed by test_deny_anonymous

Mutation score: 41/48 killed (85.4 %)   survived 5 · no coverage 2 · stillborn 3 · ignored 1
Duration: 3.2 s (baseline 0.2 s, 51 mutants, 8 workers)
```

## 5. Mutation operators (MVP)

Each operator has a stable ID, used in reports, annotations and configuration. All of them are on by default unless marked otherwise.

| ID | Mutation | Example | Authorization risk it simulates |
|---|---|---|---|
| `COMP_BOUNDARY` | `>=`↔`>`, `<=`↔`<` | `age >= 18` → `age > 18` | Off-by-one on a limit (age, level, quota) |
| `COMP_NEGATE` | `==`↔`!=`, `<`↔`>=`, `>`↔`<=` | `owner == user` → `owner != user` | Inverted ownership or identity check |
| `EXPR_REMOVE` | Delete one expression of a rule body (only if the body has 2 or more expressions) | drop `input.user.active` | A forgotten condition: suspended or inactive users get access |
| `NOT_TOGGLE` | Remove a `not`, or add one to an expression | `not is_blocked` → `is_blocked` | Inverted deny list |
| `DEFAULT_FLIP` | Flip a boolean `default` value | `default allow := false` → `true` | Fail-open policy |
| `RULE_REMOVE` | Delete one definition of a rule that has several (incremental `allow if {...}`, partial sets) | drop the 2nd `allow if` | A whole access path is untested |
| `CONST_STRING` | Change a string literal used in a comparison or membership | `"admin"` → `"admin_regodrill"` | Role or action name typo |
| `CONST_NUMBER` | Integer `n` → `n+1` and `n-1` | `count(x) > 3` → `count(x) > 4` | Wrong threshold |
| `COLLECTION_DROP` | Remove one element from a literal set or array | `{"admin", "owner"}` → `{"admin"}` | A privileged role is never tested |
| `QUANT_WEAKEN` | `every x in xs { body }` → `some x in xs` followed by `body` inlined in the enclosing rule | `every c in containers { c.privileged == false }` → `some c in containers; c.privileged == false` | "All" checked as "at least one": one compliant item lets the others through |
| `LOGIC_SWAP` | `and` ↔ `or` (Rego v1 keywords, OPA ≥ 1.22) | `a and b` → `a or b` | Condition relaxed or tightened |

Scope of each operator, as implemented in M1 (regodrill's scenario catalog has one directory per operator):

- `CONST_STRING` changes a string compared with `==`/`!=`, or on the left of `in`. Elements of a literal
  collection are `COLLECTION_DROP`'s. Raw strings are handled.
- `CONST_NUMBER` changes integers in comparisons only (decimals and call arguments are left alone).
- `COLLECTION_DROP` applies to literal sets and arrays of at least two constants (`[x.name, x.image]` is not
  a list of roles).
- `NOT_TOGGLE` does not add `not` to a declaration, a unification, `every`, `some`, or an expression whose
  variables nothing else binds (a negation binds nothing).
- `RULE_REMOVE` counts definitions across all policy files, ignores `default` definitions, and handles
  Rego v0 chained bodies (`f(x) = y { a } { b }`) and body-less definitions (`f("x", _)`).
- `print` and `trace` calls are never mutated: they are always true and do not affect the decision.
- `LOGIC_SWAP` waits for an OPA release with `and`/`or` that is at least two weeks old.

Off by default, available with `--operators`:

| ID | Mutation | Why off by default |
|---|---|---|
| `WITH_REMOVE` | Remove a `with` clause in a test file | It mutates tests, not the policy. Useful to detect tests that pass whatever the mock |
| `BUILTIN_SWAP` | `startswith`↔`endswith`, `any`↔`all`, `glob.match`↔`regex.match` | High stillborn and equivalent rate, to be measured in the spike |

### Generation rules

1. Mutants are produced from the parsed AST (types and locations from `opa/v1/ast`). They are applied as **text patches on the original source**, at the token's `Location`. The source keeps its comments and formatting, so the diff shown to the user is exactly one change.
2. One mutation per mutant (first order only).
3. Each mutant is compiled with the same compiler options as the baseline. Compile errors make it **stillborn**: it is reported in JSON with the error, and excluded from the score. Mutants that a static check can show would not compile are **not generated**: removing an expression that binds a variable the rule still needs (`x := ...`, `some x in`, `x = ...`, `items[x]`) when nothing else can bind it, or adding `not` to such an expression. The check is conservative: on gatekeeper-library and trivy-checks it dropped only mutants that were stillborn (45 % stillborn in the spike, 1.9 % after).
4. **Trivial compiler equivalence**: a mutant whose parsed module equals the original (OPA's AST comparison, which ignores locations and compares sets as sets) is `equivalent`: not run, not scored. Duplicates between mutants were measured: none among the 2,426 mutants of gatekeeper-library.
5. Order is deterministic: file path, then line, column and operator ID.

## 6. Execution

1. **Load** the paths and split policy files from test files.
2. **Baseline**: compile and run all tests once, with a query tracer. If a file does not load, a test fails or errors, or there is no test, stop with exit code 2. For each test, the tracer records:
   - the lines it evaluates (line coverage, for the `survived` / `no_coverage` distinction and the reports);
   - the documents it looks up (the `Index` trace event), which decide test selection.

   One run is enough: the test runner evaluates tests one at a time, and each test's query starts with the lookup of the test rule, so the tracer knows which test it is in. `opa/v1/cover` is not used: it adds two extra passes per test.
3. **Generate** the mutants (§5) for policy files, filtered by `--since`, operators and ignores. Each mutant knows its enclosing rule (package path and ground prefix of the head, for example `data.app.authz.allow`).
4. **Select** the tests that **reach** the enclosing rule: they look up the rule, a document that contains it (`data.app.authz`, `data.app.authz.checks[name]`), or a document inside it. Only these tests can see a change to the rule. A mutant that no test reaches is compiled (to detect a stillborn mutant) and classified `no_coverage` without running.
5. **Run** the selected tests on each other mutant, in parallel workers.
   - A test fails or errors: `killed`. `killedBy` is the first failing test **by name**, so reports are deterministic (the runner's order is not). An implementation may stop early only if it keeps this property.
   - All pass, and a test evaluates the mutated line: `survived`. All pass, and none does: `no_coverage`.
   - Duration > `--timeout-factor` × baseline duration of those tests: `timeout`, which counts as killed.
6. **Report**.

**Running the tests of a mutant.** OPA's test runner attaches a query tracer to every test, which cost about a third of the CPU time. For plain test rules, regodrill compiles the modules like the runner (same capabilities, same renaming of duplicate test names, in module path order so names are stable) and evaluates each test query without a tracer: an error, an empty result or a value other than `true` fails. Tests run in name order and stop at the first failure, which is the reported `killedBy`. A project with a parameterized test (`test_x[name] if ...`) uses the runner, whose verdict depends on sub-results. On gatekeeper-library this took the mutation phase from 55 s to 8.8 s with identical verdicts. When one test name is defined in two files of a package, test selection is turned off: the runner's renaming order is not stable, so a name may not designate the same test in two compilations.

**The baseline always runs**, even when there is no mutant to run: a broken test suite must never look like a success. It runs twice to detect unstable tests (§10).

**Selection never changes a verdict.** `--no-select` runs every test on every mutant and must give the same statuses and `killedBy`. Selection by covered line, the first design, is unsound: for an input that does not match an indexed expression (`input.kind == "Service"`), OPA's rule index skips the whole body, so the line is not covered, yet removing that expression makes the test fail. The spike measured 14 such mutants out of 1,300 (1.1 %) in gatekeeper-library.

### Score

```
score = (killed + timeout) / (killed + timeout + survived + no_coverage) × 100
```

Stillborn, equivalent and ignored mutants are excluded. A run with no scorable mutant reports `score: null` and exits 0.

## 7. Equivalent mutants and ignores

Some mutants cannot be killed: for example, `count(x) > 0` → `count(x) >= 1` behaves the same way. Users need a way to say "I checked this one".

### 7.1 Inline annotation

```rego
allow if {
    count(input.roles) > 0 # regodrill:ignore CONST_NUMBER -- same as >= 1
    ...
}
```

- `# regodrill:ignore` on a line ignores every mutant on that line. Listing operator IDs (comma-separated) narrows it. Text after `--` is a free-form reason, copied into the report.
- `# regodrill:ignore-next-line [IDS]` works the same on the following line.
- An annotation that matches no mutant is reported as a warning, so stale ignores don't accumulate.

### 7.2 Configuration file `.regodrill.yaml`

```yaml
version: 1
paths: [policies]
exclude: ["policies/vendor/**"]     # loaded and tested, never mutated
threshold: 80
operators:
  exclude: [CONST_STRING]           # or include: [...]
ignore:
  - file: policies/authz.rego
    line: 14
    operator: COMP_BOUNDARY
    reason: "age is always an integer, > 17 is tested"
  - pattern: 'input\.review\.kind\.kind =='   # every line whose text matches
    reason: "Gatekeeper's match filters the kind"
ignore-files: ["*.yaml"]            # like --ignore
v0-compatible: false
parallel: 4
timeout-factor: 5
allow-network: false
```

Command-line flags take precedence over the file. Paths are relative to the file. Unknown keys are errors, so a typo never silently disables a setting. An ignore entry that matches no mutant is a warning, like a stale annotation. Ignores apply before `--since`, so an entry on an unchanged line is not reported as stale.

## 8. Incremental mode (`--since`)

`--since origin/main` mutates only the lines added or changed between the merge base of REF and the working tree, using `git diff --unified=0`. Coverage and test selection are unchanged: all tests stay available to kill those mutants.

The score in this mode only covers the changed lines, so a PR is judged on what it adds. A PR that only removes lines produces no mutants and reports `score: null`.

## 9. Reports

### 9.1 Text

Described in §4. Colors when stdout is a terminal; `NO_COLOR` is respected.

### 9.2 JSON (contract with the VS Code extension)

```json
{
  "schemaVersion": 1,
  "tool": { "name": "regodrill", "version": "0.1.0", "opaVersion": "1.22.0" },
  "summary": {
    "score": 85.4, "total": 51,
    "killed": 40, "timeout": 1, "survived": 5, "noCoverage": 2,
    "stillborn": 3, "equivalent": 0, "ignored": 1,
    "durationMs": 3200, "baselineMs": 200
  },
  "mutants": [
    {
      "id": "policies/authz.rego:14:23:COMP_BOUNDARY:0",
      "operator": "COMP_BOUNDARY",
      "file": "policies/authz.rego",
      "range": { "start": { "line": 14, "column": 23 }, "end": { "line": 14, "column": 25 } },
      "original": ">=",
      "replacement": ">",
      "status": "survived",
      "rule": "data.app.authz.allow",
      "coveringTests": ["data.app.authz_test.test_adult_allowed"],
      "selectedTests": ["data.app.authz_test.test_adult_allowed", "data.app.authz_test.test_minor_denied"],
      "killedBy": null,
      "message": "Changing >= to > does not make any test fail."
    }
  ]
}
```

- Lines and columns are 1-based. `end` is exclusive. Columns count UTF-16 code units, like editors and SARIF; they equal byte columns on ASCII lines.
- The normative description of every field is regodrill's [`docs/report-format.md`](https://github.com/adamaKomi/regodrill/blob/main/docs/report-format.md), checked by a contract test. It adds to the example above: `tool`, `warnings`, the `ignored` and `equivalent` statuses, `ignoreReason`, `selectedTests`, `range`, and per-operator counts in camelCase.
- Test names are the names the OPA test runner filters on: `data.pkg.test_x`, or `data.pkg["test_x#01"]` for a duplicate name that the runner renamed.
- `coveringTests` evaluate the mutated line; `selectedTests` reach the enclosing rule and were run.
- `id` is stable across runs on the same source, so editors can match results with the document.
- Adding fields does not change `schemaVersion`. Removing or renaming a field does.

### 9.3 SARIF 2.1.0

- One `result` per `survived` and `no_coverage` mutant. Killed mutants are not reported.
- `ruleId` = operator ID; `level`: `warning` for survived, `note` for no coverage.
- `partialFingerprints.regodrillId` = the mutant `id`, so GitHub keeps alerts stable across commits.

The output is accepted by `github/codeql-action/upload-sarif`: survivors appear in the Security tab and as annotations on the PR diff.

## 10. Safety and determinism

- **Network off by default**: mutants can turn a test path into one that calls `http.send` or `net.lookup_ip_addr`. These built-ins are removed from the compiler capabilities unless `--allow-network` is set. A policy that needs them fails at baseline, with a message pointing to the flag.
- **Custom built-ins**: projects that run their tests with a custom OPA build (aquasecurity/trivy-checks, conftest's `parse_config`) call functions that standard OPA does not have. The baseline fails with a hint that names them. Supporting them would need a way to provide their implementations; not planned for M1.
- **Time and randomness**: built-ins like `time.now_ns`, `rand.intn` and `uuid.rfc4122` can make tests flaky. The baseline runs twice; if results differ, regodrill stops with exit code 2 and names the unstable tests.
- **Resources**: each mutant evaluation has the timeout above and the same memory limits as `opa test`. A runaway mutant (for example an infinite recursion it introduces) counts as killed by timeout and never blocks the run.
- No file is written next to the policies; mutants exist only in memory.

## 11. VS Code integration (Rego Syntax Support, this extension)

The extension stays useful without the binary: syntax highlighting and snippets don't depend on it.

| Feature | Behavior |
|---|---|
| Command `Rego: Run Mutation Testing` | On the workspace, or on the current file's directory. Progress in a notification, cancellable |
| Diagnostics | One `Warning` per survived mutant, one `Information` per no-coverage mutant, at the exact range, source `regodrill` |
| Hover | Shows the mutation as a one-line diff, the covering tests and the risk description of the operator |
| Quick fix | `Ignore this mutant`: inserts `# regodrill:ignore OPERATOR` at the end of the line |
| CodeLens | Above each rule definition: `allow: 3/5 mutants killed`, from the report's `ruleLine` (regodrill after 0.1.0; no CodeLens with older reports). Hidden in a file once it is edited, until the next run |
| Status bar | Last score, click to re-run |
| Settings | `regoSyntaxSupport.regodrill.path` (binary path; `regodrill` on the `PATH` until a binary is bundled), `regoSyntaxSupport.regodrill.args` (extra flags), `regoSyntaxSupport.regodrill.runOnSave` (default off). The prefix is the extension's own, like its other settings, so it cannot collide with another extension's `rego.*` settings |

- **Activation**: `onLanguage:rego` and the command. Nothing runs until the user starts a run, or enables `runOnSave`. Nothing runs in Restricted Mode, and the path and args settings are restricted configurations (only the user value is used there).
- **Quick fix**: on a line that already has a comment, the annotation goes on its own line above, as `# regodrill:ignore-next-line OPERATOR`, because an annotation must start its comment.
- **Web**: the commands are hidden in VS Code for the Web (`!isWeb`); a `browser` entry point keeps the grammars and snippets available there.
- **Results**: read from the JSON report. If the document changed since the run, diagnostics on edited lines are cleared rather than shown at a wrong position.
- **Distribution**: one platform-specific VSIX per target (`vsce package --target linux-x64`, etc.), with the binary bundled, so nothing needs to be installed. A universal VSIX without binary is also published, for platforms without one; it uses `rego.mutation.path`. The spike also evaluates a WASM build of the engine (§14).

## 12. GitHub Action

```yaml
- uses: adamaKomi/regodrill-action@v1
  with:
    paths: policies
    since: ${{ github.event.pull_request.base.sha }}
    threshold: 80
```

- Downloads the released binary (with checksum check), runs `regodrill run --since --format sarif`, and uploads the SARIF.
- Writes a job summary: score, number of survivors, link to the alerts.
- Fails the job only if `threshold` is set and not met.

## 13. Distribution of the engine

- Static binaries for linux, darwin and windows on amd64 and arm64, built by goreleaser on each tag, with checksums and build provenance.
- `go install github.com/adamaKomi/regodrill@latest`.
- A Docker image is a candidate for later, not part of the MVP.

## 14. Spike (before committing to the MVP)

A time-boxed experiment of 2 days, in the new Go repository, on **open-policy-agent/gatekeeper-library** (hundreds of policies with tests).

Implement only: loading, baseline with coverage, 3 operators (`COMP_BOUNDARY`, `EXPR_REMOVE`, `DEFAULT_FLIP`), sequential then parallel execution, text output.

| Question | Measure | Go criterion |
|---|---|---|
| Do AST locations allow exact text patches? | % of mutants whose patched source re-parses to the expected AST | ≥ 99 % |
| Is it fast enough for CI? | Total duration on the full library, 4 workers | ≤ 10 min, and ≤ 1 min with `--since` on a typical PR |
| Does coverage-based selection pay off? | Duration with and without selection | ≥ 3× faster |
| Is the signal useful? | Survivors reviewed by hand: real test gaps vs equivalent mutants | ≥ 50 % real gaps |
| WASM option | Size and speed of a `GOOS=wasip1` build run in Node | Recorded only, for the distribution decision |

The spike ends with a short report: the measures above and a list of real survivors found in gatekeeper-library. If those survivors are real gaps, they also make a strong launch post (and upstream PRs adding the missing tests).

If a go criterion fails, we decide before continuing: change the approach, or stop.

Results: [`docs/spike-m0.md`](https://github.com/adamaKomi/regodrill/blob/main/docs/spike-m0.md) in the regodrill repository.

## 15. Milestones

| Milestone | Content | Done when |
|---|---|---|
| M0 Spike | §14 | Report written, go or no-go |
| M1 CLI MVP | All default operators, test selection, ignores, config file, JSON v1, SARIF, threshold, `--since`, network off | Runs on gatekeeper-library and other public corpora (regodrill's `docs/corpora.md`; this repo's `test/fixtures` are highlighting samples, without tests and with deliberate type errors, so they are not a target); each operator and each behavior has a scenario in regodrill's catalog (`testdata/scenarios`), with at least one killed and one surviving example per operator. Status (2026-11-03): done except `LOGIC_SWAP`, on a local branch of regodrill; 2,426 mutants on gatekeeper-library in 13.5 s |
| M2 Release | goreleaser binaries, `go install`, README with a real example | v0.1.0 tagged |
| M3 VS Code | §11 | Integration test: open a policy with an incomplete test, run the command, a diagnostic appears at the right line |
| M4 Action | §12 | Used on a sample repository, alerts visible on a PR |
| M5 Positioning | Present Rego Syntax Support as the test-quality companion of the official OPA extension; list `regodrill` on the OPA ecosystem page | README and Marketplace page updated, ecosystem PR opened |

## 16. Decisions

1. **Names**: the engine, its CLI and its repository are `regodrill`. The name comes from a fire drill: mistakes are set off on purpose to check that the tests react. The editor integration is this extension, **Rego Syntax Support** (`AdamaKomi.rego-syntax-support`). A rename to "Rego Lens" was considered and dropped on 2026-11-02: users already installed and trust the current name. Neither name contains "OPA", so they can't be mistaken for an official OPA project; "Open Policy Agent (OPA)" appears in the description and keywords only.
2. **OPA version**: the engine embeds the latest OPA v1 Go library, so it understands all current syntax (including `and`/`or`) whatever `opa` binary the user has installed. Policies are parsed as Rego v1 by default; `--v0-compatible` parses Rego v0.
3. **Rego embedded in YAML** (Gatekeeper `ConstraintTemplate`): postponed until after M4. Its tests usually live in gator suites, not in `.rego` test files, so it needs its own design.
4. **Higher-order or prioritized mutation** (several mutations at once, ranking by rule criticality): out of the MVP, to be revisited after M1 with real data.
5. **License**: Apache 2.0 for the `regodrill` repository, like OPA, Regal and Gatekeeper (explicit patent grant). This extension stays MIT.
6. **Test selection by rule reach** (2026-11-02), not by covered line: see §6. It is sound on the spike corpus, but only 1.27× faster there, because compiling each mutant costs more than running small test suites.
7. **Scenario catalog as the acceptance test** (2026-11-02): regodrill's `testdata/scenarios` runs the CLI end to end on small projects, with and without selection, against expected verdicts justified in the fixtures. Every behavior change comes with a scenario.
8. **Own evaluation of plain tests** (2026-11-03), instead of OPA's test runner, for speed (§6). Parameterized tests keep the runner. Verdicts are compared with the runner's on the corpora at each change.
9. **No new dependencies without need**: the configuration file uses `go.yaml.in/yaml/v3`, already in OPA's module graph. The JSON report contract is checked with Go structs, not a JSON Schema library.

## References

- Martin, E. & Xie, T. (2007). *A Fault Model and Mutation Testing of Access Control Policies.* WWW '07.
- OPA Go packages: `v1/ast`, `v1/tester`, `v1/cover`: <https://pkg.go.dev/github.com/open-policy-agent/opa/v1>
- SARIF 2.1.0: <https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html>
- Gatekeeper library: <https://github.com/open-policy-agent/gatekeeper-library>
