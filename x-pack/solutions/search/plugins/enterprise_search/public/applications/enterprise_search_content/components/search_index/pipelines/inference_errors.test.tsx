/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockActions, setMockValues } from '../../../../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { InferenceErrors } from './inference_errors';

describe('InferenceErrors', () => {
  const indexName = 'unit-test-index';
  const defaultValues = {
    indexName,
    isLoading: true,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues(defaultValues);
    setMockActions({ makeRequest: jest.fn() });
  });

  it('renders spinner when loading data', () => {
    renderWithKibanaRenderContext(<InferenceErrors />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders expected table columns', () => {
    setMockValues({
      ...defaultValues,
      inferenceErrors: [],
      isLoading: false,
    });
    renderWithKibanaRenderContext(<InferenceErrors />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Timestamp' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Error message' })).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Approx. document count' })
    ).toBeInTheDocument();
  });
});
