/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues, setMockActions } from '../../../../../__mocks__/kea_logic';

import React from 'react';

import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

const mockActions = { makeRequest: jest.fn(), setKeyName: jest.fn() };

const mockValues = { apiKey: '', isLoading: false, isSuccess: false, keyName: '' };

import { GenerateAnalyticsApiKeyModal } from './generate_analytics_api_key_modal';

const onCloseMock = jest.fn();
describe('GenerateAnalyticsApiKeyModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues(mockValues);
    setMockActions(mockActions);
  });

  it('renders the empty modal', () => {
    renderWithKibanaRenderContext(
      <GenerateAnalyticsApiKeyModal collectionName="puggles" onClose={onCloseMock} />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Closes this modal window'));
    expect(onCloseMock).toHaveBeenCalled();
  });

  describe('Modal content', () => {
    it('renders API key name form', () => {
      renderWithKibanaRenderContext(
        <GenerateAnalyticsApiKeyModal collectionName="puggles" onClose={onCloseMock} />
      );
      expect(
        screen.getByTestId('enterpriseSearchGenerateAnalyticsApiKeyModalFieldText')
      ).toBeInTheDocument();
      expect(screen.getByTestId('generateApiKeyButton')).toBeInTheDocument();
    });

    it('pre-set the key name with collection name', async () => {
      renderWithKibanaRenderContext(
        <GenerateAnalyticsApiKeyModal collectionName="puggles" onClose={onCloseMock} />
      );
      await waitFor(() => {
        expect(mockActions.setKeyName).toHaveBeenCalledWith('puggles API key');
      });
    });

    it('sets keyName name on form', () => {
      renderWithKibanaRenderContext(
        <GenerateAnalyticsApiKeyModal collectionName="puggles" onClose={onCloseMock} />
      );
      const textField = screen.getByTestId('enterpriseSearchGenerateAnalyticsApiKeyModalFieldText');
      fireEvent.change(textField, { target: { value: 'changeEvent-key-name' } });
      expect(mockActions.setKeyName).toHaveBeenCalledWith('changeEvent-key-name');
    });

    it('should trigger api call from the form', () => {
      setMockValues({ ...mockValues, collectionName: 'test-123', keyName: '    with-spaces    ' });
      renderWithKibanaRenderContext(
        <GenerateAnalyticsApiKeyModal collectionName="puggles" onClose={onCloseMock} />
      );
      fireEvent.click(screen.getByTestId('generateApiKeyButton'));

      expect(mockActions.makeRequest).toHaveBeenCalledWith({
        collectionName: 'puggles',
        keyName: 'with-spaces',
      });
    });

    it('renders created API key results', () => {
      setMockValues({
        ...mockValues,
        apiKey: 'apiKeyFromBackend123123==',
        collectionName: 'test-123',
        isSuccess: true,
        keyName: 'keyname',
      });
      renderWithKibanaRenderContext(
        <GenerateAnalyticsApiKeyModal collectionName="puggles" onClose={onCloseMock} />
      );
      expect(
        screen.queryByTestId('enterpriseSearchGenerateAnalyticsApiKeyModalFieldText')
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId('generateApiKeyButton')).not.toBeInTheDocument();
      expect(screen.getByText('apiKeyFromBackend123123==')).toBeInTheDocument();
    });
  });
});
