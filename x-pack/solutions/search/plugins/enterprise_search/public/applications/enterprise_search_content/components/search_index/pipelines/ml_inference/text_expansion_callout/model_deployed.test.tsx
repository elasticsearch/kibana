/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockActions, setMockValues } from '../../../../../../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { ModelDeployed } from './model_deployed';

const DEFAULT_VALUES = {
  startTextExpansionModelError: undefined,
  isCreateButtonDisabled: false,
  isModelDownloadInProgress: false,
  isModelDownloaded: false,
  isModelStarted: false,
  isStartButtonDisabled: false,
};

describe('ModelDeployed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues(DEFAULT_VALUES);
    setMockActions({ startTextExpansionModel: jest.fn() });
  });
  it('renders start button', () => {
    renderWithKibanaRenderContext(
      <ModelDeployed
        dismiss={() => {}}
        ingestionMethod="crawler"
        isDismissable={false}
        isStartButtonDisabled={false}
      />
    );
    expect(screen.getByRole('button', { name: 'Start single-threaded' })).not.toBeDisabled();
  });
  it('renders disabled start button if it is set to disabled', () => {
    renderWithKibanaRenderContext(
      <ModelDeployed
        dismiss={() => {}}
        ingestionMethod="crawler"
        isDismissable={false}
        isStartButtonDisabled
      />
    );
    expect(screen.getByRole('button', { name: 'Start single-threaded' })).toBeDisabled();
  });
  it('renders dismiss button if it is set to dismissable', () => {
    renderWithKibanaRenderContext(
      <ModelDeployed
        dismiss={() => {}}
        ingestionMethod="crawler"
        isDismissable
        isStartButtonDisabled={false}
      />
    );
    expect(
      screen.getByTestId('enterpriseSearchTextExpansionDismissButtonButton')
    ).toBeInTheDocument();
  });
  it('does not render dismiss button if it is set to non-dismissable', () => {
    renderWithKibanaRenderContext(
      <ModelDeployed
        dismiss={() => {}}
        ingestionMethod="crawler"
        isDismissable={false}
        isStartButtonDisabled={false}
      />
    );
    expect(
      screen.queryByTestId('enterpriseSearchTextExpansionDismissButtonButton')
    ).not.toBeInTheDocument();
  });
});
