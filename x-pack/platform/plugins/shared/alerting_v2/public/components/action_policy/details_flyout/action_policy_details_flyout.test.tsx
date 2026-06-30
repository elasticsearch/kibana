/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ActionPolicyResponse } from '@kbn/alerting-v2-schemas';
import { I18nProvider } from '@kbn/i18n-react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { ActionPolicyDetailsFlyout } from './action_policy_details_flyout';

const ELASTIC_UID = 'elastic_uid';

const mockBulkGet = jest.fn();

jest.mock('@kbn/core-di-browser', () => ({
  useService: (token: unknown) => {
    if (token === 'application') {
      return {
        getUrlForApp: (appId: string, { path }: { path: string }) => `/app/${appId}${path}`,
      };
    }
    if (token === 'settings') {
      return {
        client: { get: () => 'YYYY-MM-DD HH:mm' },
      };
    }
    if (token === 'userProfile') {
      return { bulkGet: mockBulkGet };
    }
    if (token === 'http') {
      return {
        basePath: { prepend: (path: string) => `/base${path}` },
      };
    }
    return {};
  },
  CoreStart: (key: string) => key,
}));

jest.mock('../../../hooks/use_fetch_workflow', () => ({
  useFetchWorkflow: (id: string) => ({
    data: { id, name: `Workflow ${id}` },
    isLoading: false,
  }),
}));

const TEST_SUBJ = {
  flyout: 'actionPolicyDetailsFlyout',
  title: 'actionPolicyDetailsFlyoutTitle',
  closeButton: 'detailsFlyoutCloseButton',
  editButton: 'detailsFlyoutEditButton',
  actionsMenuButton: 'detailsFlyoutActionsMenuButton',
} as const;

const futureIso = (): string => new Date(Date.now() + 1000 * 60 * 60).toISOString();

const createPolicy = (overrides: Partial<ActionPolicyResponse> = {}): ActionPolicyResponse => ({
  id: 'policy-1',
  version: 'v1',
  name: 'Critical alerts policy',
  description: 'Routes critical alerts to the oncall workflow',
  enabled: true,
  destinations: [
    { type: 'workflow', id: 'wf-1' },
    { type: 'workflow', id: 'wf-2' },
  ],
  matcher: 'data.severity : "critical"',
  groupBy: ['host.name', 'service.name'],
  tags: ['production', 'oncall'],
  groupingMode: 'per_field',
  throttle: { strategy: 'time_interval', interval: '5m' },
  snoozedUntil: null,
  auth: { owner: 'elastic', createdByUser: true },
  createdBy: ELASTIC_UID,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedBy: ELASTIC_UID,
  updatedAt: '2026-03-02T11:00:00.000Z',
  ...overrides,
});

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

interface RenderProps {
  policy?: ActionPolicyResponse;
  onClose?: jest.Mock;
  onEdit?: jest.Mock;
  onClone?: jest.Mock;
  onDelete?: jest.Mock;
  onEnable?: jest.Mock;
  onDisable?: jest.Mock;
  onSnooze?: jest.Mock;
  onCancelSnooze?: jest.Mock;
  onUpdateApiKey?: jest.Mock;
}

const renderFlyout = (props: RenderProps = {}) => {
  const policy = props.policy ?? createPolicy();
  const handlers = {
    onClose: props.onClose ?? jest.fn(),
    onEdit: props.onEdit ?? jest.fn(),
    onClone: props.onClone ?? jest.fn(),
    onDelete: props.onDelete ?? jest.fn(),
    onEnable: props.onEnable ?? jest.fn(),
    onDisable: props.onDisable ?? jest.fn(),
    onSnooze: props.onSnooze ?? jest.fn(),
    onCancelSnooze: props.onCancelSnooze ?? jest.fn(),
    onUpdateApiKey: props.onUpdateApiKey ?? jest.fn(),
  };

  render(
    <QueryClientProvider client={createQueryClient()}>
      <I18nProvider>
        <ActionPolicyDetailsFlyout policy={policy} {...handlers} />
      </I18nProvider>
    </QueryClientProvider>
  );

  return { policy, handlers };
};

