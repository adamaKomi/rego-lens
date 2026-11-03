/**
 * Finds the Rego modules embedded in OPA Gatekeeper ConstraintTemplates.
 *
 * A ConstraintTemplate keeps its Rego in YAML block scalars, in one of two places
 * (https://open-policy-agent.github.io/gatekeeper/website/docs/constrainttemplates):
 *
 *   spec.targets[].rego and spec.targets[].libs[]                (legacy fields, Rego v0)
 *   spec.targets[].code[] with engine: Rego, and its source:
 *     source.rego, source.libs[], source.version ("v1", or v0 when absent)
 *
 * Gatekeeper compiles a template's rego with its libs, per target and per source, so the modules are
 * returned in groups. The default version comes from Gatekeeper's own code: an empty or missing version is
 * v0 (open-policy-agent/frameworks, constraint/pkg/client/drivers/rego/schema/schema.go, GetSource).
 *
 * This is a line-based reader for the subset of YAML that these files use (block mappings, sequences and
 * literal block scalars), not a general YAML parser: it has no dependency and keeps exact line numbers,
 * which diagnostics need.
 */

/** One Rego module found in a YAML file. */
export interface EmbeddedModule {
  /** `rego` for the template's main module, `lib` for an entry of `libs`. */
  kind: 'rego' | 'lib';
  /** The module text, with the block scalar's indentation removed. */
  text: string;
  /** 0-based line, in the YAML file, of the module's first line. */
  firstLine: number;
  /** Number of characters removed at the start of every line: add it to a module column. */
  indent: number;
}

/** The modules that Gatekeeper compiles together, and their Rego version. */
export interface EmbeddedGroup {
  version: 'v0' | 'v1';
  modules: EmbeddedModule[];
}

interface Line {
  index: number;
  text: string;
  indent: number;
}

interface Entry {
  key: string;
  value: string;
  /** Indentation of the key itself, after a "- " sequence marker if any. */
  indent: number;
  line: number;
  /** Lines of a block scalar value, when the value is `|` or `|-` (literal). */
  block?: { text: string; firstLine: number; indent: number };
  /** True when the key starts a sequence item: `- key: value`. */
  item: boolean;
  /** Indentation of the "- " marker for a sequence item. */
  itemIndent: number;
}

