/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { BaseParams } from '@kbn/reporting-common/types';
import { checkParamsVersion } from './check_params_version';

const mockLogger = loggingSystemMock.createLogger();

const baseParams: BaseParams = {
  browserTimezone: 'UTC',
  objectType: 'test',
  title: 'test title',
  version: '9.1.0',
};

describe('checkParamsVersion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the version from job params when provided', () => {
    const result = checkParamsVersion(baseParams, mockLogger, '9.9.9');
    expect(result).toBe('9.1.0');
    expect(mockLogger.debug).toHaveBeenCalledWith('Using reporting job params v9.1.0');
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('returns the defaultVersion and warns when job params version is missing', () => {
    const params = { ...baseParams, version: undefined } as unknown as BaseParams;
    const result = checkParamsVersion(params, mockLogger, '9.9.9');
    expect(result).toBe('9.9.9');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'No version provided in report job params. Defaulting to 9.9.9'
    );
    expect(mockLogger.debug).not.toHaveBeenCalled();
  });
});
