/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CommandName } from 'just-bash';

/**
 * Explicit allowlist of just-bash built-in commands enabled in Agent Builder.
 *
 * Organized by the same categories as just-bash's README so the list can be
 * cross-referenced against upstream at a glance.
 *
 * Intentionally excluded:
 *  - sqlite3 — depends on sql.js WASM (import.meta.url) which doesn't load via CJS
 *  - python, python3 — Python via CPython WASM; same WASM issue + security surface
 *  - js-exec, node — JS/TS via QuickJS; security surface, not needed
 *  - curl, html-to-markdown — network access, needs explicit security model
 *  - ln, readlink — symlinks aren't supported by workspace volume / persistence
 *  - tar — pulls in `node-liblzma` (LGPL-3.0) and `@mongodb-js/zstd`; disabled until those deps are reviewed
 *  - gzip, gunzip, zcat — zip-bomb potential, no agent workflow needs compressed content today
 *  - env, printenv, hostname, whoami — virtualized info-disclosure surface with no realistic agent use case
 *  - alias, unalias — only useful as an obfuscation primitive; aliases don't persist across `bash.exec` invocations anyway
 *  - history, help, clear — meaningless in our single-shot exec model
 *  - expr — redundant with bash's native `$((…))` arithmetic
 *  - chmod — the VFS sets a mode field but nothing in our stack enforces Unix permissions
 *  - sleep — no legitimate agent use case and including it invites bad polling-loop patterns
 */
export const ALLOWED_BASH_COMMANDS: readonly CommandName[] = [
  // File operations
  'cat',
  'cp',
  'file',
  'ls',
  'mkdir',
  'mv',
  'rm',
  'rmdir',
  'split',
  'stat',
  'touch',
  'tree',

  // Text processing
  'awk',
  'base64',
  'column',
  'comm',
  'cut',
  'diff',
  'expand',
  'fold',
  'grep',
  'egrep',
  'fgrep',
  'head',
  'join',
  'md5sum',
  'nl',
  'od',
  'paste',
  'printf',
  'rev',
  'rg',
  'sed',
  'sha1sum',
  'sha256sum',
  'sort',
  'strings',
  'tac',
  'tail',
  'tr',
  'unexpand',
  'uniq',
  'wc',
  'xargs',

  // Data processing
  'jq',
  'xan',
  'yq',

  // Navigation & environment
  'basename',
  'dirname',
  'du',
  'echo',
  'find',
  'pwd',
  'tee',

  // Shell utilities
  'bash',
  'date',
  'false',
  'seq',
  'sh',
  'time',
  'timeout',
  'true',
  'which',
] as const satisfies readonly CommandName[];
