/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { I18nProvider } from '@kbn/i18n-react';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import { applicationServiceMock, uiSettingsServiceMock } from '@kbn/core/public/mocks';
import { lensPluginMock } from '@kbn/lens-plugin/public/mocks';
import { uiActionsPluginMock } from '@kbn/ui-actions-plugin/public/mocks';
import { AGENT_BUILDER_APP_ID } from '@kbn/deeplinks-agent-builder';
import { ESQLVariableType } from '@kbn/esql-types';
import type { ESQLControlVariable } from '@kbn/esql-types';
import type { AlertingV2KibanaServices } from './kibana_services';
import { AGENT_BUILDER_NEW_CONVERSATION_PATH, CREATE_WITH_AGENT_INITIAL_PROMPT } from './constants';

const createMockServices = (): AlertingV2KibanaServices => {
  const application = applicationServiceMock.createStartContract();
  application.capabilities = {
    ...application.capabilities,
    agentBuilder: {
      show: true,
      write: true,
      manageAgents: true,
      manageTools: true,
      manageSkills: true,
      isAdmin: true,
    },
  };
  const uiSettings = uiSettingsServiceMock.createStartContract();
  (uiSettings.get as jest.Mock).mockReturnValue(true);

  return {
    http: httpServiceMock.createStartContract(),
    data: dataPluginMock.createStartContract(),
    dataViews: dataViewPluginMocks.createStartContract(),
    notifications: notificationServiceMock.createStartContract(),
    application,
    lens: lensPluginMock.createStartContract(),
    uiActions: uiActionsPluginMock.createStartContract(),
    uiSettings,
    expressions: {} as AlertingV2KibanaServices['expressions'],
    container: {} as AlertingV2KibanaServices['container'],
  };
};

let capturedSelectorProps: Record<string, unknown> = {};
jest.mock('./components/rule_create_options/rule_create_options_flyout', () => ({
  RuleCreateOptionsFlyout: (props: Record<string, unknown>) => {
    capturedSelectorProps = props;
    return (
      <div data-test-subj="mockRuleCreateOptionsFlyout">
        <button data-test-subj="esqlBtn" onClick={props.onCreateEsqlRule as () => void} />
        <button data-test-subj="agentBtn" onClick={props.onCreateWithAgent as () => void} />
        <button
          data-test-subj="thresholdBtn"
          onClick={props.onCreateThresholdAlert as () => void}
        />
      </div>
    );
  },
}));

let capturedComposeProps: Record<string, unknown> = {};
jest.mock('@kbn/alerting-v2-rule-form', () => ({
  ComposeDiscoverFlyout: (props: Record<string, unknown>) => {
    capturedComposeProps = props;
    return <div data-test-subj="mockComposeDiscoverFlyout" />;
  },
}));

// Collects all pending resolvers from untilPluginStartServicesReady calls so the test
// can resolve both the useAsync call and the currentAppId$ effect in one go.
const pendingResolvers: Array<(services: AlertingV2KibanaServices) => void> = [];
const resolveServices = (services: AlertingV2KibanaServices) => {
  [...pendingResolvers].forEach((r) => r(services));
  pendingResolvers.length = 0;
};
jest.mock('./kibana_services', () => ({
  untilPluginStartServicesReady: () =>
    new Promise<AlertingV2KibanaServices>((resolve) => {
      pendingResolvers.push(resolve);
    }),
}));

jest.mock('./services/rules_api', () => ({
  RulesApi: jest.fn().mockImplementation(() => ({
    createRule: jest.fn(),
  })),
}));

import { CreateRuleOptionsFlyout } from './create_rule_options_flyout';
import { RulesApi } from './services/rules_api';

const renderFlyout = (props: Partial<React.ComponentProps<typeof CreateRuleOptionsFlyout>> = {}) =>
  render(
    <I18nProvider>
      <CreateRuleOptionsFlyout onClose={props.onClose ?? jest.fn()} {...props} />
    </I18nProvider>
  );

