/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { QueryClientProvider } from '@kbn/react-query';
import { ESQLVariableType } from '@kbn/esql-types';
import type { ESQLControlVariable } from '@kbn/esql-types';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import { applicationServiceMock } from '@kbn/core/public/mocks';
import { lensPluginMock } from '@kbn/lens-plugin/public/mocks';
import { uiActionsPluginMock } from '@kbn/ui-actions-plugin/public/mocks';
import type { RuleFormServices } from '../../form/contexts/rule_form_context';
import { createTestQueryClient } from '../../test_utils';
import { ComposeDiscoverFlyout } from './compose_discover_flyout';
import type { ComposeDiscoverFlyoutProps } from './compose_discover_flyout';
import type { ComposeDiscoverForm } from './compose_discover_form';

type FormProps = React.ComponentProps<typeof ComposeDiscoverForm>;

jest.mock('@kbn/code-editor', () => ({
  CodeEditor: () => <div data-test-subj="codeEditorMock" />,
}));

jest.mock('@kbn/esql-editor', () => ({
  ESQLEditor: () => <div data-test-subj="esqlEditorMock" />,
}));

const mockComposeDiscoverForm = jest.fn((_props: FormProps) => (
  <div data-test-subj="composeDiscoverFormMock" />
));

jest.mock('./compose_discover_form', () => {
  const { useFormContext } = jest.requireActual('react-hook-form');
  const actual = jest.requireActual('./use_compose_discover_state');
  return {
    getSteps: (isAlert: boolean) => ({
      steps: actual.getStepIds(isAlert).map((id: string) => {
        const titles: Record<string, string> = {
          alertCondition: 'Alert Condition',
          recoveryCondition: 'Recovery Condition',
          details: 'Details & Artifacts',
        };
        return { id, title: titles[id], render: () => <div /> };
      }),
    }),
    ComposeDiscoverForm: (props: FormProps) => {
      mockComposeDiscoverForm(props);
      const { setValue } = useFormContext();
      return (
        <div data-test-subj="composeDiscoverFormMock">
          <button
            data-test-subj="mockMakeDirty"
            onClick={() => setValue('metadata.name', 'changed', { shouldDirty: true })}
            type="button"
          >
            Make dirty
          </button>
        </div>
      );
    },
  };
});

jest.mock('./query_sandbox_flyout', () => ({
  QuerySandboxFlyout: () => <div data-test-subj="composeDiscoverChildMock" />,
}));

jest.mock('./use_esql_providers', () => ({
  useEsqlAutocomplete: jest.fn(),
}));

jest.mock('./use_split_query_completion', () => ({
  useSplitQueryCompletion: () => ({ onEditorMount: jest.fn() }),
}));

jest.mock('./use_resolve_time_field', () => ({
  useResolveTimeField: () => ({
    timeFieldOptions: [{ value: '@timestamp', text: '@timestamp' }],
    isTimeFieldResolved: true,
  }),
}));

jest.mock('../../form/hooks/use_data_fields', () => ({
  useDataFields: () => ({ data: {}, isLoading: false }),
}));

jest.mock('@kbn/esql-utils', () => ({
  ...jest.requireActual('@kbn/esql-utils'),
  getESQLTimeFieldFromQuery: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../form/utils/yaml_form_utils', () => ({
  serializeFormToYaml: () => '',
  parseYamlToFormValues: (yaml: string) => ({
    values: yaml
      ? {
          kind: 'signal',
          metadata: { name: 'changed', enabled: true, description: '', tags: [] },
          timeField: '@timestamp',
          schedule: { every: '1m', lookback: '5m' },
          query: { format: 'standalone', breach: { query: '' } },
          stateTransitionAlertDelayMode: 'immediate',
          stateTransitionRecoveryDelayMode: 'immediate',
          artifacts: [],
        }
      : null,
  }),
}));

jest.mock('../../form/yaml_rule_form', () => ({
  YamlRuleForm: ({ setYamlText }: { setYamlText: (yaml: string) => void }) => (
    <div data-test-subj="yamlRuleFormMock">
      <button
        data-test-subj="mockMakeYamlDirty"
        onClick={() => setYamlText('name: changed\n')}
        type="button"
      >
        Make YAML dirty
      </button>
    </div>
  ),
}));

