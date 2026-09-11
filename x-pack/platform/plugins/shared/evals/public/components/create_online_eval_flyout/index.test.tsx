/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CreateOnlineEvalFlyout } from '.';
import { useCreateOnlineEvalWorkflow } from '../../hooks/use_online_eval_workflows';
import { useEvaluators } from '../../hooks/use_evaluators_api';
import { useModelConnectors } from '../../hooks/use_model_connectors';
import { parseOnlineEvalWorkflowYaml } from '../../../common/online_evals/workflow_yaml';

jest.mock('../../hooks/use_online_eval_workflows');
jest.mock('../../hooks/use_evaluators_api');
jest.mock('../../hooks/use_model_connectors');
jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');

  const MockEuiComboBox = ({
    options = [],
    selectedOptions = [],
    onChange,
    singleSelection,
    'data-test-subj': dataTestSubj,
  }: {
    options?: Array<{ label: string; value?: string; disabled?: boolean }>;
    selectedOptions?: Array<{ label: string; value?: string }>;
    onChange: (newOptions: Array<{ label: string; value?: string }>) => void;
    singleSelection?: { asPlainText?: boolean };
    'data-test-subj'?: string;
  }) => {
    const selectedValues = selectedOptions.map((option) => option.value ?? option.label);
    return (
      <select
        data-test-subj={dataTestSubj}
        multiple={false}
        defaultValue={selectedValues[0] ?? ''}
        onBlur={(event) => {
          const selectedValuesFromDom = Array.from(event.currentTarget.selectedOptions).map(
            (selectedOption) => selectedOption.value
          );
          const selectedValuesFallback =
            selectedValuesFromDom.length > 0
              ? selectedValuesFromDom
              : event.currentTarget.value
              ? [event.currentTarget.value]
              : [];
          const selected = selectedValuesFallback.map((selectedValue) => {
            const match = options.find(
              (option) => (option.value ?? option.label) === selectedValue
            );
            return {
              ...match,
              label: match?.label ?? selectedValue,
              value: match?.value ?? selectedValue,
            };
          });
          onChange(singleSelection ? selected.slice(0, 1) : selected);
        }}
      >
        {!singleSelection ? null : <option value="">--</option>}
        {options.map((option) => (
          <option
            key={option.value ?? option.label}
            value={option.value ?? option.label}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    );
  };

  return {
    ...actual,
    EuiComboBox: MockEuiComboBox,
  };
});

const mockedUseCreateOnlineEvalWorkflow = jest.mocked(useCreateOnlineEvalWorkflow);
const mockedUseEvaluators = jest.mocked(useEvaluators);
const mockedUseModelConnectors = jest.mocked(useModelConnectors);

describe('CreateOnlineEvalFlyout', () => {
  const mutateAsync = jest.fn();
  const onClose = jest.fn();
  let container: HTMLElement;

  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ id: 'workflow-1', name: 'nightly monitor' });
    onClose.mockReset();

    mockedUseCreateOnlineEvalWorkflow.mockReturnValue({
      mutateAsync,
      isLoading: false,
    } as unknown as ReturnType<typeof useCreateOnlineEvalWorkflow>);
    mockedUseEvaluators.mockReturnValue({
      data: {
        evaluators: [
          {
            name: 'correctness',
            version: '1.2.3',
            kind: 'llm',
            description: 'Checks correctness',
          },
          {
            name: 'cost',
            version: '0.1.0',
            kind: 'code',
            description: 'Estimates costs',
          },
        ],
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEvaluators>);
    mockedUseModelConnectors.mockReturnValue({
      connectors: [{ id: 'connector-allowed', name: 'Judge Connector' }],
      isLoading: false,
      error: null,
    });
  });

  const getByTestSubj = (testSubj: string) =>
    container.querySelector(`[data-test-subj="${testSubj}"]`) as HTMLElement;

  it('offers 5m as a schedule option', async () => {
    ({ container } = render(<CreateOnlineEvalFlyout onClose={onClose} />));

    const scheduleSelect = getByTestSubj('onlineEvalCreateEverySelect') as HTMLSelectElement;
    const optionValues = Array.from(scheduleSelect.options).map((option) => option.value);

    expect(optionValues).toEqual(['5m', '15m', '1h', '6h', '1d']);
  });

  it('renders sections in the expected parity order', async () => {
    ({ container } = render(<CreateOnlineEvalFlyout onClose={onClose} />));

    const nameLabel = screen.getByText('Name');
    const targetAndFilterLabel = screen.getByText('Target and filter');
    const evaluatorsAndJudgeLabel = screen.getByText('Evaluators and judge');
    const scheduleAndAdvancedLabel = screen.getByText('Schedule and advanced');

    expect(nameLabel.compareDocumentPosition(targetAndFilterLabel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(targetAndFilterLabel.compareDocumentPosition(evaluatorsAndJudgeLabel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(evaluatorsAndJudgeLabel.compareDocumentPosition(scheduleAndAdvancedLabel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('renders advanced fields only after expanding the accordion', async () => {
    ({ container } = render(<CreateOnlineEvalFlyout onClose={onClose} />));

    const advancedAccordionButton = screen.getByRole('button', { name: 'Advanced' });
    expect(advancedAccordionButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(advancedAccordionButton);
    expect(advancedAccordionButton).toHaveAttribute('aria-expanded', 'true');

    expect(getByTestSubj('onlineEvalCreateIndexPatternInput')).toBeInTheDocument();
    expect(getByTestSubj('onlineEvalCreateWindowInput')).toBeInTheDocument();
    expect(getByTestSubj('onlineEvalCreateLagInput')).toBeInTheDocument();
    expect(getByTestSubj('onlineEvalCreateMaxTracesInput')).toBeInTheDocument();
  });

  it('submits workflow yaml that round-trips to the default config', async () => {
    ({ container } = render(<CreateOnlineEvalFlyout onClose={onClose} />));
    fireEvent.change(getByTestSubj('onlineEvalCreateNameInput'), {
      target: { value: 'nightly monitor' },
    });

    fireEvent.change(getByTestSubj('onlineEvalCreateEvaluatorsCombo'), {
      target: { value: 'correctness' },
    });
    fireEvent.blur(getByTestSubj('onlineEvalCreateEvaluatorsCombo'), {
      target: { value: 'correctness' },
    });
    fireEvent.change(getByTestSubj('onlineEvalCreateConnectorCombo'), {
      target: { value: 'connector-allowed' },
    });
    fireEvent.blur(getByTestSubj('onlineEvalCreateConnectorCombo'), {
      target: { value: 'connector-allowed' },
    });

    fireEvent.click(getByTestSubj('onlineEvalCreateSubmitButton'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const mutationArg = mutateAsync.mock.calls[0][0] as { yaml: string };
    const parsed = parseOnlineEvalWorkflowYaml(mutationArg.yaml);

    expect(parsed).toEqual({
      name: 'nightly monitor',
      indexPattern: 'traces-agent_builder.otel-default',
      windowMinutes: 60,
      lagMinutes: 15,
      maxTracesPerRun: 25,
      every: '1h',
      evaluators: [{ name: 'correctness', version: '1.2.3' }],
      connectorId: 'connector-allowed',
    });
    expect(screen.getByText('Saved workflow "nightly monitor"')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders workflow yaml preview when the toggle is enabled', async () => {
    ({ container } = render(<CreateOnlineEvalFlyout onClose={onClose} />));
    fireEvent.change(getByTestSubj('onlineEvalCreateNameInput'), {
      target: { value: 'yaml preview monitor' },
    });

    fireEvent.change(getByTestSubj('onlineEvalCreateEvaluatorsCombo'), {
      target: { value: 'correctness' },
    });
    fireEvent.blur(getByTestSubj('onlineEvalCreateEvaluatorsCombo'), {
      target: { value: 'correctness' },
    });
    fireEvent.change(getByTestSubj('onlineEvalCreateConnectorCombo'), {
      target: { value: 'connector-allowed' },
    });
    fireEvent.blur(getByTestSubj('onlineEvalCreateConnectorCombo'), {
      target: { value: 'connector-allowed' },
    });

    fireEvent.click(getByTestSubj('onlineEvalCreateShowYamlToggle'));

    expect(screen.getByTestId('evalsWorkflowYamlPreview')).toBeInTheDocument();
    expect(screen.getByTestId('evalsWorkflowYamlPreview')).toHaveTextContent(
      'name: "[online-eval] yaml preview monitor"'
    );
  });

  it('disables submit when selecting an llm evaluator without connector', async () => {
    ({ container } = render(<CreateOnlineEvalFlyout onClose={onClose} />));

    fireEvent.change(getByTestSubj('onlineEvalCreateNameInput'), {
      target: { value: 'monitor no connector' },
    });
    fireEvent.change(getByTestSubj('onlineEvalCreateEvaluatorsCombo'), {
      target: { value: 'correctness' },
    });
    fireEvent.blur(getByTestSubj('onlineEvalCreateEvaluatorsCombo'), {
      target: { value: 'correctness' },
    });

    expect(getByTestSubj('onlineEvalCreateSubmitButton')).toBeDisabled();
    expect(
      screen.getByText(
        'Requires a name and at least one evaluator (with a connector for LLM evaluators).'
      )
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
