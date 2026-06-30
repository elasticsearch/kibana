/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { merge } from 'lodash';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { APM_INDEX_PATTERN_MAX_LENGTH } from '@kbn/apm-sources-access-plugin/public';
import type { ApmPluginContextValue } from '../../../../context/apm_plugin/apm_plugin_context';
import {
  MockApmPluginContextWrapper,
  mockApmPluginContextValue,
} from '../../../../context/apm_plugin/mock_apm_plugin_context';
import * as hooks from '../../../../hooks/use_fetcher';
import { FETCH_STATUS } from '../../../../hooks/use_fetcher';
import { ApmIndices } from '.';

const saveApmIndices = jest.fn();
const addDanger = jest.fn();

const apmIndexSettings = [
  {
    configurationName: 'error',
    defaultValue: 'logs-apm*,apm-*,logs-*.otel-*',
    savedValue: undefined,
  },
  {
    configurationName: 'onboarding',
    defaultValue: 'apm-*',
    savedValue: undefined,
  },
  {
    configurationName: 'span',
    defaultValue: 'traces-apm*,apm-*,traces-*.otel-*',
    savedValue: undefined,
  },
  {
    configurationName: 'transaction',
    defaultValue: 'traces-apm*,apm-*,traces-*.otel-*',
    savedValue: undefined,
  },
  {
    configurationName: 'metric',
    defaultValue: 'metrics-apm*,apm-*,metrics-*.otel-*',
    savedValue: undefined,
  },
] as const;

function getMockApmContext() {
  return merge({}, mockApmPluginContextValue, {
    core: {
      ...mockApmPluginContextValue.core,
      notifications: {
        toasts: {
          addDanger,
          addSuccess: jest.fn(),
        },
      },
      application: {
        capabilities: {
          apm: { 'settings:save': true },
          ml: {},
          savedObjectsManagement: { edit: true },
        },
      },
      apmSourcesAccess: {
        saveApmIndices,
      },
      spaces: {},
    },
  }) as unknown as ApmPluginContextValue;
}

describe('ApmIndices', () => {
  const mockContext = getMockApmContext();

  beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(hooks, 'useFetcher').mockImplementation((_, fnDeps) => {
      if (fnDeps[0] === (mockContext.core as any).apmSourcesAccess) {
        return {
          data: { apmIndexSettings },
          status: FETCH_STATUS.SUCCESS,
          refetch: jest.fn(),
        };
      }

      return {
        data: undefined,
        status: FETCH_STATUS.SUCCESS,
        refetch: jest.fn(),
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function renderComponent() {
    return render(
      <MockApmPluginContextWrapper value={mockContext}>
        <IntlProvider locale="en">
          <ApmIndices />
        </IntlProvider>
      </MockApmPluginContextWrapper>
    );
  }

  it('shows a field error and disables save when an index value is too long', async () => {
    const { container } = renderComponent();

    const errorInput = container.querySelector<HTMLInputElement>('input[name="error"]');
    expect(errorInput).not.toBeNull();

    fireEvent.change(errorInput!, {
      target: { name: 'error', value: 'a'.repeat(APM_INDEX_PATTERN_MAX_LENGTH + 1) },
    });

    expect(
      screen.getByText(`Must be ${APM_INDEX_PATTERN_MAX_LENGTH} characters or fewer`)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
  });

  it('surfaces the backend message in the danger toast when save fails', async () => {
    saveApmIndices.mockRejectedValue({
      body: { message: 'error must be 1000 characters or fewer' },
      message: 'Bad Request',
    });

    const { container } = renderComponent();

    const errorInput = container.querySelector<HTMLInputElement>('input[name="error"]');
    expect(errorInput).not.toBeNull();

    fireEvent.change(errorInput!, {
      target: { name: 'error', value: 'logs-*' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));

    await waitFor(() => {
      expect(addDanger).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('error must be 1000 characters or fewer'),
        })
      );
    });
  });
});
