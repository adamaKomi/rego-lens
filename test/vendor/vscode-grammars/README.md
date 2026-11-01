# Vendored VS Code grammars (test-only)

These files are **only used by the grammar tests** (`npm run test:grammar:embedded`) so that the
Rego injection grammars are exercised against the exact YAML and Markdown grammars that ship with
VS Code. They are excluded from the published extension (`.vscodeignore` ignores `test/**`).

| Files | Copied from | Upstream | License |
|---|---|---|---|
| `yaml*.tmLanguage.json` | [`microsoft/vscode` @ `1306698e`](https://github.com/microsoft/vscode/tree/1306698e328e5e531f5e632301d30020aa994eff/extensions/yaml/syntaxes) | [RedCMD/YAML-Syntax-Highlighter](https://github.com/RedCMD/YAML-Syntax-Highlighter) | MIT, Copyright 2024 RedCMD |
| `markdown.tmLanguage.json` | [`microsoft/vscode` @ `1306698e`](https://github.com/microsoft/vscode/tree/1306698e328e5e531f5e632301d30020aa994eff/extensions/markdown-basics/syntaxes) | [microsoft/vscode-markdown-tm-grammar](https://github.com/microsoft/vscode-markdown-tm-grammar) | MIT, Copyright (c) Microsoft Corporation |

The files are unmodified. To refresh them, copy the same paths from a newer `microsoft/vscode`
commit and update the commit hash above.

## MIT License (applies to both upstream projects)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