const createMockServices = (): RuleFormServices => ({
  http: httpServiceMock.createStartContract(),
  data: dataPluginMock.createStartContract(),
  dataViews: dataViewPluginMocks.createStartContract(),
  notifications: notificationServiceMock.createStartContract(),
  application: applicationServiceMock.createStartContract(),
  lens: lensPluginMock.createStartContract(),
  uiActions: uiActionsPluginMock.createStartContract(),
});

const testQueryClient = createTestQueryClient();

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <IntlProvider locale="en">
    <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
  </IntlProvider>
);

const defaultProps: ComposeDiscoverFlyoutProps = {
  historyKey: Symbol('test'),
  mode: 'create',
  onClose: jest.fn(),
  services: createMockServices(),
  onCreateRule: jest.fn(),
};

const renderFlyout = (overrides: Partial<ComposeDiscoverFlyoutProps> = {}) =>
  render(
    <TestWrapper>
      <ComposeDiscoverFlyout {...defaultProps} {...overrides} />
    </TestWrapper>
  );

const getEditModeButton = (mode: 'form' | 'yaml') => {
  const buttons = screen.getByTestId('composeDiscoverEditModeToggle').querySelectorAll('button');
  return mode === 'form' ? buttons[0] : buttons[1];
};

const clickEditMode = (mode: 'form' | 'yaml') => {
  fireEvent.click(getEditModeButton(mode)!);
};

