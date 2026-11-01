#!/usr/bin/env node
/**
 * Regenerates scripts/grammar/opa-builtins.json from the official OPA sources.
 *
 * Source of truth:
 *   - capabilities/<version>.json   -> which built-ins exist in that OPA release
 *   - builtin_metadata.json         -> official categories of each built-in
 *
 * Usage:
 *   node scripts/update-builtins.js [opa-version]      (default: version in the existing data file)
 *   node scripts/update-builtins.js v1.22.0
 *
 * After running it, rebuild the grammars with `npm run build:grammars`.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, 'grammar', 'opa-builtins.json');
const RAW = 'https://raw.githubusercontent.com/open-policy-agent/opa';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} -> HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Pure transformation, exported for unit tests.
 * - drops operators (built-ins declared with an `infix` form, e.g. `plus` for `+`)
 * - drops `internal.*` built-ins (not callable from policies)
 * - keeps deprecated built-ins, flagged, so the grammar can mark them
 */
function transform(capabilities, metadata) {
  const categoryOf = new Map();
  for (const [category, names] of Object.entries(metadata._categories || {})) {
    for (const name of names) {
      if (!categoryOf.has(name)) {
        categoryOf.set(name, category);
      }
    }
  }

  return capabilities.builtins
    .filter((b) => !b.infix && !b.name.startsWith('internal.'))
    .map((b) => ({
      name: b.name,
      category: categoryOf.get(b.name) || 'builtin',
      deprecated: Boolean(b.deprecated),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function main() {
  const existing = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8')) : {};
  const version = process.argv[2] || existing.opaVersion;
  if (!version || !/^v\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('Pass an OPA release tag, e.g. `node scripts/update-builtins.js v1.22.0`');
  }

  const capabilitiesUrl = `${RAW}/${version}/capabilities/${version}.json`;
  const metadataUrl = `${RAW}/${version}/builtin_metadata.json`;
  const [capabilities, metadata] = await Promise.all([fetchJson(capabilitiesUrl), fetchJson(metadataUrl)]);

  const data = {
    opaVersion: version,
    sources: [capabilitiesUrl, metadataUrl],
    builtins: transform(capabilities, metadata),
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(data, null, 2) + '\n');
  console.log(`Wrote ${data.builtins.length} built-ins for OPA ${version} to ${path.relative(process.cwd(), OUTPUT)}`);
}

module.exports = { transform };

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
