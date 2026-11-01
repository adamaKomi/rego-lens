'use strict';

/**
 * Second part of the YAML injection, for the YAML grammar shipped with VS Code 1.85 to 1.91
 * (textmate/yaml.tmbundle), which does not consume indentation. See injection-yaml.js.
 *
 * No `L:` prefix on purpose: on a tie at column 0 the host grammar wins, so the content of another
 * block scalar (`description: |` followed by `  rego: |`) stays a YAML string.
 * With the current YAML grammar these rules never match: indentation is consumed before our rules
 * are tried, so `^` cannot match.
 */

const { KEY, QUOTED_KEY, LIBS_KEY, BLOCK_HEADER, SELECTOR, blockHeaderCaptures, libsRepository } = require('./injection-yaml-common');

module.exports = {
  scopeName: 'rego-syntax-support.injection.yaml.line-start',
  injectionSelector: SELECTOR,
  patterns: [{ include: '#rego-key' }, { include: '#libs-key' }],
  repository: {
    'rego-key': {
      begin: String.raw`^([ \t]*)(?:(-)[ \t]+)?(${KEY}|${QUOTED_KEY})[ \t]*(:)[ \t]+${BLOCK_HEADER}`,
      beginCaptures: {
        2: { name: 'punctuation.definition.block.sequence.item.yaml' },
        3: { name: 'entity.name.tag.yaml' },
        4: { name: 'punctuation.separator.map.value.yaml' },
        ...blockHeaderCaptures(5),
      },
      while: String.raw`^(?=\1[ \t]+\S|[ \t]*$)`,
      contentName: 'meta.embedded.block.rego',
      patterns: [{ include: 'source.rego' }],
    },

    'libs-key': {
      begin: String.raw`^([ \t]*)(?:(-)[ \t]+)?(${LIBS_KEY})[ \t]*(:)[ \t]*(#.*)?$`,
      beginCaptures: {
        2: { name: 'punctuation.definition.block.sequence.item.yaml' },
        3: { name: 'entity.name.tag.yaml' },
        4: { name: 'punctuation.separator.map.value.yaml' },
        5: { name: 'comment.line.number-sign.yaml' },
      },
      while: String.raw`^(?=\1[ \t]+\S|[ \t]*$|\1-(?:[ \t]|$))`,
      patterns: [{ include: '#libs-item' }, { include: '#yaml-comment' }],
    },

    ...libsRepository,
  },
};