describe('ComposeDiscoverFlyout', () => {
  describe('HorizontalMinimalStepper', () => {
    it('renders the stepper with the correct aria-label for step 1 of 4', () => {
      renderFlyout();

      const stepper = screen.getByRole('group', { name: /Step 1 of 4: Alert Condition/ });
      expect(stepper).toBeInTheDocument();
    });

    it('renders 4 steps when tracking is enabled (default)', () => {
      renderFlyout();

      expect(screen.getByText('1 / 4')).toBeInTheDocument();
      expect(screen.getByText('Alert Condition')).toBeInTheDocument();
    });

    it('does not render the stepper in YAML mode', () => {
      renderFlyout();

      clickEditMode('yaml');

      expect(screen.queryByRole('group', { name: /Step \d+ of \d+/ })).not.toBeInTheDocument();
      expect(screen.getByTestId('composeDiscoverYamlBadge')).toBeInTheDocument();
    });
  });

  describe('flyout title', () => {
    it('shows "Create alert rule" in create mode', () => {
      renderFlyout({ mode: 'create' });
      expect(screen.getByText('Create alert rule')).toBeInTheDocument();
    });

    it('shows "Edit alert rule" in edit mode', () => {
      renderFlyout({ mode: 'edit' });
      expect(screen.getByText('Edit alert rule')).toBeInTheDocument();
    });
  });

  describe('isEditing prop', () => {
    beforeEach(() => {
      mockComposeDiscoverForm.mockClear();
    });

    it('passes isEditing=false in create mode', () => {
      renderFlyout({ mode: 'create' });
      expect(mockComposeDiscoverForm).toHaveBeenCalledWith(
        expect.objectContaining({ isEditing: false })
      );
    });

    it('passes isEditing=true in edit mode', () => {
      renderFlyout({ mode: 'edit' });
      expect(mockComposeDiscoverForm).toHaveBeenCalledWith(
        expect.objectContaining({ isEditing: true })
      );
    });

    it('passes isEditing=false in clone mode', () => {
      renderFlyout({ mode: 'clone' });
      expect(mockComposeDiscoverForm).toHaveBeenCalledWith(
        expect.objectContaining({ isEditing: false })
      );
    });
  });

  describe('footer navigation', () => {
    it('shows Next button on non-final step', () => {
      renderFlyout();
      expect(screen.getByTestId('composeDiscoverNext')).toBeInTheDocument();
      expect(screen.queryByTestId('composeDiscoverSubmit')).not.toBeInTheDocument();
    });

    it('does not show Back button on the first step', () => {
      renderFlyout();
      expect(screen.queryByTestId('composeDiscoverBack')).not.toBeInTheDocument();
    });

    it('disables Next when query is not committed on alertCondition step', () => {
      renderFlyout();
      expect(screen.getByTestId('composeDiscoverNext')).toBeDisabled();
    });
  });

  describe('unsaved-changes confirmation', () => {
    it('closes immediately when the form is pristine and the X button is clicked', () => {
      const onClose = jest.fn();
      renderFlyout({ onClose });

      fireEvent.click(screen.getByTestId('euiFlyoutCloseButton'));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('alertingV2ConfirmRuleCloseModal')).not.toBeInTheDocument();
    });

    it('closes immediately when the form is pristine and Cancel is clicked', () => {
      const onClose = jest.fn();
      renderFlyout({ onClose });

      fireEvent.click(screen.getByTestId('composeDiscoverCancel'));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('alertingV2ConfirmRuleCloseModal')).not.toBeInTheDocument();
    });

    it('shows the confirmation modal when the form is dirty and the X button is clicked', () => {
      const onClose = jest.fn();
      renderFlyout({ onClose });

      fireEvent.click(screen.getByTestId('mockMakeDirty'));
      fireEvent.click(screen.getByTestId('euiFlyoutCloseButton'));

      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('alertingV2ConfirmRuleCloseModal')).toBeInTheDocument();
    });

    it('shows the confirmation modal when the form is dirty and Cancel is clicked', () => {
      const onClose = jest.fn();
      renderFlyout({ onClose });

      fireEvent.click(screen.getByTestId('mockMakeDirty'));
      fireEvent.click(screen.getByTestId('composeDiscoverCancel'));

      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('alertingV2ConfirmRuleCloseModal')).toBeInTheDocument();
    });

    it('"Continue editing" dismisses the modal and keeps the flyout open', () => {
      const onClose = jest.fn();
      renderFlyout({ onClose });

      fireEvent.click(screen.getByTestId('mockMakeDirty'));
      fireEvent.click(screen.getByTestId('euiFlyoutCloseButton'));
      fireEvent.click(screen.getByTestId('confirmModalCancelButton'));

      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByTestId('alertingV2ConfirmRuleCloseModal')).not.toBeInTheDocument();
      expect(screen.getByTestId('composeDiscoverFormMock')).toBeInTheDocument();
    });

    it('"Discard changes" calls onClose', () => {
      const onClose = jest.fn();
      renderFlyout({ onClose });

      fireEvent.click(screen.getByTestId('mockMakeDirty'));
      fireEvent.click(screen.getByTestId('euiFlyoutCloseButton'));
      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('shows confirmation in YAML mode when text differs from baseline', () => {
      const onClose = jest.fn();
      renderFlyout({ onClose });

      clickEditMode('yaml');

      fireEvent.click(screen.getByTestId('mockMakeYamlDirty'));
      fireEvent.click(screen.getByTestId('euiFlyoutCloseButton'));

      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('alertingV2ConfirmRuleCloseModal')).toBeInTheDocument();
    });

    it('closes immediately in YAML mode when text matches baseline', () => {
      const onClose = jest.fn();
      renderFlyout({ onClose });

      clickEditMode('yaml');

      fireEvent.click(screen.getByTestId('euiFlyoutCloseButton'));

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('alertingV2ConfirmRuleCloseModal')).not.toBeInTheDocument();
    });

    it('"Continue editing" does not open sandbox when it was closed before close attempt', () => {
      const onClose = jest.fn();
      renderFlyout({ onClose, mode: 'edit' });

      expect(screen.queryByTestId('composeDiscoverChildMock')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('mockMakeDirty'));
      fireEvent.click(screen.getByTestId('euiFlyoutCloseButton'));
      fireEvent.click(screen.getByTestId('confirmModalCancelButton'));

      expect(screen.queryByTestId('composeDiscoverChildMock')).not.toBeInTheDocument();
    });

    it('"Continue editing" reopens sandbox in YAML mode', () => {
      const onClose = jest.fn();
      renderFlyout({ onClose });

      clickEditMode('yaml');

      expect(screen.getByTestId('composeDiscoverChildMock')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('mockMakeYamlDirty'));
      fireEvent.click(screen.getByTestId('euiFlyoutCloseButton'));
      fireEvent.click(screen.getByTestId('confirmModalCancelButton'));

      expect(screen.getByTestId('composeDiscoverChildMock')).toBeInTheDocument();
    });

    it('shows confirmation after editing in YAML mode and switching back to form mode', () => {
      const onClose = jest.fn();
      renderFlyout({ onClose });

      clickEditMode('yaml');
      fireEvent.click(screen.getByTestId('mockMakeYamlDirty'));
      clickEditMode('form');

      fireEvent.click(screen.getByTestId('euiFlyoutCloseButton'));

      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('alertingV2ConfirmRuleCloseModal')).toBeInTheDocument();
    });
  });

  describe('initialQuery from Discover', () => {
    const timeLiteralVariable: ESQLControlVariable[] = [
      { key: 'window', value: '15m', type: ESQLVariableType.TIME_LITERAL },
    ];

    it('shows unresolved variables in a callout and disables YAML Create rule', () => {
      renderFlyout({
        initialQuery: 'FROM logs-* | WHERE @timestamp > NOW() - ?window | LIMIT 5',
        esqlVariables: timeLiteralVariable,
      });

      const callout = screen.getByTestId('ruleV2FlyoutValidationErrors');
      expect(callout).toHaveTextContent('?window');
      expect(screen.getByTestId('composeDiscoverNext')).toBeDisabled();

      clickEditMode('yaml');

      expect(screen.getByTestId('composeDiscoverYamlSubmit')).toBeDisabled();
    });

    it('does not show a validation callout when all variables are inlined', () => {
      const esqlVariables: ESQLControlVariable[] = [
        { key: 'host', value: 'web-1', type: ESQLVariableType.VALUES },
      ];
      renderFlyout({
        initialQuery: 'FROM logs-* | WHERE host == ?host | LIMIT 5',
        esqlVariables,
      });

      expect(screen.queryByTestId('ruleV2FlyoutValidationErrors')).not.toBeInTheDocument();
    });

    it('updates validation when initialQuery changes before the form is edited', () => {
      const props = {
        ...defaultProps,
        initialQuery: 'FROM logs-* | LIMIT 5',
        esqlVariables: [] as ESQLControlVariable[],
      };
      const { rerender } = render(
        <TestWrapper>
          <ComposeDiscoverFlyout {...props} />
        </TestWrapper>
      );

      expect(screen.queryByTestId('ruleV2FlyoutValidationErrors')).not.toBeInTheDocument();

      rerender(
        <TestWrapper>
          <ComposeDiscoverFlyout
            {...props}
            initialQuery="FROM logs-* | WHERE host == ?host | LIMIT 5"
          />
        </TestWrapper>
      );

      expect(screen.getByTestId('ruleV2FlyoutValidationErrors')).toHaveTextContent('?host');
    });

    it('does not update the query after the user edits the form', () => {
      const props = {
        ...defaultProps,
        initialQuery: 'FROM logs-* | LIMIT 5',
        esqlVariables: [] as ESQLControlVariable[],
      };
      const { rerender } = render(
        <TestWrapper>
          <ComposeDiscoverFlyout {...props} />
        </TestWrapper>
      );

      fireEvent.click(screen.getByTestId('mockMakeDirty'));

      rerender(
        <TestWrapper>
          <ComposeDiscoverFlyout {...props} initialQuery="FROM metrics-* | LIMIT 5" />
        </TestWrapper>
      );

      expect(screen.queryByTestId('ruleV2FlyoutValidationErrors')).not.toBeInTheDocument();
    });
  });

  describe('forced YAML mode for non-representable rules', () => {
    const nonRepresentableRule = {
      id: 'test-rule-id',
      kind: 'alert' as const,
      enabled: true,
      metadata: { name: 'Standalone alert', tags: [] },
      time_field: '@timestamp',
      schedule: { every: '5m', lookback: '1m' },
      query: {
        format: 'standalone' as const,
        breach: { query: 'FROM logs-* | STATS c = COUNT(*) BY h | WHERE c > 100' },
      },
      recovery_strategy: 'query' as const,
    };

    const representableRule = {
      id: 'test-rule-id',
      kind: 'alert' as const,
      enabled: true,
      metadata: { name: 'Composed alert', tags: [] },
      time_field: '@timestamp',
      schedule: { every: '5m', lookback: '1m' },
      query: {
        format: 'composed' as const,
        base: 'FROM logs-*',
        breach: { segment: 'WHERE count > 100' },
      },
      recovery_strategy: 'query' as const,
    };

    it('opens in YAML mode with sandbox when rule is non-representable', () => {
      renderFlyout({ mode: 'edit', rule: nonRepresentableRule as any });

      expect(screen.getByTestId('yamlRuleFormMock')).toBeInTheDocument();
      expect(screen.queryByTestId('composeDiscoverFormMock')).not.toBeInTheDocument();
      expect(screen.getByTestId('composeDiscoverChildMock')).toBeInTheDocument();
    });

    it('disables the edit mode toggle for non-representable rules', () => {
      renderFlyout({ mode: 'edit', rule: nonRepresentableRule as any });

      const toggle = screen.getByTestId('composeDiscoverEditModeToggle');
      const buttons = toggle.querySelectorAll('button');
      buttons.forEach((btn) => expect(btn).toBeDisabled());
    });

    it('opens in form mode for representable rules', () => {
      renderFlyout({ mode: 'edit', rule: representableRule as any });

      expect(screen.getByTestId('composeDiscoverFormMock')).toBeInTheDocument();
      expect(screen.queryByTestId('yamlRuleFormMock')).not.toBeInTheDocument();
    });

    it('does not disable the toggle for representable rules', () => {
      renderFlyout({ mode: 'edit', rule: representableRule as any });

      const toggle = screen.getByTestId('composeDiscoverEditModeToggle');
      const buttons = toggle.querySelectorAll('button');
      buttons.forEach((btn) => expect(btn).not.toBeDisabled());
    });

    it('shows YAML badge instead of stepper for non-representable rules', () => {
      renderFlyout({ mode: 'edit', rule: nonRepresentableRule as any });

      expect(screen.queryByRole('group', { name: /Step \d+ of \d+/ })).not.toBeInTheDocument();
      expect(screen.getByTestId('composeDiscoverYamlBadge')).toBeInTheDocument();
    });
  });

  describe('recovery_strategy removal on update', () => {
    const ruleWithRecoveryStrategy = {
      id: 'test-rule-id',
      kind: 'alert' as const,
      enabled: true,
      metadata: { name: 'No breach recovery', tags: [] },
      time_field: '@timestamp',
      schedule: { every: '5m', lookback: '1m' },
      query: {
        format: 'composed' as const,
        base: 'FROM logs-*',
        breach: { segment: 'WHERE count > 100' },
      },
      recovery_strategy: 'no_breach' as const,
    };

    it('opens in YAML mode for recovery_strategy: no_breach', () => {
      renderFlyout({ mode: 'edit', rule: ruleWithRecoveryStrategy as any });

      expect(screen.getByTestId('yamlRuleFormMock')).toBeInTheDocument();
      expect(screen.queryByTestId('composeDiscoverFormMock')).not.toBeInTheDocument();
    });

    it('opens in YAML mode for recovery_strategy: none', () => {
      const rule = { ...ruleWithRecoveryStrategy, recovery_strategy: 'none' as const };
      renderFlyout({ mode: 'edit', rule: rule as any });

      expect(screen.getByTestId('yamlRuleFormMock')).toBeInTheDocument();
    });

    it('opens in YAML mode for no_data_strategy: emit', () => {
      const rule = {
        ...ruleWithRecoveryStrategy,
        recovery_strategy: 'query' as const,
        query: {
          format: 'composed' as const,
          base: 'FROM logs-*',
          breach: { segment: 'WHERE count > 100' },
        },
        no_data_strategy: 'emit' as const,
      };
      renderFlyout({ mode: 'edit', rule: rule as any });

      expect(screen.getByTestId('yamlRuleFormMock')).toBeInTheDocument();
    });
  });
});