describe('ActionPolicyDetailsFlyout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBulkGet.mockResolvedValue([
      { uid: ELASTIC_UID, user: { username: 'elastic', full_name: 'Elastic User' } },
    ]);
  });

  describe('header', () => {
    it('renders the policy name and enabled state badge', () => {
      renderFlyout();

      expect(screen.getByTestId(TEST_SUBJ.flyout)).toBeInTheDocument();
      expect(screen.getByTestId(TEST_SUBJ.title)).toHaveTextContent('Critical alerts policy');
      expect(screen.getByText('Enabled')).toBeInTheDocument();
    });

    it('renders a disabled state badge when the policy is disabled', () => {
      renderFlyout({ policy: createPolicy({ enabled: false }) });

      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });

    it('renders a snoozed-until chip when the policy is actively snoozed', () => {
      renderFlyout({ policy: createPolicy({ snoozedUntil: futureIso() }) });

      expect(screen.getByText(/Snoozed until/i)).toBeInTheDocument();
    });

    it('does not render a snoozed-until chip when snoozedUntil is null or in the past', () => {
      renderFlyout({ policy: createPolicy({ snoozedUntil: null }) });
      expect(screen.queryByText(/Snoozed until/i)).not.toBeInTheDocument();
    });
  });

  describe('body sections', () => {
    it('renders all basic information fields for a fully-populated policy', () => {
      renderFlyout();

      expect(screen.getByText('Routes critical alerts to the oncall workflow')).toBeInTheDocument();
      expect(screen.getByText('production')).toBeInTheDocument();
    });

    it('renders a expandable list of tags when there are more than one', () => {
      renderFlyout();

      expect(screen.getByText('production')).toBeInTheDocument();
      expect(screen.getByText('+1')).toBeInTheDocument();
    });

    it('opens the tags popover when the "+N" button is clicked', async () => {
      const user = userEvent.setup();
      renderFlyout();

      await user.click(screen.getByText('+1'));

      expect(screen.getByText('oncall')).toBeInTheDocument();
    });

    it('renders the matcher as the KQL string when provided', () => {
      renderFlyout();

      expect(screen.getByText('data.severity : "critical"')).toBeInTheDocument();
    });

    it('renders a fallback when the matcher is null', () => {
      renderFlyout({ policy: createPolicy({ matcher: null }) });

      expect(screen.getByText(/Matches all alerts/i)).toBeInTheDocument();
    });

    it('renders the dispatch grouping mode and throttle labels', () => {
      renderFlyout();

      expect(screen.getByText('Group')).toBeInTheDocument();
      expect(screen.getByText('At most once every...')).toBeInTheDocument();
      expect(screen.getByText('host.name')).toBeInTheDocument();
      expect(screen.getByText('service.name')).toBeInTheDocument();
    });

    it('does not render the group-by row when grouping mode is per_episode', () => {
      renderFlyout({
        policy: createPolicy({
          groupingMode: 'per_episode',
          groupBy: null,
          throttle: { strategy: 'on_status_change', interval: null },
        }),
      });

      expect(screen.queryByText('host.name')).not.toBeInTheDocument();
    });

    it('renders each destination with its workflow name', () => {
      renderFlyout();

      expect(screen.getByText('Workflow wf-1')).toBeInTheDocument();
      expect(screen.getByText('Workflow wf-2')).toBeInTheDocument();
    });

    it('resolves createdBy / updatedBy UIDs to user full names in the metadata section', async () => {
      renderFlyout();

      const elements = await screen.findAllByText('Elastic User');
      expect(elements).toHaveLength(2);
      elements.forEach((element) => expect(element).toBeInTheDocument());
    });

    it('falls back to the username when a profile has no full name', async () => {
      mockBulkGet.mockResolvedValueOnce([{ uid: ELASTIC_UID, user: { username: 'elastic' } }]);
      renderFlyout();

      const elements = await screen.findAllByText('elastic');
      expect(elements).toHaveLength(2);
      elements.forEach((element) => expect(element).toBeInTheDocument());
    });

    it('falls back to the UID when no matching profile is returned', async () => {
      mockBulkGet.mockResolvedValueOnce([]);
      renderFlyout();

      const elements = await screen.findAllByText(ELASTIC_UID);
      expect(elements).toHaveLength(2);
      elements.forEach((element) => expect(element).toBeInTheDocument());
    });
  });

  describe('footer actions', () => {
    it('calls onClose when the Close button is clicked', async () => {
      const user = userEvent.setup();
      const { handlers } = renderFlyout();

      await user.click(screen.getByTestId(TEST_SUBJ.closeButton));

      expect(handlers.onClose).toHaveBeenCalledTimes(1);
    });

    it('closes the flyout and calls onEdit when Edit is clicked', async () => {
      const user = userEvent.setup();
      const { handlers } = renderFlyout();

      await user.click(screen.getByTestId(TEST_SUBJ.editButton));

      expect(handlers.onClose).toHaveBeenCalledTimes(1);
      expect(handlers.onEdit).toHaveBeenCalledWith('policy-1');
    });
  });

  describe('actions menu', () => {
    it('renders the actions menu trigger next to the close icon', () => {
      renderFlyout();

      expect(screen.getByTestId(TEST_SUBJ.actionsMenuButton)).toBeInTheDocument();
    });

    it('calls onClone without closing the flyout', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const { handlers, policy } = renderFlyout();

      await user.click(screen.getByTestId(TEST_SUBJ.actionsMenuButton));
      await user.click(screen.getByText('Clone'));

      expect(handlers.onClone).toHaveBeenCalledWith(policy);
      expect(handlers.onClose).not.toHaveBeenCalled();
    });

    it('calls onDelete without closing the flyout', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const { handlers, policy } = renderFlyout();

      await user.click(screen.getByTestId(TEST_SUBJ.actionsMenuButton));
      await user.click(screen.getByText('Delete'));

      expect(handlers.onDelete).toHaveBeenCalledWith(policy);
      expect(handlers.onClose).not.toHaveBeenCalled();
    });

    it('calls onDisable without closing the flyout when Disable is selected on an enabled policy', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const { handlers, policy } = renderFlyout();

      await user.click(screen.getByTestId(TEST_SUBJ.actionsMenuButton));
      await user.click(screen.getByText('Disable'));

      expect(handlers.onDisable).toHaveBeenCalledWith(policy.id);
      expect(handlers.onClose).not.toHaveBeenCalled();
    });

    it('calls onEnable without closing the flyout when Enable is selected on a disabled policy', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const { handlers, policy } = renderFlyout({ policy: createPolicy({ enabled: false }) });

      await user.click(screen.getByTestId(TEST_SUBJ.actionsMenuButton));
      await user.click(screen.getByText('Enable'));

      expect(handlers.onEnable).toHaveBeenCalledWith(policy.id);
      expect(handlers.onClose).not.toHaveBeenCalled();
    });

    it('calls onUpdateApiKey without closing the flyout', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const { handlers, policy } = renderFlyout();

      await user.click(screen.getByTestId(TEST_SUBJ.actionsMenuButton));
      await user.click(screen.getByText('Update API key'));

      expect(handlers.onUpdateApiKey).toHaveBeenCalledWith(policy.id);
      expect(handlers.onClose).not.toHaveBeenCalled();
    });
  });
});
