/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  ALERT_INSTANCE_ID,
  ALERT_RULE_UUID,
  ALERT_STATUS,
  ALERT_STATUS_ACTIVE,
} from '@kbn/rule-data-utils';
import type { Alert } from '@kbn/alerting-types';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { AlertsQueryContext } from '@kbn/alerts-ui-shared/src/common/contexts/alerts_query_context';
import type { AdditionalContext, AlertActionsProps, RenderContext } from '../types';
import { createPartialObjectMock, testQueryClientConfig } from '../utils/test';
import { AlertsTableContextProvider } from '../contexts/alerts_table_context';
import { SnoozeAlertAction } from './snooze_alert_action';

jest.mock('../hooks/use_alert_muted_state');
jest.mock('../hooks/use_alert_snoozed_state');
jest.mock('@kbn/response-ops-alerts-apis/hooks/use_mute_alert_instance');
jest.mock('@kbn/response-ops-alerts-apis/hooks/use_unmute_alert_instance');
jest.mock('@kbn/response-ops-alerts-apis/hooks/use_snooze_alert_instance');
jest.mock('@kbn/response-ops-alerts-apis/hooks/use_unsnooze_alert_instance');
jest.mock('@kbn/response-ops-alert-snooze', () => ({
  AlertSnoozePopover: ({ onApply }: { onApply: (payload: unknown) => void }) => (
    <button data-test-subj="alertSnoozePopover" onClick={() => onApply({ expiresAt: null })}>
      Snooze
    </button>
  ),
}));

import { useAlertMutedState } from '../hooks/use_alert_muted_state';
import { useAlertSnoozedState } from '../hooks/use_alert_snoozed_state';
import { useMuteAlertInstance } from '@kbn/response-ops-alerts-apis/hooks/use_mute_alert_instance';
import { useUnmuteAlertInstance } from '@kbn/response-ops-alerts-apis/hooks/use_unmute_alert_instance';
import { useSnoozeAlertInstance } from '@kbn/response-ops-alerts-apis/hooks/use_snooze_alert_instance';
import { useUnsnoozeAlertInstance } from '@kbn/response-ops-alerts-apis/hooks/use_unsnooze_alert_instance';

const mockUseAlertMutedState = useAlertMutedState as jest.MockedFunction<typeof useAlertMutedState>;
const mockUseAlertSnoozedState = useAlertSnoozedState as jest.MockedFunction<
  typeof useAlertSnoozedState
>;
const mockMuteAlert = jest.fn().mockResolvedValue(undefined);
const mockUnmuteAlert = jest.fn().mockResolvedValue(undefined);
const mockSnoozeAlert = jest.fn().mockResolvedValue(undefined);
const mockUnsnoozeAlert = jest.fn().mockResolvedValue(undefined);

(useMuteAlertInstance as jest.Mock).mockReturnValue({ mutateAsync: mockMuteAlert });
(useUnmuteAlertInstance as jest.Mock).mockReturnValue({ mutateAsync: mockUnmuteAlert });
(useSnoozeAlertInstance as jest.Mock).mockReturnValue({ mutateAsync: mockSnoozeAlert });
(useUnsnoozeAlertInstance as jest.Mock).mockReturnValue({ mutateAsync: mockUnsnoozeAlert });

const RULE_ID = 'rule-1';
const INSTANCE_ID = 'instance-1';

const activeAlert: Alert = {
  [ALERT_RULE_UUID]: [RULE_ID],
  [ALERT_INSTANCE_ID]: [INSTANCE_ID],
  [ALERT_STATUS]: [ALERT_STATUS_ACTIVE],
} as unknown as Alert;

const inactiveAlert: Alert = {
  [ALERT_RULE_UUID]: [RULE_ID],
  [ALERT_INSTANCE_ID]: [INSTANCE_ID],
  [ALERT_STATUS]: ['recovered'],
} as unknown as Alert;

const http = httpServiceMock.createStartContract();
const notifications = notificationServiceMock.createStartContract();

const context = createPartialObjectMock<RenderContext<AdditionalContext>>({
  services: { http, notifications },
});

const queryClient = new QueryClient(testQueryClientConfig);

