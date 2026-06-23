/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import type { MLInferencePipelineOption } from './pipeline_select_logic';
import { PipelineSelectOption } from './pipeline_select_option';
import { MODEL_REDACTED_VALUE } from './utils';

describe('PipelineSelectOption', () => {
  const pipeline: MLInferencePipelineOption = {
    disabled: false,
    disabledReason: undefined,
    modelId: 'my-model-id',
    modelType: 'my-model-type',
    pipelineName: 'my-pipeline',
    sourceFields: ['my-source-field1', 'my-source-field2'],
    indexFields: [],
  };
  const label = pipeline.pipelineName;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders pipeline selection option', () => {
    renderWithKibanaRenderContext(<PipelineSelectOption label={label} pipeline={pipeline} />);
    expect(screen.getByRole('heading', { name: pipeline.pipelineName })).toBeInTheDocument();
    expect(screen.getByText('my-model-type')).toBeInTheDocument();
  });

  it('does not render model type badge if model type is unknown', () => {
    renderWithKibanaRenderContext(
      <PipelineSelectOption label={label} pipeline={{ ...pipeline, modelType: '' }} />
    );
    expect(screen.queryByText('my-model-type')).not.toBeInTheDocument();
  });

  it("redacts model ID if it's unavailable", () => {
    renderWithKibanaRenderContext(
      <PipelineSelectOption label={label} pipeline={{ ...pipeline, modelId: '' }} />
    );
    expect(screen.getByText(MODEL_REDACTED_VALUE)).toBeInTheDocument();
  });

  it('renders disable warning text if the pipeline is disabled', () => {
    renderWithKibanaRenderContext(
      <PipelineSelectOption
        label={label}
        pipeline={{ ...pipeline, disabled: true, disabledReason: 'my-reason' }}
      />
    );
    expect(screen.getByText('my-reason')).toBeInTheDocument();
  });
});
