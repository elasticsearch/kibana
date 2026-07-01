/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { DocumentDetailsContext } from '../../shared/context';
import { EventHeaderTitle } from './event_header_title';
import moment from 'moment-timezone';
import { useDateFormat, useTimeZone } from '../../../../common/lib/kibana';
import { mockContextValue } from '../../shared/mocks/mock_context';
import { mockSearchHit } from '../../shared/mocks/mock_search_hit';
import { TestProvidersComponent } from '../../../../common/mock';
import {
  EVENT_TITLE_TEST_ID,
  SEVERITY_VALUE_TEST_ID,
} from '../../../../flyout_v2/document/main/components/test_ids';
import { useFlyoutPagination } from '../../../../common/utils/flyout_pagination/use_flyout_pagination';
import { FLYOUT_ALERT_PAGINATION_TEST_ID } from './test_ids';

jest.mock('../../../../common/lib/kibana');
jest.mock('../../../../common/utils/flyout_pagination/use_flyout_pagination');

moment.suppressDeprecationWarnings = true;
moment.tz.setDefault('UTC');

const dateFormat = 'MMM D, YYYY @ HH:mm:ss.SSS';

const renderHeader = (contextValue: DocumentDetailsContext) =>
  render(
    <TestProvidersComponent>
      <DocumentDetailsContext.Provider value={contextValue}>
        <EventHeaderTitle />
      </DocumentDetailsContext.Provider>
    </TestProvidersComponent>
  );

const EVENT_HEADER_TEXT_TEST_ID = `${EVENT_TITLE_TEST_ID}Text`;
const TEST_PAGINATION_INSTANCE_ID = 'test-event-instance-uuid';

const createSearchHit = (fields: Record<string, unknown[]>) => ({
  ...mockSearchHit,
  fields: {
    ...mockSearchHit.fields,
    ...fields,
  },
});

const openAlertFlyoutMock = jest.fn();

const defaultPaginationValue = {
  flyoutAlertIndex: null,
  pageSize: 0,
  totalAlertCount: 0,
  isFlyoutAlertLoading: false,
  flyoutAlert: null,
  flyoutDocumentRef: null,
  openAlertFlyoutImpl: null,
  openAlertFlyout: openAlertFlyoutMock,
};