const TestComponent = (props: AlertActionsProps) => (
  <QueryClientProvider client={queryClient} context={AlertsQueryContext}>
    <AlertsTableContextProvider value={context}>
      <SnoozeAlertAction<AdditionalContext> {...props} />
    </AlertsTableContextProvider>
  </QueryClientProvider>
);

const baseProps = createPartialObjectMock<AlertActionsProps>({
  alert: activeAlert,
  refresh: jest.fn(),
});

describe('SnoozeAlertAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useMuteAlertInstance as jest.Mock).mockReturnValue({ mutateAsync: mockMuteAlert });
    (useUnmuteAlertInstance as jest.Mock).mockReturnValue({ mutateAsync: mockUnmuteAlert });
    (useSnoozeAlertInstance as jest.Mock).mockReturnValue({ mutateAsync: mockSnoozeAlert });
    (useUnsnoozeAlertInstance as jest.Mock).mockReturnValue({ mutateAsync: mockUnsnoozeAlert });
  });

  describe('visibility', () => {
    it('renders null for an inactive, non-muted, non-snoozed alert', () => {
      mockUseAlertMutedState.mockReturnValue({
        isMuted: false,
        ruleId: RULE_ID,
        alertInstanceId: INSTANCE_ID,
        rule: [],
      });
      mockUseAlertSnoozedState.mockReturnValue({
        isSnoozed: false,
        snoozedInstance: undefined,
        expiresAt: undefined,
        ruleId: RULE_ID,
        alertInstanceId: INSTANCE_ID,
      });

      const { container } = render(<TestComponent {...baseProps} alert={inactiveAlert} />);

      expect(container).toBeEmptyDOMElement();
    });

    it('renders null when ruleId is missing', () => {
      mockUseAlertMutedState.mockReturnValue({
        isMuted: false,
        ruleId: undefined,
        alertInstanceId: INSTANCE_ID,
        rule: [],
      });
      mockUseAlertSnoozedState.mockReturnValue({
        isSnoozed: false,
        snoozedInstance: undefined,
        expiresAt: undefined,
        ruleId: undefined,
        alertInstanceId: INSTANCE_ID,
      });

      const { container } = render(<TestComponent {...baseProps} />);

      expect(container).toBeEmptyDOMElement();
    });

    it('shows the Snooze popover trigger for an active, non-muted, non-snoozed alert', () => {
      mockUseAlertMutedState.mockReturnValue({
        isMuted: false,
        ruleId: RULE_ID,
        alertInstanceId: INSTANCE_ID,
        rule: [],
      });
      mockUseAlertSnoozedState.mockReturnValue({
        isSnoozed: false,
        snoozedInstance: undefined,
        expiresAt: undefined,
        ruleId: RULE_ID,
        alertInstanceId: INSTANCE_ID,
      });

      render(<TestComponent {...baseProps} />);

      expect(screen.getByTestId('alertSnoozePopover')).toBeInTheDocument();
    });

    it('shows the Unsnooze button when alert is muted', () => {
      mockUseAlertMutedState.mockReturnValue({
        isMuted: true,
        ruleId: RULE_ID,
        alertInstanceId: INSTANCE_ID,
        rule: [INSTANCE_ID],
      });
      mockUseAlertSnoozedState.mockReturnValue({
        isSnoozed: false,
        snoozedInstance: undefined,
        expiresAt: undefined,
        ruleId: RULE_ID,
        alertInstanceId: INSTANCE_ID,
      });

      render(<TestComponent {...baseProps} />);

      expect(screen.getByTestId('snooze-alert-action-unsnooze')).toBeInTheDocument();
    });

    it('shows the Unsnooze button when alert is snoozed', () => {
      mockUseAlertMutedState.mockReturnValue({
        isMuted: false,
        ruleId: RULE_ID,
        alertInstanceId: INSTANCE_ID,
        rule: [],
      });
      mockUseAlertSnoozedState.mockReturnValue({
        isSnoozed: true,
        snoozedInstance: {
          instanceId: INSTANCE_ID,
          snoozedAt: '2026-05-15T00:00:00.000Z',
          snoozedBy: 'user1',
        },
        expiresAt: undefined,
        ruleId: RULE_ID,
        alertInstanceId: INSTANCE_ID,
      });

      render(<TestComponent {...baseProps} />);

      expect(screen.getByTestId('snooze-alert-action-unsnooze')).toBeInTheDocument();
    });
  });

  describe('unsnooze actions', () => {
    it('calls unmuteAlert when Unsnooze is clicked on a muted alert', async () => {
      mockUseAlertMutedState.mockReturnValue({
        isMuted: true,
        ruleId: RULE_ID,
        alertInstanceId: INSTANCE_ID,
        rule: [INSTANCE_ID],
      });
      mockUseAlertSnoozedState.mockReturnValue({
        isSnoozed: false,
        snoozedInstance: undefined,
        expiresAt: undefined,
        ruleId: RULE_ID,
        alertInstanceId: INSTANCE_ID,
      });

      render(<TestComponent {...baseProps} />);
      fireEvent.click(screen.getByTestId('snooze-alert-action-unsnooze'));

      await waitFor(() => {
        expect(mockUnmuteAlert).toHaveBeenCalledWith({
          ruleId: RULE_ID,
          alertInstanceId: INSTANCE_ID,
        });
        expect(mockUnsnoozeAlert).not.toHaveBeenCalled();
      });
    });

    it('calls unsnoozeAlert when Unsnooze is clicked on a snoozed (not muted) alert', async () => {
      mockUseAlertMutedState.mockReturnValue({
        isMuted: false,
        ruleId: RULE_ID,
        alertInstanceId: INSTANCE_ID,
        rule: [],
      });
      mockUseAlertSnoozedState.mockReturnValue({
        isSnoozed: true,
        snoozedInstance: {
          instanceId: INSTANCE_ID,
          snoozedAt: '2026-05-15T00:00:00.000Z',
          snoozedBy: 'user1',
        },
        expiresAt: undefined,
        ruleId: RULE_ID,
        alertInstanceId: INSTANCE_ID,
      });

      render(<TestComponent {...baseProps} />);
      fireEvent.click(screen.getByTestId('snooze-alert-action-unsnooze'));

      await waitFor(() => {
        expect(mockUnsnoozeAlert).toHaveBeenCalledWith({
          ruleId: RULE_ID,
          alertInstanceId: INSTANCE_ID,
        });
        expect(mockUnmuteAlert).not.toHaveBeenCalled();
      });
    });
  });

  describe('snooze actions', () => {
    beforeEach(() => {
      mockUseAlertMutedState.mockReturnValue({
        isMuted: false,
        ruleId: RULE_ID,
        alertInstanceId: INSTANCE_ID,
        rule: [],
      });
      mockUseAlertSnoozedState.mockReturnValue({
        isSnoozed: false,
        snoozedInstance: undefined,
        expiresAt: undefined,
        ruleId: RULE_ID,
        alertInstanceId: INSTANCE_ID,
      });
    });

    it('calls muteAlert when snooze is applied with expiresAt: null (indefinite, no conditions)', async () => {
      // The mock AlertSnoozePopover calls onApply({ expiresAt: null }) when clicked
      render(<TestComponent {...baseProps} />);
      fireEvent.click(screen.getByTestId('alertSnoozePopover'));

      await waitFor(() => {
        expect(mockMuteAlert).toHaveBeenCalledWith({
          ruleId: RULE_ID,
          alertInstanceId: INSTANCE_ID,
        });
        expect(mockSnoozeAlert).not.toHaveBeenCalled();
      });
    });

    it('calls snoozeAlert when snooze is applied with an expiresAt date', async () => {
      // Override mock to call onApply with a time-based payload
      (jest.requireMock('@kbn/response-ops-alert-snooze') as any).AlertSnoozePopover = ({
        onApply,
      }: {
        onApply: (payload: unknown) => void;
      }) => (
        <button
          data-test-subj="alertSnoozePopover"
          onClick={() => onApply({ expiresAt: '2026-06-01T00:00:00.000Z' })}
        >
          Snooze
        </button>
      );

      render(<TestComponent {...baseProps} />);
      fireEvent.click(screen.getByTestId('alertSnoozePopover'));

      await waitFor(() => {
        expect(mockSnoozeAlert).toHaveBeenCalledWith(
          expect.objectContaining({
            ruleId: RULE_ID,
            alertInstanceId: INSTANCE_ID,
            expiresAt: '2026-06-01T00:00:00.000Z',
          })
        );
        expect(mockMuteAlert).not.toHaveBeenCalled();
      });
    });
  });
});