const KEY = /^(\s*)(-\s+)?([A-Za-z_][\w.-]*|"[^"]*"|'[^']*'):(?:\s+(.*?))?\s*$/;
const ITEM = /^(\s*)-(?:\s+(.*?))?\s*$/;
const LITERAL = /^\|([1-9])?[+-]?([1-9])?\s*(#.*)?$/;

function indentOf(text: string): number {
  return text.length - text.trimStart().length;
}

function isBlankOrComment(text: string): boolean {
  const t = text.trim();
  return t === '' || t.startsWith('#');
}

/** Reads a literal block scalar that starts after `header` (its `|` indicator), with parent indent `parent`. */
function readBlock(
  lines: Line[],
  start: number,
  parent: number,
  header: string
): { text: string; firstLine: number; indent: number; end: number } | undefined {
  const m = LITERAL.exec(header);
  if (!m) {
    return undefined; // folded (>) or a plain or quoted scalar: not Rego that we can map line by line
  }
  const explicit = Number(m[1] ?? m[2] ?? 0);
  let end = start;
  while (end < lines.length && (lines[end].text.trim() === '' || lines[end].indent > parent)) {
    end++;
  }
  // Trailing blank lines belong to the next node, not to the module.
  while (end > start && lines[end - 1].text.trim() === '') {
    end--;
  }
  if (end === start) {
    return { text: '', firstLine: start, indent: parent + 2, end };
  }
  let indent = explicit ? parent + explicit : Infinity;
  if (!explicit) {
    for (let i = start; i < end; i++) {
      if (lines[i].text.trim() !== '') {
        indent = Math.min(indent, lines[i].indent);
        break; // YAML takes the indentation of the first non-empty line
      }
    }
  }
  const text = lines
    .slice(start, end)
    .map((l) => (l.text.trim() === '' ? '' : l.text.slice(indent)))
    .join('\n');
  return { text: text + '\n', firstLine: lines[start].index, indent, end };
}

/** Splits a document into entries (keys and block scalars), skipping the content of block scalars. */
function entries(lines: Line[]): Entry[] {
  const out: Entry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const { text } = lines[i];
    if (isBlankOrComment(text)) {
      continue;
    }
    const key = KEY.exec(text);
    if (key) {
      const itemIndent = key[1].length;
      const indent = itemIndent + (key[2]?.length ?? 0);
      const entry: Entry = {
        key: key[3].replace(/^["']|["']$/g, ''),
        value: (key[4] ?? '').replace(/\s+#.*$/, ''),
        indent,
        line: lines[i].index,
        item: key[2] !== undefined,
        itemIndent,
      };
      if (entry.value.startsWith('|') || entry.value.startsWith('>')) {
        const block = readBlock(lines, i + 1, indent, entry.value);
        if (block) {
          entry.block = block;
          i = block.end - 1;
        } else {
          while (i + 1 < lines.length && (lines[i + 1].text.trim() === '' || lines[i + 1].indent > indent)) {
            i++; // skip a folded scalar
          }
        }
      }
      out.push(entry);
      continue;
    }
    const item = ITEM.exec(text);
    if (item && item[2] !== undefined && (item[2].startsWith('|') || item[2].startsWith('>'))) {
      // `- |`: a block scalar as a sequence item (an entry of libs). Its parent indent is the marker's.
      const indent = item[1].length;
      const block = readBlock(lines, i + 1, indent, item[2]);
      out.push({ key: '-', value: item[2], indent, line: lines[i].index, item: true, itemIndent: indent, block });
      if (block) {
        i = block.end - 1;
      }
    }
  }
  return out;
}

function unquote(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '');
}

/** The value of a top-level key, for `kind`. */
function topLevel(es: Entry[], key: string): string | undefined {
  return es.find((e) => e.indent === 0 && !e.item && e.key === key)?.value;
}

/**
 * Returns the groups of Rego modules of every ConstraintTemplate in a YAML file (several documents
 * separated by `---` are supported). Other documents are ignored.
 */
export function extractConstraintTemplates(source: string): EmbeddedGroup[] {
  const all: Line[] = source.split(/\r?\n/).map((text, index) => ({ index, text, indent: indentOf(text) }));
  const documents: Line[][] = [[]];
  for (const line of all) {
    if (/^(---|\.\.\.)(\s|$)/.test(line.text)) {
      documents.push([]);
    } else {
      documents[documents.length - 1].push(line);
    }
  }

  const groups: EmbeddedGroup[] = [];
  for (const doc of documents) {
    const es = entries(doc);
    if (unquote(topLevel(es, 'kind') ?? '') !== 'ConstraintTemplate') {
      continue;
    }
    // Walk the entries with a stack of open keys, to know each block scalar's ancestors.
    const stack: Entry[] = [];
    // Groups are keyed by the line of the entry that owns them: a target item, or a code source.
    const byOwner = new Map<number, EmbeddedGroup>();
    const group = (owner: Entry, version: 'v0' | 'v1'): EmbeddedGroup => {
      let g = byOwner.get(owner.line);
      if (!g) {
        g = { version, modules: [] };
        byOwner.set(owner.line, g);
        groups.push(g);
      }
      return g;
    };
    const versionOf = (source: Entry): 'v0' | 'v1' => {
      // The version key is a sibling of rego and libs, inside source.
      const idx = es.indexOf(source);
      for (let j = idx + 1; j < es.length && es[j].indent > source.indent; j++) {
        if (es[j].key === 'version' && unquote(es[j].value) === 'v1') {
          return 'v1';
        }
      }
      return 'v0';
    };

    // The item of spec.targets being read: the owner of the legacy rego and libs. Its first key opens it,
    // and the following keys of the item are its siblings, so it is remembered apart from the stack.
    let target: Entry | undefined;
    for (const e of es) {
      // Close the keys that this entry is not inside of. A sequence item closes its siblings.
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        const deeper = e.item ? e.itemIndent > top.indent : e.indent > top.indent;
        if (deeper) {
          break;
        }
        stack.pop();
      }
      const path = stack.map((s) => s.key);
      if (e.item && path[path.length - 1] === 'targets') {
        target = e;
      } else if (!path.includes('targets')) {
        target = undefined;
      }
      if (e.block && (e.key === 'rego' || e.key === '-')) {
        const kind = e.key === 'rego' ? 'rego' : 'lib';
        const parentKey = path[path.length - 1];
        if (kind === 'lib' && parentKey !== 'libs') {
          stack.push(e);
          continue;
        }
        const inTargets = path.includes('targets');
        const sourceIndex = path.lastIndexOf('source');
        const libsParent = kind === 'lib' ? path[path.length - 2] : parentKey;
        if (inTargets && sourceIndex >= 0 && (kind === 'rego' ? parentKey === 'source' : libsParent === 'source')) {
          const source = stack[sourceIndex];
          group(source, versionOf(source)).modules.push({ kind, ...e.block });
        } else if (inTargets && sourceIndex < 0) {
          // Legacy fields: spec.targets[].rego and spec.targets[].libs. The owner is the target item.
          const owner = target ?? stack[stack.length - 1];
          group(owner, 'v0').modules.push({ kind, text: e.block.text, firstLine: e.block.firstLine, indent: e.block.indent });
        }
      }
      stack.push(e);
    }
  }
  return groups.filter((g) => g.modules.some((m) => m.text.trim() !== ''));
}
