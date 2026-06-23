/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render, waitFor, fireEvent } from '@testing-library/react';
import { AlertContextMenu } from './alert_context_menu';
import { TestProviders } from '../../../../common/mock';
import React from 'react';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import { mockTimelines } from '../../../../common/mock/mock_timelines_plugin';
import { mockCasesContract } from '@kbn/cases-plugin/public/mocks';
import { initialUserPrivilegesState as mockInitialUserPrivilegesState } from '../../../../common/components/user_privileges/user_privileges_context';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { TableId } from '@kbn/securitysolution-data-table';
import { TimelineId } from '../../../../../common/types/timeline';
import { ALERTS_FEATURE_ID, SECURITY_FEATURE_ID } from '../../../../../common/constants';

jest.mock('../../../../common/components/user_privileges');

const testSecuritySolutionLinkHref = 'test-url';
jest.mock('../../../../common/components/links', () => ({
  useGetSecuritySolutionLinkProps: () => () => ({ href: testSecuritySolutionLinkHref }),
}));

jest.mock('../../../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../../common/hooks/use_license', () => ({
  useLicense: jest.fn().mockReturnValue({ isPlatinumPlus: () => true }),
}));

const ecsRowData: Ecs = {
  _id: '1',
  agent: { type: ['blah'] },
  kibana: {
    alert: {
      workflow_status: ['open'],
      rule: {
        parameters: {},
        uuid: ['testId'],
      },
    },
  },
  event: {
    kind: ['signal'],
  },
};

const props = {
  ariaLabel:
    'Select more actions for the alert or event in row 26, with columns 2021-08-12T11:07:10.552Z Malware Prevention Alert high 73  siem-windows-endpoint SYSTEM powershell.exe mimikatz.exe  ',
  ariaRowindex: 26,
  columnValues:
    '2021-08-12T11:07:10.552Z Malware Prevention Alert high 73  siem-windows-endpoint SYSTEM powershell.exe mimikatz.exe  ',
  disabled: false,
  ecsRowData,
  refetch: jest.fn(),
  timelineId: 'alerts-page',
};

const mockUseKibanaReturnValue = {
  services: {
    timelines: { ...mockTimelines },
    application: {
      capabilities: { [ALERTS_FEATURE_ID]: { edit: true, read: true }, [SECURITY_FEATURE_ID]: {} },
    },
    cases: {
      ...mockCasesContract(),
      helpers: {
        canUseCases: jest.fn().mockReturnValue({
          all: true,
          create: true,
          read: true,
          update: true,
          delete: true,
          push: true,
          createComment: true,
          reopenCase: true,
          manageTemplates: true,
        }),
        getRuleIdFromEvent: jest.fn(),
        getObservablesFromEcs: jest.fn().mockReturnValue([]),
      },
    },
  },
};
jest.mock('../../../../common/lib/kibana', () => {
  const original = jest.requireActual('../../../../common/lib/kibana');

  return {
    ...original,
    useToasts: jest.fn().mockReturnValue({
      addError: jest.fn(),
      addSuccess: jest.fn(),
      addWarning: jest.fn(),
      addInfo: jest.fn(),
      remove: jest.fn(),
    }),
    useKibana: () => mockUseKibanaReturnValue,
  };
});

jest.mock('../../../containers/detection_engine/alerts/use_alerts_privileges', () => ({
  useAlertsPrivileges: jest.fn().mockReturnValue({ hasAlertsUpdate: true }),
}));

const mockUseRunAlertWorkflowPanel = jest.fn().mockReturnValue({
  runWorkflowMenuItem: [],
  runAlertWorkflowPanel: [],
});
jest.mock('./use_run_alert_workflow_panel', () => ({
  useRunAlertWorkflowPanel: (...args: unknown[]) => mockUseRunAlertWorkflowPanel(...args),
}));

const mockUseRunDocumentWorkflowPanel = jest.fn().mockReturnValue({
  runWorkflowMenuItem: [],
  runDocumentWorkflowPanel: [],
});
jest.mock('./use_run_document_workflow_panel', () => ({
  useRunDocumentWorkflowPanel: (...args: unknown[]) => mockUseRunDocumentWorkflowPanel(...args),
}));

