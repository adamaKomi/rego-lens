/**
 * Reads the JSON report of regodrill (`regodrill run --format json`), schema version 1. The fields are
 * described in regodrill's docs/report-format.md; only the ones used here are typed. No VS Code API, so
 * this is unit-tested in plain Node.
 */
import * as path from 'path';

export interface Position {
  line: number;
  column: number;
}

export interface ReportMutant {
  id: string;
  operator: string;
  file: string;
  range: { start: Position; end: Position };
  original: string;
  replacement: string;
  rule: string;
  status:
    'killed' | 'timeout' | 'survived' | 'no_coverage' | 'stillborn' | 'equivalent' | 'ignored';
  message: string;
  killedBy?: string;
  coveringTests?: string[];
}

export interface Report {
  schemaVersion: number;
  summary: {
    score: number | null;
    total: number;
    killed: number;
    timeout: number;
    survived: number;
    noCoverage: number;
  };
  warnings?: string[];
  mutants: ReportMutant[];
}

/** A survivor to show in the editor. Lines and characters are 0-based, characters in UTF-16 code units. */
export interface MutantFinding {
  file: string;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  severity: 'warning' | 'information';
  mutant: ReportMutant;
}

/** Parses a report and checks the schema version this extension understands. */
export function parseReport(json: string): Report {
  const report = JSON.parse(json) as Report;
  if (report.schemaVersion !== 1 || !Array.isArray(report.mutants)) {
    throw new Error(`unsupported regodrill report (schemaVersion ${String(report.schemaVersion)})`);
  }
  return report;
}

/**
 * The survivors of a report, as editor positions. regodrill counts lines and columns from 1, and columns
 * in UTF-16 code units, like VS Code: only the base changes. An insertion (start equal to end) is widened
 * to one character so that it can be seen. Relative paths are resolved against the directory regodrill ran
 * in.
 */
export function survivors(report: Report, cwd: string): MutantFinding[] {
  const out: MutantFinding[] = [];
  for (const m of report.mutants) {
    if (m.status !== 'survived' && m.status !== 'no_coverage') {
      continue;
    }
    const start = m.range.start;
    let end = m.range.end;
    if (end.line === start.line && end.column <= start.column) {
      end = { line: start.line, column: start.column + 1 };
    }
    out.push({
      file: path.resolve(cwd, m.file),
      startLine: start.line - 1,
      startCharacter: start.column - 1,
      endLine: end.line - 1,
      endCharacter: end.column - 1,
      severity: m.status === 'survived' ? 'warning' : 'information',
      mutant: m,
    });
  }
  return out;
}

/** A one-line description of the change, for hovers: "`>=` → `>`", "remove `x`", "add `not `". */
export function changeSummary(m: ReportMutant): string {
  const short = (s: string): string => {
    const one = s.replace(/\s+/g, ' ').trim();
    return one.length > 60 ? `${one.slice(0, 57)}...` : one;
  };
  if (m.original === '') {
    return `add \`${short(m.replacement)}\``;
  }
  if (m.replacement === '') {
    return `remove \`${short(m.original)}\``;
  }
  return `\`${short(m.original)}\` → \`${short(m.replacement)}\``;
}

/** The score line for the status bar: "Mutation 85.4 %", or "Mutation n/a" when nothing is scorable. */
export function scoreText(report: Report): string {
  return report.summary.score === null
    ? 'Mutation n/a'
    : `Mutation ${report.summary.score.toFixed(1)} %`;
}

/**
 * The edit that marks a mutant as checked (regodrill's inline annotation). On a line without a comment,
 * `# regodrill:ignore OPERATOR` goes at the end; on a line that has one, `# regodrill:ignore-next-line
 * OPERATOR` goes on its own line above, with the same indentation, because an annotation must start its
 * comment.
 */
export function ignoreEdit(
  lineText: string,
  line: number,
  operator: string
): { line: number; character: number; text: string } {
  if (!lineText.includes('#')) {
    return { line, character: lineText.length, text: ` # regodrill:ignore ${operator}` };
  }
  const indent = /^\s*/.exec(lineText)?.[0] ?? '';
  return { line, character: 0, text: `${indent}# regodrill:ignore-next-line ${operator}\n` };
}

/** The arguments of a run: JSON report, the user's extra flags, then the path. */
export function runArgs(target: string, extra: string[]): string[] {
  return ['run', '--format', 'json', ...extra, target];
}
