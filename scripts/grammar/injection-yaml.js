'use strict';

/**
 * Highlights Rego embedded in YAML literal block scalars (`key: |`).
 *
 * Covered keys:
 *   - `rego`            OPA Gatekeeper / Azure Policy / GKE Policy Controller ConstraintTemplate
 *                       (spec.targets[].rego)
 *   - `libs`            the same ConstraintTemplate's spec.targets[].libs list of `- |` items
 *   - `<anything>.rego` e.g. ConfigMap data keys used by kube-mgmt or opa-envoy (`policy.rego: |`)
 *   Keys may be plain, "double-quoted" or 'single-quoted'.
 *
 * Only literal block scalars (`|`, with optional chomping/indentation indicators) are supported:
 * folded scalars (`>`) would join the lines of a policy, and quoted one-line strings cannot hold
 * a meaningful module. A block scalar's content must be indented more than its key: a blank line
 * or a more indented line continues the block; anything else (sibling key, comment at the key's
 * column, less indented line) ends it.
 *
 * VS Code has shipped two YAML grammars, so the injection comes in two parts:
 *
 * 1. This grammar (`L:` priority) matches the key itself. It is the one used with the current YAML
 *    grammar (RedCMD/YAML-Syntax-Highlighter, VS Code >= 1.92), which consumes the indentation of
 *    every nesting level with `while` rules anchored on \G: when a line reaches our rules, \G sits
 *    on the column of the key, hence `while: (?:\G|^)(?=[ \t]+\S|[ \t]*$)`. `^` covers keys at
 *    column 0 with the older grammar, where nothing consumes indentation.
 *
 * 2. injection-yaml-line-start.js (no priority prefix) captures the indentation from column 0.
 *    It is the one used with the older YAML grammar (textmate/yaml.tmbundle, VS Code 1.85 to 1.91)
 *    for indented keys. Without `L:`, the host grammar wins ties at column 0, which keeps the
 *    content of other block scalars (`description: |`) out of it.
 */

const { KEY, QUOTED_KEY, LIBS_KEY, BLOCK_HEADER, SELECTOR, blockHeaderCaptures, libsRepository } = require('./injection-yaml-common');

/** The key must start a mapping entry: preceded by the start of the line, a blank, `- `, `? ` or `: `. */
const KEY_START = String.raw`(?<![^\s\-?:])`;

module.exports = {
  scopeName: 'rego-syntax-support.injection.yaml',
  injectionSelector: `L:${SELECTOR}`,
  patterns: [{ include: '#rego-key' }, { include: '#libs-key' }],
  repository: {
    'rego-key': {
      begin: String.raw`${KEY_START}(${KEY}|${QUOTED_KEY})[ \t]*(:)[ \t]+${BLOCK_HEADER}`,
      beginCaptures: {
        1: { name: 'entity.name.tag.yaml' },
        2: { name: 'punctuation.separator.map.value.yaml' },
        ...blockHeaderCaptures(3),
      },
      while: String.raw`(?:\G|^)(?=[ \t]+\S|[ \t]*$)`,
      contentName: 'meta.embedded.block.rego',
      patterns: [{ include: 'source.rego' }],
    },

    'libs-key': {
      comment: 'A block sequence may be indented like its key (`libs:` then `- |` on the same column).',
      begin: String.raw`${KEY_START}(${LIBS_KEY})[ \t]*(:)[ \t]*(#.*)?$`,
      beginCaptures: {
        1: { name: 'entity.name.tag.yaml' },
        2: { name: 'punctuation.separator.map.value.yaml' },
        3: { name: 'comment.line.number-sign.yaml' },
      },
      while: String.raw`(?:\G|^)(?=[ \t]+\S|[ \t]*$|-(?:[ \t]|$))`,
      patterns: [{ include: '#libs-item' }, { include: '#yaml-comment' }],
    },

    ...libsRepository,
  },
};