const mockUseAddToChatAction = jest.fn().mockReturnValue({ addToChatActionItems: [] });
jest.mock('./use_add_to_chat_action', () => ({
  useAddToChatAction: (...args: unknown[]) => mockUseAddToChatAction(...args),
}));

const actionMenuButton = 'timeline-context-menu-button';
const addToExistingCaseButton = 'add-to-existing-case-action';
const addToNewCaseButton = 'add-to-new-case-action';
const markAsOpenButton = 'open-alert-status';
const markAsAcknowledgedButton = 'acknowledged-alert-status';
const markAsClosedButton = 'alert-close-context-menu-item';
const addEndpointEventFilterButton = 'add-event-filter-menu-item';
const applyAlertTagsButton = 'alert-tags-context-menu-item';
const applyAlertAssigneesButton = 'alert-assignees-context-menu-item';
const runWorkflowActionButton = 'run-workflow-action';
const alertWorkflowContextMenuPanel = 'alert-workflow-context-menu-panel';
const alertWorkflowPanelContent = 'alert-workflow-panel-content';
const runDocumentWorkflowActionButton = 'run-document-workflow-action';
const documentWorkflowPanelContent = 'document-workflow-panel-content';

// `alert_context_menu.tsx` eagerly imports four flyout components that are
// never opened by any test in this file. Their transitive module graphs add a
// large one-time cost to the first render through `<TestProviders>` +
// `<AlertContextMenu>`, which under CI load was pushing the first `Case
// actions` test past Jest's default 5s test timeout (flake on
// kibana-on-merge build 96698). Replacing the flyouts with no-op components
// removes the cost at its source.
jest.mock(
  '../../../../management/pages/endpoint_exceptions/view/components/endpoint_exceptions_flyout',
  () => ({ EndpointExceptionsFlyout: () => null })
);
jest.mock('../../osquery/osquery_flyout', () => ({ OsqueryFlyout: () => null }));
jest.mock('../../../../detection_engine/rule_exceptions/components/add_exception_flyout', () => ({
  AddExceptionFlyout: () => null,
}));
jest.mock(
  '../../../../management/pages/event_filters/view/components/event_filters_flyout',
  () => ({ EventFiltersFlyout: () => null })
);

