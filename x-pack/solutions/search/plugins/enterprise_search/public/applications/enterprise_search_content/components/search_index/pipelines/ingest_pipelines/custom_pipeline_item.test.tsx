/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues } from '../../../../../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { CustomPipelineItem } from './custom_pipeline_item';

describe('CustomPipelineItem', () => {
  beforeEach(() => {
    setMockValues({});
  });

  it('renders custom pipeline item', () => {
    const indexName = 'fake-index-name';
    const pipelineSuffix = 'custom-pipeline';
    const ingestionMethod = 'crawler';
    const processorsCount = 12;

    renderWithKibanaRenderContext(
      <CustomPipelineItem
        indexName={indexName}
        pipelineSuffix={pipelineSuffix}
        ingestionMethod={ingestionMethod}
        processorsCount={processorsCount}
      />
    );

    expect(
      screen.getByRole('heading', { name: `${indexName}@${pipelineSuffix}` })
    ).toBeInTheDocument();

    const editButton = screen.getByText('Edit pipeline');
    expect(editButton.closest('a')?.href).toMatch(`${indexName}@${pipelineSuffix}`);
    expect(editButton.closest('a')?.getAttribute('data-telemetry-id')).toEqual(
      `entSearchContent-${ingestionMethod}-pipelines-customPipeline-editPipeline`
    );

    expect(screen.getByText(`${processorsCount} Processors`)).toBeInTheDocument();
  });
});
