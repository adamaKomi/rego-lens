'use strict';

/**
 * Source of syntaxes/rego.tmLanguage.json.
 *
 * Do not edit the generated JSON by hand: edit this file and run
 * `npm run build:grammars`. CI fails if the two are out of sync.
 *
 * References (checked against OPA v1.22.0):
 *   - Grammar (EBNF):  https://www.openpolicyagent.org/docs/policy-reference#grammar
 *   - Scanner:         v1/ast/internal/scanner/scanner.go (strings, numbers, identifiers)
 *   - Keywords:        v1/ast/internal/tokens/tokens.go and the future keywords in v1/ast/parser.go
 *   - Template strings https://www.openpolicyagent.org/docs/policy-language#string-interpolation
 *   - Metadata blocks  https://www.openpolicyagent.org/docs/policy-language#metadata
 */

const builtinsData = require('./opa-builtins.json');

/** Rego identifier: ASCII letter or `_`, then letters, digits or `_` (scanner.go isLetter/isDigit). */
const IDENT = String.raw`[a-zA-Z_][a-zA-Z0-9_]*`;

/** A string literal usable inside a ref bracket, e.g. data["my-key"]. */
const REF_STRING = String.raw`"(?:[^"\\]|\\.)*"`;

/** A static ref as used by `package` and `import`: a.b["c-d"].e */
const STATIC_REF = String.raw`${IDENT}(?:\.${IDENT}|\[\s*${REF_STRING}\s*\])*`;

/**
 * Words that can never start a rule head. `and` / `or` are future keywords
 * (future.keywords.and/or, rego.v2) that may start a continuation line.
 */
const NON_RULE_HEAD_WORDS = [
  'package',
  'import',
  'default',
  'else',
  'some',
  'every',
  'not',
  'with',
  'as',
  'in',
  'if',
  'contains',
  'true',
  'false',
  'null',
  'and',
  'or',
];

/** Keywords must not be highlighted when used as a ref segment (capability `keywords_in_refs`), e.g. input.in */
const NOT_AFTER_DOT = String.raw`(?<![\w.$])`;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Longest names first so that alternation never stops on a shorter prefix. */
function alternation(names) {
  return [...names]
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .map(escapeRegex)
    .join('|');
}

function builtinPatterns() {
  const byCategory = new Map();
  const deprecated = [];
  for (const b of builtinsData.builtins) {
    if (b.deprecated) {
      deprecated.push(b.name);
      continue;
    }
    if (!byCategory.has(b.category)) {
      byCategory.set(b.category, []);
    }
    byCategory.get(b.category).push(b.name);
  }

  const patterns = [...byCategory.keys()].sort().map((category) => ({
    name: `support.function.${category}.rego`,
    match: String.raw`${NOT_AFTER_DOT}(?:${alternation(byCategory.get(category))})(?=\s*\()`,
  }));

  // Deprecated built-ins were removed from Rego v1 (OPA 1.0):
  // https://www.openpolicyagent.org/docs/v0-upgrade#prohibit-use-of-deprecated-builtins
  patterns.push({
    name: 'invalid.deprecated.builtin.rego',
    match: String.raw`${NOT_AFTER_DOT}(?:${alternation(deprecated)})(?=\s*\()`,
  });

  return patterns;
}

