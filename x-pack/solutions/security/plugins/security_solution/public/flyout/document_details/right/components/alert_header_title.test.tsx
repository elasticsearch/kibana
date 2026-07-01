/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { DocumentDetailsContext } from '../../shared/context';
import { AlertHeaderTitle } from './alert_header_title';
import moment from 'moment-timezone';
import { useDateFormat, useTimeZone } from '../../../../common/lib/kibana';
import { mockGetFieldsData } from '../../shared/mocks/mock_get_fields_data';
import { mockDataFormattedForFieldBrowser } from '../../shared/mocks/mock_data_formatted_for_field_browser';
import { mockSearchHit } from '../../shared/mocks/mock_search_hit';
import { TestProviders } from '../../../../common/mock';
import {
  ASSIGNEES_EMPTY_TEST_ID,
  ASSIGNEES_TEST_ID,
  ASSIGNEES_TITLE_TEST_ID,
  RISK_SCORE_TITLE_TEST_ID,
  RISK_SCORE_VALUE_TEST_ID,
  SEVERITY_VALUE_TEST_ID,
  STATUS_BUTTON_TEST_ID,
  STATUS_TITLE_TEST_ID,
  TITLE_TEST_ID,
} from '../../../../flyout_v2/document/main/components/test_ids';
import {
  ALERT_SUMMARY_PANEL_TEST_ID,
  NOTES_TITLE_TEST_ID,
} from '../../../../flyout_v2/shared/components/test_ids';
import { useRefetchByScope } from '../../../../flyout_v2/document/main/hooks/use_refetch_by_scope';
import { useFlyoutPagination } from '../../../../common/utils/flyout_pagination/use_flyout_pagination';
import { FLYOUT_ALERT_PAGINATION_TEST_ID } from './test_ids';

jest.mock('../../../../common/lib/kibana');
jest.mock('../../../../flyout_v2/document/main/hooks/use_refetch_by_scope');
jest.mock('../../../../common/utils/flyout_pagination/use_flyout_pagination');
jest.mock('../../../../flyout_v2/document/main/components/status', () => ({
  Status: ({ onAlertUpdated }: { onAlertUpdated?: () => void }) => (
    <>
      <div data-test-subj="securitySolutionFlyoutHeaderStatusTitle">{'Status'}</div>
      <button data-test-subj="rule-status-badge" onClick={onAlertUpdated} type="button" />
    </>
  ),
}));

moment.suppressDeprecationWarnings = true;
moment.tz.setDefault('UTC');

const dateFormat = 'MMM D, YYYY @ HH:mm:ss.SSS';
const createSearchHit = (fields: Record<string, unknown[]>) => ({
  ...mockSearchHit,
  fields: {
    ...mockSearchHit.fields,
    ...fields,
  },
});

const TEST_PAGINATION_INSTANCE_ID = 'test-instance-uuid';

const mockContextValue = {
  dataFormattedForFieldBrowser: mockDataFormattedForFieldBrowser,
  getFieldsData: jest.fn().mockImplementation(mockGetFieldsData),
  searchHit: createSearchHit({
    'event.kind': ['signal'],
    'kibana.alert.risk_score': [0],
    'kibana.alert.rule.name': ['rule-name'],
    'kibana.alert.severity': ['low'],
  }),
} as unknown as DocumentDetailsContext;
const HEADER_TEXT_TEST_ID = `${TITLE_TEST_ID}Text`;

const renderHeader = (contextValue: DocumentDetailsContext) =>
  render(
    <TestProviders>
      <DocumentDetailsContext.Provider value={contextValue}>
        <AlertHeaderTitle />
      </DocumentDetailsContext.Provider>
    </TestProviders>
  );

