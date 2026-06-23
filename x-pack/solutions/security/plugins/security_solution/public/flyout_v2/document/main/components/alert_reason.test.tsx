/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { TestProviders } from '../../../../common/mock';
import { getRowRenderer } from '../../../../timelines/components/timeline/body/renderers/get_row_renderer';
import { useEventDetails } from '../../../../flyout/document_details/shared/hooks/use_event_details';
import {
  REASON_DETAILS_POPOVER_TEST_ID,
  REASON_DETAILS_PREVIEW_BUTTON_TEST_ID,
  REASON_TITLE_TEST_ID,
} from './test_ids';
import { AlertReason } from './alert_reason';

jest.mock('../../../../timelines/components/timeline/body/renderers/get_row_renderer', () => ({
  getRowRenderer: jest.fn(),
}));

jest.mock('../../../../timelines/components/timeline/body/renderers', () => ({
  defaultRowRenderers: [],
}));

jest.mock('../../../../flyout/document_details/shared/hooks/use_event_details', () => ({
  useEventDetails: jest.fn(),
}));

const createMockHit = (flattened: DataTableRecord['flattened']): DataTableRecord =>
  ({
    id: '1',
    raw: {
      _id: 'test-id',
      _index: 'test-index',
    },
    flattened,
    isAnchor: false,
  } as DataTableRecord);

const alertHit = createMockHit({
  'event.kind': 'signal',
  'kibana.alert.reason': 'Alert reason value',
});

const documentHit = createMockHit({
  'event.kind': 'event',
});

const renderAlertReason = (props: Partial<Parameters<typeof AlertReason>[0]> = {}) =>
  render(
    <TestProviders>
      <IntlProvider locale="en">
        <AlertReason hit={alertHit} {...props} />
      </IntlProvider>
    </TestProviders>
  );

const NO_DATA_MESSAGE = "There's no source event information for this alert.";
const ERROR_MESSAGE = 'There was an error displaying data.';
const mockDataAsNestedObject = { _id: 'test-id' };

describe('<AlertReason />', () => {
  const mockGetRowRenderer = jest.mocked(getRowRenderer);
  const mockUseEventDetails = jest.mocked(useEventDetails);
  const mockRenderRow = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRenderRow.mockReturnValue(
      <span data-test-subj="full-reason-renderer">{'Full reason renderer'}</span>
    );
    mockGetRowRenderer.mockReturnValue({
      id: 'plain',
      isInstance: () => true,
      renderRow: mockRenderRow,
    });
    mockUseEventDetails.mockReturnValue({
      browserFields: {},
      dataAsNestedObject: mockDataAsNestedObject,
      dataFormattedForFieldBrowser: null,
      getFieldsData: jest.fn(),
      loading: false,
      refetchFlyoutData: jest.fn(),
      searchHit: undefined,
    });
  });

  it('should render the component for alert', () => {
    const { getByTestId } = renderAlertReason();

    expect(getByTestId(REASON_TITLE_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(REASON_TITLE_TEST_ID)).toHaveTextContent('Alert reason');
    expect(getByTestId(REASON_DETAILS_PREVIEW_BUTTON_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(REASON_DETAILS_PREVIEW_BUTTON_TEST_ID)).toHaveTextContent(
      'Show full reason'
    );
  });

  it('should render the component for document', () => {
    const { getByTestId, queryByTestId } = renderAlertReason({ hit: documentHit });

    expect(getByTestId(REASON_TITLE_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(REASON_TITLE_TEST_ID)).toHaveTextContent('Document reason');
    expect(queryByTestId(REASON_DETAILS_PREVIEW_BUTTON_TEST_ID)).not.toBeInTheDocument();
  });

  it('should render no reason if the field is null', () => {
    const { getByText, getByTestId } = renderAlertReason({
      hit: createMockHit({
        'event.kind': 'signal',
      }),
    });

    expect(getByText(NO_DATA_MESSAGE)).toBeInTheDocument();
    expect(getByTestId(REASON_DETAILS_PREVIEW_BUTTON_TEST_ID)).toBeDisabled();
  });

  it('should open the full reason popover when clicking the button', async () => {
    const { findByTestId, getByTestId } = renderAlertReason();

    fireEvent.click(getByTestId(REASON_DETAILS_PREVIEW_BUTTON_TEST_ID));

    expect(await findByTestId(REASON_DETAILS_POPOVER_TEST_ID)).toBeInTheDocument();
    expect(await findByTestId('full-reason-renderer')).toHaveTextContent('Full reason renderer');
    expect(mockUseEventDetails).toHaveBeenCalledWith({
      eventId: 'test-id',
      indexName: 'test-index',
    });
  });

  it('should pass the document flyout scope id to the full reason renderer', async () => {
    const { findByTestId, getByTestId } = renderAlertReason();

    fireEvent.click(getByTestId(REASON_DETAILS_PREVIEW_BUTTON_TEST_ID));

    expect(await findByTestId('full-reason-renderer')).toBeInTheDocument();
    expect(mockUseEventDetails).toHaveBeenCalledWith({
      eventId: 'test-id',
      indexName: 'test-index',
    });
    expect(mockRenderRow).toHaveBeenCalledWith({
      data: mockDataAsNestedObject,
      scopeId: 'document-details-flyout',
    });
  });

  it('should show a loading state while fetching full event details', async () => {
    mockUseEventDetails.mockReturnValue({
      browserFields: {},
      dataAsNestedObject: null,
      dataFormattedForFieldBrowser: null,
      getFieldsData: jest.fn(),
      loading: true,
      refetchFlyoutData: jest.fn(),
      searchHit: undefined,
    });

    const { findByTestId, getByTestId } = renderAlertReason();

    fireEvent.click(getByTestId(REASON_DETAILS_PREVIEW_BUTTON_TEST_ID));

    expect(await findByTestId(REASON_DETAILS_POPOVER_TEST_ID)).toBeInTheDocument();
    expect(mockGetRowRenderer).not.toHaveBeenCalled();
  });

  it('should show an error when full event details cannot be rendered', async () => {
    mockGetRowRenderer.mockReturnValue(null);

    const { findByText, getByTestId } = renderAlertReason();

    fireEvent.click(getByTestId(REASON_DETAILS_PREVIEW_BUTTON_TEST_ID));

    expect(await findByText(ERROR_MESSAGE)).toBeInTheDocument();
  });
});
