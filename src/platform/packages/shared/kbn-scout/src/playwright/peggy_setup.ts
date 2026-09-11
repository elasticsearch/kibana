/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Initialize Peggy require hook for .peggy grammar files.
 * This is required for @kbn/tinymath, @kbn/es-query and other packages that use Peggy grammars.
 *
 * Playwright loads this so packages that ship Peggy grammars (for example `@kbn/tinymath`) resolve `.peggy` files.
 * Without this, tests that pull those modules can fail with: `"whitespace" SyntaxError: Unexpected string`
 *
 * We force-register the hook because `@kbn/swc-register` (injected into Playwright via
 * NODE_OPTIONS) already installs a `pirates`-based `.peggy` handler that reads the grammar file
 * through Node's default `.js` loader. On Node >=23.5, Playwright (>=1.61) registers a synchronous
 * `module.registerHooks` load hook, so that default loader Babel-parses the raw grammar and throws
 * `SyntaxError: ... Missing semicolon`. Forcing this standalone handler ensures `.peggy` files are
 * compiled by Peggy and handed to `module._compile` directly, bypassing the load hook.
 *
 * This is similar to the Jest Peggy setup in src/platform/packages/shared/kbn-test/src/jest/transforms/peggy.js.
 */
import { requireHook } from '@kbn/peggy';
requireHook({ force: true });
