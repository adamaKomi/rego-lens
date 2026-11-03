import * as assert from 'assert';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { extractFromTarGz, extractFromZip } from '../../tools/archive';
import {
  assetFor,
  assetUrl,
  autoUpdateEnabled,
  binaryName,
  fetchBuffer,
  formatSize,
  installedPath,
  installedVersions,
  installRegodrill,
  RegodrillRelease,
  removeOtherVersions,
  sha256,
} from '../../tools/install';
import { REGODRILL_RELEASE } from '../../tools/regodrill-release';

const ROOT = path.resolve(__dirname, '..', '..', '..');
// Archives written with Go's archive/tar, compress/gzip and archive/zip, like goreleaser's (test/tools/README.md).
const ARCHIVES = path.join(ROOT, 'test', 'tools');
const BINARY = 'regodrill test binary\n' + '0123456789abcdef'.repeat(64);

function archive(name: string): Buffer {
  return fs.readFileSync(path.join(ARCHIVES, name));
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rego-syntax-support-test-'));
}

suite('regodrill archives', () => {
  test('the binary is extracted from tar.gz archives, ustar and pax', () => {
    for (const name of ['ustar.tar.gz', 'pax.tar.gz']) {
      assert.strictEqual(extractFromTarGz(archive(name), 'regodrill').toString(), BINARY, name);
    }
  });

  test('the binary is extracted from zip archives, deflated (sizes in a data descriptor) and stored', () => {
    for (const name of ['deflate.zip', 'store.zip']) {
      assert.strictEqual(extractFromZip(archive(name), 'regodrill.exe').toString(), BINARY, name);
    }
  });

  test('other files of the archive are found by name too, and a missing file is an error', () => {
    assert.strictEqual(
      extractFromTarGz(archive('ustar.tar.gz'), 'LICENSE').toString(),
      'Apache License 2.0\n'
    );
    assert.throws(() => extractFromTarGz(archive('no-binary.tar.gz'), 'regodrill'), /not found/);
    assert.throws(() => extractFromZip(archive('deflate.zip'), 'regodrill'), /not found/);
    assert.throws(
      () => extractFromZip(Buffer.from('not a zip at all, but long enough'), 'x'),
      /not a zip/
    );
  });
});

