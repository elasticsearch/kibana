/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mockTelemetryActions } from '../../__mocks__/kea_logic';

import React from 'react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { SendEnterpriseSearchTelemetry } from '.';

describe('Telemetry component helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('SendEnterpriseSearchTelemetry', () => {
    renderWithKibanaRenderContext(<SendEnterpriseSearchTelemetry action="viewed" metric="page" />);

    expect(mockTelemetryActions.sendTelemetry).toHaveBeenCalledWith({
      action: 'viewed',
      metric: 'page',
      product: 'enterprise_search',
    });
  });
});
