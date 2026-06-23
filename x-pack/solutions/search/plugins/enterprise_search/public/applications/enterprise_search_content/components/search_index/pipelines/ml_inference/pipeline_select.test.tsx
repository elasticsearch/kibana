/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockActions, setMockValues } from '../../../../../__mocks__/kea_logic';

// EuiSelectable has complex internal state and uses ResizeObserver for height calculations.
// Capturing the onChange callback lets us verify the selection logic without depending on
// EUI's internal click handling or DOM measurement in JSDOM.
let capturedOnChange: ((options: any[]) => void) | undefined;

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    EuiSelectable: (props: any) => {
      capturedOnChange = props.onChange;
      const renderedOptions = props.options ?? [];
      return (
        <div data-test-subj="euiSelectable">
          {renderedOptions.map((opt: any) => (
            <div
              key={opt.label}
              data-test-subj={`option-${opt.label}`}
              aria-selected={opt.checked === 'on'}
            >
              {opt.label}
            </div>
          ))}
        </div>
      );
    },
  };
});

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { PipelineSelect } from './pipeline_select';

const DEFAULT_VALUES = {
  addInferencePipelineModal: {
    configuration: {
      pipelineName: '',
    },
  },
  existingInferencePipelines: [],
};

const MOCK_ACTIONS = {
  selectExistingPipeline: jest.fn(),
};

describe('PipelineSelect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnChange = undefined;
    setMockValues({});
    setMockActions(MOCK_ACTIONS);
  });

  it('renders pipeline select with no options', () => {
    setMockValues(DEFAULT_VALUES);
    renderWithKibanaRenderContext(<PipelineSelect />);
    expect(screen.getByTestId('euiSelectable')).toBeInTheDocument();
    expect(screen.queryByTestId(/^option-/)).not.toBeInTheDocument();
  });

  it('renders pipeline options', () => {
    setMockValues({
      ...DEFAULT_VALUES,
      existingInferencePipelines: [
        {
          modelId: 'model_1',
          modelType: 'model_1_type',
          pipelineName: 'pipeline_1',
          sourceFields: [],
        },
        {
          modelId: 'model_2',
          modelType: 'model_2_type',
          pipelineName: 'pipeline_2',
          sourceFields: [],
        },
        {
          modelId: 'model_3',
          modelType: 'model_3_type',
          pipelineName: 'pipeline_3',
          sourceFields: [],
        },
      ],
    });
    renderWithKibanaRenderContext(<PipelineSelect />);
    expect(screen.getByTestId('option-pipeline_1')).toBeInTheDocument();
    expect(screen.getByTestId('option-pipeline_2')).toBeInTheDocument();
    expect(screen.getByTestId('option-pipeline_3')).toBeInTheDocument();
  });

  it('selects the chosen option', () => {
    setMockValues({
      addInferencePipelineModal: { configuration: { pipelineName: 'pipeline_3' } },
      existingInferencePipelines: [
        { modelId: 'model_1', modelType: 'model_1_type', pipelineName: 'pipeline_1' },
        { modelId: 'model_2', modelType: 'model_2_type', pipelineName: 'pipeline_2' },
        { modelId: 'model_3', modelType: 'model_3_type', pipelineName: 'pipeline_3' },
      ],
    });
    renderWithKibanaRenderContext(<PipelineSelect />);
    expect(screen.getByTestId('option-pipeline_3')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('option-pipeline_1')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('option-pipeline_2')).toHaveAttribute('aria-selected', 'false');
  });

  it('sets pipeline name on selecting a pipeline', () => {
    setMockValues(DEFAULT_VALUES);
    renderWithKibanaRenderContext(<PipelineSelect />);

    capturedOnChange!([
      { label: 'pipeline_1', pipeline: { pipelineName: 'pipeline_1' } },
      { checked: 'on', label: 'pipeline_2', pipeline: { pipelineName: 'pipeline_2' } },
    ]);

    expect(MOCK_ACTIONS.selectExistingPipeline).toHaveBeenCalledWith('pipeline_2');
  });
});
