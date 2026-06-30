---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/kibana-linting.html
---

# Linting [kibana-linting]

A note about linting: We use [eslint](http://eslint.org) to check that the [styleguide](https://github.com/elastic/kibana/blob/master/STYLEGUIDE.mdx) is being followed. It runs in a pre-commit hook and as a part of the tests, but most contributors integrate it with their code editors for real-time feedback.

Here are some hints for getting eslint setup in your favorite editor:

| Editor | Plugin |
| --- | --- |
| Sublime | [SublimeLinter-eslint](https://github.com/roadhump/SublimeLinter-eslint#installation) |
| Atom | [linter-eslint](https://github.com/AtomLinter/linter-eslint#installation) |
| VSCode | [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) |
| IntelliJ | Settings » Languages & Frameworks » JavaScript » Code QualityTools » ESLint |
| `vi` | [scrooloose/syntastic](https://github.com/scrooloose/syntastic) |

Another tool we use for enforcing consistent coding style is EditorConfig, which can be set up by installing a plugin in your editor that dynamically updates its configuration. Take a look at the [EditorConfig](http://editorconfig.org/#download) site to find a plugin for your editor, and browse our [`.editorconfig`](https://github.com/elastic/kibana/blob/main/.editorconfig) file to see what config rules we set up.


## Setup Guide for VS Code Users [_setup_guide_for_vs_code_users]

Note that for VSCode, to enable "`live`" linting of TypeScript (and other) file types, you will need to modify your local settings, as shown below. The default for the ESLint extension is to only lint JavaScript file types.

```json
"eslint.validate": [
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
]
```

Although, starting with [ESLint v2.0.4](https://github.com/microsoft/vscode-eslint#version-204), there is no need to use `eslint.validate` to parse typescript files as it works out of the box.

`eslint` can automatically fix trivial lint errors when you save a file by adding this line in your setting.

```json
"editor.codeActionsOnSave": {
   "source.fixAll.eslint": true
}
```

[`Prettier` extension/IDE plugin](https://prettier.io/) while maintaining the {{kib}} project. Formatting and styling roles are set in the multiple `.eslintrc.js` files across the project and some of them use the [NPM version of Prettier](https://www.npmjs.com/package/prettier). Using the IDE extension might cause conflicts, applying the formatting to too many files that shouldn’t be prettier-ized and/or highlighting errors that are actually OK.

