/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues, setMockActions } from '../../../../../__mocks__/kea_logic';

// EuiStepsHorizontal uses complex DOM measurement. Capturing the steps prop lets us
// verify step status and onClick behavior without relying on EUI internals.
let capturedSteps: any[] | undefined;

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    EuiStepsHorizontal: (props: any) => {
      capturedSteps = props.steps;
      return <div data-test-subj="euiStepsHorizontal" />;
    },
  };
});

jest.mock('./configure_pipeline', () => ({
  ConfigurePipeline: () => <div data-test-subj="configurePipeline" />,
}));

jest.mock('./configure_fields', () => ({
  ConfigureFields: () => <div data-test-subj="configureFields" />,
}));

jest.mock('./test_pipeline', () => ({
  TestPipeline: () => <div data-test-subj="testPipeline" />,
}));

jest.mock('./review_pipeline', () => ({
  ReviewPipeline: () => <div data-test-subj="reviewPipeline" />,
}));

import React from 'react';

import { fireEvent, screen } from '@testing-library/react';

import type { TrainedModelConfigResponse } from '@kbn/ml-common-types/trained_models';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import {
  AddInferencePipelineFlyout,
  AddInferencePipelineContent,
  AddInferencePipelineHorizontalSteps,
  AddInferencePipelineFooter,
} from './add_inference_pipeline_flyout';
import { EMPTY_PIPELINE_CONFIGURATION } from './ml_inference_logic';
import { AddInferencePipelineSteps } from './types';

const supportedMLModels: TrainedModelConfigResponse[] = [
  {
    inference_config: {
      ner: {},
    },
    input: {
      field_names: [],
    },
    model_id: 'test_model_id',
    model_type: 'pytorch',
    tags: ['test_tag'],
    version: '1',
  },
];
const DEFAULT_VALUES = {
  addInferencePipelineModal: {
    configuration: { ...EMPTY_PIPELINE_CONFIGURATION },
    indexName: 'unit-test-index',
    simulateBody: '',
    step: AddInferencePipelineSteps.Configuration,
  },
  createErrors: [],
  indexName: 'unit-test-index',
  ingestionMethod: 'crawler',
  isLoading: false,
  isConfigureStepValid: true,
  isPipelineDataValid: true,
  supportedMLModels,
};
const onClose = jest.fn();

