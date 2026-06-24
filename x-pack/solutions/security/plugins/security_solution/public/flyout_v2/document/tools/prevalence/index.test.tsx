/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { buildDataTableRecord, type EsHitRecord } from '@kbn/discover-utils';
import { PrevalenceDetails } from '.';
import { resetColdFrozenTierCalloutDismissedStateForTests } from './components/prevalence_details_view';
import {
  PREVALENCE_DETAILS_COLD_FROZEN_TIER_CALLOUT_DISMISS_BUTTON_TEST_ID,
  PREVALENCE_DETAILS_COLD_FROZEN_TIER_CALLOUT_TEST_ID,
  PREVALENCE_DETAILS_TABLE_ALERT_COUNT_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_COUNT_TEXT_BUTTON_TEST_ID,
  PREVALENCE_DETAILS_TABLE_DOC_COUNT_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_FIELD_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_HOST_PREVALENCE_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_INVESTIGATE_IN_TIMELINE_BUTTON_TEST_ID,
  PREVALENCE_DETAILS_TABLE_TEST_ID,
  PREVALENCE_DETAILS_TABLE_UPSELL_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_USER_PREVALENCE_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_VALUE_CELL_TEST_ID,
  PREVALENCE_DETAILS_UPSELL_TEST_ID,
} from './test_ids';
import type { CellActionRenderer } from '../../../shared/components/cell_actions';
import { getColumns } from './utils/get_columns';
import { usePrevalence } from './hooks/use_prevalence';
import { TestProviders } from '../../../../common/mock';
import { licenseService } from '../../../../common/hooks/use_license';
import { createTelemetryServiceMock } from '../../../../common/lib/telemetry/telemetry_service.mock';
import { useUserPrivileges } from '../../../../common/components/user_privileges';

jest.mock('../../../../common/components/user_privileges');
jest.mock('../../../shared/components/document_tools_flyout_header', () => ({
  DocumentToolsFlyoutHeader: ({ title }: { title: string }) => (
    <div data-test-subj="mockDocumentToolsFlyoutHeader">{title}</div>
  ),
}));

const mockedTelemetry = createTelemetryServiceMock();
const mockStorage = jest.fn();
const mockUiSettingsGet = jest.fn();
let mockServerless: unknown;
jest.mock('../../../../common/lib/kibana', () => {
  return {
    useKibana: () => ({
      services: {
        telemetry: mockedTelemetry,
        storage: { get: mockStorage },
        uiSettings: {
          get: mockUiSettingsGet,
        },
        serverless: mockServerless,
      },
    }),
  };
});

jest.mock('./hooks/use_prevalence');

const mockDispatch = jest.fn();
jest.mock('react-redux', () => {
  const original = jest.requireActual('react-redux');
  return {
    ...original,
    useDispatch: () => mockDispatch,
  };
});
jest.mock('../../../../common/hooks/use_license', () => {
  const licenseServiceInstance = {
    isPlatinumPlus: jest.fn(),
  };
  return {
    licenseService: licenseServiceInstance,
    useLicense: () => {
      return licenseServiceInstance;
    },
  };
});

const NO_DATA_MESSAGE = 'No prevalence data available.';

const SCOPE_ID = 'scopeId';
const mockHit = buildDataTableRecord({
  _id: 'event-id',
  _index: 'indexName',
} as EsHitRecord);

const UPSELL_MESSAGE = 'Host and user prevalence are only available with a';

const mockPrevelanceReturnValue = {
  loading: false,
  error: false,
  data: [
    {
      field: 'field1',
      values: ['value1'],
      alertCount: 1,
      docCount: 1,
      hostPrevalence: 0.05,
      userPrevalence: 0.1,
    },
    {
      field: 'field2',
      values: ['value2'],
      alertCount: 1,
      docCount: 1,
      hostPrevalence: 0.5,
      userPrevalence: 0.05,
    },
    {
      field: 'host.name',
      values: ['test host'],
      alertCount: 1,
      docCount: 1,
      hostPrevalence: 0.05,
      userPrevalence: 0.1,
    },
    {
      field: 'user.name',
      values: ['test user'],
      alertCount: 1,
      docCount: 1,
      hostPrevalence: 0.05,
      userPrevalence: 0.1,
    },
  ],
};

const renderCellActions: CellActionRenderer = ({ children }) => <>{children}</>;

const renderPrevalenceDetails = ({
  hit = mockHit,
  isTimelineEnabled = true,
}: {
  hit?: typeof mockHit;
  isTimelineEnabled?: boolean;
} = {}) => {
  const columns = getColumns(renderCellActions, isTimelineEnabled, SCOPE_ID);
  return render(
    <TestProviders>
      <PrevalenceDetails hit={hit} investigationFields={[]} scopeId={SCOPE_ID} columns={columns} />
    </TestProviders>
  );
};

