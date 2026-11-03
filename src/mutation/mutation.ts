/**
 * Mutation testing with regodrill in the editor (docs/mutation-testing-spec.md §11): a command runs
 * `regodrill run --format json`, and the surviving mutants become diagnostics, with a hover, a quick fix
 * that marks a mutant as checked, and the score in the status bar.
 *
 * regodrill is a separate binary (https://github.com/adamaKomi/regodrill); its path is a setting. Nothing
 * runs until the user starts a run, or turns on runOnSave; nothing runs in Restricted Mode.
 */
import { execFile } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  changeSummary,
  ignoreEdit,
  MutantFinding,
  parseReport,
  Report,
  ruleSummaries,
  RuleSummary,
  runArgs,
  scoreText,
  summaryText,
  survivors,
} from './report';

const SECTION = 'regoSyntaxSupport.regodrill';
export const RUN_COMMAND = 'regoSyntaxSupport.runMutationTesting';
const IGNORE_COMMAND = 'regoSyntaxSupport.ignoreMutant';

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runRegodrill(
  binary: string,
  args: string[],
  cwd: string,
  token: vscode.CancellationToken
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const subscription = token.onCancellationRequested(() => controller.abort());
    execFile(
      binary,
      args,
      { cwd, signal: controller.signal, maxBuffer: 256 * 1024 * 1024 },
      (err, stdout, stderr) => {
        subscription.dispose();
        if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new Error(`"${binary}" was not found`, { cause: err }));
          return;
        }
        if (err && err.name === 'AbortError') {
          reject(new vscode.CancellationError());
          return;
        }
        const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      }
    );
  });
}

