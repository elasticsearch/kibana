/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockActions, setMockValues } from '../../../../../__mocks__/kea_logic';
import { connectorIndex } from '../../../../__mocks__/view_index.mock';

jest.mock('./default_pipeline_item', () => ({
  DefaultPipelineItem: () => <div data-test-subj="defaultPipelineItem" />,
}));
jest.mock('./custom_pipeline_item', () => ({
  CustomPipelineItem: () => <div data-test-subj="customPipelineItem" />,
}));

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { DEFAULT_PIPELINE_NAME } from '../../../../../../../common/constants';

import { IngestPipelinesCard } from './ingest_pipelines_card';

const DEFAULT_VALUES = {
  // IndexViewLogic
  indexName: connectorIndex.name,
  ingestionMethod: 'connector',
  // FetchCustomPipelineApiLogic
  data: undefined,
  // PipelinesLogic
  canSetPipeline: true,
  hasIndexIngestionPipeline: false,
  index: connectorIndex,
  pipelineName: DEFAULT_PIPELINE_NAME,
  pipelineState: {
    extract_binary_content: true,
    name: DEFAULT_PIPELINE_NAME,
    reduce_whitespace: true,
    run_ml_inference: true,
  },
  showModal: false,
};

describe('IngestPipelinesCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues({ ...DEFAULT_VALUES });
    setMockActions({ fetchCustomPipeline: jest.fn(), makeRequest: jest.fn() });
  });

  it('renders with default ingest pipeline', () => {
    renderWithKibanaRenderContext(<IngestPipelinesCard extractionDisabled={false} />);
    expect(screen.getByTestId('defaultPipelineItem')).toBeInTheDocument();
    expect(screen.queryByTestId('customPipelineItem')).not.toBeInTheDocument();
  });
});
