/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { REPO_ROOT } from '@kbn/repo-info';
import path from 'path';
import fs from 'fs';
import { createFlagError } from '@kbn/dev-cli-errors';

export interface TestFilesValidationResult {
  testFiles: string[];
  configPath: string;
}

/**
 * Regex pattern to match scout test directory paths.
 * Pattern: {scout,scout_*}[/<namespace>]/{ui,api}/{tests,parallel_tests}
 * Capturing groups: [1] scout directory name, [2] namespace (optional), [3] type (ui|api), [4] test type (tests|parallel_tests)
 */
const SCOUT_TEST_DIR_PATTERN =
  /\/(scout(?:_[^/]+)?)(?:\/([^/]+))?\/(ui|api)\/(tests|parallel_tests)/;
const SCOUT_TEST_DIR = '{scout,scout_*}/{,<namespace>/}{ui,api}/{tests,parallel_tests}';

function isTestFile(fileName: string): boolean {
  return fileName.endsWith('.spec.ts');
}

/**
 * Checks if a directory contains any test files (recursively)
 */
function hasTestFilesInDirectory(dirPath: string): boolean {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (hasTestFilesInDirectory(fullPath)) {
        return true;
      }
    } else if (entry.isFile() && isTestFile(entry.name)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates that a path is within one of the allowed scout directories
 * @param normalizedPath Normalized path to validate
 * @param originalPath Original path for error messages
 * @param isFile Whether the path is a file (affects validation specificity)
 */
function validateScoutPath(normalizedPath: string, originalPath: string, isFile: boolean): void {
  const isValidScoutPath = SCOUT_TEST_DIR_PATTERN.test(normalizedPath);

  if (!isValidScoutPath) {
    const pathType = isFile ? 'Test file' : 'Directory';
    throw createFlagError(
      `${pathType} must be within a scout directory matching pattern '${SCOUT_TEST_DIR}': ${originalPath}`
    );
  }
}

/**
 * Validates and processes a single file path
 */
function validateFile(testPath: string, fullPath: string): string {
  if (!isTestFile(path.basename(fullPath))) {
    throw createFlagError(`File must be a test file ending '*.spec.ts': ${testPath}`);
  }

  const normalizedPath = testPath.replace(/\\/g, '/');
  validateScoutPath(normalizedPath, testPath, true);

  return testPath;
}

/**
 * Validates and processes a single directory path
 */
function validateDirectory(testPath: string, fullPath: string): string {
  if (!hasTestFilesInDirectory(fullPath)) {
    throw createFlagError(`No test files found in directory: ${testPath}`);
  }

  const normalizedPath = testPath.replace(/\\/g, '/');
  validateScoutPath(normalizedPath, testPath, false);

  return testPath;
}

/**
 * Validates and processes test files or directories, deriving the appropriate config path
 * @param testFilesList Comma-separated string of test file/directory paths
 * @returns Validation result with processed test files and derived config path
 */
export function validateAndProcessTestFiles(testFilesList: string): TestFilesValidationResult {
  const testFiles: string[] = [];
  const rawPaths = testFilesList
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  let derivedConfigPath: string | null = null;

  for (const testPath of rawPaths) {
    const fullPath = path.resolve(REPO_ROOT, testPath);

    // Basic path validation
    if (!fullPath.startsWith(REPO_ROOT)) {
      throw createFlagError(`Path must be within the repository: ${testPath}`);
    }

    if (!fs.existsSync(fullPath)) {
      throw createFlagError(`Path does not exist: ${testPath}`);
    }

    // Validate and process based on path type
    const stat = fs.statSync(fullPath);
    let validatedPath: string;

    if (stat.isFile()) {
      validatedPath = validateFile(testPath, fullPath);
    } else if (stat.isDirectory()) {
      validatedPath = validateDirectory(testPath, fullPath);
    } else {
      throw createFlagError(`Path must be a file or directory: ${testPath}`);
    }

    testFiles.push(validatedPath);

    // Derive and validate config path consistency
    const normalizedPath = testPath.replace(/\\/g, '/');
    const derivedConfigForPath = deriveConfigPath(normalizedPath, testPath);

    if (derivedConfigPath === null) {
      derivedConfigPath = derivedConfigForPath;
    } else if (derivedConfigPath !== derivedConfigForPath) {
      throw createFlagError(
        `All paths must be from the same scout test directory (matching pattern '${SCOUT_TEST_DIR}')`
      );
    }
  }

  return {
    testFiles,
    configPath: derivedConfigPath!,
  };
}

/**
 * Derives the appropriate Playwright config path based on the test file/directory location
 * @param normalizedPath Normalized test file/directory path
 * @param originalPath Original test file/directory path for error messages
 * @returns Derived config path
 */
function deriveConfigPath(normalizedPath: string, originalPath: string): string {
  const match = normalizedPath.match(SCOUT_TEST_DIR_PATTERN);

  if (!match) {
    throw createFlagError(`Unable to derive config path for path: ${originalPath}`);
  }

  const [, scoutDir, namespace, type, testType] = match;
  const namespaceSegment = namespace ? `/${namespace}` : '';
  // Find the index of the scout directory pattern to preserve the full path prefix
  const scoutIndex = normalizedPath.indexOf(`/${scoutDir}${namespaceSegment}/${type}/`);
  const pathPrefix = normalizedPath.substring(0, scoutIndex);
  const scoutBasePath = `${pathPrefix}/${scoutDir}${namespaceSegment}/${type}`;

  if (testType === 'parallel_tests') {
    return `${scoutBasePath}/parallel.playwright.config.ts`;
  } else {
    return `${scoutBasePath}/playwright.config.ts`;
  }
}
