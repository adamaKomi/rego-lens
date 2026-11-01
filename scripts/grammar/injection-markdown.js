'use strict';

/**
 * Highlights ```rego fenced code blocks in Markdown.
 *
 * The begin/end/while expressions mirror the fenced code blocks of VS Code's built-in
 * Markdown grammar (extensions/markdown-basics/syntaxes/markdown.tmLanguage.json,
 * e.g. `fenced_code_block_css`) so behaviour is identical to the languages VS Code
 * supports out of the box (``` or ~~~ fences, indentation, info-string attributes,
 * lists and block quotes).
 */
module.exports = {
  scopeName: 'rego-syntax-support.injection.markdown',
  injectionSelector: 'L:text.html.markdown -markup.fenced_code.block.markdown -markup.raw -comment',
  patterns: [{ include: '#rego-code-block' }],
  repository: {
    'rego-code-block': {
      name: 'markup.fenced_code.block.markdown',
      begin: String.raw`(^|\G)(\s*)(\`{3,}|~{3,})\s*(?i:(rego)((\s+|:|,|\{|\?)[^\`]*)?$)`,
      beginCaptures: {
        3: { name: 'punctuation.definition.markdown' },
        4: { name: 'fenced_code.block.language.markdown' },
        5: { name: 'fenced_code.block.language.attributes.markdown' },
      },
      end: String.raw`(^|\G)(\2|\s{0,3})(\3)\s*$`,
      endCaptures: {
        3: { name: 'punctuation.definition.markdown' },
      },
      patterns: [
        {
          begin: String.raw`(^|\G)(\s*)(.*)`,
          while: String.raw`(^|\G)(?!\s*([\`~]{3,})\s*$)`,
          contentName: 'meta.embedded.block.rego',
          patterns: [{ include: 'source.rego' }],
        },
      ],
    },
  },
};
