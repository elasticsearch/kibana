/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues } from '../../../../../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import type { EuiSelectableOption } from '@elastic/eui';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import type { MlModel } from '../../../../../../../common/types/ml';
import { MlModelDeploymentState } from '../../../../../../../common/types/ml';

import { ModelSelectOption } from './model_select_option';

const DEFAULT_PROPS: EuiSelectableOption<MlModel> = {
  modelId: 'model_1',
  type: 'ner',
  label: 'Model 1',
  title: 'Model 1',
  description: 'Model 1 description',
  licenseType: 'elastic',
  modelDetailsPageUrl: 'https://my-model.ai',
  deploymentState: MlModelDeploymentState.NotDeployed,
  startTime: 0,
  targetAllocationCount: 0,
  nodeAllocationCount: 0,
  threadsPerAllocation: 0,
  isPlaceholder: false,
  hasStats: false,
  types: ['pytorch', 'ner'],
  inputFieldNames: ['title'],
  version: '1',
};

describe('ModelSelectOption', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues({});
  });

  it('renders with license badge if present', () => {
    renderWithKibanaRenderContext(<ModelSelectOption {...DEFAULT_PROPS} />);
    expect(screen.getByText(/License: elastic/i)).toBeInTheDocument();
  });

  it('renders without license badge if not present', () => {
    renderWithKibanaRenderContext(<ModelSelectOption {...DEFAULT_PROPS} licenseType={undefined} />);
    expect(screen.queryByText(/License:/i)).not.toBeInTheDocument();
  });

  it('renders with description if present', () => {
    renderWithKibanaRenderContext(<ModelSelectOption {...DEFAULT_PROPS} />);
    expect(screen.getByText('Model 1 description')).toBeInTheDocument();
  });

  it('renders without description if not present', () => {
    renderWithKibanaRenderContext(<ModelSelectOption {...DEFAULT_PROPS} description={undefined} />);
    expect(screen.queryByText('Model 1 description')).not.toBeInTheDocument();
  });

  it('renders status badge if there is no action button', () => {
    renderWithKibanaRenderContext(<ModelSelectOption {...DEFAULT_PROPS} />);
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });
});