const grammar = {
  $schema: 'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
  name: 'Rego',
  scopeName: 'source.rego',
  fileTypes: ['rego'],
  patterns: [
    { include: '#metadata-block' },
    { include: '#comment' },
    { include: '#package' },
    { include: '#import' },
    { include: '#rule-head' },
    { include: '#expression' },
  ],
  repository: {
    'metadata-block': {
      comment:
        'A `# METADATA` annotation block. Every line must start at column 1 and the YAML ends at the first non-comment line.',
      name: 'comment.block.documentation.metadata.rego',
      begin: String.raw`(?:^|\G)(#)\s*(METADATA)\s*$`,
      beginCaptures: {
        1: { name: 'punctuation.definition.comment.rego' },
        2: { name: 'storage.type.metadata.rego' },
      },
      while: String.raw`(?:^|\G)(#)`,
      whileCaptures: {
        1: { name: 'punctuation.definition.comment.rego' },
      },
      patterns: [
        {
          match: String.raw`\G\s*(?:(-)\s+)?([A-Za-z_][\w-]*)\s*(:)(?=\s|$)`,
          captures: {
            1: { name: 'punctuation.definition.list.metadata.rego' },
            2: { name: 'entity.name.tag.metadata.rego' },
            3: { name: 'punctuation.separator.key-value.metadata.rego' },
          },
        },
        {
          match: String.raw`\G\s*(-)(?=\s|$)`,
          captures: {
            1: { name: 'punctuation.definition.list.metadata.rego' },
          },
        },
      ],
    },

    comment: {
      match: String.raw`(#).*$`,
      name: 'comment.line.number-sign.rego',
      captures: {
        1: { name: 'punctuation.definition.comment.rego' },
      },
    },

    package: {
      match: String.raw`(?:^|\G)\s*(package)\s+(${STATIC_REF})`,
      captures: {
        1: { name: 'keyword.control.package.rego' },
        2: { name: 'entity.name.namespace.rego' },
      },
    },

    import: {
      match: String.raw`(?:^|\G)\s*(import)\s+(${STATIC_REF})(?:\s+(as)\s+(${IDENT}))?`,
      captures: {
        1: { name: 'keyword.control.import.rego' },
        2: { name: 'entity.name.import.rego' },
        3: { name: 'keyword.control.as.rego' },
        4: { name: 'entity.name.alias.rego' },
      },
    },

    'rule-head': {
      comment:
        'Only tried at module level: inside {...}, [...] and (...) a leading identifier is a local variable, not a rule.',
      match: String.raw`(?:^|\G)\s*(?:(default)\s+)?(?!(?:${NON_RULE_HEAD_WORDS.join('|')})\b)(${IDENT}(?:\.${IDENT})*)(?=\s*(?:\[|\(|:=|=(?!=)|\{|\bif\b|\bcontains\b|#|$))`,
      captures: {
        1: { name: 'keyword.control.rego' },
        2: { name: 'entity.name.function.rule.rego' },
      },
    },

    expression: {
      patterns: [
        { include: '#comment' },
        { include: '#template-string' },
        { include: '#raw-template-string' },
        { include: '#string' },
        { include: '#raw-string' },
        { include: '#braces' },
        { include: '#brackets' },
        { include: '#parens' },
        { include: '#number' },
        { include: '#builtin-call' },
        { include: '#empty-set' },
        { include: '#logical-keyword' },
        { include: '#keyword' },
        { include: '#constant' },
        { include: '#language-variable' },
        { include: '#function-call' },
        { include: '#operator' },
        { include: '#punctuation' },
      ],
    },

    braces: {
      begin: String.raw`\{`,
      beginCaptures: { 0: { name: 'punctuation.section.braces.begin.rego' } },
      end: String.raw`\}`,
      endCaptures: { 0: { name: 'punctuation.section.braces.end.rego' } },
      patterns: [{ include: '#comprehension-body-braces' }, { include: '#expression' }],
    },

    brackets: {
      begin: String.raw`\[`,
      beginCaptures: { 0: { name: 'punctuation.section.brackets.begin.rego' } },
      end: String.raw`\]`,
      endCaptures: { 0: { name: 'punctuation.section.brackets.end.rego' } },
      patterns: [{ include: '#comprehension-body-brackets' }, { include: '#expression' }],
    },

    parens: {
      begin: String.raw`\(`,
      beginCaptures: { 0: { name: 'punctuation.section.parens.begin.rego' } },
      end: String.raw`\)`,
      endCaptures: { 0: { name: 'punctuation.section.parens.end.rego' } },
      patterns: [{ include: '#expression' }],
    },

    'comprehension-body-brackets': {
      comment: 'In `[term | query]` the first `|` separates the term from the query; later ones are set unions.',
      begin: String.raw`\|`,
      beginCaptures: { 0: { name: 'keyword.operator.comprehension.rego' } },
      end: String.raw`(?=\])`,
      patterns: [{ include: '#expression' }],
    },

    'comprehension-body-braces': {
      comment:
        'In `{term | query}` / `{key: value | query}` the first `|` separates the head from the query. A `|` used as a set union directly inside a rule body cannot be told apart lexically and is scoped the same way.',
      begin: String.raw`\|`,
      beginCaptures: { 0: { name: 'keyword.operator.comprehension.rego' } },
      end: String.raw`(?=\})`,
      patterns: [{ include: '#expression' }],
    },

    string: {
      comment: 'JSON string: may not span lines (scanner.go scanString).',
      name: 'string.quoted.double.rego',
      begin: '"',
      beginCaptures: { 0: { name: 'punctuation.definition.string.begin.rego' } },
      end: String.raw`(")|$`,
      endCaptures: { 1: { name: 'punctuation.definition.string.end.rego' } },
      patterns: [{ include: '#string-escape' }],
    },

    'string-escape': {
      patterns: [
        {
          name: 'constant.character.escape.rego',
          match: String.raw`\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})`,
        },
        {
          name: 'invalid.illegal.unrecognized-string-escape.rego',
          match: String.raw`\\.`,
        },
      ],
    },

    'raw-string': {
      comment: 'Raw strings may span lines and have no escape sequences.',
      name: 'string.quoted.raw.rego',
      begin: '`',
      beginCaptures: { 0: { name: 'punctuation.definition.string.begin.rego' } },
      end: '`',
      endCaptures: { 0: { name: 'punctuation.definition.string.end.rego' } },
    },

    'template-string': {
      comment: 'String interpolation (OPA >= 1.12): $"text {expr}". Same escapes as JSON strings plus \\{.',
      name: 'string.interpolated.rego',
      begin: String.raw`(\$)(")`,
      beginCaptures: {
        1: { name: 'punctuation.definition.template-string.rego' },
        2: { name: 'punctuation.definition.string.begin.rego' },
      },
      end: String.raw`(")|$`,
      endCaptures: { 1: { name: 'punctuation.definition.string.end.rego' } },
      patterns: [
        { name: 'constant.character.escape.rego', match: String.raw`\\\{` },
        { include: '#string-escape' },
        { include: '#template-expression' },
      ],
    },

    'raw-template-string': {
      comment: 'Raw string interpolation (OPA >= 1.12): $`text {expr}`. Only \\{ is an escape; may span lines.',
      name: 'string.interpolated.raw.rego',
      begin: String.raw`(\$)(\`)`,
      beginCaptures: {
        1: { name: 'punctuation.definition.template-string.rego' },
        2: { name: 'punctuation.definition.string.begin.rego' },
      },
      end: '`',
      endCaptures: { 0: { name: 'punctuation.definition.string.end.rego' } },
      patterns: [
        { name: 'constant.character.escape.rego', match: String.raw`\\\{` },
        { include: '#template-expression' },
      ],
    },

    'template-expression': {
      name: 'meta.template.expression.rego',
      contentName: 'meta.embedded.line.rego',
      begin: String.raw`\{`,
      beginCaptures: { 0: { name: 'punctuation.definition.template-expression.begin.rego' } },
      end: String.raw`\}`,
      endCaptures: { 0: { name: 'punctuation.definition.template-expression.end.rego' } },
      patterns: [{ include: '#expression' }],
    },

    number: {
      comment: 'JSON numbers (scanner.go scanNumber). A number immediately followed by letters is illegal, e.g. 0a2b.',
      patterns: [
        {
          name: 'invalid.illegal.numeric.rego',
          match: String.raw`(?<![\w.])(?>\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)[a-zA-Z_]\w*`,
        },
        {
          name: 'constant.numeric.float.rego',
          match: String.raw`(?<![\w.])\d+(?:\.\d+(?:[eE][+-]?\d+)?|[eE][+-]?\d+)\b`,
        },
        {
          name: 'constant.numeric.integer.rego',
          match: String.raw`(?<![\w.])\d+\b`,
        },
      ],
    },

    'builtin-call': {
      comment: `Generated from OPA ${builtinsData.opaVersion} capabilities and builtin_metadata.json (scripts/update-builtins.js). Only matched when called, so a rule or field with the same name is not colored.`,
      patterns: builtinPatterns(),
    },

    'empty-set': {
      comment: '`set()` is the literal for an empty set.',
      match: String.raw`${NOT_AFTER_DOT}(set)(\()\s*(\))`,
      captures: {
        1: { name: 'support.type.set.rego' },
        2: { name: 'punctuation.section.parens.begin.rego' },
        3: { name: 'punctuation.section.parens.end.rego' },
      },
    },

    'logical-keyword': {
      comment: 'Future keywords enabled by `import future.keywords.and/or` or `import rego.v2` (OPA >= 1.17).',
      name: 'keyword.operator.logical.rego',
      match: String.raw`${NOT_AFTER_DOT}\b(?:and|or)\b`,
    },

    keyword: {
      patterns: [
        {
          name: 'keyword.control.rego',
          match: String.raw`${NOT_AFTER_DOT}\b(?:if|else|not|with|as|default|some|every|in|contains)\b`,
        },
        {
          name: 'keyword.other.rego',
          match: String.raw`${NOT_AFTER_DOT}\b(?:package|import)\b`,
        },
      ],
    },

    constant: {
      patterns: [
        {
          name: 'constant.language.boolean.rego',
          match: String.raw`${NOT_AFTER_DOT}\b(?:true|false)\b`,
        },
        {
          name: 'constant.language.null.rego',
          match: String.raw`${NOT_AFTER_DOT}\bnull\b`,
        },
      ],
    },

    'language-variable': {
      patterns: [
        { name: 'variable.language.input.rego', match: String.raw`${NOT_AFTER_DOT}\binput\b` },
        { name: 'variable.language.data.rego', match: String.raw`${NOT_AFTER_DOT}\bdata\b` },
        { name: 'variable.language.wildcard.rego', match: String.raw`${NOT_AFTER_DOT}\b_\b` },
      ],
    },

    'function-call': {
      comment: 'Call of a user-defined function, e.g. is_admin(user) or data.lib.helper(x).',
      match: String.raw`\b(${IDENT})(?=\s*\()`,
      captures: {
        1: { name: 'entity.name.function.call.rego' },
      },
    },

    operator: {
      comment: 'Order matters: longest operators first.',
      patterns: [
        { name: 'keyword.operator.assignment.rego', match: ':=' },
        { name: 'keyword.operator.comparison.rego', match: '==|!=|<=|>=' },
        { name: 'keyword.operator.unification.rego', match: '=' },
        { name: 'keyword.operator.comparison.rego', match: '<|>' },
        { name: 'keyword.operator.arithmetic.rego', match: String.raw`\+|-|\*|/|%` },
        { name: 'keyword.operator.set.rego', match: String.raw`&|\|` },
      ],
    },

    punctuation: {
      patterns: [
        { name: 'punctuation.separator.comma.rego', match: ',' },
        { name: 'punctuation.terminator.statement.rego', match: ';' },
        { name: 'punctuation.accessor.rego', match: String.raw`\.` },
        { name: 'punctuation.separator.key-value.rego', match: ':' },
      ],
    },
  },
};

module.exports = grammar;
