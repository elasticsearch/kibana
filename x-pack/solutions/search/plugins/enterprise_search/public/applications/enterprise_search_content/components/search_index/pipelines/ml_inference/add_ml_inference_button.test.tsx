/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues } from '../../../../../__mocks__/kea_logic';

import React from 'react';

import { fireEvent, screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { AddMLInferencePipelineButton } from './add_ml_inference_button';

const DEFAULT_VALUES = {
  canUseMlInferencePipeline: true,
  capabilities: {
    ml: {
      canGetTrainedModels: true,
    },
  },
  hasIndexIngestionPipeline: true,
  ingestionMethod: 'crawler',
};

describe('add inference pipeline button', () => {
  const onClick = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues({ ...DEFAULT_VALUES });
  });

  it('renders button', () => {
    renderWithKibanaRenderContext(<AddMLInferencePipelineButton onClick={onClick} />);
    expect(screen.getByRole('button', { name: /Add Inference Pipeline/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Inference Pipeline/i })).not.toBeDisabled();
  });

  it('renders permission tooltip when user cannot get trained models', async () => {
    setMockValues({ ...DEFAULT_VALUES, capabilities: {} });
    renderWithKibanaRenderContext(<AddMLInferencePipelineButton onClick={onClick} />);

    // EuiToolTip wraps the disabled button in a span to capture hover events
    // (disabled buttons have pointer-events:none and don't fire mouse events)
    const button = screen.getByRole('button', { name: /Add Inference Pipeline/i });
    expect(button).toBeDisabled();
    fireEvent.mouseOver(button.parentElement!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/permission/i);
  });

  it('renders copy & customize tooltip with index pipeline', async () => {
    setMockValues({ ...DEFAULT_VALUES, hasIndexIngestionPipeline: false });
    renderWithKibanaRenderContext(<AddMLInferencePipelineButton onClick={onClick} />);

    const button = screen.getByRole('button', { name: /Add Inference Pipeline/i });
    expect(button).toBeDisabled();
    fireEvent.mouseOver(button.parentElement!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/copy and customize/i);
  });

  it('renders disabled tooltip ml is not enabled', async () => {
    setMockValues({ ...DEFAULT_VALUES, canUseMlInferencePipeline: false });
    renderWithKibanaRenderContext(<AddMLInferencePipelineButton onClick={onClick} />);

    const button = screen.getByRole('button', { name: /Add Inference Pipeline/i });
    expect(button).toBeDisabled();
    fireEvent.mouseOver(button.parentElement!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/enable ML Inference Pipelines/i);
  });
});
