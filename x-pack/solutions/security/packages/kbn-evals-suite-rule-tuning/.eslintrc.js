/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** @type {import('eslint').Linter.Config} */
module.exports = {
  overrides: [
    // This package is Node-only (Playwright eval suite). Allow Node.js builtins.
    {
      files: ['**/*.{js,mjs,ts,tsx}'],
      rules: {
        'import/no-nodejs-modules': 'off',
        // functional-tests packages intentionally import from test-helper packages (e.g. @kbn/evals, @kbn/scout)
        '@kbn/imports/no_boundary_crossing': 'off',
      },
    },
  ],
};
