/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { Dispatch } from 'redux-v4';
import type { EuiDataGridCellValueElementProps, EuiDataGridControlColumn } from '@elastic/eui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';

import { DefaultCellRenderer } from '../../cell_rendering/default_cell_renderer';
import { defaultHeaders, mockTimelineData } from '../../../../../common/mock';
import { TestProviders } from '../../../../../common/mock/test_providers';
import { defaultRowRenderers } from '../../body/renderers';
import type { SortColumnTimeline as Sort } from '../../../../../../common/types/timeline';
import { TimelineId } from '../../../../../../common/types/timeline';
import { useTimelineEvents } from '../../../../containers';
import type { Props as PinnedTabContentComponentProps } from '.';
import { PinnedTabContentComponent } from '.';
import { Direction } from '../../../../../../common/search_strategy';
import { useIsExperimentalFeatureEnabled } from '../../../../../common/hooks/use_experimental_features';
import type { ExperimentalFeatures } from '../../../../../../common';
import { allowedExperimentalValues } from '../../../../../../common';
import { useKibana } from '../../../../../common/lib/kibana';
import { createStartServicesMock } from '../../../../../common/lib/kibana/kibana_react.mock';
import { useUserPrivileges } from '../../../../../common/components/user_privileges';
import { initialUserPrivilegesState } from '../../../../../common/components/user_privileges/user_privileges_context';
import { createExpandableFlyoutApiMock } from '../../../../../common/mock/expandable_flyout';
import { useFlyoutApi } from '../../../../../flyout_v2/use_flyout_api';
import { createFlyoutApiMock } from '../../../../../flyout_v2/use_flyout_api.mock';
import { useIsNewFlyoutEnabled } from '../../../../../common/hooks/use_is_new_flyout_enabled';
import type { UnifiedTimelineDataGridCellContext } from '../../types';
import { FLYOUT_ORIGIN } from '../../../../../common/lib/telemetry';

/**
 * `onToggleShowNotes` is declared inline in `PinnedTabContentComponent` and reaches the
 * notes button only through the data grid's leading control column, so covering it means
 * rendering that column rather than calling a hook. `UnifiedTimelineBody` is stubbed to
 * render the column on its own: the callback, the control column and the notes button are
 * all the real ones, and the `EuiDataGrid` mount that surrounds them in production is not.
 * `use_timeline_control_columns.test.tsx` cannot make these assertions, because it supplies
 * its own `onToggleShowNotes` mock and so never runs the branch that picks a flyout.
 */

jest.mock('../../../../containers', () => ({
  useTimelineEvents: jest.fn(),
}));

jest.mock('../../../../../common/components/user_privileges');

jest.mock('@kbn/expandable-flyout');
jest.mock('../../../../../flyout_v2/use_flyout_api');
jest.mock('../../../../../common/hooks/use_is_new_flyout_enabled');

jest.mock('../../../../../common/hooks/use_experimental_features');
const useIsExperimentalFeatureEnabledMock = useIsExperimentalFeatureEnabled as jest.Mock;

jest.mock('../../../../../common/lib/kibana', () => {
  const originalModule = jest.requireActual('../../../../../common/lib/kibana');
  return {
    ...originalModule,
    useKibana: jest.fn(),
    useGetUserSavedObjectPermissions: jest.fn(),
  };
});

type ControlColumnCellRender = (
  props: EuiDataGridCellValueElementProps & UnifiedTimelineDataGridCellContext
) => React.JSX.Element;

jest.mock('../../body/unified_timeline_body', () => ({
  UnifiedTimelineBody: ({
    leadingControlColumns,
  }: {
    leadingControlColumns: EuiDataGridControlColumn[];
  }) => {
    const RowCellRender = leadingControlColumns[0].rowCellRender as ControlColumnCellRender;

    return (
      <RowCellRender
        colIndex={0}
        columnId="default-timeline-control-column"
        isDetails={false}
        isExpandable={false}
        isExpanded={false}
        rowIndex={0}
        setCellProps={() => {}}
      />
    );
  },
}));

