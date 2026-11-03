/**
 * Desktop entry point: checks the Rego embedded in OPA Gatekeeper ConstraintTemplates with `opa check`,
 * and shows its errors on the YAML lines. The grammars and snippets need no code; VS Code for the Web uses
 * web.ts, where this check is not available (it needs the opa binary).
 */
import * as vscode from 'vscode';
import { checkGroup, Finding, parseOpaVersion, runProcess } from './embedded/check';
import { extractConstraintTemplates } from './embedded/extract';
import { MutationTesting } from './mutation/mutation';

const SECTION = 'regoSyntaxSupport';
const COMMAND = 'regoSyntaxSupport.checkEmbeddedRego';
/** Global state key: the user does not want to hear about a missing opa binary again. */
const MISSING_DISMISSED = 'opaMissingDismissed';

/** A quick test before parsing: only ConstraintTemplates have embedded Rego to check. */
const TEMPLATE = /^kind:\s*["']?ConstraintTemplate["']?\s*$/m;

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('rego-embedded');
  const checker = new EmbeddedRegoChecker(diagnostics, context.globalState);
  context.subscriptions.push(
    diagnostics,
    vscode.workspace.onDidOpenTextDocument((d) => checker.check(d)),
    vscode.workspace.onDidSaveTextDocument((d) => checker.check(d)),
    vscode.workspace.onDidCloseTextDocument((d) => diagnostics.delete(d.uri)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION) || e.affectsConfiguration('opa.dependency_paths.opa')) {
        checker.reset();
        checker.checkOpenDocuments();
      }
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => checker.checkOpenDocuments()),
    vscode.commands.registerCommand(COMMAND, async () => {
      const document = vscode.window.activeTextEditor?.document;
      if (!document) {
        return;
      }
      if (!vscode.workspace.isTrusted) {
        void vscode.window.showInformationMessage(
          'Checking the Rego of Gatekeeper templates runs the opa binary, which is off in Restricted Mode.'
        );
        return;
      }
      const count = await checker.check(document, true);
      if (count === 0) {
        void vscode.window.setStatusBarMessage('Rego in Gatekeeper templates: no errors', 3000);
      }
    })
  );
  checker.checkOpenDocuments();
  new MutationTesting().register(context);
}

export function deactivate(): void {
  // Nothing to release: the subscriptions are disposed by VS Code.
}

class EmbeddedRegoChecker {
  /** Major version of each opa path tried, or null when it could not run. */
  private readonly versions = new Map<string, number | null>();
  /** Documents being checked, to run one check at a time per document. */
  private readonly running = new Map<string, Promise<number>>();
  private warnedMissing = false;

  constructor(
    private readonly diagnostics: vscode.DiagnosticCollection,
    private readonly state: vscode.Memento
  ) {}

  reset(): void {
    this.versions.clear();
    this.warnedMissing = false;
  }

  checkOpenDocuments(): void {
    for (const document of vscode.workspace.textDocuments) {
      void this.check(document);
    }
  }

  /** Checks a document and returns the number of errors. `explicit` is a request from the command. */
  async check(document: vscode.TextDocument, explicit = false): Promise<number> {
    const enabled = vscode.workspace
      .getConfiguration(SECTION)
      .get<boolean>('embeddedRego.check', true);
    if (document.languageId !== 'yaml' || (!enabled && !explicit) || !vscode.workspace.isTrusted) {
      return 0;
    }
    const key = document.uri.toString();
    const previous = this.running.get(key);
    if (previous) {
      await previous; // the next check sees the latest saved text
    }
    const run = this.run(document, explicit);
    this.running.set(key, run);
    try {
      return await run;
    } finally {
      if (this.running.get(key) === run) {
        this.running.delete(key);
      }
    }
  }

  private async run(document: vscode.TextDocument, explicit: boolean): Promise<number> {
    const text = document.getText();
    if (!TEMPLATE.test(text)) {
      this.diagnostics.delete(document.uri);
      return 0;
    }
    const groups = extractConstraintTemplates(text);
    const opa = await this.opa(explicit);
    if (!opa) {
      return 0;
    }
    const findings: Finding[] = [];
    for (const group of groups) {
      try {
        findings.push(...(await checkGroup(group, opa)));
      } catch (err) {
        void vscode.window.showWarningMessage(
          `Rego Syntax Support: opa check failed: ${String(err)}`
        );
        return 0;
      }
    }
    this.diagnostics.set(
      document.uri,
      findings.map((f) => {
        const line = document.lineAt(Math.min(f.line, document.lineCount - 1));
        const start = Math.min(f.column, line.range.end.character);
        const range = new vscode.Range(
          line.lineNumber,
          start,
          line.lineNumber,
          line.range.end.character
        );
        const diagnostic = new vscode.Diagnostic(range, f.message, vscode.DiagnosticSeverity.Error);
        diagnostic.source = 'opa check';
        diagnostic.code = f.code;
        return diagnostic;
      })
    );
    return findings.length;
  }

  /**
   * The opa binary to use: this extension's setting, else the official OPA extension's
   * (opa.dependency_paths.opa), else `opa` on the PATH.
   */
  private async opa(explicit: boolean): Promise<{ path: string; major: number } | undefined> {
    const own = vscode.workspace.getConfiguration(SECTION).get<string>('opa.path', '').trim();
    const official = vscode.workspace
      .getConfiguration('opa')
      .get<string | null>('dependency_paths.opa', null);
    const path = own || official?.trim() || 'opa';
    if (!this.versions.has(path)) {
      const major = await runProcess(path, ['version'], 10000).then(
        (r) => parseOpaVersion(r.stdout) ?? null,
        () => null
      );
      this.versions.set(path, major);
    }
    const major = this.versions.get(path);
    if (major === null || major === undefined) {
      // Say it once per session at most, never again once dismissed, and always for an explicit request.
      if (explicit || (!this.warnedMissing && !this.state.get<boolean>(MISSING_DISMISSED, false))) {
        this.warnedMissing = true;
        const choice = await vscode.window.showInformationMessage(
          `Rego Syntax Support checks the Rego of Gatekeeper templates with opa, but "${path}" could not run. ` +
            'Install OPA (https://www.openpolicyagent.org/docs#install-and-run-opa) or set the path to it.',
          'Open Settings',
          "Don't Show Again"
        );
        if (choice === 'Open Settings') {
          void vscode.commands.executeCommand(
            'workbench.action.openSettings',
            `${SECTION}.opa.path`
          );
        } else if (choice === "Don't Show Again") {
          await this.state.update(MISSING_DISMISSED, true);
        }
      }
      return undefined;
    }
    return { path, major };
  }
}
