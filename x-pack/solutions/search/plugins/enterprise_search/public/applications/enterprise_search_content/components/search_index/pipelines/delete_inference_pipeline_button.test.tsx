/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import type { InferencePipeline } from '../../../../../../common/types/pipelines';
import { TrainedModelState } from '../../../../../../common/types/pipelines';

import { DeleteInferencePipelineButton } from './delete_inference_pipeline_button';

export const DEFAULT_VALUES: InferencePipeline = {
  modelId: 'sample-bert-ner-model',
  modelState: TrainedModelState.Started,
  pipelineName: 'Sample Processor',
  pipelineReferences: ['index@ml-inference'],
  types: ['pytorch', 'ner'],
};

describe('DeleteInferencePipelineButton', () => {
  const onClickHandler = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders button with defaults', () => {
    renderWithKibanaRenderContext(
      <DeleteInferencePipelineButton onClick={onClickHandler} pipeline={DEFAULT_VALUES} />
    );
    const btn = screen.getByText('Delete pipeline');
    expect(btn).toBeInTheDocument();
    expect(btn.closest('button')).not.toBeDisabled();
  });

  it('renders disabled with tooltip with multiple references', () => {
    renderWithKibanaRenderContext(
      <DeleteInferencePipelineButton
        onClick={onClickHandler}
        pipeline={{
          ...DEFAULT_VALUES,
          pipelineReferences: ['index@ml-inference', 'other-index@ml-inference'],
        }}
      />
    );
    const btn = screen.getByText('Delete pipeline');
    expect(btn.closest('button')).toBeDisabled();
  });
});
