/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import { getPlaywrightProject, hasTestsInPlaywrightConfig } from './run_tests';
import { execPromise } from '../utils';
import { ScoutTestTarget } from '@kbn/scout-info';

jest.mock('../utils', () => ({
  execPromise: jest.fn(),
  withKibanaSwcRegister: jest.fn((env = {}) => ({
    ...env,
    NODE_OPTIONS: [env.NODE_OPTIONS, '--require=@kbn/swc-register/install']
      .filter(Boolean)
      .join(' '),
  })),
}));

describe('getPlaywrightProject', () => {
  it('returns "local" for testTarget with location "local"', () => {
    expect(getPlaywrightProject(new ScoutTestTarget('local', 'stateful', 'classic'))).toBe('local');
  });

  it('returns "ech" for cloud stateful testTarget', () => {
    expect(getPlaywrightProject(new ScoutTestTarget('cloud', 'stateful', 'classic'))).toBe('ech');
  });

  it('returns "mki" for cloud serverless testTarget', () => {
    expect(getPlaywrightProject(new ScoutTestTarget('cloud', 'serverless', 'search'))).toBe('mki');
  });

  it('throws for unknown location', () => {
    expect(() =>
      getPlaywrightProject({
        location: 'unknown',
        arch: 'stateful',
        domain: 'classic',
      } as unknown as ScoutTestTarget)
    ).toThrow(/Unable to determine Playwright project for test target/);
  });
});

describe('hasTestsInPlaywrightConfig', () => {
  let mockLog: ToolingLog;
  const execPromiseMock = execPromise as jest.Mock;

  beforeEach(() => {
    mockLog = {
      info: jest.fn(),
      error: jest.fn(),
    } as unknown as ToolingLog;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  it(`should log the last line of stdout when tests are found and return '0'`, async () => {
    execPromiseMock.mockImplementationOnce(() =>
      Promise.resolve({
        stdout: 'Listing tests:\n[local] > spec.ts > Suite > Test\nTotal: 1 test in 1 file\n',
        stderr: '',
      })
    );

    const exitCode = await hasTestsInPlaywrightConfig(
      mockLog,
      'playwright',
      ['test pwArgs'],
      'configPath/playwright.config.ts'
    );

    expect(execPromiseMock).toHaveBeenCalledWith(
      'playwright test pwArgs --list',
      expect.objectContaining({
        env: expect.objectContaining({
          SCOUT_REPORTER_ENABLED: 'false',
          NODE_OPTIONS: expect.stringContaining('--require=@kbn/swc-register/install'),
        }),
      })
    );
    expect(mockLog.info).toHaveBeenCalledTimes(2);
    expect(mockLog.info).toHaveBeenNthCalledWith(1, 'scout: Validate Playwright config has tests');
    expect(mockLog.info).toHaveBeenNthCalledWith(2, 'scout: Total: 1 test in 1 file');
    expect(exitCode).toEqual(0);
  });

  it(`should log an error and return '2' when no tests are found`, async () => {
    execPromiseMock.mockRejectedValueOnce(new Error('No tests found'));

    const exitCode = await hasTestsInPlaywrightConfig(
      mockLog,
      'playwright',
      ['test pwArgs'],
      'configPath/playwright.config.ts'
    );

    expect(mockLog.info).toHaveBeenCalledWith('scout: Validate Playwright config has tests');
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringMatching(/^scout: No tests found in \[configPath\/playwright\.config\.ts\]\./)
    );
    expect(exitCode).toEqual(2);
  });

  it(`should log an error and return '1' when test command throws error`, async () => {
    execPromiseMock.mockRejectedValueOnce(new Error(`unknown command 'test'`));

    const exitCode = await hasTestsInPlaywrightConfig(
      mockLog,
      'playwright',
      ['test pwArgs'],
      'configPath/playwright.config.ts'
    );

    expect(mockLog.info).toHaveBeenCalledWith('scout: Validate Playwright config has tests');
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringMatching(/^scout: Playwright CLI is probably broken\./)
    );
    expect(exitCode).toEqual(1);
  });

  it(`should log an error and return '1' when unknown error occurs`, async () => {
    execPromiseMock.mockRejectedValueOnce(new Error(`unknown error`));

    const exitCode = await hasTestsInPlaywrightConfig(
      mockLog,
      'playwright',
      ['test pwArgs'],
      'configPath/playwright.config.ts'
    );

    expect(mockLog.info).toHaveBeenCalledWith('scout: Validate Playwright config has tests');
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringMatching(/^scout: Unknown error occurred\./)
    );
    expect(exitCode).toEqual(1);
  });
});
