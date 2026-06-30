/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import type { RuleApiResponse } from '../services/rules_api';

const mockCreateMutate = jest.fn();
const mockUpdateMutate = jest.fn();
const mockSetupMutate = jest.fn();

let capturedFlyoutProps: Record<string, unknown> = {};

jest.mock('@kbn/alerting-v2-rule-form', () => ({
  ComposeDiscoverFlyout: (props: Record<string, unknown>) => {
    capturedFlyoutProps = props;
    return <div data-test-subj="mockComposeDiscoverFlyout" />;
  },
  RULE_BUILDER_REGISTRY: {},
}));

jest.mock('./use_create_rule', () => ({
  useCreateRule: () => ({ mutate: mockCreateMutate, isLoading: false }),
}));
jest.mock('./use_update_rule', () => ({
  useUpdateRule: () => ({ mutate: mockUpdateMutate, isLoading: false }),
}));
jest.mock('./use_setup_rule_notifications', () => ({
  useSetupRuleNotifications: () => ({ mutate: mockSetupMutate, isLoading: false }),
}));

const mockNavigateToUrl = jest.fn();

jest.mock('@kbn/core-di', () => ({
  PluginStart: (key: string) => `plugin:${key}`,
}));
jest.mock('@kbn/core-di-browser', () => ({
  CoreStart: (key: string) => `core:${key}`,
  useService: (key: string) => {
    switch (key) {
      case 'core:http':
        return { basePath: { prepend: (path: string) => path } };
      case 'core:notifications':
        return { toasts: { addWarning: jest.fn(), addInfo: jest.fn() } };
      case 'core:application':
        return { navigateToUrl: mockNavigateToUrl };
      default:
        return {};
    }
  },
}));

import { useComposeDiscoverFlyout } from './use_compose_discover_flyout';

const editRule = {
  id: 'rule-1',
  metadata: { name: 'My rule' },
} as unknown as RuleApiResponse;

const updatedRule = {
  id: 'rule-1',
  metadata: { name: 'My rule (updated)' },
} as unknown as RuleApiResponse;

const createdRule = {
  id: 'rule-new',
  metadata: { name: 'My rule' },
} as unknown as RuleApiResponse;

const REDIRECT_PATH = '/app/alerting_v2/rules';

const existingAction = { id: 'a1', source: 'existing' as const, workflowId: 'wf-1' };

let hookApi: ReturnType<typeof useComposeDiscoverFlyout> | undefined;

const Harness = ({ redirectPath }: { redirectPath?: string }) => {
  const api = useComposeDiscoverFlyout({ createSuccessRedirectPath: redirectPath });
  hookApi = api;
  return <>{api.flyout}</>;
};

const renderAndOpenCreate = async (redirectPath?: string) => {
  render(<Harness redirectPath={redirectPath} />);
  act(() => {
    hookApi!.openCreateFlyout();
  });
  await waitFor(() => {
    expect(screen.getByTestId('mockComposeDiscoverFlyout')).toBeInTheDocument();
  });
};

const callOnCreateRule = (notifications?: unknown) => {
  const onCreateRule = capturedFlyoutProps.onCreateRule as (
    payload: unknown,
    notifications?: unknown
  ) => void;
  act(() => {
    onCreateRule({ metadata: { name: 'My rule' } }, notifications);
  });
};

const renderAndOpenEdit = async () => {
  render(<Harness />);
  act(() => {
    hookApi!.openEditFlyout(editRule);
  });
  await waitFor(() => {
    expect(screen.getByTestId('mockComposeDiscoverFlyout')).toBeInTheDocument();
  });
};

const callOnUpdateRule = (notifications?: unknown) => {
  const onUpdateRule = capturedFlyoutProps.onUpdateRule as (
    id: string,
    payload: unknown,
    notifications?: unknown
  ) => void;
  act(() => {
    onUpdateRule('rule-1', { metadata: { name: 'My rule (updated)' } }, notifications);
  });
};

