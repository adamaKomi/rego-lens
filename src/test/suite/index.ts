import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

/** Entry point loaded by VS Code (--extensionTestsPath): runs the integration tests of this folder only. */
export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 30000 });
  const files = await glob('*.test.js', { cwd: __dirname });
  files.sort().forEach((f) => mocha.addFile(path.resolve(__dirname, f)));

  const failures = await new Promise<number>((resolve) => mocha.run(resolve));
  if (failures > 0) {
    throw new Error(`${failures} integration test(s) failed.`);
  }
}
