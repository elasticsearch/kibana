/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues, setMockActions } from '../../../__mocks__/kea_logic';

import React from 'react';

import { fireEvent, screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { AddAnalyticsCollectionForm } from './add_analytics_collection_form';

const mockValues = {
  canSubmit: true,
  inputError: false,
  isLoading: false,
  name: 'test',
};

const mockActions = {
  createAnalyticsCollection: jest.fn(),
  setNameValue: jest.fn(),
};

describe('AddAnalyticsCollectionForm', () => {
  const formId = 'addAnalyticsCollectionFormId';
  const collectionNameField = 'collectionNameField';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders', () => {
    setMockValues(mockValues);
    setMockActions(mockActions);

    renderWithKibanaRenderContext(
      <AddAnalyticsCollectionForm formId={formId} collectionNameField={collectionNameField} />
    );

    expect(screen.getByText('Collection name')).toBeInTheDocument();
  });

  it('submit form will call create analytics collection action', () => {
    setMockValues(mockValues);
    setMockActions(mockActions);

    const { container } = renderWithKibanaRenderContext(
      <AddAnalyticsCollectionForm formId={formId} collectionNameField={collectionNameField} />
    );

    fireEvent.submit(container.querySelector('form')!);
    expect(mockActions.createAnalyticsCollection).toHaveBeenCalled();
  });

  it('cannot call createAnalyticsCollection when form has errors', () => {
    setMockValues({
      ...mockValues,
      canSubmit: false,
    });
    setMockActions(mockActions);

    const { container } = renderWithKibanaRenderContext(
      <AddAnalyticsCollectionForm formId={formId} collectionNameField={collectionNameField} />
    );

    fireEvent.submit(container.querySelector('form')!);
    expect(mockActions.createAnalyticsCollection).not.toHaveBeenCalled();
  });

  it('should call setNameValue action when input is updated', () => {
    setMockValues(mockValues);
    setMockActions(mockActions);

    const { container } = renderWithKibanaRenderContext(
      <AddAnalyticsCollectionForm formId={formId} collectionNameField={collectionNameField} />
    );

    const input = container.querySelector(
      `input[name="${collectionNameField}"]`
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'new-collection' } });
    expect(mockActions.setNameValue).toHaveBeenCalledWith('new-collection');
  });

  it('should show error when input error exists', () => {
    const inputErrorMock = 'Already exists';
    setMockValues({
      ...mockValues,
      inputError: inputErrorMock,
    });
    setMockActions(mockActions);

    renderWithKibanaRenderContext(
      <AddAnalyticsCollectionForm formId={formId} collectionNameField={collectionNameField} />
    );

    expect(screen.getByText(inputErrorMock)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });
});
