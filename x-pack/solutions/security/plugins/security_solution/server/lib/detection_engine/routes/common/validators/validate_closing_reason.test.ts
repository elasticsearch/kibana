/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_DETECTIONS_CLOSE_REASONS_KEY } from '../../../../../../common/constants';
import type { SecuritySolutionRequestHandlerContext } from '../../../../../types';
import { requestContextMock } from '../../__mocks__';
import { validateClosingReason } from './validate_closing_reason';

describe('validateClosingReason', () => {
  let core: Awaited<SecuritySolutionRequestHandlerContext['core']>;
  let uiSettingsGet: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    const { context } = requestContextMock.createTools();
    core = context.core as unknown as Awaited<SecuritySolutionRequestHandlerContext['core']>;
    uiSettingsGet = context.core.uiSettings.client.get as unknown as jest.Mock;
    uiSettingsGet.mockResolvedValue([]);
  });

  it('returns valid with an undefined reason when status is not closed', async () => {
    const result = await validateClosingReason({ core, status: 'open', reason: 'false_positive' });

    expect(result).toEqual({ valid: true, reason: undefined });
  });

  it('does not read ui settings when status is not closed', async () => {
    await validateClosingReason({ core, status: 'open' });

    expect(uiSettingsGet).not.toHaveBeenCalled();
  });

  it('returns valid for a default closing reason', async () => {
    const result = await validateClosingReason({
      core,
      status: 'closed',
      reason: 'false_positive',
    });

    expect(result).toEqual({ valid: true, reason: 'false_positive' });
  });

  it('returns valid with an undefined reason when no reason is provided', async () => {
    const result = await validateClosingReason({ core, status: 'closed' });

    expect(result).toEqual({ valid: true, reason: undefined });
  });

  it('reads custom reasons from the advanced settings', async () => {
    uiSettingsGet.mockResolvedValue(['custom_close_reason']);

    await validateClosingReason({ core, status: 'closed', reason: 'custom_close_reason' });

    expect(uiSettingsGet).toHaveBeenCalledWith(DEFAULT_DETECTIONS_CLOSE_REASONS_KEY);
  });

  it('returns valid for a configured custom closing reason', async () => {
    uiSettingsGet.mockResolvedValue(['custom_close_reason']);

    const result = await validateClosingReason({
      core,
      status: 'closed',
      reason: 'custom_close_reason',
    });

    expect(result).toEqual({ valid: true, reason: 'custom_close_reason' });
  });

  it('returns invalid with an error message for an unknown closing reason', async () => {
    const result = await validateClosingReason({ core, status: 'closed', reason: 'not_valid' });

    expect(result).toEqual({
      valid: false,
      message: 'not_valid is an invalid closing reason.',
    });
  });
});