describe('<AlertHeaderTitle />', () => {
  const refetchMock = jest.fn();
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

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useDateFormat).mockImplementation(() => dateFormat);
    jest.mocked(useTimeZone).mockImplementation(() => 'UTC');
    jest.mocked(useRefetchByScope).mockReturnValue({ refetch: refetchMock });
    jest.mocked(useFlyoutPagination).mockReturnValue(defaultPaginationValue);
  });

  it('should render component', () => {
    const { getByTestId, getByText, queryByTestId } = renderHeader(mockContextValue);

    expect(getByTestId(HEADER_TEXT_TEST_ID)).toHaveTextContent('rule-name');
    expect(getByTestId(SEVERITY_VALUE_TEST_ID)).toBeInTheDocument();
    expect(getByText('Jan 1, 2020 @ 00:00:00.000')).toBeInTheDocument();
    expect(getByTestId(ALERT_SUMMARY_PANEL_TEST_ID)).toBeInTheDocument();

    expect(getByTestId(STATUS_TITLE_TEST_ID)).toHaveTextContent('Status');
    expect(getByTestId(RISK_SCORE_TITLE_TEST_ID)).toHaveTextContent('Risk score');
    expect(getByTestId(ASSIGNEES_TITLE_TEST_ID)).toHaveTextContent('Assignees');
    expect(getByTestId(NOTES_TITLE_TEST_ID)).toBeInTheDocument();

    expect(getByTestId(RISK_SCORE_VALUE_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(STATUS_BUTTON_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(ASSIGNEES_TEST_ID)).toBeInTheDocument();
    expect(queryByTestId(ASSIGNEES_EMPTY_TEST_ID)).not.toBeInTheDocument();
  });

  it('should render title correctly if flyout is in preview', () => {
    const { queryByTestId, getByTestId } = renderHeader({
      ...mockContextValue,
      isRulePreview: true,
    });
    expect(getByTestId(HEADER_TEXT_TEST_ID)).toHaveTextContent('rule-name');

    expect(getByTestId(RISK_SCORE_VALUE_TEST_ID)).toBeInTheDocument();
    expect(queryByTestId(STATUS_BUTTON_TEST_ID)).not.toBeInTheDocument();
    expect(getByTestId(ASSIGNEES_EMPTY_TEST_ID)).toBeInTheDocument();
    expect(queryByTestId(ASSIGNEES_TEST_ID)).not.toBeInTheDocument();
  });

  it('refetches both table and flyout data when the alert status changes', () => {
    const refetchFlyoutData = jest.fn();
    const { getByTestId } = renderHeader({
      ...mockContextValue,
      refetchFlyoutData,
    });

    getByTestId(STATUS_BUTTON_TEST_ID).click();

    expect(refetchMock).toHaveBeenCalledTimes(1);
    expect(refetchFlyoutData).toHaveBeenCalledTimes(1);
  });

  describe('alert pagination', () => {
    it('does not render the pagination control when no paginationInstanceId is in context', () => {
      // mockContextValue has no paginationInstanceId → pagination hidden
      const { queryByTestId } = renderHeader(mockContextValue);
      expect(queryByTestId(FLYOUT_ALERT_PAGINATION_TEST_ID)).not.toBeInTheDocument();
    });

    it('does not render the pagination control when only one alert is in the result set', () => {
      jest.mocked(useFlyoutPagination).mockReturnValue({
        ...defaultPaginationValue,
        flyoutAlertIndex: 0,
        pageSize: 50,
        totalAlertCount: 1,
      });
      const { queryByTestId } = renderHeader({
        ...mockContextValue,
        paginationInstanceId: TEST_PAGINATION_INSTANCE_ID,
      } as unknown as DocumentDetailsContext);
      expect(queryByTestId(FLYOUT_ALERT_PAGINATION_TEST_ID)).not.toBeInTheDocument();
    });

    it('does not render the pagination control when the flyout is in rule preview mode', () => {
      jest.mocked(useFlyoutPagination).mockReturnValue({
        ...defaultPaginationValue,
        flyoutAlertIndex: 1,
        pageSize: 50,
        totalAlertCount: 1432,
      });
      const { queryByTestId } = renderHeader({
        ...mockContextValue,
        isRulePreview: true,
        paginationInstanceId: TEST_PAGINATION_INSTANCE_ID,
      } as unknown as DocumentDetailsContext);
      expect(queryByTestId(FLYOUT_ALERT_PAGINATION_TEST_ID)).not.toBeInTheDocument();
    });

    it('does not render the pagination control when paginationInstanceId does not match a slice (scopeId mismatch equivalent)', () => {
      // useFlyoutPagination returns absent slice (no flyoutAlertIndex) for unknown id
      jest.mocked(useFlyoutPagination).mockReturnValue({
        ...defaultPaginationValue,
        flyoutAlertIndex: null,
        totalAlertCount: 0,
      });
      const { queryByTestId } = renderHeader({
        ...mockContextValue,
        paginationInstanceId: 'some-other-instance',
      } as unknown as DocumentDetailsContext);
      expect(queryByTestId(FLYOUT_ALERT_PAGINATION_TEST_ID)).not.toBeInTheDocument();
    });

    it('renders the pagination control with page count equal to the total alert count', () => {
      jest.mocked(useFlyoutPagination).mockReturnValue({
        ...defaultPaginationValue,
        flyoutAlertIndex: 2,
        pageSize: 50,
        totalAlertCount: 1432,
      });
      const { getByTestId } = renderHeader({
        ...mockContextValue,
        paginationInstanceId: TEST_PAGINATION_INSTANCE_ID,
      } as unknown as DocumentDetailsContext);
      const pagination = getByTestId(FLYOUT_ALERT_PAGINATION_TEST_ID);
      expect(pagination).toBeInTheDocument();
      // The compressed EuiPagination renders a "{active+1} of {total}" label.
      expect(pagination).toHaveTextContent('3 of 1432');
    });

    it('uses the absolute alert index when computing the active page', () => {
      jest.mocked(useFlyoutPagination).mockReturnValue({
        ...defaultPaginationValue,
        // 2nd alert of the 2nd page (page size 50) → absolute index 51.
        flyoutAlertIndex: 51,
        pageSize: 50,
        totalAlertCount: 1432,
      });
      const { getByTestId } = renderHeader({
        ...mockContextValue,
        paginationInstanceId: TEST_PAGINATION_INSTANCE_ID,
      } as unknown as DocumentDetailsContext);
      const pagination = getByTestId(FLYOUT_ALERT_PAGINATION_TEST_ID);
      // activePage is absolute, so we expect "52 of 1432".
      expect(pagination).toHaveTextContent('52 of 1432');
    });

    it('opens the next/prev alert via the flyout pagination slice when pagination is clicked', () => {
      jest.mocked(useFlyoutPagination).mockReturnValue({
        ...defaultPaginationValue,
        flyoutAlertIndex: 49,
        pageSize: 50,
        totalAlertCount: 1432,
      });
      const { getByTestId } = renderHeader({
        ...mockContextValue,
        paginationInstanceId: TEST_PAGINATION_INSTANCE_ID,
      } as unknown as DocumentDetailsContext);
      const pagination = getByTestId(FLYOUT_ALERT_PAGINATION_TEST_ID);

      // EuiPagination tags its prev/next chevrons with these test subjects.
      const nextButton = pagination.querySelector('[data-test-subj="pagination-button-next"]');
      expect(nextButton).not.toBeNull();
      fireEvent.click(nextButton as HTMLElement);

      // Last alert of page 1 (absolute index 49) → next is the first alert of
      // page 2 (absolute index 50). The pagination crosses the page boundary
      // without changing the underlying table page.
      expect(openAlertFlyoutMock).toHaveBeenCalledWith(50);

      const prevButton = pagination.querySelector('[data-test-subj="pagination-button-previous"]');
      expect(prevButton).not.toBeNull();
      fireEvent.click(prevButton as HTMLElement);

      // Previous from absolute index 49 → 48.
      expect(openAlertFlyoutMock).toHaveBeenCalledWith(48);
    });

    it('renders the severity badge and the pagination control in the same EuiFlexGroup row', () => {
      jest.mocked(useFlyoutPagination).mockReturnValue({
        ...defaultPaginationValue,
        flyoutAlertIndex: 2,
        pageSize: 50,
        totalAlertCount: 1432,
      });
      const { getByTestId } = renderHeader({
        ...mockContextValue,
        paginationInstanceId: TEST_PAGINATION_INSTANCE_ID,
      } as unknown as DocumentDetailsContext);

      const severity = getByTestId(SEVERITY_VALUE_TEST_ID);
      const pagination = getByTestId(FLYOUT_ALERT_PAGINATION_TEST_ID);

      // The closest ancestor flex group should be the same node for both —
      // proves severity (left) and pagination (right) share one row, rather
      // than the pre-iteration-2 layout where pagination sat on its own row
      // above severity.
      const severityFlexGroup = severity.closest('.euiFlexGroup');
      const paginationFlexGroup = pagination.closest('.euiFlexGroup');
      expect(severityFlexGroup).not.toBeNull();
      expect(severityFlexGroup).toBe(paginationFlexGroup);
    });
  });
});
