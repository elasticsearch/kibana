/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mockTelemetryActions } from '../../../__mocks__/kea_logic';

import React from 'react';

import { screen, waitFor } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

// EnterpriseSearchContentPageTemplate is mocked to capture the pageChrome prop —
// breadcrumbs are set via kea side-effects and don't appear in the DOM directly.
jest.mock('../layout', () => ({
  EnterpriseSearchContentPageTemplate: jest.fn(({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )),
}));

import { EnterpriseSearchContentPageTemplate } from '../layout';

import { NotFound } from '.';

const MockedPageTemplate = jest.mocked(EnterpriseSearchContentPageTemplate);

describe('NotFound', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the shared not found prompt', () => {
    renderWithKibanaRenderContext(<NotFound />);

    expect(screen.getByText('404 error')).toBeInTheDocument();
  });

  it('renders a telemetry error event', async () => {
    renderWithKibanaRenderContext(<NotFound />);

    await waitFor(() => {
      expect(mockTelemetryActions.sendTelemetry).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'error', metric: 'not_found' })
      );
    });
  });

  it('passes optional preceding page chrome', () => {
    renderWithKibanaRenderContext(<NotFound pageChrome={['Search indices', 'some-index']} />);

    expect(MockedPageTemplate.mock.calls[0][0].pageChrome).toEqual([
      'Search indices',
      'some-index',
      '404',
    ]);
  });
});
