/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { REPO_ROOT } from '@kbn/repo-info';
import { ToolingLog } from '@kbn/tooling-log';

import { File } from '../file';

jest.mock('eslint', () => {
  const mockConstructor = jest.fn();
  const mockLintFiles = jest.fn();
  const mockLoadFormatter = jest.fn();
  const mockOutputFixes = jest.fn();

  return {
    ESLint: class ESLint {
      static outputFixes = mockOutputFixes;

      constructor(options: unknown) {
        mockConstructor(options);
      }

      public lintFiles = mockLintFiles;
      public loadFormatter = mockLoadFormatter;
    },
    __mock: {
      mockConstructor,
      mockLintFiles,
      mockLoadFormatter,
      mockOutputFixes,
    },
  };
});

import { lintFiles } from './lint_files';

const { __mock } = jest.requireMock('eslint') as {
  __mock: {
    mockConstructor: jest.Mock;
    mockLintFiles: jest.Mock;
    mockLoadFormatter: jest.Mock;
    mockOutputFixes: jest.Mock;
  };
};
const { mockConstructor, mockLintFiles, mockLoadFormatter, mockOutputFixes } = __mock;

describe('lintFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLintFiles.mockResolvedValue([
      {
        errorCount: 0,
        filePath: `${REPO_ROOT}/src/foo.ts`,
        output: 'fixed foo',
        warningCount: 0,
      },
      {
        errorCount: 0,
        filePath: `${REPO_ROOT}/src/bar.ts`,
        output: undefined,
        warningCount: 0,
      },
      {
        errorCount: 0,
        filePath: `${REPO_ROOT}/src/baz.ts`,
        output: 'fixed baz',
        warningCount: 0,
      },
    ]);
    mockLoadFormatter.mockResolvedValue({
      format: jest.fn(),
    });
  });

  it('returns and logs the files updated by eslint --fix', async () => {
    const log = new ToolingLog();
    jest.spyOn(log, 'info').mockImplementation(() => undefined);
    jest.spyOn(log, 'success').mockImplementation(() => undefined);

    const result = await lintFiles(
      log,
      [
        new File(`${REPO_ROOT}/src/foo.ts`),
        new File(`${REPO_ROOT}/src/bar.ts`),
        new File(`${REPO_ROOT}/src/baz.ts`),
      ],
      { fix: true }
    );

    expect(mockConstructor).toHaveBeenCalledWith({
      cache: true,
      cwd: REPO_ROOT,
      fix: expect.any(Function),
    });
    expect(mockOutputFixes).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      fixedFiles: ['src/baz.ts', 'src/foo.ts'],
      failedFiles: [],
      lintedFileCount: 3,
      warningCount: 0,
    });
  });

  it('returns failedFiles when eslint reports errors', async () => {
    mockLintFiles.mockResolvedValue([
      {
        errorCount: 2,
        filePath: `${REPO_ROOT}/src/broken.ts`,
        output: undefined,
        warningCount: 0,
      },
      {
        errorCount: 0,
        filePath: `${REPO_ROOT}/src/ok.ts`,
        output: undefined,
        warningCount: 0,
      },
    ]);
    mockLoadFormatter.mockResolvedValue({
      format: jest.fn().mockReturnValue('error output'),
    });

    const log = new ToolingLog();
    jest.spyOn(log, 'error').mockImplementation(() => undefined);

    const result = await lintFiles(
      log,
      [new File(`${REPO_ROOT}/src/broken.ts`), new File(`${REPO_ROOT}/src/ok.ts`)],
      { fix: false }
    );

    expect(result.failedFiles).toEqual(['src/broken.ts']);
    expect(result.lintedFileCount).toBe(2);
  });

  it('counts warnings for files that also have errors', async () => {
    mockLintFiles.mockResolvedValue([
      {
        errorCount: 1,
        filePath: `${REPO_ROOT}/src/mixed.ts`,
        output: undefined,
        warningCount: 2,
      },
    ]);
    mockLoadFormatter.mockResolvedValue({
      format: jest.fn().mockReturnValue('mixed output'),
    });

    const log = new ToolingLog();
    jest.spyOn(log, 'error').mockImplementation(() => undefined);

    const result = await lintFiles(log, [new File(`${REPO_ROOT}/src/mixed.ts`)], { fix: false });

    expect(result).toEqual({
      failedFiles: ['src/mixed.ts'],
      fixedFiles: [],
      lintedFileCount: 1,
      warningCount: 2,
    });
  });
});
