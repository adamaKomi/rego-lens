import * as path from 'path';
import { glob } from 'glob';

/** Entry point loaded by VS Code (--extensionTestsPath): runs the integration tests of this folder only. */
export async function run(): Promise<void> {
  // Mocha 12 is ESM-only: VS Code 1.85 (Node 18) cannot require() it, but can import() it.
  const { default: Mocha } = await import('mocha');
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 30000 });
  const files = await glob('*.test.js', { cwd: __dirname });
  files.sort().forEach((f) => mocha.addFile(path.resolve(__dirname, f)));

  const failures = await new Promise<number>((resolve) => mocha.run(resolve));
  if (failures > 0) {
    throw new Error(`${failures} integration test(s) failed.`);
  }
}
