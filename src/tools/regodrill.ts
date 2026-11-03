/**
 * Finds the regodrill binary, or downloads it once the user agrees (docs/mutation-testing-spec.md §11).
 *
 * Order: the `regoSyntaxSupport.regodrill.path` setting, `regodrill` on the PATH, then the copy downloaded
 * into the extension's global storage. Nothing is downloaded without a click from the user, and nothing at all
 * in Restricted Mode. A downloaded copy follows the extension: when an update of the extension fixes a newer
 * regodrill version, the copy is updated in the background if VS Code updates extensions automatically, and
 * after a question otherwise.
 */
import * as vscode from 'vscode';
import { runProcess } from '../embedded/check';
import {
  assetFor,
  autoUpdateEnabled,
  formatSize,
  installedPath,
  installedVersions,
  installRegodrill,
  RegodrillRelease,
  RELEASES_URL,
  removeOtherVersions,
} from './install';
import { REGODRILL_RELEASE } from './regodrill-release';

const SECTION = 'regoSyntaxSupport.regodrill';

export interface Tool {
  path: string;
  source: 'setting' | 'path' | 'download';
}

export class Regodrill {
  /** Whether `regodrill` on the PATH runs, once known. */
  private onPath: boolean | undefined;
  /** Whether a binary has the `check` command (regodrill 0.3.0 or later), by path. */
  private readonly checkSupport = new Map<string, boolean>();
  private installing: Promise<string | undefined> | undefined;

  constructor(
    private readonly storageDir: string,
    readonly release: RegodrillRelease = REGODRILL_RELEASE
  ) {}

  /** Forgets what was found, after a settings change. */
  reset(): void {
    this.onPath = undefined;
    this.checkSupport.clear();
  }

  /** The size of the download for this platform, for messages ("7.5 MB"). */
  downloadSize(): string {
    const asset = assetFor(this.release);
    return asset ? formatSize(asset.size) : '';
  }

  /** The binary to run, without downloading anything. */
  async find(): Promise<Tool | undefined> {
    const setting = vscode.workspace.getConfiguration(SECTION).get<string>('path', '').trim();
    if (setting) {
      return { path: setting, source: 'setting' };
    }
    if (this.onPath === undefined) {
      this.onPath = await runProcess('regodrill', ['version'], 10000).then(
        (r) => r.code === 0,
        () => false
      );
    }
    if (this.onPath) {
      return { path: 'regodrill', source: 'path' };
    }
    return this.downloaded();
  }

  /** The copy downloaded by the extension, if this version is installed. */
  async downloaded(): Promise<Tool | undefined> {
    const versions = await installedVersions(this.storageDir);
    return versions.includes(this.release.version)
      ? { path: installedPath(this.storageDir, this.release.version), source: 'download' }
      : undefined;
  }

  /**
   * find(), else download regodrill. `consented` is true when the user chose an action that says it
   * downloads regodrill; otherwise the user is asked first. `feature` names what needs it, for the question.
   */
  async ensure(feature: string, consented: boolean): Promise<Tool | undefined> {
    const found = await this.find();
    if (found || !vscode.workspace.isTrusted) {
      return found;
    }
    return this.offerDownload(feature, consented);
  }

  /**
   * The downloaded copy, downloading it if needed, after the user agreed: for features that need a newer
   * regodrill than the one on the PATH (`check`).
   */
  async ensureDownloaded(feature: string): Promise<Tool | undefined> {
    const found = await this.downloaded();
    if (found || !vscode.workspace.isTrusted) {
      return found;
    }
    return this.offerDownload(feature, true);
  }

  private async offerDownload(feature: string, consented: boolean): Promise<Tool | undefined> {
    if (!assetFor(this.release)) {
      const choice = await vscode.window.showInformationMessage(
        `${feature} needs regodrill, which has no build for ${process.platform}-${process.arch}. ` +
          'Build it from source and set its path in the settings.',
        'Open Releases'
      );
      if (choice === 'Open Releases') {
        void vscode.env.openExternal(vscode.Uri.parse(RELEASES_URL));
      }
      return undefined;
    }
    if (!consented) {
      const choice = await vscode.window.showInformationMessage(
        `${feature} needs regodrill. Download regodrill ${this.release.version} ` +
          `(${this.downloadSize()}) from GitHub? Its SHA-256 is checked before it is used.`,
        'Download',
        'Use Another Binary'
      );
      if (choice === 'Use Another Binary') {
        void vscode.commands.executeCommand('workbench.action.openSettings', `${SECTION}.path`);
        return undefined;
      }
      if (choice !== 'Download') {
        return undefined;
      }
    }
    const path = await this.download(false);
    return path ? { path, source: 'download' } : undefined;
  }

  /** Whether a binary has `regodrill check` (0.3.0 or later); older ones answer "unknown command". */
  async supportsCheck(tool: Tool): Promise<boolean> {
    let known = this.checkSupport.get(tool.path);
    if (known === undefined) {
      known = await runProcess(tool.path, ['check'], 10000).then(
        (r) => /specify at least one file/.test(r.stderr),
        () => false
      );
      this.checkSupport.set(tool.path, known);
    }
    return known;
  }

  /**
   * At activation: a copy downloaded by an earlier version of the extension is updated to this version's
   * regodrill, in the background when VS Code updates extensions automatically, after a question otherwise.
   * Users who never downloaded regodrill are left alone.
   */
  async updateDownloaded(): Promise<void> {
    if (!vscode.workspace.isTrusted || !assetFor(this.release)) {
      return;
    }
    const versions = await installedVersions(this.storageDir);
    if (versions.length === 0 || versions.includes(this.release.version)) {
      return;
    }
    if (autoUpdateEnabled(vscode.workspace.getConfiguration('extensions').get('autoUpdate'))) {
      await this.download(true);
      return;
    }
    const choice = await vscode.window.showInformationMessage(
      `Rego Syntax Support comes with regodrill ${this.release.version}; the downloaded copy is ` +
        `${versions[versions.length - 1]}. Download the new version (${this.downloadSize()})?`,
      'Update'
    );
    if (choice === 'Update') {
      await this.download(false);
    }
  }

  /** Downloads and installs this release, once at a time. `quiet` shows progress in the status bar only. */
  private download(quiet: boolean): Promise<string | undefined> {
    this.installing ??= Promise.resolve(
      vscode.window.withProgress(
        {
          location: quiet ? vscode.ProgressLocation.Window : vscode.ProgressLocation.Notification,
          title: `Downloading regodrill ${this.release.version}`,
        },
        async () => {
          const path = await installRegodrill(this.storageDir, this.release);
          await removeOtherVersions(this.storageDir, this.release.version);
          this.checkSupport.delete(path);
          return path;
        }
      )
    )
      .then(
        (path) => path,
        async (err: Error) => {
          const choice = await vscode.window.showErrorMessage(
            `Could not download regodrill: ${err.message}`,
            'Open Releases'
          );
          if (choice === 'Open Releases') {
            void vscode.env.openExternal(vscode.Uri.parse(RELEASES_URL));
          }
          return undefined;
        }
      )
      .finally(() => {
        this.installing = undefined;
      });
    return this.installing;
  }
}