describe('AddInferencePipelineFlyout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedSteps = undefined;
    setMockValues({ ...DEFAULT_VALUES });
    setMockActions({
      attachPipeline: jest.fn(),
      createPipeline: jest.fn(),
      makeMappingRequest: jest.fn(),
      makeMlInferencePipelinesRequest: jest.fn(),
      onAddInferencePipelineStepChange: jest.fn(),
      setIndexName: jest.fn(),
      startPollingModels: jest.fn(),
    });
  });
  it('renders AddInferencePipelineContent', () => {
    renderWithKibanaRenderContext(<AddInferencePipelineFlyout onClose={onClose} />);
    expect(screen.getByText('Add an inference pipeline')).toBeInTheDocument();
    expect(screen.getByTestId('euiStepsHorizontal')).toBeInTheDocument();
  });
  describe('AddInferencePipelineContent', () => {
    const baseActions = {
      attachPipeline: jest.fn(),
      createPipeline: jest.fn(),
      onAddInferencePipelineStepChange: jest.fn(),
    };

    beforeEach(() => {
      jest.clearAllMocks();
      capturedSteps = undefined;
      setMockValues({ ...DEFAULT_VALUES });
      setMockActions(baseActions);
    });

    it('renders spinner when loading', () => {
      setMockValues({ ...DEFAULT_VALUES, isLoading: true });
      renderWithKibanaRenderContext(<AddInferencePipelineContent onClose={onClose} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.queryByTestId('configurePipeline')).not.toBeInTheDocument();
    });

    it('renders AddInferencePipelineHorizontalSteps', () => {
      renderWithKibanaRenderContext(<AddInferencePipelineContent onClose={onClose} />);
      expect(screen.getByTestId('euiStepsHorizontal')).toBeInTheDocument();
    });

    it('renders ModalFooter with Continue button', () => {
      renderWithKibanaRenderContext(<AddInferencePipelineContent onClose={onClose} />);
      expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    });

    it('renders errors', () => {
      const errorMsg = 'oh no!';
      setMockValues({ ...DEFAULT_VALUES, createErrors: [errorMsg] });
      renderWithKibanaRenderContext(<AddInferencePipelineContent onClose={onClose} />);
      expect(screen.getByText('Error creating pipeline')).toBeInTheDocument();
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });

    it('renders configure step', () => {
      renderWithKibanaRenderContext(<AddInferencePipelineContent onClose={onClose} />);
      expect(screen.getByTestId('configurePipeline')).toBeInTheDocument();
    });

    it('renders fields step', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: {
          ...DEFAULT_VALUES.addInferencePipelineModal,
          step: AddInferencePipelineSteps.Fields,
        },
      });
      renderWithKibanaRenderContext(<AddInferencePipelineContent onClose={onClose} />);
      expect(screen.getByTestId('configureFields')).toBeInTheDocument();
    });

    it('renders test step', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: {
          ...DEFAULT_VALUES.addInferencePipelineModal,
          step: AddInferencePipelineSteps.Test,
        },
      });
      renderWithKibanaRenderContext(<AddInferencePipelineContent onClose={onClose} />);
      expect(screen.getByTestId('testPipeline')).toBeInTheDocument();
    });

    it('renders review step', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: {
          ...DEFAULT_VALUES.addInferencePipelineModal,
          step: AddInferencePipelineSteps.Review,
        },
      });
      renderWithKibanaRenderContext(<AddInferencePipelineContent onClose={onClose} />);
      expect(screen.getByTestId('reviewPipeline')).toBeInTheDocument();
    });
  });
  describe('AddInferencePipelineHorizontalSteps', () => {
    const CONFIGURE_STEP_INDEX = 0;
    const FIELDS_STEP_INDEX = 1;
    const TEST_STEP_INDEX = 2;
    const REVIEW_STEP_INDEX = 3;
    const onAddInferencePipelineStepChange = jest.fn();
    beforeEach(() => {
      jest.clearAllMocks();
      capturedSteps = undefined;
      setMockValues({ ...DEFAULT_VALUES });
      setMockActions({ onAddInferencePipelineStepChange });
    });
    it('renders EuiStepsHorizontal', () => {
      renderWithKibanaRenderContext(<AddInferencePipelineHorizontalSteps />);
      expect(screen.getByTestId('euiStepsHorizontal')).toBeInTheDocument();
    });

    const testStepStatus = (stepIndex: number, expectedTitle: string, expectedStatus: string) => {
      renderWithKibanaRenderContext(<AddInferencePipelineHorizontalSteps />);
      expect(capturedSteps![stepIndex].title).toBe(expectedTitle);
      expect(capturedSteps![stepIndex].status).toBe(expectedStatus);
    };

    it('configure step is current with valid data', () => {
      testStepStatus(CONFIGURE_STEP_INDEX, 'Configure', 'current');
    });
    it('configure step is current with invalid data', () => {
      setMockValues({ ...DEFAULT_VALUES, isConfigureStepValid: false });
      testStepStatus(CONFIGURE_STEP_INDEX, 'Configure', 'current');
    });
    it('configure step is complete when on later step', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: { step: AddInferencePipelineSteps.Review },
      });
      testStepStatus(CONFIGURE_STEP_INDEX, 'Configure', 'complete');
    });
    it('fields step is current with valid data', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: { step: AddInferencePipelineSteps.Fields },
      });
      testStepStatus(FIELDS_STEP_INDEX, 'Fields', 'current');
    });
    it('fields step is current with invalid data', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: { step: AddInferencePipelineSteps.Fields },
        isPipelineDataValid: false,
      });
      testStepStatus(FIELDS_STEP_INDEX, 'Fields', 'current');
    });
    it('fields step is complete when on later step', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: { step: AddInferencePipelineSteps.Review },
      });
      testStepStatus(FIELDS_STEP_INDEX, 'Fields', 'complete');
    });
    it('test step is current when on step', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: { step: AddInferencePipelineSteps.Test },
      });
      testStepStatus(TEST_STEP_INDEX, 'Test (Optional)', 'current');
    });
    it('test step is complete when on later step', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: { step: AddInferencePipelineSteps.Review },
      });
      testStepStatus(TEST_STEP_INDEX, 'Test (Optional)', 'complete');
    });
    it('review step is current when on step', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: { step: AddInferencePipelineSteps.Review },
      });
      testStepStatus(REVIEW_STEP_INDEX, 'Review', 'current');
    });

    const testClickStep = (stepIndex: number, expectedStep: AddInferencePipelineSteps) => {
      renderWithKibanaRenderContext(<AddInferencePipelineHorizontalSteps />);
      capturedSteps![stepIndex].onClick({} as any);
      expect(onAddInferencePipelineStepChange).toHaveBeenCalledWith(expectedStep);
    };

    it('clicking configure step updates step', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: { step: AddInferencePipelineSteps.Review },
      });
      testClickStep(CONFIGURE_STEP_INDEX, AddInferencePipelineSteps.Configuration);
    });
    it('clicking fields step updates step', () => {
      testClickStep(FIELDS_STEP_INDEX, AddInferencePipelineSteps.Fields);
    });
    it('clicking test step updates step', () => {
      testClickStep(TEST_STEP_INDEX, AddInferencePipelineSteps.Test);
    });
    it('clicking review step updates step', () => {
      testClickStep(REVIEW_STEP_INDEX, AddInferencePipelineSteps.Review);
    });

    const testCannotClickInvalidStep = (stepIndex: number) => {
      renderWithKibanaRenderContext(<AddInferencePipelineHorizontalSteps />);
      capturedSteps![stepIndex].onClick({} as any);
      expect(onAddInferencePipelineStepChange).not.toHaveBeenCalled();
    };

    it('cannot click fields step when data is invalid', () => {
      setMockValues({ ...DEFAULT_VALUES, isConfigureStepValid: false });
      testCannotClickInvalidStep(FIELDS_STEP_INDEX);
    });
    it('cannot click test step when data is invalid', () => {
      setMockValues({ ...DEFAULT_VALUES, isPipelineDataValid: false });
      testCannotClickInvalidStep(TEST_STEP_INDEX);
    });
    it('cannot click review step when data is invalid', () => {
      setMockValues({ ...DEFAULT_VALUES, isPipelineDataValid: false });
      testCannotClickInvalidStep(REVIEW_STEP_INDEX);
    });
  });
  describe('ModalFooter', () => {
    const ingestionMethod = 'crawler';
    const actions = {
      attachPipeline: jest.fn(),
      createPipeline: jest.fn(),
      onAddInferencePipelineStepChange: jest.fn(),
    };
    beforeEach(() => {
      jest.clearAllMocks();
      setMockValues({ ...DEFAULT_VALUES });
      setMockActions(actions);
    });
    it('renders cancel button on config step', () => {
      renderWithKibanaRenderContext(
        <AddInferencePipelineFooter ingestionMethod={ingestionMethod} onClose={onClose} />
      );
      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    it('renders cancel button on fields step', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: {
          ...DEFAULT_VALUES.addInferencePipelineModal,
          step: AddInferencePipelineSteps.Fields,
        },
      });
      renderWithKibanaRenderContext(
        <AddInferencePipelineFooter ingestionMethod={ingestionMethod} onClose={onClose} />
      );
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    it('renders cancel button on test step', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: {
          ...DEFAULT_VALUES.addInferencePipelineModal,
          step: AddInferencePipelineSteps.Test,
        },
      });
      renderWithKibanaRenderContext(
        <AddInferencePipelineFooter ingestionMethod={ingestionMethod} onClose={onClose} />
      );
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    it('renders cancel button on review step', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: {
          ...DEFAULT_VALUES.addInferencePipelineModal,
          step: AddInferencePipelineSteps.Review,
        },
      });
      renderWithKibanaRenderContext(
        <AddInferencePipelineFooter ingestionMethod={ingestionMethod} onClose={onClose} />
      );
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    const testBackButton = (
      currentStep: AddInferencePipelineSteps,
      expectedStep: AddInferencePipelineSteps
    ) => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: {
          ...DEFAULT_VALUES.addInferencePipelineModal,
          step: currentStep,
        },
      });
      renderWithKibanaRenderContext(
        <AddInferencePipelineFooter ingestionMethod={ingestionMethod} onClose={onClose} />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(actions.onAddInferencePipelineStepChange).toHaveBeenCalledWith(expectedStep);
    };

    it('renders back button on fields step', () => {
      testBackButton(AddInferencePipelineSteps.Fields, AddInferencePipelineSteps.Configuration);
    });
    it('renders back button on test step', () => {
      testBackButton(AddInferencePipelineSteps.Test, AddInferencePipelineSteps.Fields);
    });
    it('renders back button on review step', () => {
      testBackButton(AddInferencePipelineSteps.Review, AddInferencePipelineSteps.Test);
    });

    it('renders enabled continue button with valid data', () => {
      renderWithKibanaRenderContext(
        <AddInferencePipelineFooter ingestionMethod={ingestionMethod} onClose={onClose} />
      );
      const continueBtn = screen.getByRole('button', { name: 'Continue' });
      expect(continueBtn).not.toBeDisabled();
      fireEvent.click(continueBtn);
      expect(actions.onAddInferencePipelineStepChange).toHaveBeenCalledWith(
        AddInferencePipelineSteps.Fields
      );
    });
    it('renders disabled continue button with invalid data', () => {
      setMockValues({ ...DEFAULT_VALUES, isConfigureStepValid: false });
      renderWithKibanaRenderContext(
        <AddInferencePipelineFooter ingestionMethod={ingestionMethod} onClose={onClose} />
      );
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    });
    it('renders continue button on fields step', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: {
          ...DEFAULT_VALUES.addInferencePipelineModal,
          step: AddInferencePipelineSteps.Fields,
        },
      });
      renderWithKibanaRenderContext(
        <AddInferencePipelineFooter ingestionMethod={ingestionMethod} onClose={onClose} />
      );
      const continueBtn = screen.getByRole('button', { name: 'Continue' });
      expect(continueBtn).not.toBeDisabled();
      fireEvent.click(continueBtn);
      expect(actions.onAddInferencePipelineStepChange).toHaveBeenCalledWith(
        AddInferencePipelineSteps.Test
      );
    });
    it('renders continue button on test step', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: {
          ...DEFAULT_VALUES.addInferencePipelineModal,
          step: AddInferencePipelineSteps.Test,
        },
      });
      renderWithKibanaRenderContext(
        <AddInferencePipelineFooter ingestionMethod={ingestionMethod} onClose={onClose} />
      );
      const continueBtn = screen.getByRole('button', { name: 'Continue' });
      expect(continueBtn).not.toBeDisabled();
      fireEvent.click(continueBtn);
      expect(actions.onAddInferencePipelineStepChange).toHaveBeenCalledWith(
        AddInferencePipelineSteps.Review
      );
    });
    it('renders create button on review step', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: {
          ...DEFAULT_VALUES.addInferencePipelineModal,
          step: AddInferencePipelineSteps.Review,
          configuration: {
            existingPipeline: false,
            modelID: 'test-model',
            pipelineName: 'my-test-pipeline',
          },
        },
      });
      renderWithKibanaRenderContext(
        <AddInferencePipelineFooter ingestionMethod={ingestionMethod} onClose={onClose} />
      );
      const createBtn = screen.getByRole('button', { name: 'Create pipeline' });
      expect(createBtn).toBeInTheDocument();
      fireEvent.click(createBtn);
      expect(actions.createPipeline).toHaveBeenCalledTimes(1);
    });
    it('renders attach button on review step', () => {
      setMockValues({
        ...DEFAULT_VALUES,
        addInferencePipelineModal: {
          ...DEFAULT_VALUES.addInferencePipelineModal,
          step: AddInferencePipelineSteps.Review,
          configuration: {
            existingPipeline: true,
            modelID: 'test-model',
            pipelineName: 'my-test-pipeline',
          },
        },
      });
      renderWithKibanaRenderContext(
        <AddInferencePipelineFooter ingestionMethod={ingestionMethod} onClose={onClose} />
      );
      const attachBtn = screen.getByRole('button', { name: 'Attach' });
      expect(attachBtn).toBeInTheDocument();
      fireEvent.click(attachBtn);
      expect(actions.attachPipeline).toHaveBeenCalledTimes(1);
    });
  });
});
