/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { DefaultAlertActions } from './default_alert_actions';
import { render, screen } from '@testing-library/react';
import type { AdditionalContext, AlertActionsProps, RenderContext } from '../types';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import { createPartialObjectMock, testQueryClientConfig } from '../utils/test';
import { AlertsTableContextProvider } from '../contexts/alerts_table_context';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { AlertsQueryContext } from '@kbn/alerts-ui-shared/src/common/contexts/alerts_query_context';
import { ALERT_RULE_TYPE_ID } from '@kbn/rule-data-utils';

jest.mock('@kbn/alerts-ui-shared/src/common/hooks/use_get_rule_types_permissions');

jest.mock('./view_rule_details_alert_action', () => {
  return {
    ViewRuleDetailsAlertAction: () => (
      <div data-test-subj="viewRuleDetailsAlertAction">{'ViewRuleDetailsAlertAction'}</div>
    ),
  };
});

jest.mock('./view_alert_details_alert_action', () => {
  return {
    ViewAlertDetailsAlertAction: () => (
      <div data-test-subj="viewAlertDetailsAlertAction">{'ViewAlertDetailsAlertAction'}</div>
    ),
  };
});

jest.mock('./snooze_alert_action', () => {
  return {
    SnoozeAlertAction: () => <div data-test-subj="snoozeAlertAction">{'SnoozeAlertAction'}</div>,
  };
});

jest.mock('./acknowledge_alert_action', () => {
  return {
    AcknowledgeAlertAction: () => (
      <div data-test-subj="acknowledgeAlertAction">{'AcknowledgeAlertAction'}</div>
    ),
  };
});

jest.mock('./mark_as_untracked_alert_action', () => {
  return {
    MarkAsUntrackedAlertAction: () => (
      <div data-test-subj="markAsUntrackedAlertAction">{'MarkAsUntrackedAlertAction'}</div>
    ),
  };
});

jest.mock('./edit_tags_action', () => {
  return {
    EditTagsAction: () => <div data-test-subj="editTagsAction">{'EditTagsAction'}</div>,
  };
});

jest.mock('../contexts/individual_tags_action_context', () => {
  const actual = jest.requireActual('../contexts/individual_tags_action_context');
  return {
    ...actual,
    useIndividualTagsActionContext: () => ({
      isFlyoutOpen: false,
      selectedAlerts: [],
      openFlyout: jest.fn(),
      onClose: jest.fn(),
      onSaveTags: jest.fn(),
      getAction: jest.fn(),
    }),
  };
});

const { useGetRuleTypesPermissions } = jest.requireMock(
  '@kbn/alerts-ui-shared/src/common/hooks/use_get_rule_types_permissions'
);

const http = httpServiceMock.createStartContract();
const notifications = notificationServiceMock.createStartContract();
const props = createPartialObjectMock<AlertActionsProps>({
  alert: {},
  refresh: jest.fn(),
});

const context = createPartialObjectMock<RenderContext<AdditionalContext>>({
  services: {
    http,
    notifications,
  },
});

const queryClient = new QueryClient(testQueryClientConfig);

const TestComponent = (_props: AlertActionsProps) => (
  <QueryClientProvider client={queryClient} context={AlertsQueryContext}>
    <AlertsTableContextProvider value={context}>
      <DefaultAlertActions<AdditionalContext> {..._props} />
    </AlertsTableContextProvider>
  </QueryClientProvider>
);

