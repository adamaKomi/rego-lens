/**
 * Entry point of the unit tests: plain Node.js, no VS Code instance needed.
 *   npm run test:unit
 */
import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

async function main(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 20000 });
  const files = await glob('**/*.test.js', { cwd: __dirname });
  files.sort().forEach((f) => mocha.addFile(path.resolve(__dirname, f)));

  const failures = await new Promise<number>((resolve) => mocha.run(resolve));
  process.exitCode = failures > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