export class MutationTesting
  implements vscode.HoverProvider, vscode.CodeActionProvider, vscode.CodeLensProvider
{
  private readonly diagnostics = vscode.languages.createDiagnosticCollection('regodrill');
  private readonly output = vscode.window.createOutputChannel('regodrill');
  private readonly status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  /** Findings by file path, from the last run. */
  private findings = new Map<string, MutantFinding[]>();
  /** Per-definition results of the last run, by file path, for the CodeLenses. */
  private summaries = new Map<string, RuleSummary[]>();
  private readonly lensesChanged = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.lensesChanged.event;
  private lastTarget: { cwd: string; target: string } | undefined;
  private running = false;

  register(context: vscode.ExtensionContext): void {
    const rego = { language: 'rego' };
    context.subscriptions.push(
      this.diagnostics,
      this.output,
      this.status,
      vscode.commands.registerCommand(RUN_COMMAND, () => this.runCommand()),
      vscode.commands.registerCommand(IGNORE_COMMAND, (uri: vscode.Uri, finding: MutantFinding) =>
        this.ignore(uri, finding)
      ),
      vscode.languages.registerHoverProvider(rego, this),
      vscode.languages.registerCodeLensProvider(rego, this),
      this.lensesChanged,
      vscode.languages.registerCodeActionsProvider(rego, this, {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
      }),
      vscode.workspace.onDidChangeTextDocument((e) => this.dropStale(e)),
      vscode.workspace.onDidSaveTextDocument((d) => {
        const onSave = vscode.workspace.getConfiguration(SECTION).get<boolean>('runOnSave', false);
        if (onSave && d.languageId === 'rego' && vscode.workspace.isTrusted && !this.running) {
          const target = this.lastTarget ?? this.defaultTarget(d.uri);
          if (target) {
            void this.run(target);
          }
        }
      })
    );
    this.status.command = RUN_COMMAND;
    this.status.tooltip = 'regodrill mutation score of the last run. Click to run again.';
  }

  /** The workspace folder of a file, or the first one: regodrill reads .regodrill.yaml there. */
  private defaultTarget(uri?: vscode.Uri): { cwd: string; target: string } | undefined {
    const folder =
      (uri && vscode.workspace.getWorkspaceFolder(uri)) ?? vscode.workspace.workspaceFolders?.[0];
    return folder ? { cwd: folder.uri.fsPath, target: folder.uri.fsPath } : undefined;
  }

  private async runCommand(): Promise<void> {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showInformationMessage(
        'Mutation testing runs the regodrill binary and the policies tests, which is off in Restricted Mode.'
      );
      return;
    }
    const active = vscode.window.activeTextEditor?.document;
    const workspace = this.defaultTarget(active?.uri);
    if (!workspace) {
      void vscode.window.showInformationMessage(
        'Open a folder to run mutation testing on its policies.'
      );
      return;
    }
    let target = workspace;
    if (active?.languageId === 'rego' && active.uri.scheme === 'file') {
      const directory = path.dirname(active.uri.fsPath);
      if (directory !== workspace.target) {
        const choice = await vscode.window.showQuickPick(
          [
            { label: 'Workspace folder', description: workspace.target, value: workspace.target },
            { label: "Current file's directory", description: directory, value: directory },
          ],
          { placeHolder: 'Run mutation testing on' }
        );
        if (!choice) {
          return;
        }
        target = { cwd: workspace.cwd, target: choice.value };
      }
    }
    await this.run(target);
  }

  private async run(target: { cwd: string; target: string }): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.lastTarget = target;
    const config = vscode.workspace.getConfiguration(SECTION);
    const binary = config.get<string>('path', '').trim() || 'regodrill';
    const extra = config.get<string[]>('args', []);
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'regodrill: mutation testing',
          cancellable: true,
        },
        async (_progress, token) => {
          let result: RunResult;
          try {
            result = await runRegodrill(binary, runArgs(target.target, extra), target.cwd, token);
          } catch (err) {
            if (err instanceof vscode.CancellationError) {
              return;
            }
            const choice = await vscode.window.showErrorMessage(
              `regodrill could not run: ${(err as Error).message}. Set the path to the regodrill binary.`,
              'Open Settings'
            );
            if (choice === 'Open Settings') {
              void vscode.commands.executeCommand(
                'workbench.action.openSettings',
                `${SECTION}.path`
              );
            }
            return;
          }
          this.output.clear();
          if (result.stderr.trim()) {
            this.output.append(result.stderr);
          }
          // 0: done; 3: done, score below --threshold. 1 (usage) and 2 (baseline) produce no report.
          if (result.code !== 0 && result.code !== 3) {
            const first = result.stderr.trim().split('\n')[0] || `exit code ${result.code}`;
            const choice = await vscode.window.showErrorMessage(
              `regodrill: ${first}`,
              'Show Output'
            );
            if (choice === 'Show Output') {
              this.output.show(true);
            }
            return;
          }
          this.show(parseReport(result.stdout), target.cwd);
        }
      );
    } catch (err) {
      void vscode.window.showErrorMessage(`regodrill: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private show(report: Report, cwd: string): void {
    this.diagnostics.clear();
    this.findings = new Map();
    this.summaries = new Map();
    for (const s of ruleSummaries(report, cwd)) {
      this.summaries.set(s.file, [...(this.summaries.get(s.file) ?? []), s]);
    }
    this.lensesChanged.fire();
    for (const f of survivors(report, cwd)) {
      const list = this.findings.get(f.file) ?? [];
      list.push(f);
      this.findings.set(f.file, list);
    }
    for (const [file, list] of this.findings) {
      this.diagnostics.set(
        vscode.Uri.file(file),
        list.map((f) => {
          const d = new vscode.Diagnostic(
            new vscode.Range(f.startLine, f.startCharacter, f.endLine, f.endCharacter),
            f.mutant.message,
            f.severity === 'warning'
              ? vscode.DiagnosticSeverity.Warning
              : vscode.DiagnosticSeverity.Information
          );
          d.source = 'regodrill';
          d.code = f.mutant.operator;
          return d;
        })
      );
    }
    this.status.text = `$(beaker) ${scoreText(report)}`;
    this.status.show();
    const s = report.summary;
    void vscode.window.setStatusBarMessage(
      `regodrill: ${scoreText(report)}, ${s.survived} survived, ${s.noCoverage} without coverage`,
      5000
    );
  }

  /** Diagnostics of edited lines would point at the wrong text: drop them, and the ones below a line change. */
  private dropStale(e: vscode.TextDocumentChangeEvent): void {
    // Lines may have moved: the per-rule counts wait for the next run rather than sit on the wrong rule.
    if (e.contentChanges.length > 0 && this.summaries.delete(e.document.uri.fsPath)) {
      this.lensesChanged.fire();
    }
    const list = this.findings.get(e.document.uri.fsPath);
    if (!list || e.contentChanges.length === 0) {
      return;
    }
    const from = Math.min(...e.contentChanges.map((c) => c.range.start.line));
    const shifted = e.contentChanges.some(
      (c) => c.range.start.line !== c.range.end.line || c.text.includes('\n')
    );
    const touched = new Set(e.contentChanges.map((c) => c.range.start.line));
    const kept = list.filter((f) => (shifted ? f.startLine < from : !touched.has(f.startLine)));
    this.findings.set(e.document.uri.fsPath, kept);
    const diagnostics = (this.diagnostics.get(e.document.uri) ?? []).filter((d) =>
      shifted ? d.range.start.line < from : !touched.has(d.range.start.line)
    );
    this.diagnostics.set(e.document.uri, diagnostics);
  }

  private at(document: vscode.TextDocument, position: vscode.Position): MutantFinding[] {
    return (this.findings.get(document.uri.fsPath) ?? []).filter((f) =>
      new vscode.Range(f.startLine, f.startCharacter, f.endLine, f.endCharacter).contains(position)
    );
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    return (this.summaries.get(document.uri.fsPath) ?? [])
      .filter((s) => s.line < document.lineCount)
      .map(
        (s) =>
          new vscode.CodeLens(new vscode.Range(s.line, 0, s.line, 0), {
            title: summaryText(s),
            tooltip:
              'Mutants of this rule definition killed by the tests, in the last regodrill run. Click to run again.',
            command: RUN_COMMAND,
          })
      );
  }

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const found = this.at(document, position);
    if (found.length === 0) {
      return undefined;
    }
    const md = new vscode.MarkdownString();
    for (const f of found) {
      const m = f.mutant;
      md.appendMarkdown(
        `**regodrill** · ${m.operator} · ${m.status === 'survived' ? 'survived' : 'no coverage'}\n\n`
      );
      md.appendMarkdown(`${changeSummary(m)} in \`${m.rule}\`\n\n`);
      const tests = m.coveringTests ?? [];
      md.appendMarkdown(
        tests.length > 0
          ? `Tests that evaluate this line: ${tests
              .slice(0, 5)
              .map((t) => `\`${t}\``)
              .join(', ')}${tests.length > 5 ? `, and ${tests.length - 5} more` : ''}\n\n`
          : 'No test evaluates this line.\n\n'
      );
    }
    return new vscode.Hover(md);
  }

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection
  ): vscode.CodeAction[] {
    return this.at(document, range.start).map((f) => {
      const action = new vscode.CodeAction(
        `Ignore this mutant (${f.mutant.operator})`,
        vscode.CodeActionKind.QuickFix
      );
      action.command = {
        command: IGNORE_COMMAND,
        title: action.title,
        arguments: [document.uri, f],
      };
      action.diagnostics = (this.diagnostics.get(document.uri) ?? []).filter(
        (d) => d.range.start.line === f.startLine && d.code === f.mutant.operator
      );
      return action;
    });
  }

  private async ignore(uri: vscode.Uri, finding: MutantFinding): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    const line = document.lineAt(finding.startLine);
    const e = ignoreEdit(line.text, finding.startLine, finding.mutant.operator);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, new vscode.Position(e.line, e.character), e.text);
    await vscode.workspace.applyEdit(edit);
  }
}
