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
 * Matches `scout{_*}/[<namespace>/]{ui,api}/{parallel_,}tests/` paths.
 * Backtracking prevents `ui`/`api` from being consumed as the namespace segment.
 */
const SCOUT_TEST_PATH_PATTERN =
  /\/test\/scout(?:_[^/]+)?(?:\/[^/]+)?\/(?:ui|api)\/(?:parallel_)?tests\//;

/**
 * Detects unsupported two-level namespace nesting: `scout{_*}/<a>/<b>/{ui,api}/`.
 * Only one namespace level is allowed between the scout root and `{ui,api}/`.
 */
const SCOUT_TOO_DEEP_NAMESPACE_PATTERN = /\/test\/scout(?:_[^/]+)?\/[^/]+\/[^/]+\/(?:ui|api)\//;

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
        'Scout test files must be located in scout{_*}/[<namespace>/]{ui,api}/{parallel_,}tests/ directories, ' +
        'where the optional <namespace> is a single sub-directory level.',
      invalidNamespaceDepth:
        'Scout test files support at most one namespace sub-directory between the scout root and the ' +
        '{ui,api} directory: scout{_*}/<namespace>/{ui,api}/{parallel_,}tests/. ' +
        'Found more than one namespace level; rename to use a single namespace segment.',
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

      // Check for unsupported two-level namespace paths, e.g. scout/<a>/<b>/{ui,api}/
      if (SCOUT_TOO_DEEP_NAMESPACE_PATTERN.test(filename)) {
        return {
          Program(node) {
            context.report({
              node,
              messageId: 'invalidNamespaceDepth',
            });
          },
        };
      }

      // File is in /test/scout but not in the correct subdirectory structure.
      // Only report if it looks like a test file (has spec in name or .spec.ts ext).
      const basename = path.basename(filename, '.ts');
      if (basename.includes('spec') || hasSpecExtension(filename)) {
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