describe('Alert table context menu', () => {
  describe('Case actions', () => {
    test('it render AddToCase context menu item if timelineId === TimelineId.detectionsPage', () => {
      const wrapper = render(
        <TestProviders>
          <AlertContextMenu {...props} scopeId={TableId.alertsOnAlertsPage} />
        </TestProviders>
      );

      fireEvent.click(wrapper.getByTestId(actionMenuButton));

      expect(wrapper.getByTestId(addToExistingCaseButton)).toBeTruthy();
      expect(wrapper.getByTestId(addToNewCaseButton)).toBeTruthy();
    });

    test('it render AddToCase context menu item if timelineId === TimelineId.detectionsRulesDetailsPage', () => {
      const wrapper = render(
        <TestProviders>
          <AlertContextMenu {...props} scopeId={TableId.alertsOnRuleDetailsPage} />
        </TestProviders>
      );

      fireEvent.click(wrapper.getByTestId(actionMenuButton));

      expect(wrapper.getByTestId(addToExistingCaseButton)).toBeTruthy();
      expect(wrapper.getByTestId(addToNewCaseButton)).toBeTruthy();
    });

    test('it render AddToCase context menu item if timelineId === TimelineId.active', () => {
      const wrapper = render(
        <TestProviders>
          <AlertContextMenu {...props} scopeId={TimelineId.active} />
        </TestProviders>
      );

      fireEvent.click(wrapper.getByTestId(actionMenuButton));

      expect(wrapper.getByTestId(addToExistingCaseButton)).toBeTruthy();
      expect(wrapper.getByTestId(addToNewCaseButton)).toBeTruthy();
    });
  });

  describe('Alert status actions', () => {
    test('it renders the correct status action buttons', async () => {
      const wrapper = render(
        <TestProviders>
          <AlertContextMenu {...props} scopeId={TimelineId.active} />
        </TestProviders>
      );

      fireEvent.click(wrapper.getByTestId(actionMenuButton));

      expect(wrapper.queryByTestId(markAsOpenButton)).toBeNull();
      expect(wrapper.getByTestId(markAsAcknowledgedButton)).toBeInTheDocument();
      expect(wrapper.getByTestId(markAsClosedButton)).toBeInTheDocument();
    });
  });

  describe('Workflow actions', () => {
    const mockRunWorkflowMenuItem = [
      {
        'data-test-subj': runWorkflowActionButton,
        key: 'run-workflow-action',
        name: 'Run workflow',
        panel: 'RUN_WORKFLOW_PANEL_ID',
      },
    ];
    const mockRunAlertWorkflowPanel = [
      {
        id: 'RUN_WORKFLOW_PANEL_ID',
        title: 'Alert workflows',
        'data-test-subj': alertWorkflowContextMenuPanel,
        content: <div data-test-subj={alertWorkflowPanelContent}>{'Workflow panel'}</div>,
      },
    ];

    test('it does not render the run workflow action when workflow capability is disabled', async () => {
      mockUseRunAlertWorkflowPanel.mockReturnValue({
        runWorkflowMenuItem: [],
        runAlertWorkflowPanel: [],
      });

      const wrapper = render(
        <TestProviders>
          <AlertContextMenu {...props} scopeId={TimelineId.active} />
        </TestProviders>
      );

      fireEvent.click(wrapper.getByTestId(actionMenuButton));

      expect(wrapper.queryByTestId(runWorkflowActionButton)).not.toBeInTheDocument();
    });

    test('it renders the run workflow action when workflow is enabled', async () => {
      mockUseRunAlertWorkflowPanel.mockReturnValue({
        runWorkflowMenuItem: mockRunWorkflowMenuItem,
        runAlertWorkflowPanel: mockRunAlertWorkflowPanel,
      });

      const wrapper = render(
        <TestProviders>
          <AlertContextMenu {...props} scopeId={TimelineId.active} />
        </TestProviders>
      );

      fireEvent.click(wrapper.getByTestId(actionMenuButton));

      expect(wrapper.getByTestId(runWorkflowActionButton)).toBeInTheDocument();
    });

    test('it shows the workflow panel when run workflow action is clicked', async () => {
      mockUseRunAlertWorkflowPanel.mockReturnValue({
        runWorkflowMenuItem: mockRunWorkflowMenuItem,
        runAlertWorkflowPanel: mockRunAlertWorkflowPanel,
      });

      const wrapper = render(
        <TestProviders>
          <AlertContextMenu {...props} scopeId={TimelineId.active} />
        </TestProviders>
      );

      fireEvent.click(wrapper.getByTestId(actionMenuButton));
      fireEvent.click(wrapper.getByTestId(runWorkflowActionButton));

      await waitFor(() => {
        expect(wrapper.getByTestId(alertWorkflowPanelContent)).toBeInTheDocument();
        expect(wrapper.getByText('Workflow panel')).toBeInTheDocument();
      });
    });

    afterEach(() => {
      mockUseRunAlertWorkflowPanel.mockReturnValue({
        runWorkflowMenuItem: [],
        runAlertWorkflowPanel: [],
      });
    });
  });

  describe('Document workflow actions (events)', () => {
    const eventEcsRowData: Ecs = {
      _id: '1',
      agent: { type: ['blah'] },
      event: {
        kind: ['event'],
      },
    };

    const eventProps = {
      ...props,
      ecsRowData: eventEcsRowData,
    };

    const mockDocumentWorkflowMenuItem = [
      {
        'data-test-subj': runDocumentWorkflowActionButton,
        key: 'run-document-workflow-action',
        name: 'Run workflow',
        panel: 'RUN_DOCUMENT_WORKFLOW_PANEL_ID',
      },
    ];
    const mockDocumentWorkflowPanel = [
      {
        id: 'RUN_DOCUMENT_WORKFLOW_PANEL_ID',
        title: 'Document workflows',
        'data-test-subj': 'document-workflow-context-menu-panel',
        content: (
          <div data-test-subj={documentWorkflowPanelContent}>{'Document workflow panel'}</div>
        ),
      },
    ];

    test('it does not render the run document workflow action when workflow capability is disabled', async () => {
      mockUseRunDocumentWorkflowPanel.mockReturnValue({
        runWorkflowMenuItem: [],
        runDocumentWorkflowPanel: [],
      });

      const wrapper = render(
        <TestProviders>
          <AlertContextMenu {...eventProps} scopeId={TableId.hostsPageEvents} />
        </TestProviders>
      );

      fireEvent.click(wrapper.getByTestId(actionMenuButton));

      expect(wrapper.queryByTestId(runDocumentWorkflowActionButton)).not.toBeInTheDocument();
    });

    test('it renders the run document workflow action for event rows when workflow is enabled', async () => {
      mockUseRunDocumentWorkflowPanel.mockReturnValue({
        runWorkflowMenuItem: mockDocumentWorkflowMenuItem,
        runDocumentWorkflowPanel: mockDocumentWorkflowPanel,
      });

      const wrapper = render(
        <TestProviders>
          <AlertContextMenu {...eventProps} scopeId={TableId.hostsPageEvents} />
        </TestProviders>
      );

      fireEvent.click(wrapper.getByTestId(actionMenuButton));

      expect(wrapper.getByTestId(runDocumentWorkflowActionButton)).toBeInTheDocument();
    });

    test('it shows the document workflow panel when run workflow action is clicked', async () => {
      mockUseRunDocumentWorkflowPanel.mockReturnValue({
        runWorkflowMenuItem: mockDocumentWorkflowMenuItem,
        runDocumentWorkflowPanel: mockDocumentWorkflowPanel,
      });

      const wrapper = render(
        <TestProviders>
          <AlertContextMenu {...eventProps} scopeId={TableId.hostsPageEvents} />
        </TestProviders>
      );

      fireEvent.click(wrapper.getByTestId(actionMenuButton));
      fireEvent.click(wrapper.getByTestId(runDocumentWorkflowActionButton));

      await waitFor(() => {
        expect(wrapper.getByTestId(documentWorkflowPanelContent)).toBeInTheDocument();
      });
    });

    afterEach(() => {
      mockUseRunDocumentWorkflowPanel.mockReturnValue({
        runWorkflowMenuItem: [],
        runDocumentWorkflowPanel: [],
      });
    });
  });

  describe('Endpoint event filter actions', () => {
    describe('AddEndpointEventFilter', () => {
      const endpointEventProps = {
        ...props,
        ecsRowData: { ...ecsRowData, agent: { type: ['endpoint'] }, event: { kind: ['event'] } },
      };

      describe('when users has write event filters privilege', () => {
        beforeEach(() => {
          (useUserPrivileges as jest.Mock).mockReturnValue({
            ...mockInitialUserPrivilegesState(),
            endpointPrivileges: { loading: false, canWriteEventFilters: true },
          });
        });

        test('it disables AddEndpointEventFilter when timeline id is not host events page', async () => {
          const wrapper = render(
            <TestProviders>
              <AlertContextMenu {...endpointEventProps} scopeId={TimelineId.active} />
            </TestProviders>
          );

          fireEvent.click(wrapper.getByTestId(actionMenuButton));

          const button = wrapper.getByTestId(addEndpointEventFilterButton);

          expect(button).toBeInTheDocument();
          expect(button).toBeDisabled();
        });

        test('it enables AddEndpointEventFilter when timeline id is host events page', async () => {
          const wrapper = render(
            <TestProviders>
              <AlertContextMenu {...endpointEventProps} scopeId={TableId.hostsPageEvents} />
            </TestProviders>
          );

          fireEvent.click(wrapper.getByTestId(actionMenuButton));

          const button = wrapper.getByTestId(addEndpointEventFilterButton);

          expect(button).toBeInTheDocument();
          expect(button).not.toBeDisabled();
        });

        test('it disables AddEndpointEventFilter when timeline id is host events page but is not from endpoint', async () => {
          const customProps = {
            ...props,
            ecsRowData: { ...ecsRowData, agent: { type: ['other'] }, event: { kind: ['event'] } },
          };
          const wrapper = render(
            <TestProviders>
              <AlertContextMenu {...customProps} scopeId={TableId.hostsPageEvents} />
            </TestProviders>
          );

          fireEvent.click(wrapper.getByTestId(actionMenuButton));

          const button = wrapper.getByTestId(addEndpointEventFilterButton);

          expect(button).toBeInTheDocument();
          expect(button).toBeDisabled();
        });

        test('it enables AddEndpointEventFilter when timeline id is user events page', async () => {
          const wrapper = render(
            <TestProviders>
              <AlertContextMenu {...endpointEventProps} scopeId={TableId.usersPageEvents} />
            </TestProviders>
          );

          fireEvent.click(wrapper.getByTestId(actionMenuButton));

          const button = wrapper.getByTestId(addEndpointEventFilterButton);

          expect(button).toBeInTheDocument();
          expect(button).not.toBeDisabled();
        });

        test('it disables AddEndpointEventFilter when timeline id is user events page but is not from endpoint', async () => {
          const customProps = {
            ...props,
            ecsRowData: { ...ecsRowData, agent: { type: ['other'] }, event: { kind: ['event'] } },
          };
          const wrapper = render(
            <TestProviders>
              <AlertContextMenu {...customProps} scopeId={TableId.usersPageEvents} />
            </TestProviders>
          );

          fireEvent.click(wrapper.getByTestId(actionMenuButton));

          const button = wrapper.getByTestId(addEndpointEventFilterButton);

          expect(button).toBeInTheDocument();
          expect(button).toBeDisabled();
        });
      });
    });

    describe('Apply alert tags action', () => {
      test('it renders the apply alert tags action button', async () => {
        const wrapper = render(
          <TestProviders>
            <AlertContextMenu {...props} scopeId={TimelineId.active} />
          </TestProviders>
        );

        fireEvent.click(wrapper.getByTestId(actionMenuButton));

        await waitFor(() => {
          expect(wrapper.getByTestId(applyAlertTagsButton)).toBeTruthy();
        });
      });
    });

    describe('Assign alert action', () => {
      test('it renders the assign alert action button', async () => {
        const wrapper = render(
          <TestProviders>
            <AlertContextMenu {...props} scopeId={TimelineId.active} />
          </TestProviders>
        );

        fireEvent.click(wrapper.getByTestId(actionMenuButton));

        await waitFor(() => {
          expect(wrapper.getByTestId(applyAlertAssigneesButton)).toBeTruthy();
        });
      });
    });
  });

  describe('Add to chat action', () => {
    const addToChatButton = 'add-to-chat-action';

    test('it renders the add to chat action when agent builder returns an item', async () => {
      mockUseAddToChatAction.mockReturnValue({
        addToChatActionItems: [
          {
            'data-test-subj': addToChatButton,
            name: 'Add to chat',
            onClick: jest.fn(),
          },
        ],
      });

      const wrapper = render(
        <TestProviders>
          <AlertContextMenu {...props} scopeId={TimelineId.active} />
        </TestProviders>
      );

      fireEvent.click(wrapper.getByTestId(actionMenuButton));

      await waitFor(() => {
        expect(wrapper.getByTestId(addToChatButton)).toBeInTheDocument();
      });
    });

    test('it does not render the add to chat action when agent builder is disabled', async () => {
      mockUseAddToChatAction.mockReturnValue({ addToChatActionItems: [] });

      const wrapper = render(
        <TestProviders>
          <AlertContextMenu {...props} scopeId={TimelineId.active} />
        </TestProviders>
      );

      fireEvent.click(wrapper.getByTestId(actionMenuButton));

      expect(wrapper.queryByTestId(addToChatButton)).not.toBeInTheDocument();
    });

    afterEach(() => {
      mockUseAddToChatAction.mockReturnValue({ addToChatActionItems: [] });
    });
  });
});
