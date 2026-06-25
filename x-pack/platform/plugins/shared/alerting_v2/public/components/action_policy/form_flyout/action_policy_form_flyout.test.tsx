/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ActionPolicyResponse } from '@kbn/alerting-v2-schemas';
import { I18nProvider } from '@kbn/i18n-react';
import { ActionPolicyFormFlyout } from './action_policy_form_flyout';

jest.mock('@kbn/core-di-browser', () => ({
  useService: (token: unknown) => {
    if (token === 'application') {
      return {
        getUrlForApp: (appId: string, { path }: { path: string }) => `/app/${appId}${path}`,
      };
    }
    if (token === 'uiSettings') {
      return { get: () => true };
    }
    return {};
  },
  CoreStart: (key: string) => key,
}));

jest.mock('../form/components/matcher_input', () => ({
  MatcherInput: (props: {
    value: string;
    onChange: (v: string) => void;
    'data-test-subj'?: string;
  }) => (
    <input
      data-test-subj={props['data-test-subj']}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    />
  ),
}));

jest.mock('../../../hooks/use_fetch_data_fields', () => ({
  useFetchDataFields: (_matcher?: string) => ({ data: undefined, isLoading: false }),
}));

jest.mock('../../../hooks/use_fetch_rules', () => ({
  useFetchRules: () => ({ data: { items: [], total: 0 }, isLoading: false }),
}));

jest.mock('../../../hooks/use_fetch_rule_tags', () => ({
  useFetchRuleTags: () => ({ data: [], isLoading: false }),
}));

jest.mock('../../../hooks/use_fetch_tags', () => ({
  useFetchTags: () => ({ data: [], isLoading: false }),
}));

jest.mock('../../../hooks/use_fetch_workflows', () => ({
  useFetchWorkflows: () => ({
    data: {
      results: [
        {
          id: 'wf-1',
          name: 'Test Workflow',
          description: '',
          enabled: true,
          definition: null,
          createdAt: '',
          history: [],
          valid: true,
        },
      ],
      total: 1,
      page: 1,
      size: 100,
    },
    isLoading: false,
  }),
}));

const TEST_SUBJ = {
  title: 'title',
  cancelButton: 'cancelButton',
  submitButton: 'submitButton',
  nameInput: 'nameInput',
  descriptionInput: 'descriptionInput',
} as const;

const renderFlyout = ({
  onClose = jest.fn(),
  onSave,
  onUpdate,
  initialValues,
}: {
  onClose?: jest.Mock;
  onSave?: jest.Mock;
  onUpdate?: jest.Mock;
  initialValues?: ActionPolicyResponse;
}) => {
  return render(
    <I18nProvider>
      <ActionPolicyFormFlyout
        onClose={onClose}
        onSave={onSave}
        onUpdate={onUpdate}
        initialValues={initialValues}
      />
    </I18nProvider>
  );
};

describe('ActionPolicyFormFlyout', () => {
  it('renders create mode and closes on cancel', async () => {
    const user = userEvent.setup({ delay: null });
    const onClose = jest.fn();

    renderFlyout({ onClose, onSave: jest.fn() });

    expect(screen.getByTestId(TEST_SUBJ.title)).toHaveTextContent('Create action policy');
    expect(screen.getByTestId(TEST_SUBJ.submitButton)).toHaveTextContent('Create policy');

    await user.click(screen.getByTestId(TEST_SUBJ.cancelButton));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('submits create payload and omits optional empty fields', async () => {
    const user = userEvent.setup({ delay: null });
    const onSave = jest.fn();

    renderFlyout({ onClose: jest.fn(), onSave });

    await user.type(screen.getByTestId(TEST_SUBJ.nameInput), 'Policy from test');
    await user.tab();
    await user.type(screen.getByTestId(TEST_SUBJ.descriptionInput), 'Description from test');
    await user.tab();

    // Select a workflow destination (required field)
    const destinationsCombo = screen.getByTestId('destinationsInput');
    await user.click(within(destinationsCombo).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Test Workflow' }));

    const saveButton = screen.getByTestId(TEST_SUBJ.submitButton);
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      name: 'Policy from test',
      description: 'Description from test',
      groupingMode: 'per_episode',
      throttle: { strategy: 'on_status_change', interval: null },
      destinations: [{ type: 'workflow', id: 'wf-1' }],
    });
  });

  it('renders edit mode and submits update payload with optional fields and version', async () => {
    const user = userEvent.setup({ delay: null });
    const onUpdate = jest.fn();
    const initialValues: ActionPolicyResponse = {
      id: 'policy-1',
      version: 'WzEsMV0=',
      name: 'Critical production alerts',
      description: 'Routes critical alerts',
      enabled: true,
      matcher: 'data.severity : "critical"',
      groupBy: ['host.name', 'service.name'],
      tags: ['production'],
      groupingMode: 'per_field',
      throttle: { strategy: 'time_interval', interval: '5m' },
      snoozedUntil: null,
      destinations: [{ type: 'workflow', id: 'workflow-2' }],
      createdBy: 'elastic',
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedBy: 'elastic',
      updatedAt: '2026-03-01T10:00:00.000Z',
      auth: {
        owner: 'elastic',
        createdByUser: true,
      },
    };

    renderFlyout({ onClose: jest.fn(), onUpdate, initialValues });

    expect(screen.getByTestId(TEST_SUBJ.title)).toHaveTextContent('Edit action policy');
    expect(screen.getByTestId(TEST_SUBJ.submitButton)).toHaveTextContent('Update policy');

    await user.click(screen.getByTestId(TEST_SUBJ.nameInput));
    await user.tab();
    await user.click(screen.getByTestId(TEST_SUBJ.descriptionInput));
    await user.tab();

    const updateButton = screen.getByTestId(TEST_SUBJ.submitButton);
    await waitFor(() => expect(updateButton).toBeEnabled());
    await user.click(updateButton);

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith('policy-1', {
      version: 'WzEsMV0=',
      name: 'Critical production alerts',
      description: 'Routes critical alerts',
      groupingMode: 'per_field',
      tags: ['production'],
      matcher: 'data.severity : "critical"',
      groupBy: ['host.name', 'service.name'],
      throttle: { strategy: 'time_interval', interval: '5m' },
      destinations: [{ type: 'workflow', id: 'workflow-2' }],
    });
  });
});
