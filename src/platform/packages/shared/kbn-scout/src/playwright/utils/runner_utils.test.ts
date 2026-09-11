/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  isValidUTCDate,
  formatTime,
  getPlaywrightGrepTag,
  withKibanaSwcRegister,
} from './runner_utils';
import moment from 'moment';
import { ScoutTestTarget } from '@kbn/scout-info';
jest.mock('moment', () => {
  const actualMoment = jest.requireActual('moment');
  return {
    ...actualMoment,
    utc: jest.fn((date, fmt) => actualMoment(date, fmt)),
  };
});

describe('isValidUTCDate', () => {
  it('should return true for valid UTC date strings', () => {
    expect(isValidUTCDate('2019-04-27T23:56:51.374Z')).toBe(true);
  });

  it('should return false for invalid date strings', () => {
    expect(isValidUTCDate('invalid-date')).toBe(false);
  });

  it('should return false for valid non-UTC date strings', () => {
    expect(isValidUTCDate('2015-09-19T06:31:44')).toBe(false);
    expect(isValidUTCDate('Sep 19, 2015 @ 06:31:44.000')).toBe(false);
  });
});

describe('formatTime', () => {
  it('should format the time using the default format', () => {
    const mockDate = '2024-12-16T12:00:00.000Z';
    const mockFormat = 'MMM D, YYYY @ HH:mm:ss.SSS';
    (moment.utc as jest.Mock).mockReturnValue({ format: () => 'Dec 16, 2024 @ 12:00:00.000' });

    const result = formatTime(mockDate);

    expect(moment.utc).toHaveBeenCalledWith(mockDate, mockFormat);
    expect(result).toBe('Dec 16, 2024 @ 12:00:00.000');
  });

  it('should format the time using a custom format', () => {
    const mockDate = '2024-12-16T12:00:00.000Z';
    const customFormat = 'YYYY-MM-DD';
    (moment.utc as jest.Mock).mockReturnValue({ format: () => '2024-12-16' });

    const result = formatTime(mockDate, customFormat);

    expect(moment.utc).toHaveBeenCalledWith(mockDate, customFormat);
    expect(result).toBe('2024-12-16');
  });
});

describe('getPlaywrightGrepTag', () => {
  it('should return the correct tag for serverless mode', () => {
    const testTarget = new ScoutTestTarget('local', 'serverless', 'observability_complete');
    const result = getPlaywrightGrepTag(testTarget);
    expect(result).toBe('@local-serverless-observability_complete');
  });

  it('should return the correct tag for stateful mode', () => {
    const testTarget = new ScoutTestTarget('cloud', 'stateful', 'classic');
    const result = getPlaywrightGrepTag(testTarget);
    expect(result).toBe('@cloud-stateful-classic');
  });
});

describe('withKibanaSwcRegister', () => {
  const originalNodeOptions = process.env.NODE_OPTIONS;

  afterEach(() => {
    if (originalNodeOptions === undefined) {
      delete process.env.NODE_OPTIONS;
    } else {
      process.env.NODE_OPTIONS = originalNodeOptions;
    }
  });

  it('sets NODE_OPTIONS to only the kbn swc-register --require when none is present', () => {
    delete process.env.NODE_OPTIONS;

    const result = withKibanaSwcRegister({ FOO: 'bar' });

    expect(result.FOO).toBe('bar');
    expect(result.NODE_OPTIONS).toBe('--require=@kbn/swc-register/install');
  });

  it('appends the kbn swc-register --require to caller-provided NODE_OPTIONS', () => {
    delete process.env.NODE_OPTIONS;

    const result = withKibanaSwcRegister({
      NODE_OPTIONS: '--max-old-space-size=4096',
    });

    expect(result.NODE_OPTIONS).toBe(
      '--max-old-space-size=4096 --require=@kbn/swc-register/install'
    );
  });

  it('appends to process.env.NODE_OPTIONS when the input env does not set NODE_OPTIONS', () => {
    process.env.NODE_OPTIONS = '--max-old-space-size=4096';

    const result = withKibanaSwcRegister({});

    expect(result.NODE_OPTIONS).toBe(
      '--max-old-space-size=4096 --require=@kbn/swc-register/install'
    );
  });

  it('is idempotent when the --require is already present', () => {
    delete process.env.NODE_OPTIONS;

    const existing = '--max-old-space-size=4096 --require=@kbn/swc-register/install';
    const result = withKibanaSwcRegister({ NODE_OPTIONS: existing });

    expect(result.NODE_OPTIONS).toBe(existing);
  });

  it('prefers the env-provided NODE_OPTIONS over process.env', () => {
    process.env.NODE_OPTIONS = '--inspect';

    const result = withKibanaSwcRegister({ NODE_OPTIONS: '--max-old-space-size=4096' });

    expect(result.NODE_OPTIONS).toBe(
      '--max-old-space-size=4096 --require=@kbn/swc-register/install'
    );
  });
});
