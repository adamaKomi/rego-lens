import * as path from 'path';
import { runTests } from '@vscode/test-electron';

/** Downloads VS Code (stable by default, or VSCODE_VERSION) and runs the integration tests in it. */
async function main(): Promise<void> {
  try {
    await runTests({
      version: process.env.VSCODE_VERSION ?? 'stable',
      extensionDevelopmentPath: path.resolve(__dirname, '../../'),
      extensionTestsPath: path.resolve(__dirname, './suite/index'),
      // Other installed extensions must not interfere (e.g. another Rego grammar).
      launchArgs: ['--disable-extensions'],
    });
  } catch (err) {
    console.error('Failed to run integration tests:', err);
    process.exit(1);
  }
}

void main();
