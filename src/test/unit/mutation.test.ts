import * as assert from 'assert';
import { execFile } from 'child_process';
import * as path from 'path';
import {
  changeSummary,
  ignoreEdit,
  parseReport,
  Report,
  ReportMutant,
  ruleSummaries,
  runArgs,
  scoreText,
  summaryText,
  survivors,
} from '../../mutation/report';

const ROOT = path.resolve(__dirname, '..', '..', '..');

function mutant(over: Partial<ReportMutant>): ReportMutant {
  return {
    id: 'policy.rego:4:17:COMP_BOUNDARY:0',
    operator: 'COMP_BOUNDARY',
    file: 'policy.rego',
    range: { start: { line: 4, column: 17 }, end: { line: 4, column: 19 } },
    original: '>=',
    replacement: '>',
    rule: 'data.authz.allow',
    status: 'survived',
    message: 'Changing `>=` to `>` does not make any test fail.',
    ...over,
  };
}

function report(mutants: ReportMutant[], score: number | null = 50): Report {
  return {
    schemaVersion: 1,
    summary: { score, total: mutants.length, killed: 1, timeout: 0, survived: 1, noCoverage: 0 },
    mutants,
  };
}

suite('regodrill report', () => {
  test('survivors become 0-based editor ranges; killed and ignored mutants are left out', () => {
    const found = survivors(
      report([
        mutant({}),
        mutant({ status: 'killed', killedBy: 'data.authz_test.test_x' }),
        mutant({ status: 'ignored' }),
        mutant({
          status: 'no_coverage',
          original: '',
          replacement: 'not ',
          range: { start: { line: 5, column: 2 }, end: { line: 5, column: 2 } },
        }),
      ]),
      '/work'
    );
    assert.deepStrictEqual(
      found.map((f) => [
        f.file,
        f.startLine,
        f.startCharacter,
        f.endLine,
        f.endCharacter,
        f.severity,
      ]),
      [
        [path.resolve('/work', 'policy.rego'), 3, 16, 3, 18, 'warning'],
        // An insertion is widened to one character, so that it can be seen.
        [path.resolve('/work', 'policy.rego'), 4, 1, 4, 2, 'information'],
      ]
    );
  });

  test('an unknown schema version is refused', () => {
    assert.throws(
      () => parseReport('{"schemaVersion": 2, "mutants": []}'),
      /unsupported regodrill report/
    );
    assert.strictEqual(parseReport(JSON.stringify(report([]))).schemaVersion, 1);
  });

  test('texts for hovers and the status bar', () => {
    assert.strictEqual(changeSummary(mutant({})), '`>=` → `>`');
    assert.strictEqual(
      changeSummary(mutant({ original: 'input.user.active', replacement: '' })),
      'remove `input.user.active`'
    );
    assert.strictEqual(changeSummary(mutant({ original: '', replacement: 'not ' })), 'add `not`');
    assert.strictEqual(scoreText(report([], 85.44)), 'Mutation 85.4 %');
    assert.strictEqual(scoreText(report([], null)), 'Mutation n/a');
    assert.deepStrictEqual(runArgs('/work', ['--v0-compatible']), [
      'run',
      '--format',
      'json',
      '--v0-compatible',
      '/work',
    ]);
  });

  test('the ignore annotation goes at the end of the line, or on its own line above a comment', () => {
    assert.deepStrictEqual(ignoreEdit('\tinput.user.age >= 18', 3, 'COMP_BOUNDARY'), {
      line: 3,
      character: 21,
      text: ' # regodrill:ignore COMP_BOUNDARY',
    });
    assert.deepStrictEqual(ignoreEdit('\tinput.user.age >= 18 # adults', 3, 'COMP_BOUNDARY'), {
      line: 3,
      character: 0,
      text: '\t# regodrill:ignore-next-line COMP_BOUNDARY\n',
    });
  });

  // The contract with the real binary, when there is one: regodrill is not published yet, so CI skips it.
  test('with the real regodrill binary', function (done) {
    this.timeout(60000);
    const dir = path.join(ROOT, 'test', 'mutation');
    execFile(
      'regodrill',
      runArgs(dir, ['--operators=COMP_BOUNDARY,EXPR_REMOVE']),
      { cwd: dir },
      (err, stdout) => {
        if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
          if (process.env.REQUIRE_REGODRILL === '1') {
            done(new Error('REQUIRE_REGODRILL=1 but regodrill is not on the PATH'));
            return;
          }
          this.skip();
          return;
        }
        try {
          const found = survivors(parseReport(String(stdout)), dir);
          // test/mutation has two gaps: no test at age 18, and no inactive adult.
          assert.deepStrictEqual(
            found.map((f) => [path.basename(f.file), f.startLine, f.mutant.operator, f.severity]),
            [
              ['policy.rego', 3, 'COMP_BOUNDARY', 'warning'],
              ['policy.rego', 4, 'EXPR_REMOVE', 'warning'],
            ]
          );
          done();
        } catch (e) {
          done(e);
        }
      }
    );
  });
});

suite('regodrill rule summaries', () => {
  test('mutants are counted per rule definition; stillborn, equivalent and ignored ones are not', () => {
    const at = (
      ruleLine: number | undefined,
      status: ReportMutant['status'],
      rule = 'data.authz.allow'
    ): ReportMutant => mutant({ ruleLine, status, rule });
    const summaries = ruleSummaries(
      report([
        at(3, 'killed'),
        at(3, 'timeout'),
        at(3, 'survived'),
        at(3, 'stillborn'),
        at(3, 'ignored'),
        at(8, 'no_coverage'),
        at(12, 'killed', 'data.authz.level'),
      ]),
      '/work'
    );
    assert.deepStrictEqual(
      summaries.map((s) => [s.line, summaryText(s)]),
      [
        [2, 'allow: 2/3 mutants killed'],
        [7, 'allow: 0/1 mutants killed'],
        [11, 'level: 1/1 mutants killed'],
      ]
    );
  });

  test('a report without ruleLine (regodrill 0.1.0) has no summaries', () => {
    assert.deepStrictEqual(ruleSummaries(report([mutant({})]), '/work'), []);
  });
});