describe('<EventHeaderTitle />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useDateFormat).mockImplementation(() => dateFormat);
    jest.mocked(useTimeZone).mockImplementation(() => 'UTC');
    jest.mocked(useFlyoutPagination).mockReturnValue(defaultPaginationValue);
  });

  it('should render component', () => {
    const { getByTestId, getByText } = renderHeader({
      ...mockContextValue,
      searchHit: createSearchHit({
        'event.kind': ['event'],
        'event.category': ['process'],
        'process.name': ['process name'],
        'event.severity': [3],
      }),
    });

    expect(getByTestId(EVENT_HEADER_TEXT_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(SEVERITY_VALUE_TEST_ID)).toBeInTheDocument();
    expect(getByText('Jan 1, 2020 @ 00:00:00.000')).toBeInTheDocument();
  });

  it('should render corret title if event.kind is alert', () => {
    const { getByTestId } = renderHeader({
      ...mockContextValue,
      searchHit: createSearchHit({
        'event.kind': ['alert'],
        'event.category': ['malware'],
      }),
    });

    expect(getByTestId(EVENT_HEADER_TEXT_TEST_ID)).toHaveTextContent('External alert details');
  });

  it('should render corret title if event.kind is not alert or event', () => {
    const { getByTestId } = renderHeader({
      ...mockContextValue,
      searchHit: createSearchHit({
        'event.kind': ['metric'],
        'event.category': ['malware'],
      }),
    });

    expect(getByTestId(EVENT_HEADER_TEXT_TEST_ID)).toHaveTextContent('Metric details');
  });

  it('should render event category as title if event.kind is event', () => {
    const { getByTestId } = renderHeader({
      ...mockContextValue,
      searchHit: createSearchHit({
        'event.kind': ['event'],
        'event.category': ['process'],
        'process.name': ['process name'],
      }),
    });

    expect(getByTestId(EVENT_HEADER_TEXT_TEST_ID)).toHaveTextContent('process name');
  });

  it('should render default title if event.kind is event and event category is not available', () => {
    const { getByTestId } = renderHeader({
      ...mockContextValue,
      searchHit: createSearchHit({
        'event.kind': ['event'],
      }),
    });

    expect(getByTestId(EVENT_HEADER_TEXT_TEST_ID)).toHaveTextContent('Event details');
  });

  it('should fallback title if event kind is null', () => {
    const { getByTestId } = renderHeader({
      ...mockContextValue,
      searchHit: createSearchHit({
        'event.kind': [''],
      }),
    });

    expect(getByTestId(EVENT_HEADER_TEXT_TEST_ID)).toHaveTextContent('Event details');
  });

  describe('event pagination', () => {
    it('renders chevrons when slice is populated and paginationInstanceId is set', () => {
      jest.mocked(useFlyoutPagination).mockReturnValue({
        ...defaultPaginationValue,
        flyoutAlertIndex: 2,
        pageSize: 500,
        totalAlertCount: 42,
      });
      const { getByTestId } = renderHeader({
        ...mockContextValue,
        paginationInstanceId: TEST_PAGINATION_INSTANCE_ID,
      } as unknown as DocumentDetailsContext);

      const pagination = getByTestId(FLYOUT_ALERT_PAGINATION_TEST_ID);
      expect(pagination).toBeInTheDocument();
      expect(pagination).toHaveTextContent('3 of 42');
    });

    it('hides chevrons when paginationInstanceId is undefined', () => {
      jest.mocked(useFlyoutPagination).mockReturnValue({
        ...defaultPaginationValue,
        flyoutAlertIndex: 2,
        pageSize: 500,
        totalAlertCount: 42,
      });
      // mockContextValue has no paginationInstanceId by default
      const { queryByTestId } = renderHeader(mockContextValue);
      expect(queryByTestId(FLYOUT_ALERT_PAGINATION_TEST_ID)).not.toBeInTheDocument();
    });

    it('hides chevrons when totalAlertCount is 1', () => {
      jest.mocked(useFlyoutPagination).mockReturnValue({
        ...defaultPaginationValue,
        flyoutAlertIndex: 0,
        pageSize: 500,
        totalAlertCount: 1,
      });
      const { queryByTestId } = renderHeader({
        ...mockContextValue,
        paginationInstanceId: TEST_PAGINATION_INSTANCE_ID,
      } as unknown as DocumentDetailsContext);
      expect(queryByTestId(FLYOUT_ALERT_PAGINATION_TEST_ID)).not.toBeInTheDocument();
    });

    it('dispatches through openAlertFlyout when next chevron is clicked', () => {
      jest.mocked(useFlyoutPagination).mockReturnValue({
        ...defaultPaginationValue,
        flyoutAlertIndex: 3,
        pageSize: 500,
        totalAlertCount: 42,
      });
      const { getByTestId } = renderHeader({
        ...mockContextValue,
        paginationInstanceId: TEST_PAGINATION_INSTANCE_ID,
      } as unknown as DocumentDetailsContext);

      const pagination = getByTestId(FLYOUT_ALERT_PAGINATION_TEST_ID);
      const nextButton = pagination.querySelector('[data-test-subj="pagination-button-next"]');
      expect(nextButton).not.toBeNull();
      fireEvent.click(nextButton as HTMLElement);
      expect(openAlertFlyoutMock).toHaveBeenCalledWith(4);

      const prevButton = pagination.querySelector('[data-test-subj="pagination-button-previous"]');
      expect(prevButton).not.toBeNull();
      fireEvent.click(prevButton as HTMLElement);
      expect(openAlertFlyoutMock).toHaveBeenCalledWith(2);
    });

    it('renders severity badge and pagination in the same EuiFlexGroup row', () => {
      jest.mocked(useFlyoutPagination).mockReturnValue({
        ...defaultPaginationValue,
        flyoutAlertIndex: 1,
        pageSize: 500,
        totalAlertCount: 10,
      });
      const { getByTestId } = renderHeader({
        ...mockContextValue,
        paginationInstanceId: TEST_PAGINATION_INSTANCE_ID,
        searchHit: createSearchHit({
          'event.kind': ['event'],
          'event.category': ['process'],
          'event.severity': [3],
        }),
      } as unknown as DocumentDetailsContext);

      const severity = getByTestId(SEVERITY_VALUE_TEST_ID);
      const pagination = getByTestId(FLYOUT_ALERT_PAGINATION_TEST_ID);

      const severityFlexGroup = severity.closest('.euiFlexGroup');
      const paginationFlexGroup = pagination.closest('.euiFlexGroup');
      expect(severityFlexGroup).not.toBeNull();
      expect(severityFlexGroup).toBe(paginationFlexGroup);
    });
  });
});
