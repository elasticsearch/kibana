/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { updateAlertStatus } from './update_alerts';
import { DefaultClosingReasonSchema } from '../../../../../common/types';

const mockUpdateAlertStatusByIds = jest.fn().mockReturnValue(new Promise(() => {}));
const mockUpdateAlertStatusByQuery = jest.fn().mockReturnValue(new Promise(() => {}));

jest.mock('../../../../detections/containers/detection_engine/alerts/api', () => {
  return {
    updateAlertStatusByQuery: (params: unknown) => mockUpdateAlertStatusByQuery(params),
    updateAlertStatusByIds: (params: unknown) => mockUpdateAlertStatusByIds(params),
  };
});

const status = 'open';

describe('updateAlertStatus', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should reject if neither query nor signalIds are provided', async () => {
    await expect(updateAlertStatus({ status })).rejects.toThrow(
      'Either query or signalIds must be provided'
    );
  });

  it('should call updateAlertStatusByIds if signalIds are provided', () => {
    const signalIds = ['1', '2'];
    updateAlertStatus({
      status,
      signalIds,
    });
    expect(mockUpdateAlertStatusByIds).toHaveBeenCalledWith({
      status,
      signalIds,
    });
    expect(mockUpdateAlertStatusByQuery).not.toHaveBeenCalled();
  });

  it('should call updateAlertStatusByIds with `reason` if provided', () => {
    const signalIds = ['1', '2'];
    const mockReason = DefaultClosingReasonSchema.enum.benign_positive;
    updateAlertStatus({
      status,
      signalIds,
      reason: mockReason,
    });
    expect(mockUpdateAlertStatusByIds).toHaveBeenCalledWith({
      status,
      signalIds,
      reason: mockReason,
    });
    expect(mockUpdateAlertStatusByQuery).not.toHaveBeenCalled();
  });

  it('should call mockUpdateAlertStatusByQuery if query is provided', () => {
    const query = { query: 'query' };
    updateAlertStatus({
      status,
      query,
    });
    expect(mockUpdateAlertStatusByIds).not.toHaveBeenCalled();
    expect(mockUpdateAlertStatusByQuery).toHaveBeenCalledWith(
      expect.objectContaining({ status, query })
    );
  });

  it('should forward `runtimeFields` to updateAlertStatusByQuery', () => {
    const query = { query: 'query' };
    const runtimeFields = { 'source.ip_ecs': 'ip', 'user.tag': 'keyword' } as const;
    updateAlertStatus({
      status,
      query,
      runtimeFields,
    });
    expect(mockUpdateAlertStatusByQuery).toHaveBeenCalledWith(
      expect.objectContaining({ status, query, runtimeFields })
    );
  });
});
