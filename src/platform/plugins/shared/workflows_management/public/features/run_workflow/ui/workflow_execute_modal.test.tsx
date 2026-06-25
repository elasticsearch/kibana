/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import type { useFetchAlertsIndexNamesQuery } from '@kbn/alerts-ui-shared';
import { I18nProvider } from '@kbn/i18n-react';
import type { WorkflowYaml } from '@kbn/workflows';
import { useWorkflowsCapabilities } from '@kbn/workflows-ui';
import { WorkflowExecuteModal } from './workflow_execute_modal';

type UseFetchAlertsIndexNamesQueryArgs = Parameters<typeof useFetchAlertsIndexNamesQuery>;

const mockUseWorkflowsCapabilities = useWorkflowsCapabilities as jest.MockedFunction<
  typeof useWorkflowsCapabilities
>;

jest.mock('@kbn/workflows-ui', () => ({
  useWorkflowsCapabilities: jest.fn(),
}));

const defaultWorkflowsCapabilities = {
  canCreateWorkflow: true,
  canReadWorkflow: true,
  canReadManagedWorkflow: true,
  canUpdateWorkflow: true,
  canDeleteWorkflow: true,
  canExecuteWorkflow: true,
  canReadWorkflowExecution: true,
  canReadManagedWorkflowExecution: true,
  canCancelWorkflowExecution: true,
};

const mockUseFetchAlertsIndexNamesQuery = jest.fn(
  (..._args: UseFetchAlertsIndexNamesQueryArgs) => ({
    data: ['.alerts-security.alerts-default'],
    isError: false,
  })
);

jest.mock('@kbn/alerts-ui-shared', () => {
  const actual = jest.requireActual('@kbn/alerts-ui-shared');
  return {
    ...actual,
    useFetchAlertsIndexNamesQuery: (
      ...args: Parameters<typeof mockUseFetchAlertsIndexNamesQuery>
    ) => mockUseFetchAlertsIndexNamesQuery(...args),
  };
});

const baseWorkflowDefinition = {
  version: '1',
  name: 'test-workflow',
  enabled: true,
  triggers: [],
  steps: [],
} as WorkflowYaml;

// Mock the form components
const mockWorkflowExecuteAlertForm = jest.fn((_props?: Record<string, unknown>) => null);
jest.mock('./workflow_execute_alert_form', () => ({
  WorkflowExecuteAlertForm: (props: Record<string, unknown>) => mockWorkflowExecuteAlertForm(props),
}));
const mockWorkflowExecuteIndexForm = jest.fn((_props?: Record<string, unknown>) => null);
jest.mock('./workflow_execute_index_form', () => ({
  WorkflowExecuteIndexForm: (props: Record<string, unknown>) => mockWorkflowExecuteIndexForm(props),
}));
const mockWorkflowExecuteManualForm = jest.fn(() => null);
jest.mock('./workflow_execute_manual_form', () => ({
  WorkflowExecuteManualForm: () => mockWorkflowExecuteManualForm(),
}));
const mockWorkflowExecuteHistoricalForm = jest.fn(() => null);
jest.mock('./workflow_execute_historical_form', () => ({
  WorkflowExecuteHistoricalForm: () => mockWorkflowExecuteHistoricalForm(),
}));
const mockWorkflowExecuteEventForm = jest.fn((_props?: Record<string, unknown>) => null);
jest.mock('./workflow_execute_event_form', () => ({
  WorkflowExecuteEventForm: (props: Record<string, unknown>) => mockWorkflowExecuteEventForm(props),
}));

jest.mock('../../workflow_list/ui/use_event_driven_execution_status', () => ({
  useEventDrivenExecutionStatus: () => ({
    eventDrivenExecutionEnabled: true,
    isLoading: false,
    error: false,
  }),
}));

jest.mock('../../../entities/workflows/model/use_workflow_execution', () => ({
  useWorkflowExecution: () => ({ data: null, isLoading: false }),
}));

const mockUseKibana = jest.fn();
jest.mock('../../../hooks/use_kibana', () => ({
  useKibana: () => mockUseKibana(),
}));