describe('DefaultAlertActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('with authorization to create rules', () => {
    beforeEach(() => {
      useGetRuleTypesPermissions.mockReturnValue({ authorizedToCreateAnyRules: true });
    });

    describe('for non-security rule types', () => {
      const nonSecurityProps = createPartialObjectMock<AlertActionsProps>({
        alert: {
          [ALERT_RULE_TYPE_ID]: 'apm.anomaly' as any,
        },
        refresh: jest.fn(),
      });
      const noRuleTypeProps = createPartialObjectMock<AlertActionsProps>({
        alert: {},
        refresh: jest.fn(),
      });

      it.each([nonSecurityProps, noRuleTypeProps])(
        'should show all modify options for rule type %s',
        async (standardProps) => {
          render(<TestComponent {...standardProps} />);

          expect(screen.queryByText('AcknowledgeAlertAction')).toBeInTheDocument();
          expect(screen.queryByText('SnoozeAlertAction')).toBeInTheDocument();
          expect(screen.queryByText('MarkAsUntrackedAlertAction')).toBeInTheDocument();
          expect(screen.queryByText('EditTagsAction')).toBeInTheDocument();
        }
      );

      it('should hide the Snooze alert action when isMutedAlertsEnabled is false', async () => {
        const mutedAlertsDisabledProps = createPartialObjectMock<AlertActionsProps>({
          alert: {
            [ALERT_RULE_TYPE_ID]: 'apm.anomaly' as any,
          },
          refresh: jest.fn(),
          isMutedAlertsEnabled: false,
        });

        render(<TestComponent {...mutedAlertsDisabledProps} />);

        expect(screen.queryByText('SnoozeAlertAction')).not.toBeInTheDocument();
        expect(screen.queryByText('MarkAsUntrackedAlertAction')).toBeInTheDocument();
        expect(screen.queryByText('EditTagsAction')).toBeInTheDocument();
      });
    });

    describe('for security rule types', () => {
      it.each(['siem.queryRule', 'siem.esqlRuleType', 'attack-discovery', 'siem.mlRule'])(
        'should hide all modify options for rule type %s',
        async (ruleTypeId) => {
          const securityProps = createPartialObjectMock<AlertActionsProps>({
            alert: {
              [ALERT_RULE_TYPE_ID]: ruleTypeId as any,
            },
            refresh: jest.fn(),
          });

          render(<TestComponent {...securityProps} />);

          expect(screen.queryByText('SnoozeAlertAction')).not.toBeInTheDocument();
          expect(screen.queryByText('MarkAsUntrackedAlertAction')).not.toBeInTheDocument();
          expect(screen.queryByText('EditTagsAction')).not.toBeInTheDocument();
        }
      );
    });

    describe('view-only actions', () => {
      it('should always show "View rule details" and "View alert details" for all rule types', async () => {
        render(<TestComponent {...props} />);

        expect(await screen.findByText('ViewRuleDetailsAlertAction')).toBeInTheDocument();
        expect(await screen.findByText('ViewAlertDetailsAlertAction')).toBeInTheDocument();
      });

      it('should show view actions for security rules even when modify options are hidden', async () => {
        const siemProps = createPartialObjectMock<AlertActionsProps>({
          alert: {
            [ALERT_RULE_TYPE_ID]: 'siem.queryRule' as any,
          },
          refresh: jest.fn(),
        });

        render(<TestComponent {...siemProps} />);

        expect(await screen.findByText('ViewRuleDetailsAlertAction')).toBeInTheDocument();
        expect(await screen.findByText('ViewAlertDetailsAlertAction')).toBeInTheDocument();
      });
    });
  });

  describe('without authorization to create rules', () => {
    beforeEach(() => {
      useGetRuleTypesPermissions.mockReturnValue({ authorizedToCreateAnyRules: false });
    });

    it('should hide "Snooze", "Marked as untracked", and "Edit tags" options for non-security rules', async () => {
      const nonSecurityProps = createPartialObjectMock<AlertActionsProps>({
        alert: {
          [ALERT_RULE_TYPE_ID]: 'apm.anomaly' as any,
        },
        refresh: jest.fn(),
      });

      render(<TestComponent {...nonSecurityProps} />);

      expect(screen.queryByText('SnoozeAlertAction')).not.toBeInTheDocument();
      expect(screen.queryByText('MarkAsUntrackedAlertAction')).not.toBeInTheDocument();
      expect(screen.queryByText('EditTagsAction')).not.toBeInTheDocument();
    });

    it('should hide all modify options for security rules', async () => {
      const siemProps = createPartialObjectMock<AlertActionsProps>({
        alert: {
          [ALERT_RULE_TYPE_ID]: 'siem.queryRule' as any,
        },
        refresh: jest.fn(),
      });

      render(<TestComponent {...siemProps} />);

      expect(screen.queryByText('SnoozeAlertAction')).not.toBeInTheDocument();
      expect(screen.queryByText('MarkAsUntrackedAlertAction')).not.toBeInTheDocument();
      expect(screen.queryByText('EditTagsAction')).not.toBeInTheDocument();
    });

    it('should still show view actions', async () => {
      render(<TestComponent {...props} />);

      expect(await screen.findByText('ViewRuleDetailsAlertAction')).toBeInTheDocument();
      expect(await screen.findByText('ViewAlertDetailsAlertAction')).toBeInTheDocument();
    });
  });
});
