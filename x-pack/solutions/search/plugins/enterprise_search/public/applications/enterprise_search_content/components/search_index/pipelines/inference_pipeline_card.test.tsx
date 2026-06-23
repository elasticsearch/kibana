/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues } from '../../../../__mocks__/kea_logic';

import React from 'react';

import { fireEvent, screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import type { InferencePipeline } from '../../../../../../common/types/pipelines';
import { TrainedModelState } from '../../../../../../common/types/pipelines';

import { InferencePipelineCard, TrainedModelHealthPopover } from './inference_pipeline_card';
import { MODEL_REDACTED_VALUE } from './ml_inference/utils';

export const DEFAULT_VALUES: InferencePipeline = {
  modelId: 'sample-bert-ner-model',
  modelState: TrainedModelState.Started,
  pipelineName: 'Sample Processor',
  pipelineReferences: [],
  types: ['pytorch', 'ner'],
  sourceFields: ['title', 'body'],
};

const mockValues = { ...DEFAULT_VALUES };

describe('InferencePipelineCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues(mockValues);
  });

  it('renders the item', () => {
    renderWithKibanaRenderContext(<InferencePipelineCard {...mockValues} />);
    expect(screen.getByRole('heading', { name: DEFAULT_VALUES.pipelineName })).toBeInTheDocument();
  });

  it('renders pipeline as title', () => {
    renderWithKibanaRenderContext(<InferencePipelineCard {...mockValues} />);
    expect(screen.getByRole('heading', { name: DEFAULT_VALUES.pipelineName })).toBeInTheDocument();
  });

  it('renders pipeline as title with unknown model type', () => {
    const values = { ...DEFAULT_VALUES, types: ['pytorch'] };
    renderWithKibanaRenderContext(<InferencePipelineCard {...values} />);
    expect(screen.getByRole('heading', { name: DEFAULT_VALUES.pipelineName })).toBeInTheDocument();
    // subtitle block not rendered when model type is unknown
    expect(screen.queryByText(DEFAULT_VALUES.modelId!)).not.toBeInTheDocument();
  });

  it('renders model ID as subtitle', () => {
    renderWithKibanaRenderContext(<InferencePipelineCard {...mockValues} />);
    expect(screen.getByText(DEFAULT_VALUES.modelId!)).toBeInTheDocument();
  });

  it("renders message about redaction instead of model ID if it's redacted", () => {
    const values = { ...DEFAULT_VALUES, modelId: '' };
    renderWithKibanaRenderContext(<InferencePipelineCard {...values} />);
    expect(screen.getByText(MODEL_REDACTED_VALUE)).toBeInTheDocument();
  });

  it('renders model type as badge', () => {
    renderWithKibanaRenderContext(<InferencePipelineCard {...mockValues} />);
    expect(screen.getByText('ner')).toBeInTheDocument();
  });

  it('does not render model type if model ID is redacted', () => {
    const values = { ...DEFAULT_VALUES, modelId: '' };
    renderWithKibanaRenderContext(<InferencePipelineCard {...values} />);
    expect(screen.queryByText('ner')).not.toBeInTheDocument();
  });

  it('renders source fields', () => {
    renderWithKibanaRenderContext(<InferencePipelineCard {...mockValues} />);
    expect(screen.getByText('title, body')).toBeInTheDocument();
  });

  it('does not render source fields if there are none', () => {
    const values = { ...DEFAULT_VALUES, sourceFields: undefined };
    renderWithKibanaRenderContext(<InferencePipelineCard {...values} />);
    expect(screen.queryByText('title, body')).not.toBeInTheDocument();
  });
});

describe('TrainedModelHealthPopover', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues(mockValues);
  });

  it('popover renders fix button when model not deployed', () => {
    const values = { ...DEFAULT_VALUES, modelState: TrainedModelState.NotDeployed };
    renderWithKibanaRenderContext(<TrainedModelHealthPopover {...values} />);

    fireEvent.click(screen.getByTestId('enterpriseSearchTrainedModelHealthPopoverButton'));

    const fixButton = screen.getByTestId(
      'enterpriseSearchTrainedModelHealthPopoverFixIssueInTrainedModelsButton'
    );
    expect(fixButton).toBeInTheDocument();
    expect(fixButton).toHaveAttribute('href', '/app/management/ml/trained_models');
  });

  it('popover does not render fix button when model deployed', () => {
    renderWithKibanaRenderContext(<TrainedModelHealthPopover {...mockValues} />);

    fireEvent.click(screen.getByTestId('enterpriseSearchTrainedModelHealthPopoverButton'));

    expect(
      screen.queryByTestId('enterpriseSearchTrainedModelHealthPopoverFixIssueInTrainedModelsButton')
    ).not.toBeInTheDocument();
  });
});