const kibanaMockResult = {
  services: createStartServicesMock(),
};

const useKibanaMock = useKibana as jest.Mock;

describe('PinnedTabContent Leading actions - notes', () => {
  let props = {} as PinnedTabContentComponentProps;
  let flyoutApi: ReturnType<typeof createFlyoutApiMock>;
  const mockOpenFlyout = jest.fn();
  const sort: Sort[] = [
    {
      columnId: '@timestamp',
      columnType: 'date',
      esTypes: ['date'],
      sortDirection: Direction.desc,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // The notes control column only renders when the corresponding rawEvent is present,
    // so we provide a rawEvent that matches the first (and only) event.
    (useTimelineEvents as jest.Mock).mockReturnValue([
      false,
      {
        events: mockTimelineData.slice(0, 1),
        rawEvents: [
          {
            _id: mockTimelineData[0]._id,
            _index: 'test-index',
            _source: {},
          },
        ],
        pageInfo: {
          activePage: 0,
          totalPages: 1,
        },
        isPartial: false,
        shardFailures: [],
        timedOut: false,
      },
    ]);

    (useIsExperimentalFeatureEnabledMock as jest.Mock).mockImplementation(
      (feature: keyof ExperimentalFeatures) => {
        return allowedExperimentalValues[feature];
      }
    );

    (useUserPrivileges as jest.Mock).mockReturnValue({
      ...initialUserPrivilegesState(),
      notesPrivileges: { read: true },
      timelinePrivileges: { crud: true, read: true },
    });

    flyoutApi = createFlyoutApiMock();
    jest.mocked(useExpandableFlyoutApi).mockReturnValue({
      ...createExpandableFlyoutApiMock(),
      openFlyout: mockOpenFlyout,
    });
    jest.mocked(useFlyoutApi).mockReturnValue(flyoutApi);
    jest.mocked(useIsNewFlyoutEnabled).mockReturnValue(false);

    useKibanaMock.mockReturnValue(kibanaMockResult);

    props = {
      dispatch: {} as Dispatch,
      columns: defaultHeaders,
      timelineId: TimelineId.test,
      itemsPerPage: 5,
      itemsPerPageOptions: [5, 10, 20],
      renderCellValue: DefaultCellRenderer,
      rowRenderers: defaultRowRenderers,
      sort,
      pinnedEventIds: { [mockTimelineData[0]._id]: true },
      eventIdToNoteIds: {},
    };
  });

  it('should open the legacy notes flyout when the new flyout is disabled', async () => {
    render(
      <TestProviders>
        <PinnedTabContentComponent {...props} />
      </TestProviders>
    );

    const notesButton = await screen.findByTestId('timeline-notes-button-small');
    expect(notesButton).not.toBeDisabled();

    fireEvent.click(notesButton);

    await waitFor(() => {
      expect(mockOpenFlyout).toHaveBeenCalledWith(
        expect.objectContaining({
          right: expect.objectContaining({ id: 'document-details-right' }),
          left: expect.objectContaining({ id: 'document-details-left' }),
        })
      );
    });
    expect(flyoutApi.openNotes).not.toHaveBeenCalled();
  });

  it('should open the new notes flyout when the new flyout is enabled', async () => {
    jest.mocked(useIsNewFlyoutEnabled).mockReturnValue(true);

    render(
      <TestProviders>
        <PinnedTabContentComponent {...props} />
      </TestProviders>
    );

    const notesButton = await screen.findByTestId('timeline-notes-button-small');
    expect(notesButton).not.toBeDisabled();

    fireEvent.click(notesButton);

    await waitFor(() => {
      expect(flyoutApi.openNotes).toHaveBeenCalledWith({
        hit: expect.objectContaining({ _id: mockTimelineData[0]._id }),
        origin: FLYOUT_ORIGIN.TIMELINE,
      });
    });
    expect(mockOpenFlyout).not.toHaveBeenCalled();
  });
});