suite('regodrill installation', () => {
  const release = (digest: string): RegodrillRelease => ({
    version: '9.9.9',
    assets: {
      'linux-x64': { file: 'regodrill_9.9.9_linux_amd64.tar.gz', sha256: digest, size: 239 },
      'win32-x64': { file: 'regodrill_9.9.9_windows_amd64.zip', sha256: digest, size: 510 },
    },
  });

  test('an archive with the expected SHA-256 is installed under its version', async () => {
    const dir = tempDir();
    const data = archive('ustar.tar.gz');
    const urls: string[] = [];
    const installed = await installRegodrill(dir, release(sha256(data)), {
      platform: 'linux',
      arch: 'x64',
      fetch: (url) => {
        urls.push(url);
        return Promise.resolve(data);
      },
    });
    assert.deepStrictEqual(urls, [
      'https://github.com/adamaKomi/regodrill/releases/download/v9.9.9/regodrill_9.9.9_linux_amd64.tar.gz',
    ]);
    assert.strictEqual(installed, path.join(dir, '9.9.9', 'regodrill'));
    assert.strictEqual(fs.readFileSync(installed, 'utf8'), BINARY);
    if (process.platform !== 'win32') {
      assert.strictEqual(fs.statSync(installed).mode & 0o111, 0o111, 'executable');
    }
    assert.deepStrictEqual(await installedVersions(dir, 'linux'), ['9.9.9']);
  });

  test('the Windows archive gives regodrill.exe', async () => {
    const dir = tempDir();
    const data = archive('deflate.zip');
    const installed = await installRegodrill(dir, release(sha256(data)), {
      platform: 'win32',
      arch: 'x64',
      fetch: () => Promise.resolve(data),
    });
    assert.strictEqual(installed, path.join(dir, '9.9.9', 'regodrill.exe'));
    assert.strictEqual(fs.readFileSync(installed, 'utf8'), BINARY);
  });

  test('an archive with another SHA-256 is refused, and nothing is installed', async () => {
    const dir = tempDir();
    await assert.rejects(
      installRegodrill(dir, release('0'.repeat(64)), {
        platform: 'linux',
        arch: 'x64',
        fetch: () => Promise.resolve(archive('ustar.tar.gz')),
      }),
      /does not match the expected 0{64}; nothing was installed/
    );
    assert.deepStrictEqual(fs.readdirSync(dir), []);
  });

  test('a platform without a build is refused before any download', async () => {
    let fetched = false;
    await assert.rejects(
      installRegodrill(tempDir(), release('0'.repeat(64)), {
        platform: 'freebsd',
        arch: 'x64',
        fetch: () => {
          fetched = true;
          return Promise.resolve(Buffer.alloc(0));
        },
      }),
      /no build for freebsd-x64/
    );
    assert.strictEqual(fetched, false);
  });

  test('older versions are removed, the kept one stays', async () => {
    const dir = tempDir();
    for (const version of ['0.2.0', '0.3.0']) {
      fs.mkdirSync(path.join(dir, version));
      fs.writeFileSync(installedPath(dir, version, 'linux'), 'x');
    }
    fs.mkdirSync(path.join(dir, 'not-a-version'));
    assert.deepStrictEqual(await installedVersions(dir, 'linux'), ['0.2.0', '0.3.0']);
    await removeOtherVersions(dir, '0.3.0');
    assert.deepStrictEqual(fs.readdirSync(dir), ['0.3.0']);
    assert.deepStrictEqual(await installedVersions(path.join(dir, 'missing'), 'linux'), []);
  });

  test('downloads go over HTTPS only', async () => {
    await assert.rejects(
      fetchBuffer('http://example.com/regodrill'),
      /refusing to download over http:/
    );
  });

  test('extensions.autoUpdate: values of current VS Code and of VS Code 1.85', () => {
    const cases: Array<[unknown, boolean]> = [
      [undefined, true],
      ['on', true],
      ['off', false],
      [true, true],
      [false, false],
      ['onlyEnabledExtensions', true],
      ['onlySelectedExtensions', false],
    ];
    for (const [value, expected] of cases) {
      assert.strictEqual(autoUpdateEnabled(value), expected, String(value));
    }
  });

  test('names, URLs and sizes', () => {
    assert.strictEqual(binaryName('win32'), 'regodrill.exe');
    assert.strictEqual(binaryName('darwin'), 'regodrill');
    assert.strictEqual(formatSize(7499634), '7.5 MB');
    const r = release('a'.repeat(64));
    assert.strictEqual(assetFor(r, 'linux', 'arm64'), undefined);
    assert.strictEqual(
      assetUrl(r, r.assets['win32-x64']),
      'https://github.com/adamaKomi/regodrill/releases/download/v9.9.9/regodrill_9.9.9_windows_amd64.zip'
    );
  });
});

suite('The regodrill release fixed in the extension', () => {
  test('has an archive with a SHA-256 for each platform that regodrill builds', () => {
    const { version, assets } = REGODRILL_RELEASE;
    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.deepStrictEqual(Object.keys(assets).sort(), [
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
      'win32-arm64',
      'win32-x64',
    ]);
    for (const [platform, asset] of Object.entries(assets)) {
      assert.match(asset.sha256, /^[0-9a-f]{64}$/, platform);
      assert.ok(asset.file.startsWith(`regodrill_${version}_`), asset.file);
      assert.ok(asset.file.endsWith(platform.startsWith('win32') ? '.zip' : '.tar.gz'), asset.file);
      assert.ok(
        asset.size > 1_000_000 && asset.size < 64 * 1024 * 1024,
        `${platform}: ${asset.size}`
      );
    }
  });

  // Downloads the real archive for this platform from GitHub, checks it and runs the binary. Network: runs
  // only with TEST_DOWNLOAD=1 (set in CI).
  test('downloads, checks and runs on this platform', async function () {
    if (process.env.TEST_DOWNLOAD !== '1') {
      this.skip();
    }
    this.timeout(180000);
    const installed = await installRegodrill(tempDir(), REGODRILL_RELEASE);
    const output = await new Promise<string>((resolve, reject) =>
      execFile(installed, ['version'], (err, stdout) =>
        err ? reject(new Error(err.message, { cause: err })) : resolve(stdout)
      )
    );
    assert.match(
      output,
      new RegExp(`^regodrill ${REGODRILL_RELEASE.version.replace(/\./g, '\\.')} `)
    );
  });
});