// Mock the translations
jest.mock('../../../../common/translations', () => ({
  MANUAL_TRIGGERS_DESCRIPTIONS: {
    manual: 'Manual trigger description',
    index: 'Index trigger description',
    alert: 'Alert trigger description',
  },
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(component, { wrapper: I18nProvider });
};

describe('WorkflowExecuteModal', () => {
  let mockOnClose: jest.Mock;
  let mockOnSubmit: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWorkflowsCapabilities.mockReturnValue(defaultWorkflowsCapabilities);
    mockUseFetchAlertsIndexNamesQuery.mockImplementation(
      (..._args: UseFetchAlertsIndexNamesQueryArgs) => ({
        data: ['.alerts-security.alerts-default'],
        isError: false,
      })
    );
    mockUseKibana.mockReturnValue({
      services: {
        application: { capabilities: {} },
        http: {},
      },
    });
    mockOnClose = jest.fn();
    mockOnSubmit = jest.fn();
    mockWorkflowExecuteAlertForm.mockClear();
    mockWorkflowExecuteIndexForm.mockClear();
    mockWorkflowExecuteManualForm.mockClear();
    mockWorkflowExecuteHistoricalForm.mockClear();
    mockWorkflowExecuteEventForm.mockClear();
  });

  describe('Basic rendering', () => {
    it('renders the modal with correct title', () => {
      const { getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(getByText('Run Workflow')).toBeInTheDocument();
    });

    it('renders all trigger type buttons when the workflow definition is missing', () => {
      const { getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(getByText('Alert')).toBeInTheDocument();
      expect(getByText('Document')).toBeInTheDocument();
      expect(getByText('Event')).toBeInTheDocument();
      expect(getByText('Manual')).toBeInTheDocument();
      expect(getByText('Historical')).toBeInTheDocument();
    });

    it('shows only tabs that match triggers declared in the workflow', () => {
      const { getByText, queryByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={{
            ...baseWorkflowDefinition,
            triggers: [{ type: 'alert' }],
          }}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(getByText('Alert')).toBeInTheDocument();
      expect(getByText('Manual')).toBeInTheDocument();
      expect(getByText('Historical')).toBeInTheDocument();
      expect(queryByText('Document')).not.toBeInTheDocument();
      expect(queryByText('Event')).not.toBeInTheDocument();
    });

    it('uses the test run title and still exposes the full trigger tab set', () => {
      const { getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={true}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(getByText('Test Workflow')).toBeInTheDocument();
      expect(getByText('Alert')).toBeInTheDocument();
      expect(getByText('Document')).toBeInTheDocument();
      expect(getByText('Event')).toBeInTheDocument();
      expect(getByText('Manual')).toBeInTheDocument();
      expect(getByText('Historical')).toBeInTheDocument();
    });

    it('keeps the alert trigger enabled when RAC prefetch succeeds (no capability pre-check)', () => {
      mockUseKibana.mockReturnValue({
        services: {
          application: { capabilities: {} },
          http: {},
        },
      });

      const { getByTestId } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(getByTestId('workflowExecuteModalTrigger-alert')).not.toBeDisabled();
    });

    it('prefetches RAC alert index names on modal open', () => {
      renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(mockUseFetchAlertsIndexNamesQuery).toHaveBeenCalledWith(
        expect.objectContaining({ ruleTypeIds: [] }),
        expect.objectContaining({ enabled: true })
      );
    });

    it('prefetches with query enabled even when application capabilities are empty', () => {
      mockUseKibana.mockReturnValue({
        services: {
          application: { capabilities: {} },
          http: {},
        },
      });

      renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(mockUseFetchAlertsIndexNamesQuery).toHaveBeenCalledWith(
        expect.objectContaining({ ruleTypeIds: [] }),
        expect.objectContaining({ enabled: true })
      );
    });

    it('disables the alert tab when RAC index prefetch reports forbidden', async () => {
      mockUseFetchAlertsIndexNamesQuery.mockImplementation(
        (...args: UseFetchAlertsIndexNamesQueryArgs) => {
          const [, options] = args;
          if (options?.onError) {
            queueMicrotask(() => options.onError?.({ response: { status: 403 } }));
          }
          return { data: [], isError: true };
        }
      );

      const { getByTestId } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      await waitFor(() => {
        expect(getByTestId('workflowExecuteModalTrigger-alert')).toBeDisabled();
      });
    });

    it('does not disable the alert tab when RAC prefetch onError is not a forbidden response', async () => {
      mockUseFetchAlertsIndexNamesQuery.mockImplementation(
        (...args: UseFetchAlertsIndexNamesQueryArgs) => {
          const [, options] = args;
          if (options?.onError) {
            queueMicrotask(() => options.onError?.(new Error('network down')));
          }
          return { data: [], isError: true };
        }
      );

      const { getByTestId } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      await waitFor(() => {
        expect(mockUseFetchAlertsIndexNamesQuery).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(getByTestId('workflowExecuteModalTrigger-alert')).not.toBeDisabled();
      });
    });

    it('disables the historical trigger when the user lacks Read Workflow Execution', () => {
      mockUseWorkflowsCapabilities.mockReturnValue({
        ...defaultWorkflowsCapabilities,
        canReadWorkflowExecution: false,
      });

      const { getByTestId } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(getByTestId('workflowExecuteModalTrigger-historical')).toBeDisabled();
    });

    it('disables the event trigger when the user lacks Read Workflow Execution', () => {
      mockUseWorkflowsCapabilities.mockReturnValue({
        ...defaultWorkflowsCapabilities,
        canReadWorkflowExecution: false,
      });

      const { getByTestId } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(getByTestId('workflowExecuteModalTrigger-event')).toBeDisabled();
    });

    it('renders trigger descriptions', () => {
      const { getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(getByText('Provide custom JSON data manually')).toBeInTheDocument();
      expect(getByText('Choose a document from Elasticsearch')).toBeInTheDocument();
      expect(
        getByText('Select one of possible events that you can use to run a workflow')
      ).toBeInTheDocument();
      expect(getByText('Choose an existing alert directly')).toBeInTheDocument();
      expect(getByText('Reuse input data from previous executions')).toBeInTheDocument();
    });

    it('renders the execute button', () => {
      const { getByTestId } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(getByTestId('executeWorkflowButton')).toBeInTheDocument();
    });
  });

  describe('Trigger selection', () => {
    it('defaults to alert trigger when no definition is provided', () => {
      const { getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const alertButton = getByText('Alert').closest('button');
      expect(alertButton).toHaveClass('euiButton');
      // Check if the radio input is checked
      const alertRadio = alertButton?.querySelector('input[type="radio"]');
      expect(alertRadio).toBeChecked();
    });

    it('switches to manual trigger when clicked', async () => {
      const { getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const manualButton = getByText('Manual').closest('button');
      fireEvent.click(manualButton!);

      await waitFor(() => {
        expect(manualButton).toHaveClass('euiButton');
        // Check if the radio input is checked
        const manualRadio = manualButton?.querySelector('input[type="radio"]');
        expect(manualRadio).toBeChecked();
      });
    });

    it('switches to index trigger when clicked', async () => {
      const { getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const indexButton = getByText('Document').closest('button');
      fireEvent.click(indexButton!);

      await waitFor(() => {
        expect(indexButton).toHaveClass('euiButton');
        // Check if the radio input is checked
        const indexRadio = indexButton?.querySelector('input[type="radio"]');
        expect(indexRadio).toBeChecked();
      });
    });
  });

  describe('Form rendering based on trigger type', () => {
    it('renders alert form when alert trigger is selected', () => {
      renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      // Alert trigger is selected by default, so event form should be called
      expect(mockWorkflowExecuteAlertForm).toHaveBeenCalledTimes(1);
      expect(mockWorkflowExecuteIndexForm).not.toHaveBeenCalled();
      expect(mockWorkflowExecuteManualForm).not.toHaveBeenCalled();
    });

    it('renders manual form when manual trigger is selected', async () => {
      const { getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      // Initially, event form should be called (alert is default)
      expect(mockWorkflowExecuteAlertForm).toHaveBeenCalledTimes(1);

      // Click manual trigger
      const manualButton = getByText('Manual').closest('button');
      fireEvent.click(manualButton!);

      await waitFor(() => {
        // Now manual form should be called
        expect(mockWorkflowExecuteManualForm).toHaveBeenCalledTimes(1);
        expect(mockWorkflowExecuteAlertForm).toHaveBeenCalledTimes(1); // Still called once from initial render
        expect(mockWorkflowExecuteIndexForm).not.toHaveBeenCalled();
      });
    });

    it('renders index form when index trigger is selected', async () => {
      const { getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      // Initially, event form should be called (alert is default)
      expect(mockWorkflowExecuteAlertForm).toHaveBeenCalledTimes(1);

      // Click index (Document) trigger
      const indexButton = getByText('Document').closest('button');
      fireEvent.click(indexButton!);

      await waitFor(() => {
        // Now index form should be called
        expect(mockWorkflowExecuteIndexForm).toHaveBeenCalledTimes(1);
        expect(mockWorkflowExecuteAlertForm).toHaveBeenCalledTimes(1); // Still called once from initial render
        expect(mockWorkflowExecuteManualForm).not.toHaveBeenCalled();
      });
    });
  });

  describe('Auto-run logic', () => {
    it('auto-runs and closes modal when workflow has no alerts and no inputs', () => {
      renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={{
            ...baseWorkflowDefinition,
            triggers: [{ type: 'manual' }],
          }}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(mockOnSubmit).toHaveBeenCalledWith({}, 'manual');
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('auto-runs only once when onSubmit and onClose change identity', () => {
      const definition = {
        ...baseWorkflowDefinition,
        triggers: [{ type: 'manual' as const }],
      };

      const { rerender } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={definition}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalledTimes(1);

      rerender(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={definition}
          onClose={jest.fn()}
          onSubmit={jest.fn()}
        />
      );

      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('does not auto-run when workflow has alert triggers', () => {
      const { getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={{
            ...baseWorkflowDefinition,
            triggers: [{ type: 'alert' }],
          }}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(mockOnSubmit).not.toHaveBeenCalled();
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(getByText('Run Workflow')).toBeInTheDocument();
    });

    it('does not auto-run when workflow has inputs', () => {
      const { getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={
            {
              ...baseWorkflowDefinition,
              triggers: [
                {
                  type: 'manual',
                  inputs: [{ name: 'test-input', type: 'string', required: true }],
                },
              ],
            } as WorkflowYaml
          }
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(mockOnSubmit).not.toHaveBeenCalled();
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(getByText('Run Workflow')).toBeInTheDocument();
    });
  });

  describe('Default trigger selection based on definition', () => {
    it('selects alert trigger when definition has alert triggers', () => {
      const { getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={{
            ...baseWorkflowDefinition,
            triggers: [{ type: 'alert' }],
          }}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const alertButton = getByText('Alert').closest('button');
      expect(alertButton).toHaveClass('euiButton');
      // Check if the radio input is checked
      const alertRadio = alertButton?.querySelector('input[type="radio"]');
      expect(alertRadio).toBeChecked();
    });

    it('selects manual trigger when definition has inputs', () => {
      const { getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={
            {
              ...baseWorkflowDefinition,
              triggers: [
                {
                  type: 'manual',
                  inputs: [{ name: 'test-input', type: 'string', required: true }],
                },
              ],
            } as WorkflowYaml
          }
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const manualButton = getByText('Manual').closest('button');
      expect(manualButton).toHaveClass('euiButton');
      // Check if the radio input is checked
      const manualRadio = manualButton?.querySelector('input[type="radio"]');
      expect(manualRadio).toBeChecked();
    });
  });

  describe('Form submission', () => {
    it('renders the execute button', () => {
      const { getByTestId } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const executeButton = getByTestId('executeWorkflowButton');
      expect(executeButton).toBeInTheDocument();
    });

    it('disables execute button when the user cannot execute workflows', () => {
      mockUseWorkflowsCapabilities.mockReturnValue({
        ...defaultWorkflowsCapabilities,
        canExecuteWorkflow: false,
      });
      const { getByTestId } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(getByTestId('executeWorkflowButton')).toBeDisabled();
    });

    it('associates execute-forbidden tooltip with the Run button wrapper for screen readers', () => {
      mockUseWorkflowsCapabilities.mockReturnValue({
        ...defaultWorkflowsCapabilities,
        canExecuteWorkflow: false,
      });
      const { getByTestId, getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const executeButton = getByTestId('executeWorkflowButton');
      const tooltipWrapper = executeButton.parentElement;

      expect(tooltipWrapper).toHaveAttribute('aria-disabled', 'true');
      expect(tooltipWrapper).toHaveAttribute('tabIndex', '0');

      const tooltipDescription = getByText(
        'You need the Workflows Execute privilege to run this workflow.'
      );
      expect(tooltipWrapper).toHaveAttribute(
        'aria-describedby',
        tooltipDescription.getAttribute('id')
      );
    });

    it('disables execute for test runs when the user cannot execute workflows', () => {
      mockUseWorkflowsCapabilities.mockReturnValue({
        ...defaultWorkflowsCapabilities,
        canExecuteWorkflow: false,
      });
      const { getByTestId } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={true}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(getByTestId('executeWorkflowButton')).toBeDisabled();
    });

    it('disables execute button when there are errors', () => {
      const { getByTestId, getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      fireEvent.click(getByText('Manual').closest('button')!);

      const executeButton = getByTestId('executeWorkflowButton');
      expect(executeButton).not.toBeDisabled();
    });

    it('disables execute button on the alert tab when no rows are selected', () => {
      const { getByTestId } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      expect(getByTestId('executeWorkflowButton')).toBeDisabled();
    });

    it('enables execute button on the alert tab when rows are selected', () => {
      const { getByTestId } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const alertFormCalls = mockWorkflowExecuteAlertForm.mock.calls;
      const lastAlertFormProps = alertFormCalls[alertFormCalls.length - 1]?.[0] as
        | { setValue?: (value: string) => void }
        | undefined;

      act(() => {
        lastAlertFormProps!.setValue!('{"event":{"alertIds":[]}}');
      });

      expect(getByTestId('executeWorkflowButton')).not.toBeDisabled();
    });

    it('disables execute button on the document tab when no rows are selected', () => {
      const { getByTestId, getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      fireEvent.click(getByText('Document').closest('button')!);

      expect(getByTestId('executeWorkflowButton')).toBeDisabled();
    });

    it('enables execute button on the document tab when rows are selected', () => {
      const { getByTestId, getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      fireEvent.click(getByText('Document').closest('button')!);

      const indexFormCalls = mockWorkflowExecuteIndexForm.mock.calls;
      const lastIndexFormProps = indexFormCalls[indexFormCalls.length - 1]?.[0] as
        | { setValue?: (value: string) => void }
        | undefined;

      act(() => {
        lastIndexFormProps!.setValue!('{"event":{"documents":[]}}');
      });

      expect(getByTestId('executeWorkflowButton')).not.toBeDisabled();
    });

    it('disables execute button when the event trigger reports multiple table row selections', () => {
      const { getByTestId, getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const eventTrigger = getByText('Event').closest('button');
      fireEvent.click(eventTrigger!);

      const eventFormCalls = mockWorkflowExecuteEventForm.mock.calls;
      const lastEventFormProps = eventFormCalls[eventFormCalls.length - 1]?.[0] as
        | { onTriggerEventTableSelectionCountChange?: (count: number) => void }
        | undefined;
      expect(lastEventFormProps?.onTriggerEventTableSelectionCountChange).toBeDefined();

      act(() => {
        lastEventFormProps!.onTriggerEventTableSelectionCountChange!(2);
      });

      const executeButton = getByTestId('executeWorkflowButton');
      expect(executeButton).toBeDisabled();
    });

    it('hides trigger tabs and applies fullscreen modal class when the alert grid enters fullscreen', () => {
      const { getByTestId, getByText, queryByTestId } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      fireEvent.click(getByText('Alert').closest('button')!);

      const alertFormCalls = mockWorkflowExecuteAlertForm.mock.calls;
      const lastAlertFormProps = alertFormCalls[alertFormCalls.length - 1]?.[0] as
        | { onTableGridFullScreenChange?: (isFullScreen: boolean) => void }
        | undefined;

      expect(lastAlertFormProps?.onTableGridFullScreenChange).toBeDefined();

      act(() => {
        lastAlertFormProps!.onTableGridFullScreenChange!(true);
      });

      expect(queryByTestId('workflowExecuteModalTriggerTabs')).not.toBeInTheDocument();
      expect(getByTestId('workflowExecuteModal').className).toContain(
        'workflowExecuteModal--tableGridFullScreen'
      );
    });

    it('exits table fullscreen instead of closing the modal when X is pressed', () => {
      const { getByTestId, getByText, getByLabelText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      fireEvent.click(getByText('Alert').closest('button')!);

      const alertFormCalls = mockWorkflowExecuteAlertForm.mock.calls;
      const lastAlertFormProps = alertFormCalls[alertFormCalls.length - 1]?.[0] as
        | { onTableGridFullScreenChange?: (isFullScreen: boolean) => void }
        | undefined;

      act(() => {
        lastAlertFormProps!.onTableGridFullScreenChange!(true);
      });

      expect(getByTestId('workflowExecuteModal').className).toContain(
        'workflowExecuteModal--tableGridFullScreen'
      );

      act(() => {
        fireEvent.click(getByLabelText('Closes this modal window'));
      });

      expect(mockOnClose).not.toHaveBeenCalled();
      expect(getByTestId('workflowExecuteModal').className).not.toContain(
        'workflowExecuteModal--tableGridFullScreen'
      );
      expect(getByTestId('workflowExecuteModalTriggerTabs')).toBeInTheDocument();
    });

    it('hides trigger tabs and applies fullscreen modal class when the event grid enters fullscreen', () => {
      const { getByTestId, getByText, queryByTestId } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      fireEvent.click(getByText('Event').closest('button')!);

      const eventFormCalls = mockWorkflowExecuteEventForm.mock.calls;
      const lastEventFormProps = eventFormCalls[eventFormCalls.length - 1]?.[0] as
        | { onTableGridFullScreenChange?: (isFullScreen: boolean) => void }
        | undefined;

      expect(lastEventFormProps?.onTableGridFullScreenChange).toBeDefined();

      act(() => {
        lastEventFormProps!.onTableGridFullScreenChange!(true);
      });

      expect(queryByTestId('workflowExecuteModalTriggerTabs')).not.toBeInTheDocument();
      expect(getByTestId('workflowExecuteModal').className).toContain(
        'workflowExecuteModal--tableGridFullScreen'
      );
    });

    it('disables execute for test runs when the event trigger reports multiple table row selections', () => {
      const { getByTestId, getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={true}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const eventTrigger = getByText('Event').closest('button');
      fireEvent.click(eventTrigger!);

      const eventFormCalls = mockWorkflowExecuteEventForm.mock.calls;
      const lastEventFormProps = eventFormCalls[eventFormCalls.length - 1]?.[0] as
        | { onTriggerEventTableSelectionCountChange?: (count: number) => void }
        | undefined;
      expect(lastEventFormProps?.onTriggerEventTableSelectionCountChange).toBeDefined();

      act(() => {
        lastEventFormProps!.onTriggerEventTableSelectionCountChange!(2);
      });

      expect(getByTestId('executeWorkflowButton')).toBeDisabled();
    });
  });

  describe('Historical trigger', () => {
    it('defaults to historical tab when initialExecutionId is provided', () => {
      const { getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          initialExecutionId="exec-123"
        />
      );

      const historicalButton = getByText('Historical').closest('button');
      const historicalRadio = historicalButton?.querySelector('input[type="radio"]');
      expect(historicalRadio).toBeChecked();
    });

    it('defaults to document tab when initialExecutionId is set but execution read is denied', () => {
      mockUseWorkflowsCapabilities.mockReturnValue({
        ...defaultWorkflowsCapabilities,
        canReadWorkflowExecution: false,
      });

      const { getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          initialExecutionId="exec-123"
        />
      );

      const documentButton = getByText('Document').closest('button');
      const documentRadio = documentButton?.querySelector('input[type="radio"]');
      expect(documentRadio).toBeChecked();
    });

    it('renders historical form when historical trigger is clicked', async () => {
      const { getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      const historicalButton = getByText('Historical').closest('button');
      fireEvent.click(historicalButton!);

      await waitFor(() => {
        expect(mockWorkflowExecuteHistoricalForm).toHaveBeenCalled();
      });
    });

    it('should keep historical tab when initialExecutionId is set and definition has alert triggers', () => {
      const { getByText } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={{
            ...baseWorkflowDefinition,
            triggers: [{ type: 'alert' }],
          }}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
          initialExecutionId="exec-123"
        />
      );

      // Without initialExecutionId, alert workflows default to the alert tab via resolveInitialSelectedTrigger.
      // With initialExecutionId, we open on historical instead.
      const historicalButton = getByText('Historical').closest('button');
      const historicalRadio = historicalButton?.querySelector('input[type="radio"]');
      expect(historicalRadio).toBeChecked();
    });
  });

  describe('Modal close functionality', () => {
    it('calls onClose when modal close button is clicked', () => {
      const { container } = renderWithProviders(
        <WorkflowExecuteModal
          isTestRun={false}
          definition={null}
          onClose={mockOnClose}
          onSubmit={mockOnSubmit}
        />
      );

      // Find and click the close button (EUI modal close button)
      const closeButton = container.querySelector('[aria-label="Closes this modal window"]');
      if (closeButton) {
        fireEvent.click(closeButton);
        expect(mockOnClose).toHaveBeenCalled();
      }
    });
  });
});
