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

import { ModelStarted } from './model_started';

const DEFAULT_VALUES = {
  startTextExpansionModelError: undefined,
  isCreateButtonDisabled: false,
  isModelDownloadInProgress: false,
  isModelDownloaded: false,
  isModelStarted: false,
  isStartButtonDisabled: false,
};

describe('ModelStarted', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues(DEFAULT_VALUES);
  });
  it('renders dismiss button if it is set to dismissable', () => {
    renderWithKibanaRenderContext(
      <ModelStarted dismiss={() => {}} isCompact={false} isDismissable isSingleThreaded />
    );
    expect(
      screen.getByTestId('enterpriseSearchTextExpansionDismissButtonButton')
    ).toBeInTheDocument();
  });
  it('does not render dismiss button if it is set to non-dismissable', () => {
    renderWithKibanaRenderContext(
      <ModelStarted dismiss={() => {}} isCompact={false} isDismissable={false} isSingleThreaded />
    );
    expect(
      screen.queryByTestId('enterpriseSearchTextExpansionDismissButtonButton')
    ).not.toBeInTheDocument();
  });
  it('renders fine-tune button if the model is running single-threaded', () => {
    renderWithKibanaRenderContext(
      <ModelStarted dismiss={() => {}} isCompact={false} isDismissable isSingleThreaded />
    );
    expect(
      screen.getByTestId('enterpriseSearchFineTuneModelsButtonFineTunePerformanceButton')
    ).toBeInTheDocument();
  });
  it('does not render description if it is set to compact', () => {
    renderWithKibanaRenderContext(
      <ModelStarted dismiss={() => {}} isCompact isDismissable isSingleThreaded />
    );
    // Title is present but body description is hidden when compact
    expect(screen.getByText('Your ELSER model is running single-threaded.')).toBeInTheDocument();
    expect(
      screen.queryByText(/This single-threaded configuration is great for testing/)
    ).not.toBeInTheDocument();
  });
});