describe('CreateRuleOptionsFlyout', () => {
  let mockServices: AlertingV2KibanaServices;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedSelectorProps = {};
    capturedComposeProps = {};
    pendingResolvers.length = 0;
    mockServices = createMockServices();
  });

  describe('loading state', () => {
    it('shows a loading spinner inside a flyout while modules load', () => {
      renderFlyout();

      expect(screen.getByTestId('createAlertFlyoutLoading')).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.queryByTestId('mockRuleCreateOptionsFlyout')).not.toBeInTheDocument();
    });

    it('renders the selector flyout once services resolve', async () => {
      renderFlyout();
      resolveServices(mockServices);

      await waitFor(() => {
        expect(screen.getByTestId('mockRuleCreateOptionsFlyout')).toBeInTheDocument();
      });
    });
  });

  describe('selector → esql transition', () => {
    it('renders ComposeDiscoverFlyout when the ES|QL option is clicked', async () => {
      const onClose = jest.fn();
      renderFlyout({ onClose, initialQuery: 'FROM logs-*' });
      resolveServices(mockServices);

      await waitFor(() => {
        expect(screen.getByTestId('mockRuleCreateOptionsFlyout')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('esqlBtn'));

      await waitFor(() => {
        expect(screen.getByTestId('mockComposeDiscoverFlyout')).toBeInTheDocument();
      });
      expect(capturedComposeProps.initialQuery).toBe('FROM logs-*');
      expect(capturedComposeProps.mode).toBe('create');
      expect(capturedComposeProps.onClose).toBe(onClose);
      expect(capturedComposeProps.onCreateRule).toBeDefined();
    });

    it('passes esqlVariables through to ComposeDiscoverFlyout', async () => {
      const esqlVariables: ESQLControlVariable[] = [
        { key: 'host', value: 'web-1', type: ESQLVariableType.VALUES },
      ];
      renderFlyout({ initialQuery: 'FROM logs-* | WHERE host == ?host', esqlVariables });
      resolveServices(mockServices);

      await waitFor(() => {
        expect(screen.getByTestId('mockRuleCreateOptionsFlyout')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('esqlBtn'));

      await waitFor(() => {
        expect(screen.getByTestId('mockComposeDiscoverFlyout')).toBeInTheDocument();
      });
      expect(capturedComposeProps.esqlVariables).toBe(esqlVariables);
    });

    it('passes undefined initialQuery when initialQuery is not provided', async () => {
      renderFlyout();
      resolveServices(mockServices);

      await waitFor(() => {
        expect(screen.getByTestId('mockRuleCreateOptionsFlyout')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('esqlBtn'));

      await waitFor(() => {
        expect(screen.getByTestId('mockComposeDiscoverFlyout')).toBeInTheDocument();
      });
      expect(capturedComposeProps.initialQuery).toBeUndefined();
    });
  });

  describe('selector → threshold transition', () => {
    it('renders ComposeDiscoverFlyout when the threshold option is clicked', async () => {
      const onClose = jest.fn();
      renderFlyout({ onClose });
      resolveServices(mockServices);

      await waitFor(() => {
        expect(screen.getByTestId('mockRuleCreateOptionsFlyout')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('thresholdBtn'));

      await waitFor(() => {
        expect(screen.getByTestId('mockComposeDiscoverFlyout')).toBeInTheDocument();
      });
      expect(capturedComposeProps.mode).toBe('create');
      expect(capturedComposeProps.builderType).toBe('threshold');
      expect(capturedComposeProps.onClose).toBe(onClose);
    });
  });

  describe('selector → agent builder navigation', () => {
    it('navigates to agent builder and closes when the AI option is clicked', async () => {
      const onClose = jest.fn();
      renderFlyout({ onClose });
      resolveServices(mockServices);

      await waitFor(() => {
        expect(screen.getByTestId('mockRuleCreateOptionsFlyout')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('agentBtn'));

      expect(mockServices.application.navigateToApp).toHaveBeenCalledWith(AGENT_BUILDER_APP_ID, {
        path: AGENT_BUILDER_NEW_CONVERSATION_PATH,
        state: { initialMessage: CREATE_WITH_AGENT_INITIAL_PROMPT },
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not pass onCreateWithAgent when agentBuilder capability is missing', async () => {
      mockServices.application.capabilities = {
        ...mockServices.application.capabilities,
        agentBuilder: {
          show: false,
          write: false,
          manageAgents: false,
          manageTools: false,
          manageSkills: false,
          isAdmin: false,
        },
      };
      renderFlyout();
      resolveServices(mockServices);

      await waitFor(() => {
        expect(screen.getByTestId('mockRuleCreateOptionsFlyout')).toBeInTheDocument();
      });

      expect(capturedSelectorProps.onCreateWithAgent).toBeUndefined();
    });

    it('does not pass onCreateWithAgent when experimental features are disabled', async () => {
      (mockServices.uiSettings.get as jest.Mock).mockReturnValue(false);
      renderFlyout();
      resolveServices(mockServices);

      await waitFor(() => {
        expect(screen.getByTestId('mockRuleCreateOptionsFlyout')).toBeInTheDocument();
      });

      expect(capturedSelectorProps.onCreateWithAgent).toBeUndefined();
    });
  });

  describe('selector → legacy transition', () => {
    it('renders the legacy rule type when its option is clicked', async () => {
      const legacyRender = jest.fn((_onClose: () => void) => (
        <div data-test-subj="mockLegacyFlyout" />
      ));

      renderFlyout({
        legacyRuleTypes: [
          { id: 'search-threshold', label: 'Search threshold rule', render: legacyRender },
        ],
      });
      resolveServices(mockServices);

      await waitFor(() => {
        expect(screen.getByTestId('mockRuleCreateOptionsFlyout')).toBeInTheDocument();
      });

      const legacyItems = capturedSelectorProps.legacyRuleTypes as Array<{
        onClick: () => void;
      }>;
      expect(legacyItems).toHaveLength(1);

      act(() => {
        legacyItems[0].onClick();
      });

      await waitFor(() => {
        expect(screen.getByTestId('mockLegacyFlyout')).toBeInTheDocument();
      });
      expect(legacyRender).toHaveBeenCalled();
    });
  });

  describe('navigation guard', () => {
    it('closes flyout when pathname changes', () => {
      const onClose = jest.fn();
      const history = createMemoryHistory({ initialEntries: ['/app/discover'] });
      renderFlyout({ onClose, history });

      act(() => {
        history.push('/app/dashboards');
      });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does NOT close flyout when only query parameters change', () => {
      const onClose = jest.fn();
      const history = createMemoryHistory({ initialEntries: ['/app/discover'] });
      renderFlyout({ onClose, history });

      act(() => {
        history.push('/app/discover?q=newQuery');
      });

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('handleCreateRule', () => {
    it('shows a success toast and closes on successful rule creation', async () => {
      const onClose = jest.fn();
      const mockCreateRule = jest.fn().mockResolvedValue({
        metadata: { name: 'My test rule' },
      });
      (RulesApi as jest.Mock).mockImplementation(() => ({
        createRule: mockCreateRule,
      }));

      renderFlyout({ onClose });
      resolveServices(mockServices);

      await waitFor(() => {
        expect(screen.getByTestId('mockRuleCreateOptionsFlyout')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('thresholdBtn'));

      await waitFor(() => {
        expect(screen.getByTestId('mockComposeDiscoverFlyout')).toBeInTheDocument();
      });

      const onCreateRule = capturedComposeProps.onCreateRule as (payload: unknown) => Promise<void>;
      await act(async () => {
        await onCreateRule({ name: 'My test rule' });
      });

      expect(mockCreateRule).toHaveBeenCalledWith({ name: 'My test rule' });
      expect(mockServices.notifications.toasts.addSuccess).toHaveBeenCalledWith(
        expect.stringContaining('My test rule')
      );
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('shows an error toast on failed rule creation', async () => {
      const onClose = jest.fn();
      const mockCreateRule = jest.fn().mockRejectedValue(new Error('network error'));
      (RulesApi as jest.Mock).mockImplementation(() => ({
        createRule: mockCreateRule,
      }));

      renderFlyout({ onClose });
      resolveServices(mockServices);

      await waitFor(() => {
        expect(screen.getByTestId('mockRuleCreateOptionsFlyout')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('thresholdBtn'));

      await waitFor(() => {
        expect(screen.getByTestId('mockComposeDiscoverFlyout')).toBeInTheDocument();
      });

      const onCreateRule = capturedComposeProps.onCreateRule as (payload: unknown) => Promise<void>;
      await act(async () => {
        await onCreateRule({ name: 'Bad rule' });
      });

      expect(mockServices.notifications.toasts.addDanger).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create rule')
      );
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
