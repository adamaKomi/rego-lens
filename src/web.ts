/**
 * VS Code for the Web entry point. An extension with a `main` but no `browser` entry point is ignored by
 * the web extension host (https://code.visualstudio.com/api/extension-guides/web-extensions), which would
 * take away the grammars and snippets there too. This entry keeps them available; checking embedded Rego
 * is not, because it runs the opa binary.
 *
 * It must not import anything: the web extension host loads it as a single file.
 */
export function activate(): void {
  // Nothing to do on the web: the grammars and snippets are declarative.
}

export function deactivate(): void {
  // Nothing to release.
}
