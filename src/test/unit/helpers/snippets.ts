/**
 * Minimal expander for the VS Code snippet syntax used in snippets/rego.snippets.json.
 * Follows https://code.visualstudio.com/docs/editing/userdefinedsnippets#_grammar :
 *   $1, ${1}, ${1:placeholder} (nestable), ${1|one,two|} (first choice is used),
 *   and the escapes \$ \} \\ (plus \, and \| inside choices).
 * Variables ($TM_FILENAME, ...) are rejected because the snippets do not use them.
 */
export function expandSnippet(body: string): string {
  let pos = 0;

  function fail(message: string): never {
    throw new Error(`${message} at offset ${pos} in snippet: ${body}`);
  }

  function parse(stopAtBrace: boolean): string {
    let out = '';
    while (pos < body.length) {
      const ch = body[pos];
      if (ch === '\\' && pos + 1 < body.length && '$}\\'.includes(body[pos + 1])) {
        out += body[pos + 1];
        pos += 2;
      } else if (ch === '}' && stopAtBrace) {
        return out;
      } else if (ch === '$') {
        out += parseDollar();
      } else {
        out += ch;
        pos++;
      }
    }
    if (stopAtBrace) {
      fail('unterminated ${');
    }
    return out;
  }

  function parseDollar(): string {
    pos++; // $
    const simple = /^\d+/.exec(body.slice(pos));
    if (simple) {
      pos += simple[0].length;
      return '';
    }
    if (body[pos] !== '{') {
      fail('unsupported $ syntax (variables are not supported)');
    }
    pos++; // {
    const index = /^\d+/.exec(body.slice(pos));
    if (!index) {
      fail('expected a tabstop number');
    }
    pos += index[0].length;
    if (body[pos] === '}') {
      pos++;
      return '';
    }
    if (body[pos] === ':') {
      pos++;
      const value = parse(true);
      pos++; // }
      return value;
    }
    if (body[pos] === '|') {
      pos++;
      const choices: string[] = [];
      let current = '';
      while (pos < body.length && !(body[pos] === '|' && body[pos + 1] === '}')) {
        if (body[pos] === '\\' && ',|\\$}'.includes(body[pos + 1])) {
          current += body[pos + 1];
          pos += 2;
        } else if (body[pos] === ',') {
          choices.push(current);
          current = '';
          pos++;
        } else {
          current += body[pos++];
        }
      }
      if (pos >= body.length) {
        fail('unterminated choice');
      }
      choices.push(current);
      pos += 2; // |}
      return choices[0];
    }
    return fail('unexpected character after ${n');
  }

  return parse(false);
}