describe('useComposeDiscoverFlyout — create submission wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedFlyoutProps = {};
    hookApi = undefined;
    mockCreateMutate.mockImplementation((_payload, opts) => opts?.onSuccess?.(createdRule));
  });

  it('opens in create mode with no ruleId and provides onCreateRule', async () => {
    await renderAndOpenCreate();

    expect(capturedFlyoutProps.mode).toBe('create');
    expect(capturedFlyoutProps.ruleId).toBeUndefined();
    expect(capturedFlyoutProps.onCreateRule).toBeDefined();
  });

  it('creates the rule then sets up notifications and redirects on success', async () => {
    mockSetupMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());

    await renderAndOpenCreate(REDIRECT_PATH);
    callOnCreateRule({ workflows: [existingAction] });

    expect(mockCreateMutate).toHaveBeenCalledWith(
      { metadata: { name: 'My rule' } },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(mockSetupMutate).toHaveBeenCalledWith(
      { rule: createdRule, actions: [existingAction] },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );

    await waitFor(() => {
      expect(mockNavigateToUrl).toHaveBeenCalledWith(REDIRECT_PATH);
      expect(screen.queryByTestId('mockComposeDiscoverFlyout')).not.toBeInTheDocument();
    });
  });

  it('still redirects when notification setup fails (unlike edit, which stays open)', async () => {
    mockSetupMutate.mockImplementation((_vars, opts) => opts?.onError?.(new Error('setup failed')));

    await renderAndOpenCreate(REDIRECT_PATH);
    callOnCreateRule({ workflows: [existingAction] });

    expect(mockSetupMutate).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(mockNavigateToUrl).toHaveBeenCalledWith(REDIRECT_PATH);
      expect(screen.queryByTestId('mockComposeDiscoverFlyout')).not.toBeInTheDocument();
    });
  });

  it('redirects without setting up notifications when there are no actions', async () => {
    await renderAndOpenCreate(REDIRECT_PATH);
    callOnCreateRule(undefined);

    expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    expect(mockSetupMutate).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(mockNavigateToUrl).toHaveBeenCalledWith(REDIRECT_PATH);
      expect(screen.queryByTestId('mockComposeDiscoverFlyout')).not.toBeInTheDocument();
    });
  });
});

describe('useComposeDiscoverFlyout — edit submission wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedFlyoutProps = {};
    hookApi = undefined;
    // The rule update is an idempotent PATCH; default it to succeed with the updated rule.
    mockUpdateMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.(updatedRule));
  });

  it('passes ruleId only in edit mode and provides onUpdateRule', async () => {
    await renderAndOpenEdit();

    expect(capturedFlyoutProps.mode).toBe('edit');
    expect(capturedFlyoutProps.ruleId).toBe('rule-1');
    expect(capturedFlyoutProps.onUpdateRule).toBeDefined();
  });

  it('updates the rule then sets up notifications and closes on success', async () => {
    mockSetupMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());

    await renderAndOpenEdit();
    callOnUpdateRule({ workflows: [existingAction] });

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      { id: 'rule-1', payload: { metadata: { name: 'My rule (updated)' } } },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(mockSetupMutate).toHaveBeenCalledWith(
      { rule: updatedRule, actions: [existingAction] },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );

    await waitFor(() => {
      expect(screen.queryByTestId('mockComposeDiscoverFlyout')).not.toBeInTheDocument();
    });
  });

  it('keeps the flyout open when notification setup does not succeed', async () => {
    mockSetupMutate.mockImplementation(() => undefined);

    await renderAndOpenEdit();
    callOnUpdateRule({ workflows: [existingAction] });

    expect(mockSetupMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('mockComposeDiscoverFlyout')).toBeInTheDocument();
  });

  it('closes without setting up notifications when there are no actions', async () => {
    await renderAndOpenEdit();
    callOnUpdateRule(undefined);

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    expect(mockSetupMutate).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByTestId('mockComposeDiscoverFlyout')).not.toBeInTheDocument();
    });
  });

  it('does not set up notifications when the workflows list is empty', async () => {
    await renderAndOpenEdit();
    callOnUpdateRule({ workflows: [] });

    expect(mockSetupMutate).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByTestId('mockComposeDiscoverFlyout')).not.toBeInTheDocument();
    });
  });
});
