/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { DocumentDetailsContext } from '../../shared/context';
import { SHARE_BUTTON_TEST_ID } from './test_ids';
import { HeaderActions } from './header_actions';
import { mockGetFieldsData } from '../../shared/mocks/mock_get_fields_data';
import { mockDataFormattedForFieldBrowser } from '../../shared/mocks/mock_data_formatted_for_field_browser';
import { TestProvidersComponent } from '../../../../common/mock';
import { useGetFlyoutLink } from '../hooks/use_get_flyout_link';

jest.mock('../../../../common/lib/kibana');
jest.mock('../hooks/use_get_flyout_link');

jest.mock('@elastic/eui', () => ({
  ...jest.requireActual('@elastic/eui'),
  EuiCopy: jest.fn(({ children: functionAsChild }) => functionAsChild(jest.fn())),
}));

const alertUrl = 'https://example.com/alert';
const mockContextValue = {
  dataFormattedForFieldBrowser: mockDataFormattedForFieldBrowser,
  getFieldsData: jest.fn().mockImplementation(mockGetFieldsData),
} as unknown as DocumentDetailsContext;

const renderHeaderActions = (contextValue: DocumentDetailsContext) =>
  render(
    <TestProvidersComponent>
      <DocumentDetailsContext.Provider value={contextValue}>
        <HeaderActions />
      </DocumentDetailsContext.Provider>
    </TestProvidersComponent>
  );

describe('<HeaderAction />', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?',
      },
    });
  });

  beforeEach(() => {
    window.location.search = '?';
    jest.mocked(useGetFlyoutLink).mockReturnValue(alertUrl);
  });

  describe('Copy link to alert url action', () => {
    it('should render share button in the title', () => {
      const { getByTestId } = renderHeaderActions(mockContextValue);
      const shareButton = getByTestId(SHARE_BUTTON_TEST_ID);
      expect(shareButton).toBeInTheDocument();
    });

    it('should not render share button in the title if alert is missing url info', () => {
      jest.mocked(useGetFlyoutLink).mockReturnValue(null);
      const { queryByTestId } = renderHeaderActions(mockContextValue);
      expect(queryByTestId(SHARE_BUTTON_TEST_ID)).not.toBeInTheDocument();
    });

    it('should not render share button in the title if document is not an alert', () => {
      const { queryByTestId } = renderHeaderActions({
        ...mockContextValue,
        dataFormattedForFieldBrowser: [],
      });
      expect(queryByTestId(SHARE_BUTTON_TEST_ID)).not.toBeInTheDocument();
    });
  });
});
