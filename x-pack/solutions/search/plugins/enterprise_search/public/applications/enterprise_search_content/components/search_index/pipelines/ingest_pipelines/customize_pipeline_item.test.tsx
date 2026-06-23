/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockActions, setMockValues } from '../../../../../__mocks__/kea_logic';
import { connectorIndex } from '../../../../__mocks__/view_index.mock';

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { CopyAndCustomizePipelinePanel } from './customize_pipeline_item';

const DEFAULT_VALUES = {
  // LicensingLogic
  hasPlatinumLicense: true,
  // IndexViewLogic
  indexName: connectorIndex.name,
  ingestionMethod: 'connector',
  // KibanaLogic
  isCloud: false,
  // PipelineLogic
  hasIndexIngestionPipeline: false,
};

describe('CopyAndCustomizePipelinePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues({ ...DEFAULT_VALUES });
    setMockActions({ makeRequest: jest.fn() });
  });

  it('renders callout with default pipeline', () => {
    renderWithKibanaRenderContext(<CopyAndCustomizePipelinePanel />);
    expect(screen.getByText('Unlock your custom pipelines')).toBeInTheDocument();
    expect(screen.getByText('Copy and customize')).toBeInTheDocument();
  });

  it('returns LicensingCallout if gated', () => {
    setMockValues({ ...DEFAULT_VALUES, hasPlatinumLicense: false, isCloud: false });
    renderWithKibanaRenderContext(<CopyAndCustomizePipelinePanel />);
    expect(
      screen.getByText(/Custom pipelines require a Platinum license or higher/)
    ).toBeInTheDocument();
  });

  it('returns null if you have a custom pipeline', () => {
    setMockValues({ ...DEFAULT_VALUES, hasIndexIngestionPipeline: true });
    renderWithKibanaRenderContext(<CopyAndCustomizePipelinePanel />);
    expect(screen.queryByText('Copy and customize')).not.toBeInTheDocument();
    expect(screen.queryByText('Unlock your custom pipelines')).not.toBeInTheDocument();
  });
});
