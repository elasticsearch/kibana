/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues } from '../../../../../__mocks__/kea_logic';
import { mockPipelineState } from '../../../../__mocks__/pipeline.mock';
import { indices } from '../../../../__mocks__/search_indices.mock';

jest.mock('../../components/curl_request/curl_request', () => ({
  CurlRequest: () => <div data-test-subj="curlRequest" />,
}));

import React from 'react';

import { fireEvent, screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { DefaultPipelineItem } from './default_pipeline_item';

describe('DefaultPipelineItem', () => {
  beforeEach(() => {
    setMockValues({});
  });

  it('renders default pipeline item for ingestion indices', () => {
    const index = indices[1];
    const mockOpenModal = jest.fn();
    const ingestionMethod = 'connector';

    renderWithKibanaRenderContext(
      <DefaultPipelineItem
        index={index}
        indexName={index.name}
        ingestionMethod={ingestionMethod}
        openPipelineSettings={mockOpenModal}
        pipelineName={mockPipelineState.name}
        pipelineState={mockPipelineState}
      />
    );

    expect(screen.getByRole('heading', { name: mockPipelineState.name })).toBeInTheDocument();

    const settingsButton = screen.getByText('Settings');
    expect(settingsButton.closest('button')?.getAttribute('data-telemetry-id')).toEqual(
      `entSearchContent-${ingestionMethod}-pipelines-ingestPipelines-settings`
    );
    fireEvent.click(settingsButton);
    expect(mockOpenModal).toHaveBeenCalledTimes(1);

    expect(screen.queryByText('Ingest a document using cURL')).not.toBeInTheDocument();
    expect(screen.getByText('Managed')).toBeInTheDocument();
  });

  it('renders default pipeline item for api indices', () => {
    const index = indices[0];
    const mockOpenModal = jest.fn();
    const ingestionMethod = 'api';

    renderWithKibanaRenderContext(
      <DefaultPipelineItem
        index={index}
        indexName={index.name}
        ingestionMethod={ingestionMethod}
        openPipelineSettings={mockOpenModal}
        pipelineName={mockPipelineState.name}
        pipelineState={mockPipelineState}
      />
    );

    expect(screen.getByRole('heading', { name: mockPipelineState.name })).toBeInTheDocument();

    const settingsButton = screen.getByText('Settings');
    expect(settingsButton.closest('button')?.getAttribute('data-telemetry-id')).toEqual(
      `entSearchContent-${ingestionMethod}-pipelines-ingestPipelines-settings`
    );
    fireEvent.click(settingsButton);
    expect(mockOpenModal).toHaveBeenCalledTimes(1);

    expect(screen.getByTestId('curlRequest')).toBeInTheDocument();
    expect(screen.getByText('Managed')).toBeInTheDocument();
  });
});
