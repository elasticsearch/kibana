/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { DocumentToolsFlyoutHeader } from './document_tools_flyout_header';
import { useDocumentFlyoutTitle } from '../hooks/use_document_flyout_title';

jest.mock('../hooks/use_document_flyout_title');

const mockToolsFlyoutHeaderProps = jest.fn();
jest.mock('./tools_flyout_header', () => ({
  ToolsFlyoutHeader: (props: Record<string, unknown>) => {
    mockToolsFlyoutHeaderProps(props);
    return <div data-test-subj="mockToolsFlyoutHeader" />;
  },
}));

const useDocumentFlyoutTitleMock = useDocumentFlyoutTitle as jest.Mock;

const hit = { id: '1', raw: {}, flattened: {} } as unknown as DataTableRecord;

const onTitleClick = jest.fn();
const badge = <div data-test-subj="mockBadge" />;
const timestamp = <div data-test-subj="mockTimestamp" />;

const titleResult = {
  label: 'Test Rule',
  iconType: 'warning',
  onTitleClick,
  badge,
  timestamp,
};

describe('<DocumentToolsFlyoutHeader />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDocumentFlyoutTitleMock.mockReturnValue(titleResult);
  });

  it('renders the ToolsFlyoutHeader', () => {
    const { getByTestId } = render(
      <DocumentToolsFlyoutHeader title={<span>{'Correlations'}</span>} hit={hit} />
    );
    expect(getByTestId('mockToolsFlyoutHeader')).toBeInTheDocument();
  });

  it('forwards the title and the values computed by useDocumentFlyoutTitle to ToolsFlyoutHeader', () => {
    const title = <span>{'Correlations'}</span>;
    render(<DocumentToolsFlyoutHeader title={title} hit={hit} />);

    expect(mockToolsFlyoutHeaderProps).toHaveBeenCalledWith(
      expect.objectContaining({
        title,
        label: 'Test Rule',
        iconType: 'warning',
        onTitleClick,
        badge,
        timestamp,
      })
    );
  });

  it('passes hit, renderCellActions and onAlertUpdated to useDocumentFlyoutTitle', () => {
    const renderCellActions = jest.fn();
    const onAlertUpdated = jest.fn();

    render(
      <DocumentToolsFlyoutHeader
        title={<span>{'Correlations'}</span>}
        hit={hit}
        renderCellActions={renderCellActions}
        onAlertUpdated={onAlertUpdated}
      />
    );

    expect(useDocumentFlyoutTitleMock).toHaveBeenCalledWith({
      hit,
      renderCellActions,
      onAlertUpdated,
    });
  });
});
