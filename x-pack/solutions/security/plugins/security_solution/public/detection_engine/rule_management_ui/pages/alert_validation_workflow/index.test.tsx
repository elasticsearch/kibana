/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { coreMock } from '@kbn/core/public/mocks';
import { TestProviders } from '../../../../common/mock';
import { createStartServicesMock } from '../../../../common/lib/kibana/kibana_react.mock';
import {
  ALERT_VALIDATION_WORKFLOW_API_VERSION,
  ALERT_VALIDATION_WORKFLOW_SETTINGS_ROUTE,
} from './api';
import { AlertValidationWorkflowPage } from '.';

jest.mock('../../../../common/containers/use_full_screen', () => ({
  useGlobalFullScreen: () => ({
    globalFullScreen: false,
    setGlobalFullScreen: jest.fn(),
  }),
}));

describe('AlertValidationWorkflowPage', () => {
  const coreStart = coreMock.createStart();

  const renderComponent = () => {
    coreStart.application.capabilities = {
      ...coreStart.application.capabilities,
      advancedSettings: { show: true, save: true },
      securitySolution: { show: true, crud: true },
    };
    coreStart.application.getUrlForApp.mockImplementation(
      (appId, options) => `/app/${appId}${options?.path ?? ''}`
    );
    coreStart.featureFlags.getBooleanValue.mockReturnValue(true);
    coreStart.http.fetch.mockImplementation(async (...args: unknown[]) => {
      const [path, options] = args as [string, { method?: string; body?: string } | undefined];

      if (path === ALERT_VALIDATION_WORKFLOW_SETTINGS_ROUTE) {
        const settings =
          options?.method === 'PUT'
            ? JSON.parse(options.body as string)
            : {
                autoCloseEnabled: true,
                autoCloseConfidenceScoreMinThreshold: 0.85,
                autoCloseConfidenceScoreMaxThreshold: 1,
              };

        return {
          settings,
          installed: options?.method === 'PUT',
          workflowId: 'system-security-alert-validation-default',
        };
      }

      return {
        page: 1,
        perPage: 5,
        total: 0,
        attached: 0,
        rules: [],
      };
    });

    return render(
      <MemoryRouter>
        <TestProviders startServices={createStartServicesMock(coreStart)}>
          <AlertValidationWorkflowPage />
        </TestProviders>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves changed settings through the Security route', async () => {
    renderComponent();

    expect(await screen.findByText('Alert analysis workflow')).toBeInTheDocument();
    expect(await screen.findByTestId('alertValidationWorkflowLink')).toHaveAttribute(
      'href',
      '/app/workflows/system-security-alert-validation-default'
    );

    const autoCloseSwitch = await screen.findByTestId('alertValidationWorkflowAutoCloseEnabled');
    fireEvent.click(autoCloseSwitch);

    const saveButton = await screen.findByTestId('alertValidationWorkflowSaveButton');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(coreStart.http.fetch).toHaveBeenCalledWith(ALERT_VALIDATION_WORKFLOW_SETTINGS_ROUTE, {
        method: 'PUT',
        version: ALERT_VALIDATION_WORKFLOW_API_VERSION,
        body: JSON.stringify({
          autoCloseEnabled: false,
          autoCloseConfidenceScoreMinThreshold: 0.85,
          autoCloseConfidenceScoreMaxThreshold: 1,
        }),
      });
    });
  });
});
