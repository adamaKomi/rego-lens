# Archive fixtures

Small archives shaped like regodrill's release archives, for the unit tests of `src/tools/archive.ts` and
`src/tools/install.ts`. They were written with Go's `archive/tar`, `compress/gzip` and `archive/zip`, which
goreleaser uses, so they have the same structure: a tar entry per file at the root (`ustar.tar.gz`, and
`pax.tar.gz` with pax extended headers), and zip entries whose sizes are in a data descriptor after the data
(`deflate.zip`), or stored (`store.zip`). Each holds `CHANGELOG.md`, `LICENSE` and a fake binary, `regodrill`
or `regodrill.exe`; `no-binary.tar.gz` has no binary.

The real archives are tested too: `TEST_DOWNLOAD=1 npm run test:unit` downloads the release fixed in
`src/tools/regodrill-release.ts` for the current platform, checks it and runs it.