describe('PrevalenceDetails', () => {
  const licenseServiceMock = licenseService as jest.Mocked<typeof licenseService>;

  beforeEach(() => {
    jest.clearAllMocks();
    resetColdFrozenTierCalloutDismissedStateForTests();
    mockServerless = undefined;
    mockUiSettingsGet.mockReturnValue(true);
    licenseServiceMock.isPlatinumPlus.mockReturnValue(true);
    (useUserPrivileges as jest.Mock).mockReturnValue({ timelinePrivileges: { read: true } });
  });

  it('should render the table with all data if license is platinum', () => {
    (usePrevalence as jest.Mock).mockReturnValue(mockPrevelanceReturnValue);
    const { getByTestId, getAllByTestId, queryByTestId, queryByText } = renderPrevalenceDetails();

    expect(getByTestId(PREVALENCE_DETAILS_TABLE_TEST_ID)).toBeInTheDocument();
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_FIELD_CELL_TEST_ID).length).toBeGreaterThan(1);
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_VALUE_CELL_TEST_ID).length).toBeGreaterThan(1);
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_DOC_COUNT_CELL_TEST_ID).length).toBeGreaterThan(
      1
    );
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_DOC_COUNT_CELL_TEST_ID).length).toBeGreaterThan(
      1
    );
    expect(
      getAllByTestId(PREVALENCE_DETAILS_TABLE_HOST_PREVALENCE_CELL_TEST_ID).length
    ).toBeGreaterThan(1);
    expect(
      getAllByTestId(PREVALENCE_DETAILS_TABLE_USER_PREVALENCE_CELL_TEST_ID).length
    ).toBeGreaterThan(1);
    expect(queryByTestId(PREVALENCE_DETAILS_UPSELL_TEST_ID)).not.toBeInTheDocument();
    expect(queryByText(NO_DATA_MESSAGE)).not.toBeInTheDocument();
  });

  it('should render host and user name values in the table', () => {
    (usePrevalence as jest.Mock).mockReturnValue(mockPrevelanceReturnValue);

    const { getAllByTestId } = renderPrevalenceDetails();
    const valueCells = getAllByTestId(PREVALENCE_DETAILS_TABLE_VALUE_CELL_TEST_ID);

    expect(valueCells[0]).toHaveTextContent('value1');
    expect(valueCells[1]).toHaveTextContent('value2');
    expect(valueCells[2]).toHaveTextContent('test host');
    expect(valueCells[3]).toHaveTextContent('test user');
  });

  it('should hide data in prevalence columns if license is not platinum', () => {
    const field1 = 'field1';

    licenseServiceMock.isPlatinumPlus.mockReturnValue(false);
    (usePrevalence as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      data: [
        {
          field: field1,
          values: ['value1'],
          alertCount: 1,
          docCount: 1,
          hostPrevalence: 0.05,
          userPrevalence: 0.1,
        },
      ],
    });

    const { getByTestId, getAllByTestId } = renderPrevalenceDetails();

    expect(getByTestId(PREVALENCE_DETAILS_TABLE_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(PREVALENCE_DETAILS_UPSELL_TEST_ID)).toHaveTextContent(UPSELL_MESSAGE);
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_UPSELL_CELL_TEST_ID).length).toEqual(2);
    expect(
      getByTestId(PREVALENCE_DETAILS_TABLE_HOST_PREVALENCE_CELL_TEST_ID)
    ).not.toHaveTextContent('5%');
    expect(
      getByTestId(PREVALENCE_DETAILS_TABLE_USER_PREVALENCE_CELL_TEST_ID)
    ).not.toHaveTextContent('10%');
  });

  it('should render formatted numbers for the alert and document count columns and be clickable buttons', () => {
    (usePrevalence as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      data: [
        {
          field: 'field1',
          values: ['value1'],
          alertCount: 1000,
          docCount: 2000000,
          hostPrevalence: 0.05,
          userPrevalence: 0.1,
        },
      ],
    });

    const { getByTestId, getAllByTestId } = renderPrevalenceDetails();

    expect(getByTestId(PREVALENCE_DETAILS_TABLE_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_FIELD_CELL_TEST_ID)).toHaveTextContent('field1');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_VALUE_CELL_TEST_ID)).toHaveTextContent('value1');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_ALERT_COUNT_CELL_TEST_ID)).toHaveTextContent('1k');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_DOC_COUNT_CELL_TEST_ID)).toHaveTextContent('2M');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_HOST_PREVALENCE_CELL_TEST_ID)).toHaveTextContent(
      '5%'
    );
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_USER_PREVALENCE_CELL_TEST_ID)).toHaveTextContent(
      '10%'
    );

    expect(
      getAllByTestId(PREVALENCE_DETAILS_TABLE_INVESTIGATE_IN_TIMELINE_BUTTON_TEST_ID).length
    ).toBeGreaterThan(1);
  });

  it('should render formatted numbers as text when timeline interactions are disabled', () => {
    (usePrevalence as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      data: [
        {
          field: 'field1',
          values: ['value1'],
          alertCount: 1000,
          docCount: 2000000,
          hostPrevalence: 0.05,
          userPrevalence: 0.1,
        },
      ],
    });

    const { getAllByTestId, queryAllByTestId } = renderPrevalenceDetails({
      isTimelineEnabled: false,
    });

    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_COUNT_TEXT_BUTTON_TEST_ID).length).toBe(2);
    expect(
      queryAllByTestId(PREVALENCE_DETAILS_TABLE_INVESTIGATE_IN_TIMELINE_BUTTON_TEST_ID).length
    ).toBe(0);
  });

  it('should render formatted numbers as text if user lacks timeline read privileges', () => {
    (useUserPrivileges as jest.Mock).mockReturnValue({ timelinePrivileges: { read: false } });
    (usePrevalence as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      data: [
        {
          field: 'field1',
          values: ['value1'],
          alertCount: 1000,
          docCount: 2000000,
          hostPrevalence: 0.05,
          userPrevalence: 0.1,
        },
      ],
    });

    const { getByTestId, queryAllByTestId } = renderPrevalenceDetails();

    expect(getByTestId(PREVALENCE_DETAILS_TABLE_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_FIELD_CELL_TEST_ID)).toHaveTextContent('field1');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_VALUE_CELL_TEST_ID)).toHaveTextContent('value1');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_ALERT_COUNT_CELL_TEST_ID)).toHaveTextContent('1k');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_DOC_COUNT_CELL_TEST_ID)).toHaveTextContent('2M');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_HOST_PREVALENCE_CELL_TEST_ID)).toHaveTextContent(
      '5%'
    );
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_USER_PREVALENCE_CELL_TEST_ID)).toHaveTextContent(
      '10%'
    );

    expect(
      queryAllByTestId(PREVALENCE_DETAILS_TABLE_INVESTIGATE_IN_TIMELINE_BUTTON_TEST_ID).length
    ).not.toBeGreaterThan(1);
  });

  it('should render multiple values in value column', () => {
    (usePrevalence as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      data: [
        {
          field: 'field1',
          values: ['value1', 'value2'],
          alertCount: 1000,
          docCount: 2000000,
          hostPrevalence: 0.05,
          userPrevalence: 0.1,
        },
      ],
    });

    const { getByTestId } = renderPrevalenceDetails();

    expect(getByTestId(PREVALENCE_DETAILS_TABLE_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_VALUE_CELL_TEST_ID)).toHaveTextContent('value1');
    expect(getByTestId(PREVALENCE_DETAILS_TABLE_VALUE_CELL_TEST_ID)).toHaveTextContent('value2');
  });

  it('should render the table with only basic columns if license is not platinum', () => {
    const field1 = 'field1';
    const field2 = 'field2';
    (usePrevalence as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      data: [
        {
          field: field1,
          values: ['value1'],
          alertCount: 1,
          docCount: 1,
          hostPrevalence: 0.05,
          userPrevalence: 0.1,
        },
        {
          field: field2,
          values: ['value2'],
          alertCount: 1,
          docCount: 1,
          hostPrevalence: 0.5,
          userPrevalence: 0.05,
        },
      ],
    });
    licenseServiceMock.isPlatinumPlus.mockReturnValue(false);

    const { getByTestId, getAllByTestId } = renderPrevalenceDetails();

    expect(getByTestId(PREVALENCE_DETAILS_TABLE_TEST_ID)).toBeInTheDocument();
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_FIELD_CELL_TEST_ID).length).toBeGreaterThan(1);
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_VALUE_CELL_TEST_ID).length).toBeGreaterThan(1);
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_DOC_COUNT_CELL_TEST_ID).length).toBeGreaterThan(
      1
    );
    expect(getAllByTestId(PREVALENCE_DETAILS_TABLE_DOC_COUNT_CELL_TEST_ID).length).toBeGreaterThan(
      1
    );
    expect(
      getAllByTestId(PREVALENCE_DETAILS_TABLE_HOST_PREVALENCE_CELL_TEST_ID).length
    ).toBeGreaterThan(1);
    expect(
      getAllByTestId(PREVALENCE_DETAILS_TABLE_USER_PREVALENCE_CELL_TEST_ID).length
    ).toBeGreaterThan(1);
    expect(getByTestId(PREVALENCE_DETAILS_UPSELL_TEST_ID)).toBeInTheDocument();
  });

  it('should render no data message if call errors out', () => {
    (usePrevalence as jest.Mock).mockReturnValue({
      loading: false,
      error: true,
      data: [],
    });

    const { getByText } = renderPrevalenceDetails();
    expect(getByText(NO_DATA_MESSAGE)).toBeInTheDocument();
  });

  it('should render no data message if no data', () => {
    (usePrevalence as jest.Mock).mockReturnValue({
      loading: false,
      error: false,
      data: [],
    });

    const { getByText } = renderPrevalenceDetails();
    expect(getByText(NO_DATA_MESSAGE)).toBeInTheDocument();
  });

  it('should render excluded cold and frozen tiers callout text when ui setting is enabled', () => {
    const { getByTestId } = renderPrevalenceDetails();

    expect(getByTestId(PREVALENCE_DETAILS_COLD_FROZEN_TIER_CALLOUT_TEST_ID)).toHaveTextContent(
      'Some data excluded'
    );
    expect(getByTestId(PREVALENCE_DETAILS_COLD_FROZEN_TIER_CALLOUT_TEST_ID)).toHaveTextContent(
      'Cold and frozen tiers are excluded to improve performance.'
    );
  });

  it('should render included cold and frozen tiers callout text when ui setting is disabled', () => {
    mockUiSettingsGet.mockReturnValue(false);

    const { getByTestId } = renderPrevalenceDetails();

    expect(getByTestId(PREVALENCE_DETAILS_COLD_FROZEN_TIER_CALLOUT_TEST_ID)).toHaveTextContent(
      'Performance optimization'
    );
    expect(getByTestId(PREVALENCE_DETAILS_COLD_FROZEN_TIER_CALLOUT_TEST_ID)).toHaveTextContent(
      'This view loads more slowly because cold and frozen tiers are included.'
    );
  });

  it('should not render cold and frozen tiers callout in serverless', () => {
    mockServerless = {};

    const { queryByTestId } = renderPrevalenceDetails();

    expect(
      queryByTestId(PREVALENCE_DETAILS_COLD_FROZEN_TIER_CALLOUT_TEST_ID)
    ).not.toBeInTheDocument();
  });

  it('should keep callout hidden in same tab session after dismissing and opening another alert flyout', () => {
    const { getByTestId, queryByTestId, unmount } = renderPrevalenceDetails();

    fireEvent.click(
      getByTestId(PREVALENCE_DETAILS_COLD_FROZEN_TIER_CALLOUT_DISMISS_BUTTON_TEST_ID)
    );
    expect(
      queryByTestId(PREVALENCE_DETAILS_COLD_FROZEN_TIER_CALLOUT_TEST_ID)
    ).not.toBeInTheDocument();

    unmount();

    const anotherHit = buildDataTableRecord({
      _id: 'event-id-2',
      _index: 'indexName',
    } as EsHitRecord);

    const { queryByTestId: queryByTestIdAfterOpeningAnotherFlyout } = renderPrevalenceDetails({
      hit: anotherHit,
    });

    expect(
      queryByTestIdAfterOpeningAnotherFlyout(PREVALENCE_DETAILS_COLD_FROZEN_TIER_CALLOUT_TEST_ID)
    ).not.toBeInTheDocument();
  });

  it('should show callout again after page refresh', () => {
    const { getByTestId, queryByTestId } = renderPrevalenceDetails();

    fireEvent.click(
      getByTestId(PREVALENCE_DETAILS_COLD_FROZEN_TIER_CALLOUT_DISMISS_BUTTON_TEST_ID)
    );
    expect(
      queryByTestId(PREVALENCE_DETAILS_COLD_FROZEN_TIER_CALLOUT_TEST_ID)
    ).not.toBeInTheDocument();

    resetColdFrozenTierCalloutDismissedStateForTests();
    const { getByTestId: getByTestIdAfterRefresh } = renderPrevalenceDetails();

    expect(
      getByTestIdAfterRefresh(PREVALENCE_DETAILS_COLD_FROZEN_TIER_CALLOUT_TEST_ID)
    ).toBeInTheDocument();
  });

  it('should use default interval values to fetch prevalence data', () => {
    renderPrevalenceDetails();

    expect(usePrevalence).toHaveBeenCalledWith(
      expect.objectContaining({
        interval: { from: 'now-30d', to: 'now' },
      })
    );
  });

  it('should use values from local storage to fetch prevalence data', () => {
    mockStorage.mockReturnValue({ start: 'now-7d', end: 'now-3d' });

    renderPrevalenceDetails();

    expect(usePrevalence).toHaveBeenCalledWith(
      expect.objectContaining({
        interval: { from: 'now-7d', to: 'now-3d' },
      })
    );
  });
});
