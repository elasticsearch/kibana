/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { TestProviders } from '../../../../common/mock';
import { AssetDocumentTab } from './asset_document';
import { FLYOUT_BODY_TEST_ID } from './test_ids';
import { DocumentDetailsContext } from '../../../document_details/shared/context';
import { mockContextValue } from '../../../document_details/shared/mocks/mock_context';
import userEvent from '@testing-library/user-event';
import { TABLE_TAB_CONTENT_TEST_ID } from '../../../document_details/right/tabs/test_ids';
import { JSON_TAB_CONTENT_TEST_ID } from '../../../../flyout_v2/shared/components/json_tab';
import { PREFIX } from '../../../shared/test_ids';

jest.mock('@kbn/unified-doc-viewer-plugin/public');

describe('AssetDocumentTab', () => {
  it('renders', () => {
    const { getByTestId } = render(
      <TestProviders>
        <DocumentDetailsContext.Provider value={mockContextValue}>
          <AssetDocumentTab />
        </DocumentDetailsContext.Provider>
      </TestProviders>
    );

    expect(getByTestId(FLYOUT_BODY_TEST_ID)).toBeInTheDocument();
  });

  it('should preselect the table tab', () => {
    const { getByTestId } = render(
      <TestProviders>
        <DocumentDetailsContext.Provider value={mockContextValue}>
          <AssetDocumentTab />
        </DocumentDetailsContext.Provider>
      </TestProviders>
    );

    expect(getByTestId(TABLE_TAB_CONTENT_TEST_ID)).toBeInTheDocument();
  });

  it('should select json tab when clicked', async () => {
    const user = userEvent.setup({ delay: null });
    const { getByTestId, getByTitle } = render(
      <TestProviders>
        <DocumentDetailsContext.Provider value={mockContextValue}>
          <AssetDocumentTab />
        </DocumentDetailsContext.Provider>
      </TestProviders>
    );

    await user.click(getByTitle('JSON'));

    expect(getByTestId(PREFIX + JSON_TAB_CONTENT_TEST_ID)).toBeInTheDocument();
  });

  it('should select table tab when path tab is table', async () => {
    const user = userEvent.setup({ delay: null });
    const { getByTestId, getByTitle } = render(
      <TestProviders>
        <DocumentDetailsContext.Provider value={mockContextValue}>
          <AssetDocumentTab path={{ tab: 'table' }} />
        </DocumentDetailsContext.Provider>
      </TestProviders>
    );

    await user.click(getByTitle('JSON')); // make sure Table isn't selected
    await user.click(getByTitle('Table'));

    expect(getByTestId(TABLE_TAB_CONTENT_TEST_ID)).toBeInTheDocument();
  });
});
