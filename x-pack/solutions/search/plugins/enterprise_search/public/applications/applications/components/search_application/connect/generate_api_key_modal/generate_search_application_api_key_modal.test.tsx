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

import { GenerateSearchApplicationApiKeyModal } from './generate_search_application_api_key_modal';

const mockActions = { makeRequest: jest.fn(), setKeyName: jest.fn() };

const mockValues = { apiKey: '', isLoading: false, isSuccess: false, keyName: '' };

const onCloseMock = jest.fn();
describe('GenerateSearchApplicationApiKeyModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues(mockValues);
    setMockActions(mockActions);
  });

  it('renders the empty modal', () => {
    renderWithKibanaRenderContext(
      <GenerateSearchApplicationApiKeyModal searchApplicationName="puggles" onClose={onCloseMock} />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Closes this modal window'));
    expect(onCloseMock).toHaveBeenCalled();
  });

  describe('Modal content', () => {
    it('renders API key name form', () => {
      renderWithKibanaRenderContext(
        <GenerateSearchApplicationApiKeyModal
          searchApplicationName="puggles"
          onClose={onCloseMock}
        />
      );
      expect(
        screen.getByTestId('enterpriseSearchGenerateSearchApplicationApiKeyModalFieldText')
      ).toBeInTheDocument();
      expect(screen.getByTestId('generateApiKeyButton')).toBeInTheDocument();
    });

    it('pre-set the key name with search application name', async () => {
      renderWithKibanaRenderContext(
        <GenerateSearchApplicationApiKeyModal
          searchApplicationName="puggles"
          onClose={onCloseMock}
        />
      );
      await waitFor(() => {
        expect(mockActions.setKeyName).toHaveBeenCalledWith('puggles read-only API key');
      });
    });

    it('sets keyName name on form', () => {
      renderWithKibanaRenderContext(
        <GenerateSearchApplicationApiKeyModal
          searchApplicationName="puggles"
          onClose={onCloseMock}
        />
      );
      const textField = screen.getByTestId(
        'enterpriseSearchGenerateSearchApplicationApiKeyModalFieldText'
      );
      fireEvent.change(textField, { target: { value: 'changeEvent-key-name' } });
      expect(mockActions.setKeyName).toHaveBeenCalledWith('changeEvent-key-name');
    });

    it('should trigger api call from the form', () => {
      setMockValues({
        ...mockValues,
        searchApplicationName: 'test-123',
        keyName: '    with-spaces    ',
      });
      renderWithKibanaRenderContext(
        <GenerateSearchApplicationApiKeyModal
          searchApplicationName="puggles"
          onClose={onCloseMock}
        />
      );
      fireEvent.click(screen.getByTestId('generateApiKeyButton'));

      expect(mockActions.makeRequest).toHaveBeenCalledWith({
        searchApplicationName: 'puggles',
        keyName: 'with-spaces',
      });
    });

    it('renders created API key results', () => {
      setMockValues({
        ...mockValues,
        apiKey: 'apiKeyFromBackend123123==',
        searchApplicationName: 'test-123',
        isSuccess: true,
        keyName: 'keyname',
      });
      renderWithKibanaRenderContext(
        <GenerateSearchApplicationApiKeyModal
          searchApplicationName="puggles"
          onClose={onCloseMock}
        />
      );
      expect(
        screen.queryByTestId('enterpriseSearchGenerateSearchApplicationApiKeyModalFieldText')
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId('generateApiKeyButton')).not.toBeInTheDocument();
      expect(screen.getByText('apiKeyFromBackend123123==')).toBeInTheDocument();
    });
  });
});
