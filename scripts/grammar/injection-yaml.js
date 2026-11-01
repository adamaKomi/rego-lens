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
 * How it fits VS Code's YAML grammar (RedCMD/YAML-Syntax-Highlighter, built into VS Code):
 * that grammar consumes the indentation of every nesting level with `while` rules anchored on \G,
 * so when a line reaches our rules the parent indentation has already been consumed and \G sits
 * on the column of the key. A block scalar's content must be indented more than its key, hence
 * the `while: \G(?=\s+\S|\s*$)` rule: a blank line or a more indented line continues the block,
 * anything else (sibling key, comment at the key's column, less indented line) ends it.
 *
 * Only literal block scalars (`|`, with optional chomping/indentation indicators) are supported:
 * folded scalars (`>`) would join the lines of a policy, and quoted one-line strings cannot hold
 * a meaningful module.
 */

const KEY = String.raw`(?:rego|[A-Za-z0-9_.-]*\.rego)`;
const QUOTED_KEY = String.raw`"${KEY}"|'${KEY}'`;
const BLOCK_HEADER = String.raw`(\|)([1-9][+-]?|[+-][1-9]?)?[ \t]*(#.*)?$`;
const NOT_INSIDE_A_KEY = String.raw`(?<![^\s\-?:])`;

const blockHeaderCaptures = (offset) => ({
  [offset]: { name: 'keyword.control.flow.block-scalar.literal.yaml' },
  [offset + 1]: { name: 'keyword.control.flow.block-scalar.indicator.yaml' },
  [offset + 2]: { name: 'comment.line.number-sign.yaml' },
});

module.exports = {
  scopeName: 'rego-syntax-support.injection.yaml',
  injectionSelector: 'L:source.yaml -string -comment -meta.embedded.block.rego',
  patterns: [{ include: '#rego-key' }, { include: '#libs-key' }],
  repository: {
    'rego-key': {
      begin: String.raw`${NOT_INSIDE_A_KEY}(${KEY}|${QUOTED_KEY})[ \t]*(:)[ \t]+${BLOCK_HEADER}`,
      beginCaptures: {
        1: { name: 'entity.name.tag.yaml' },
        2: { name: 'punctuation.separator.map.value.yaml' },
        ...blockHeaderCaptures(3),
      },
      while: String.raw`\G(?=[ \t]+\S|[ \t]*$)`,
      contentName: 'meta.embedded.block.rego',
      patterns: [{ include: 'source.rego' }],
    },

    'libs-key': {
      begin: String.raw`${NOT_INSIDE_A_KEY}(libs|"libs"|'libs')[ \t]*(:)[ \t]*(#.*)?$`,
      beginCaptures: {
        1: { name: 'entity.name.tag.yaml' },
        2: { name: 'punctuation.separator.map.value.yaml' },
        3: { name: 'comment.line.number-sign.yaml' },
      },
      comment: 'A block sequence may be indented like its key (`libs:` then `- |` on the same column).',
      while: String.raw`\G(?=[ \t]+\S|[ \t]*$|-(?:[ \t]|$))`,
      patterns: [{ include: '#libs-item' }, { include: '#yaml-comment' }],
    },

    'libs-item': {
      begin: String.raw`\G([ \t]*)(-)[ \t]+${BLOCK_HEADER}`,
      beginCaptures: {
        2: { name: 'punctuation.definition.block.sequence.item.yaml' },
        ...blockHeaderCaptures(3),
      },
      while: String.raw`\G(?=\1[ \t]+\S|[ \t]*$)`,
      contentName: 'meta.embedded.block.rego',
      patterns: [{ include: 'source.rego' }],
    },

    'yaml-comment': {
      match: String.raw`(?:^|(?<=\s))(#).*$`,
      name: 'comment.line.number-sign.yaml',
      captures: { 1: { name: 'punctuation.definition.comment.yaml' } },
    },
  },
};
