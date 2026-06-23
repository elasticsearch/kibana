/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockActions, setMockValues } from '../../../../../__mocks__/kea_logic';

// EuiSelectable uses ResizeObserver and complex internal state in JSDOM.
// Capturing the onChange callback lets us verify selection logic without
// relying on EUI's internal click handling or DOM measurement.
let capturedOnChange: ((options: any[]) => void) | undefined;

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    EuiSelectable: (props: any) => {
      capturedOnChange = props.onChange;
      const options = props.options ?? [];
      return (
        <div data-test-subj="euiSelectable">
          {options.map((opt: any) => (
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

import type { MlModel } from '../../../../../../../common/types/ml';
import { MlModelDeploymentState } from '../../../../../../../common/types/ml';

import { ModelSelect, SelectedModel } from './model_select';

const DEFAULT_VALUES = {
  addInferencePipelineModal: {
    configuration: {},
    indexName: 'my-index',
  },
  selectableModels: [{ modelId: 'model_1' }, { modelId: 'model_2' }],
};

const DEFAULT_MODEL: MlModel = {
  modelId: 'model_1',
  type: 'ner',
  title: 'Model 1',
  description: 'Model 1 description',
  licenseType: 'elastic',
  modelDetailsPageUrl: 'https://my-model.ai',
  deploymentState: MlModelDeploymentState.NotDeployed,
  startTime: 0,
  targetAllocationCount: 0,
  nodeAllocationCount: 0,
  threadsPerAllocation: 0,
  isPlaceholder: false,
  hasStats: false,
  types: ['pytorch', 'ner'],
  inputFieldNames: ['title'],
  version: '1',
};

const MOCK_ACTIONS = {
  setInferencePipelineConfiguration: jest.fn(),
};

describe('ModelSelect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnChange = undefined;
    setMockValues({});
    setMockActions(MOCK_ACTIONS);
  });

  it('renders model select with no options', () => {
    setMockValues({ ...DEFAULT_VALUES, selectableModels: null });
    renderWithKibanaRenderContext(<ModelSelect />);
    expect(screen.getByTestId('euiSelectable')).toBeInTheDocument();
    expect(screen.queryByTestId(/^option-/)).not.toBeInTheDocument();
  });

  it('renders model select with options', () => {
    setMockValues(DEFAULT_VALUES);
    renderWithKibanaRenderContext(<ModelSelect />);
    expect(screen.getByTestId('option-model_1')).toBeInTheDocument();
    expect(screen.getByTestId('option-model_2')).toBeInTheDocument();
  });

  it('selects the chosen option', () => {
    setMockValues({
      ...DEFAULT_VALUES,
      addInferencePipelineModal: {
        configuration: { modelID: 'model_2' },
      },
    });
    renderWithKibanaRenderContext(<ModelSelect />);
    expect(screen.getByTestId('option-model_2')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('option-model_1')).toHaveAttribute('aria-selected', 'false');
  });

  it('sets model ID on selecting an item and clears config', () => {
    setMockValues(DEFAULT_VALUES);
    renderWithKibanaRenderContext(<ModelSelect />);

    capturedOnChange!([
      { data: { modelId: 'model_1' } },
      { data: { modelId: 'model_2' }, checked: 'on' },
    ]);

    expect(MOCK_ACTIONS.setInferencePipelineConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({
        inferenceConfig: undefined,
        modelID: 'model_2',
        fieldMappings: undefined,
      })
    );
  });

  it('sets placeholder flag on selecting a placeholder item', () => {
    setMockValues(DEFAULT_VALUES);
    renderWithKibanaRenderContext(<ModelSelect />);

    capturedOnChange!([
      { data: { modelId: 'model_1' } },
      { data: { modelId: 'model_2', isPlaceholder: true }, checked: 'on' },
    ]);

    expect(MOCK_ACTIONS.setInferencePipelineConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({
        modelID: 'model_2',
        isModelPlaceholderSelected: true,
      })
    );
  });

  it('generates pipeline name on selecting an item', () => {
    setMockValues(DEFAULT_VALUES);
    renderWithKibanaRenderContext(<ModelSelect />);

    capturedOnChange!([
      { data: { modelId: 'model_1' } },
      { data: { modelId: 'model_2' }, checked: 'on' },
    ]);

    expect(MOCK_ACTIONS.setInferencePipelineConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ pipelineName: 'my-index-model_2' })
    );
  });

  it('does not generate pipeline name on selecting an item if it a name was supplied by the user', () => {
    setMockValues({
      ...DEFAULT_VALUES,
      addInferencePipelineModal: {
        configuration: {
          pipelineName: 'user-pipeline',
          isPipelineNameUserSupplied: true,
        },
        indexName: 'my-index',
      },
    });
    renderWithKibanaRenderContext(<ModelSelect />);

    capturedOnChange!([
      { data: { modelId: 'model_1' } },
      { data: { modelId: 'model_2' }, checked: 'on' },
    ]);

    expect(MOCK_ACTIONS.setInferencePipelineConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ pipelineName: 'user-pipeline' })
    );
  });

  it('renders selected model panel if a model is selected', () => {
    setMockValues({
      ...DEFAULT_VALUES,
      addInferencePipelineModal: { configuration: { modelID: 'model_2' } },
      selectedModel: DEFAULT_MODEL,
    });
    renderWithKibanaRenderContext(<ModelSelect />);
    expect(screen.getByText('Model 1')).toBeInTheDocument();
    expect(
      screen.queryByText('Select an available model to add to your inference pipeline')
    ).not.toBeInTheDocument();
  });

  it('renders no model selected panel if no model is selected', () => {
    setMockValues(DEFAULT_VALUES);
    renderWithKibanaRenderContext(<ModelSelect />);
    expect(
      screen.getByText('Select an available model to add to your inference pipeline')
    ).toBeInTheDocument();
  });

  describe('SelectedModel', () => {
    beforeEach(() => {
      setMockActions({ createModel: jest.fn(), startModel: jest.fn() });
      setMockValues({ areActionButtonsDisabled: false });
    });

    it('renders with license badge if present', () => {
      renderWithKibanaRenderContext(<SelectedModel {...DEFAULT_MODEL} />);
      expect(screen.getByText(/License: elastic/i)).toBeInTheDocument();
    });

    it('renders without license badge if not present', () => {
      renderWithKibanaRenderContext(<SelectedModel {...DEFAULT_MODEL} licenseType={undefined} />);
      expect(screen.queryByText(/License:/i)).not.toBeInTheDocument();
    });

    it('renders with description if present', () => {
      renderWithKibanaRenderContext(<SelectedModel {...DEFAULT_MODEL} />);
      expect(screen.getByText('Model 1 description')).toBeInTheDocument();
    });

    it('renders without description if not present', () => {
      renderWithKibanaRenderContext(<SelectedModel {...DEFAULT_MODEL} description={undefined} />);
      expect(screen.queryByText('Model 1 description')).not.toBeInTheDocument();
    });

    it('renders deploy button for a model placeholder', () => {
      renderWithKibanaRenderContext(<SelectedModel {...DEFAULT_MODEL} isPlaceholder />);
      expect(screen.getByText('Deploy')).toBeInTheDocument();
    });

    it('renders start button for a downloaded model', () => {
      renderWithKibanaRenderContext(
        <SelectedModel {...DEFAULT_MODEL} deploymentState={MlModelDeploymentState.NotDeployed} />
      );
      expect(screen.getByText('Start')).toBeInTheDocument();
    });
  });
});
