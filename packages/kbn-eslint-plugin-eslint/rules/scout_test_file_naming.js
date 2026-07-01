/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/** @typedef {import("eslint").Rule.RuleModule} Rule */

const path = require('path');

/**
 * Matches Scout test file paths following the pattern:
 * {scout,scout_*}/{ui,api}/{tests,parallel_tests}/**\/*.spec.ts
 */
const SCOUT_TEST_PATH_PATTERN = /\/test\/scout(_[^/]+)?\/(?:ui|api)\/(?:parallel_)?tests\//;

/**
 * Checks if a file path is in a Scout test directory
 * @param {string} filename
 * @returns {boolean}
 */
const isInScoutTestDirectory = (filename) => {
  return SCOUT_TEST_PATH_PATTERN.test(filename);
};

/**
 * Checks if a file has the .spec.ts extension
 * @param {string} filename
 * @returns {boolean}
 */
const hasSpecExtension = (filename) => {
  return filename.endsWith('.spec.ts');
};

/**
 * Checks if a file is a global setup or teardown file
 * @param {string} filename
 * @returns {boolean}
 */
const isGlobalSetupOrTeardownFile = (filename) => {
  const basename = path.basename(filename);
  return basename === 'global.setup.ts' || basename === 'global.teardown.ts';
};

const ALLOWED_PLAYWRIGHT_CONFIG_NAMES = new Set([
  'playwright.config.ts',
  'parallel.playwright.config.ts',
]);

/**
 * Checks if a file is a Playwright config with a non-standard name
 * @param {string} filename
 * @returns {boolean}
 */
const isNonStandardPlaywrightConfig = (filename) => {
  const basename = path.basename(filename);
  return (
    basename.includes('playwright.config.ts') && !ALLOWED_PLAYWRIGHT_CONFIG_NAMES.has(basename)
  );
};

/**
 * Gets the file extension from a filename
 * @param {string} filename
 * @returns {string}
 */
const getExtension = (filename) => {
  const ext = path.extname(filename);
  const basename = path.basename(filename, ext);

  // Check for double extension like .test.ts
  const secondExt = path.extname(basename);
  if (secondExt) {
    return secondExt + ext;
  }

  return ext;
};

/** @type {Rule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce Scout test files to use .spec.ts naming convention',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      invalidExtension:
        'Scout test files must end with .spec.ts extension. Found: "{{actual}}", expected: "{{expected}}"',
      invalidPath:
        'Scout test files must be located in scout{_*}/{ui,api}/{parallel_,}tests/ directories.',
      invalidPlaywrightConfigName: `Scout Playwright config files must be named one of the following: ${[
        ...ALLOWED_PLAYWRIGHT_CONFIG_NAMES,
      ].join(', ')}. Found: "{{actual}}"`,
    },
    fixable: null,
    schema: [],
  },
  create: (context) => {
    const filename = context.getFilename();

    // Only process TypeScript files in test/scout directories
    if (!filename.includes('/test/scout')) {
      return {};
    }

    // Check if the file is in a Scout test directory
    if (isInScoutTestDirectory(filename)) {
      // Allow global.setup.ts and global.teardown.ts files
      if (isGlobalSetupOrTeardownFile(filename)) {
        return {};
      }

      // File is in correct directory structure, check extension
      if (!hasSpecExtension(filename)) {
        const actualExt = getExtension(filename);

        return {
          Program(node) {
            context.report({
              node,
              messageId: 'invalidExtension',
              data: {
                actual: path.basename(filename),
                expected: path.basename(filename).replace(actualExt, '.spec.ts'),
              },
            });
          },
        };
      }
    } else if (filename.includes('/test/scout') && filename.endsWith('.ts')) {
      if (isNonStandardPlaywrightConfig(filename)) {
        return {
          Program(node) {
            context.report({
              node,
              messageId: 'invalidPlaywrightConfigName',
              data: {
                actual: path.basename(filename),
              },
            });
          },
        };
      }

      // File is in /test/scout but not in the correct subdirectory structure
      // Only report if it looks like a test file (has .spec.ts extension)
      if (hasSpecExtension(filename)) {
        return {
          Program(node) {
            context.report({
              node,
              messageId: 'invalidPath',
            });
          },
        };
      }
    }

    return {};
  },
};
