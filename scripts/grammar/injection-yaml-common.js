'use strict';

/**
 * Pieces shared by the two YAML injections (see injection-yaml.js for the full explanation).
 */

/** `rego` (Gatekeeper) or any key ending in `.rego` (ConfigMap data keys). */
const KEY = String.raw`(?:rego|[A-Za-z0-9_.-]*\.rego)`;
const QUOTED_KEY = String.raw`"${KEY}"|'${KEY}'`;
const LIBS_KEY = String.raw`libs|"libs"|'libs'`;

/** `|`, optional indentation/chomping indicators in either order, optional trailing comment. */
const BLOCK_HEADER = String.raw`(\|)([1-9][+-]?|[+-][1-9]?)?[ \t]*(#.*)?$`;

/** The selector shared by both injections: never inside strings, comments or our own content. */
const SELECTOR = 'source.yaml -string -comment -meta.embedded.block.rego';

function blockHeaderCaptures(offset) {
  return {
    [offset]: { name: 'keyword.control.flow.block-scalar.literal.yaml' },
    [offset + 1]: { name: 'keyword.control.flow.block-scalar.indicator.yaml' },
    [offset + 2]: { name: 'comment.line.number-sign.yaml' },
  };
}

/** Repository entries used inside a `libs:` block by both injections. */
const libsRepository = {
  'libs-item': {
    comment: 'A `- |` item. \\G is where the enclosing `libs` rule stopped, so \\1 is relative to it.',
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
};

module.exports = { KEY, QUOTED_KEY, LIBS_KEY, BLOCK_HEADER, SELECTOR, blockHeaderCaptures, libsRepository };
