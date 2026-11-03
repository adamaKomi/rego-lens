/**
 * Checks the Rego embedded in a YAML file with `opa check`, and maps its errors back to YAML positions.
 *
 * `opa check` parses and compiles the files it is given, together
 * (https://www.openpolicyagent.org/docs/cli#check). With `--format json`, it prints the errors to stderr as
 * `{"errors": [{"code", "message", "location": {"file", "row", "col"}}]}`: the JSON form of OPA's `ast.Error`
 * (v1/ast/errors.go). Each group of modules (a template's rego and libs) is written to a temporary directory
 * and checked on its own, with the Rego version that Gatekeeper uses for it.
 */
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { EmbeddedGroup } from './extract';

/** An error found in a YAML file. Lines and columns are 0-based, like VS Code positions. */
export interface Finding {
  line: number;
  column: number;
  message: string;
  code: string;
}

/** Runs a program and resolves with its output and exit code; rejects only if it cannot start. */
export type Runner = (
  file: string,
  args: string[],
  timeoutMs: number
) => Promise<{ stdout: string; stderr: string; code: number }>;

/** The default runner: execFile, without a shell. */
export const runProcess: Runner = (file, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error(`${file} not found`, { cause: err }));
        return;
      }
      const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      resolve({ stdout: String(stdout), stderr: String(stderr), code });
    });
  });

/** Reads the major version from `opa version` ("Version: 1.21.3"). */
export function parseOpaVersion(output: string): number | undefined {
  const m = /^Version:\s*v?(\d+)\.(\d+)/m.exec(output);
  return m ? Number(m[1]) : undefined;
}

/**
 * The flags that make `opa check` parse a module as Gatekeeper does. OPA 1.x reads Rego v1 by default and
 * takes `--v0-compatible`; OPA 0.x reads Rego v0 by default and takes `--v1-compatible`.
 */
export function versionFlags(opaMajor: number, version: 'v0' | 'v1'): string[] {
  if (opaMajor >= 1) {
    return version === 'v0' ? ['--v0-compatible'] : [];
  }
  return version === 'v1' ? ['--v1-compatible'] : [];
}

interface OpaError {
  code?: string;
  message?: string;
  location?: { file?: string; row?: number; col?: number };
}

/** Maps the errors of `opa check --format json` on a group's files to positions in the YAML file. */
export function mapErrors(output: string, group: EmbeddedGroup, files: string[]): Finding[] {
  let parsed: { errors?: OpaError[] };
  try {
    parsed = JSON.parse(output) as { errors?: OpaError[] };
  } catch {
    return [];
  }
  const findings: Finding[] = [];
  for (const e of parsed.errors ?? []) {
    const index = e.location?.file ? files.findIndex((f) => path.resolve(f) === path.resolve(e.location!.file!)) : -1;
    // An error without a known location ("error limit reached") goes to the first module.
    const module = group.modules[index >= 0 ? index : 0];
    const row = index >= 0 && e.location?.row ? e.location.row : 1;
    const col = index >= 0 && e.location?.col ? e.location.col : 1;
    const lines = module.text.split('\n');
    // A parse error at the end of the module points past its last line: keep it on the last line.
    const moduleLine = Math.min(row - 1, Math.max(0, lines.length - 2));
    findings.push({
      line: module.firstLine + moduleLine,
      column: module.indent + Math.max(col, 1) - 1,
      message: e.message ?? 'error',
      code: e.code ?? 'rego_error',
    });
  }
  return findings;
}

/** Checks one group of modules with the given opa binary. */
export async function checkGroup(
  group: EmbeddedGroup,
  opa: { path: string; major: number },
  run: Runner = runProcess,
  timeoutMs = 20000
): Promise<Finding[]> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'rego-syntax-support-'));
  try {
    const files: string[] = [];
    for (const [i, module] of group.modules.entries()) {
      const file = path.join(dir, `${module.kind}-${i}.rego`);
      await writeFile(file, module.text, 'utf8');
      files.push(file);
    }
    const args = ['check', '--format', 'json', ...versionFlags(opa.major, group.version), ...files];
    const result = await run(opa.path, args, timeoutMs);
    if (result.code === 0) {
      return [];
    }
    return mapErrors(result.stderr.trim() || result.stdout.trim(), group, files);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
