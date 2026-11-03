/**
 * Desktop entry point: checks the Rego embedded in OPA Gatekeeper ConstraintTemplates with `opa check`, or
 * `regodrill check` when there is no opa, and shows its errors on the YAML lines; registers mutation testing.
 * The grammars and snippets need no code; VS Code for the Web uses web.ts, where these features are not
 * available (they run binaries).
 */
import * as path from 'path';
import * as vscode from 'vscode';
import { checkGroup, Finding, parseOpaVersion, runProcess } from './embedded/check';
import { extractConstraintTemplates } from './embedded/extract';
import { MutationTesting } from './mutation/mutation';
import { Regodrill } from './tools/regodrill';

const SECTION = 'regoSyntaxSupport';
const COMMAND = 'regoSyntaxSupport.checkEmbeddedRego';
/** Global state key: the user does not want to hear about a missing opa or regodrill binary again. */
const MISSING_DISMISSED = 'opaMissingDismissed';

/** The program that checks the Rego: opa, or regodrill, whose `check` has the same flags and output. */
interface Checker {
  path: string;
  /** Major version of OPA, for versionFlags: regodrill check takes the flags of OPA 1.x. */
  major: number;
  name: 'opa check' | 'regodrill check';
}

/** A quick test before parsing: only ConstraintTemplates have embedded Rego to check. */
const TEMPLATE = /^kind:\s*["']?ConstraintTemplate["']?\s*$/m;

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('rego-embedded');
  const regodrill = new Regodrill(path.join(context.globalStorageUri.fsPath, 'regodrill'));
  const checker = new EmbeddedRegoChecker(diagnostics, context.globalState, regodrill);
  context.subscriptions.push(
    diagnostics,
    vscode.workspace.onDidOpenTextDocument((d) => checker.check(d)),
    vscode.workspace.onDidSaveTextDocument((d) => checker.check(d)),
    vscode.workspace.onDidCloseTextDocument((d) => diagnostics.delete(d.uri)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SECTION) || e.affectsConfiguration('opa.dependency_paths.opa')) {
        regodrill.reset();
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
          'Checking the Rego of Gatekeeper templates runs opa or regodrill, which is off in Restricted Mode.'
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
  new MutationTesting(regodrill).register(context);
  void regodrill.updateDownloaded();
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
    private readonly state: vscode.Memento,
    private readonly regodrill: Regodrill
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
    const checker = await this.checker(explicit);
    if (!checker) {
      return 0;
    }
    const findings: Finding[] = [];
    for (const group of groups) {
      try {
        findings.push(...(await checkGroup(group, checker)));
      } catch (err) {
        void vscode.window.showWarningMessage(
          `Rego Syntax Support: ${checker.name} failed: ${String(err)}`
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
        diagnostic.source = checker.name;
        diagnostic.code = f.code;
        return diagnostic;
      })
    );
    return findings.length;
  }

  /**
   * The program that checks the Rego. opa first: this extension's setting, else the official OPA extension's
   * (opa.dependency_paths.opa), else `opa` on the PATH. Then regodrill 0.3.0 or later (setting, PATH, or the
   * downloaded copy), unless this extension's opa setting names a binary: that one is what the user wants.
   * With neither, the user is told once per session, and can download regodrill.
   */
  private async checker(explicit: boolean): Promise<Checker | undefined> {
    const own = vscode.workspace.getConfiguration(SECTION).get<string>('opa.path', '').trim();
    const official = vscode.workspace
      .getConfiguration('opa')
      .get<string | null>('dependency_paths.opa', null);
    const opa = own || official?.trim() || 'opa';
    if (!this.versions.has(opa)) {
      const major = await runProcess(opa, ['version'], 10000).then(
        (r) => parseOpaVersion(r.stdout) ?? null,
        () => null
      );
      this.versions.set(opa, major);
    }
    const major = this.versions.get(opa);
    if (major !== null && major !== undefined) {
      return { path: opa, major, name: 'opa check' };
    }
    if (!own) {
      for (const tool of [await this.regodrill.find(), await this.regodrill.downloaded()]) {
        if (tool && (await this.regodrill.supportsCheck(tool))) {
          return { path: tool.path, major: 1, name: 'regodrill check' };
        }
      }
    }
    // Say it once per session at most, never again once dismissed, and always for an explicit request.
    if (!explicit && (this.warnedMissing || this.state.get<boolean>(MISSING_DISMISSED, false))) {
      return undefined;
    }
    this.warnedMissing = true;
    if (own) {
      const choice = await vscode.window.showInformationMessage(
        `Rego Syntax Support checks the Rego of Gatekeeper templates with opa, but "${own}" could not run. ` +
          'Fix the path to opa, or clear it to use regodrill.',
        'Open Settings'
      );
      if (choice === 'Open Settings') {
        void vscode.commands.executeCommand('workbench.action.openSettings', `${SECTION}.opa.path`);
      }
      return undefined;
    }
    const choice = await vscode.window.showInformationMessage(
      'Rego Syntax Support checks the Rego of Gatekeeper templates with regodrill or opa, and found ' +
        `neither. Download regodrill ${this.regodrill.release.version} (${this.regodrill.downloadSize()}) ` +
        'from GitHub? Its SHA-256 is checked before it is used.',
      'Download',
      'Open Settings',
      "Don't Show Again"
    );
    if (choice === 'Download') {
      const tool = await this.regodrill.ensureDownloaded('Checking Gatekeeper templates');
      if (tool && (await this.regodrill.supportsCheck(tool))) {
        return { path: tool.path, major: 1, name: 'regodrill check' };
      }
    } else if (choice === 'Open Settings') {
      void vscode.commands.executeCommand('workbench.action.openSettings', `${SECTION}.opa.path`);
    } else if (choice === "Don't Show Again") {
      await this.state.update(MISSING_DISMISSED, true);
    }
    return undefined;
  }
}
