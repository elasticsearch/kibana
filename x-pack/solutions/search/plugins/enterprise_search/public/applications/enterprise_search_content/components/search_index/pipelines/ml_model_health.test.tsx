/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues } from '../../../../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { MlModelDeploymentState } from '../../../../../../common/types/ml';
import type { InferencePipeline } from '../../../../../../common/types/pipelines';
import { TrainedModelState } from '../../../../../../common/types/pipelines';

import { TrainedModelHealth } from './ml_model_health';

describe('TrainedModelHealth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues({});
  });

  const commonModelData: InferencePipeline = {
    modelId: 'sample-bert-ner-model',
    modelState: TrainedModelState.NotDeployed,
    pipelineName: 'Sample Processor',
    pipelineReferences: [],
    types: ['pytorch'],
  };

  it('renders model downloading', () => {
    renderWithKibanaRenderContext(
      <TrainedModelHealth modelState={MlModelDeploymentState.Downloading} />
    );
    expect(screen.getByText('Deploying')).toBeInTheDocument();
  });

  it('renders model downloaded', () => {
    renderWithKibanaRenderContext(
      <TrainedModelHealth modelState={MlModelDeploymentState.Downloaded} />
    );
    expect(screen.getByText('Deployed')).toBeInTheDocument();
  });

  it('renders model started', () => {
    const pipeline: InferencePipeline = {
      ...commonModelData,
      modelState: TrainedModelState.Started,
    };
    const { modelState, modelStateReason } = pipeline;
    renderWithKibanaRenderContext(
      <TrainedModelHealth modelState={modelState} modelStateReason={modelStateReason} />
    );
    expect(screen.getByText('Started')).toBeInTheDocument();
  });

  it('renders model not deployed', () => {
    const pipeline: InferencePipeline = { ...commonModelData };
    const { modelState, modelStateReason } = pipeline;
    renderWithKibanaRenderContext(
      <TrainedModelHealth modelState={modelState} modelStateReason={modelStateReason} />
    );
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });

  it('renders model not downloaded for downloadable models', () => {
    renderWithKibanaRenderContext(
      <TrainedModelHealth modelState={MlModelDeploymentState.NotDeployed} isDownloadable />
    );
    expect(screen.getByText('Not deployed')).toBeInTheDocument();
  });

  it('renders model stopping', () => {
    const pipeline: InferencePipeline = {
      ...commonModelData,
      modelState: TrainedModelState.Stopping,
    };
    const { modelState, modelStateReason } = pipeline;
    renderWithKibanaRenderContext(
      <TrainedModelHealth modelState={modelState} modelStateReason={modelStateReason} />
    );
    expect(screen.getByText('Stopping')).toBeInTheDocument();
  });

  it('renders model starting', () => {
    const pipeline: InferencePipeline = {
      ...commonModelData,
      modelState: TrainedModelState.Starting,
    };
    const { modelState, modelStateReason } = pipeline;
    renderWithKibanaRenderContext(
      <TrainedModelHealth modelState={modelState} modelStateReason={modelStateReason} />
    );
    expect(screen.getByText('Starting')).toBeInTheDocument();
  });

  it('renders model failed', () => {
    const pipeline: InferencePipeline = {
      ...commonModelData,
      modelState: TrainedModelState.Failed,
      modelStateReason: 'Model start boom.',
    };
    const { modelState, modelStateReason } = pipeline;
    renderWithKibanaRenderContext(
      <TrainedModelHealth modelState={modelState} modelStateReason={modelStateReason} />
    );
    expect(screen.getByText('Deployment failed')).toBeInTheDocument();
  });
});
