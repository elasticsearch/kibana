/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues } from '../../../../../../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { ModelDeploymentInProgress } from './model_deployment_in_progress';

const DEFAULT_VALUES = {
  startTextExpansionModelError: undefined,
  isCreateButtonDisabled: false,
  isModelDownloadInProgress: false,
  isModelDownloaded: false,
  isModelStarted: false,
  isStartButtonDisabled: false,
};

describe('ModelDeploymentInProgress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues(DEFAULT_VALUES);
  });
  it('renders dismiss button if it is set to dismissable', () => {
    renderWithKibanaRenderContext(<ModelDeploymentInProgress dismiss={() => {}} isDismissable />);
    expect(
      screen.getByTestId('enterpriseSearchTextExpansionDismissButtonButton')
    ).toBeInTheDocument();
  });
  it('does not render dismiss button if it is set to non-dismissable', () => {
    renderWithKibanaRenderContext(
      <ModelDeploymentInProgress dismiss={() => {}} isDismissable={false} />
    );
    expect(
      screen.queryByTestId('enterpriseSearchTextExpansionDismissButtonButton')
    ).not.toBeInTheDocument();
  });
});
