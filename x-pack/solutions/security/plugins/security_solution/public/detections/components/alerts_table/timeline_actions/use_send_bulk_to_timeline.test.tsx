/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useSendBulkToTimeline } from './use_send_bulk_to_timeline';
import { TableId } from '@kbn/securitysolution-data-table';
import { createMockStore, mockGlobalState, TestProviders } from '../../../../common/mock';
import { useUpdateTimeline } from '../../../../timelines/components/open_timeline/use_update_timeline';
import { useCreateTimeline } from '../../../../timelines/hooks/use_create_timeline';
import { sendBulkEventsToTimelineAction } from '../actions';
import type { TimelineItem } from '@kbn/timelines-plugin/common';
import type { State } from '../../../../common/store/types';
import { TimelineId } from '../../../../../common/types/timeline';

jest.mock('../../../../timelines/components/open_timeline/use_update_timeline');
jest.mock('../../../../timelines/hooks/use_create_timeline');
jest.mock('../actions', () => ({
  sendBulkEventsToTimelineAction: jest.fn(),
}));

const mockUseUpdateTimeline = useUpdateTimeline as jest.Mock;
const mockUseCreateTimeline = useCreateTimeline as jest.Mock;
const mockSendBulkEventsToTimelineAction = sendBulkEventsToTimelineAction as jest.Mock;

const defaultProps = {
  tableId: TableId.alertsOnAlertsPage,
  from: '2020-07-07T08:20:18.966Z',
  to: '2020-07-08T08:20:18.966Z',
};

const mockTimelineItems: TimelineItem[] = [
  {
    _id: 'test-id-1',
    _index: 'test-index',
    data: [],
    ecs: { _id: 'test-id-1', _index: 'test-index' },
  },
  {
    _id: 'test-id-2',
    _index: 'test-index',
    data: [],
    ecs: { _id: 'test-id-2', _index: 'test-index' },
  },
];

// Create a base table config to reuse
const createTableConfig = (tableId: TableId) => ({
  ...mockGlobalState.dataTable.tableById[TableId.test],
  id: tableId,
  selectedEventIds: {},
});

// Create state with the required data tables initialized
const createTestState = (): State => ({
  ...mockGlobalState,
  dataTable: {
    tableById: {
      ...mockGlobalState.dataTable.tableById,
      [TableId.alertsOnAlertsPage]: createTableConfig(TableId.alertsOnAlertsPage),
      [TableId.riskInputs]: createTableConfig(TableId.riskInputs),
      [TableId.alertsOnAttacksPage]: createTableConfig(TableId.alertsOnAttacksPage),
    },
  },
});

describe('useSendBulkToTimeline', () => {
  let store: ReturnType<typeof createMockStore>;
  let mockUpdateTimeline: jest.Mock;
  let mockClearActiveTimeline: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateTimeline = jest.fn();
    mockClearActiveTimeline = jest.fn().mockResolvedValue(undefined);
    mockUseUpdateTimeline.mockReturnValue(mockUpdateTimeline);
    mockUseCreateTimeline.mockReturnValue(mockClearActiveTimeline);
    store = createMockStore(createTestState());
  });

  const renderHookWithProviders = (props = defaultProps) => {
    return renderHook(() => useSendBulkToTimeline(props), {
      wrapper: ({ children }) => <TestProviders store={store}>{children}</TestProviders>,
    });
  };

  it('should return sendBulkEventsToTimelineHandler function', () => {
    const { result } = renderHookWithProviders();

    expect(result.current).toHaveProperty('sendBulkEventsToTimelineHandler');
    expect(typeof result.current.sendBulkEventsToTimelineHandler).toBe('function');
  });

  describe('sendBulkEventsToTimelineHandler', () => {
    it('should call sendBulkEventsToTimelineAction with correct parameters', () => {
      const { result } = renderHookWithProviders();

      act(() => {
        result.current.sendBulkEventsToTimelineHandler(mockTimelineItems);
      });

      expect(mockSendBulkEventsToTimelineAction).toHaveBeenCalledTimes(1);
      expect(mockSendBulkEventsToTimelineAction).toHaveBeenCalledWith(
        expect.any(Function),
        mockTimelineItems.map((item) => item.ecs),
        'KqlFilter'
      );
    });

    it('should extract ecs data from timeline items', () => {
      const { result } = renderHookWithProviders();

      act(() => {
        result.current.sendBulkEventsToTimelineHandler(mockTimelineItems);
      });

      const ecsData = mockSendBulkEventsToTimelineAction.mock.calls[0][1];
      expect(ecsData).toEqual([
        { _id: 'test-id-1', _index: 'test-index' },
        { _id: 'test-id-2', _index: 'test-index' },
      ]);
    });

    it('should handle empty items array', () => {
      const { result } = renderHookWithProviders();

      act(() => {
        result.current.sendBulkEventsToTimelineHandler([]);
      });

      expect(mockSendBulkEventsToTimelineAction).toHaveBeenCalledWith(
        expect.any(Function),
        [],
        'KqlFilter'
      );
    });

    it('enriches ecs with kibana.alert.rule.type and kibana.alert.group.id from data', () => {
      // Bulk selections only populate `item.ecs` with `_id`/`_index`; the real
      // field values live in `item.data`. See https://github.com/elastic/kibana/issues/288404.
      const eqlTimelineItems: TimelineItem[] = [
        {
          _id: 'eql-alert-a',
          _index: 'test-index',
          data: [
            { field: 'kibana.alert.rule.type', value: ['eql'] },
            { field: 'kibana.alert.group.id', value: ['group-a'] },
          ],
          ecs: { _id: 'eql-alert-a', _index: 'test-index' },
        },
      ];
      const { result } = renderHookWithProviders();

      act(() => {
        result.current.sendBulkEventsToTimelineHandler(eqlTimelineItems);
      });

      const ecsData = mockSendBulkEventsToTimelineAction.mock.calls[0][1];
      expect(ecsData).toEqual([
        {
          _id: 'eql-alert-a',
          _index: 'test-index',
          kibana: { alert: { rule: { type: ['eql'] }, group: { id: ['group-a'] } } },
        },
      ]);
    });
  });

  describe('createTimeline', () => {
    const getCreateTimelineFn = (result: ReturnType<typeof renderHookWithProviders>['result']) => {
      act(() => {
        result.current.sendBulkEventsToTimelineHandler(mockTimelineItems);
      });
      return mockSendBulkEventsToTimelineAction.mock.calls[0][0];
    };

    const ruleNote = 'some note';

    it('should clear active timeline before updating', async () => {
      const { result } = renderHookWithProviders();
      const createTimeline = getCreateTimelineFn(result);

      await act(async () => {
        await createTimeline({
          timeline: { indexNames: ['test-index'], filters: [] },
          ruleNote,
        });
      });

      expect(mockClearActiveTimeline).toHaveBeenCalledTimes(1);
    });

    it('should call updateTimeline with correct parameters', async () => {
      const { result } = renderHookWithProviders();
      const createTimeline = getCreateTimelineFn(result);

      const mockFilters = [{ meta: { alias: 'test' } }];
      await act(async () => {
        await createTimeline({
          timeline: { indexNames: ['test-index'], filters: mockFilters },
          ruleNote,
        });
      });

      expect(mockUpdateTimeline).toHaveBeenCalledTimes(1);
      expect(mockUpdateTimeline).toHaveBeenCalledWith({
        duplicate: true,
        from: defaultProps.from,
        to: defaultProps.to,
        id: TimelineId.active,
        notes: [],
        timeline: expect.objectContaining({
          indexNames: ['test-index'],
          show: true,
          filters: mockFilters,
        }),
        ruleNote,
      });
    });

    it('should use from and to props in timeline update', async () => {
      const customProps = {
        ...defaultProps,
        from: '2023-01-01T00:00:00.000Z',
        to: '2023-01-02T00:00:00.000Z',
      };
      const { result } = renderHookWithProviders(customProps);
      const createTimeline = getCreateTimelineFn(result);

      await act(async () => {
        await createTimeline({
          timeline: { indexNames: [], filters: [] },
          ruleNote: '',
        });
      });

      expect(mockUpdateTimeline).toHaveBeenCalledWith(
        expect.objectContaining({
          from: customProps.from,
          to: customProps.to,
        })
      );
    });

    it('should default indexNames to empty array if not provided', async () => {
      const { result } = renderHookWithProviders();
      const createTimeline = getCreateTimelineFn(result);

      await act(async () => {
        await createTimeline({
          timeline: { indexNames: undefined, filters: [] },
          ruleNote: '',
        });
      });

      expect(mockUpdateTimeline).toHaveBeenCalledWith(
        expect.objectContaining({
          timeline: expect.objectContaining({
            indexNames: [],
          }),
        })
      );
    });

    it('should set show to true on the timeline', async () => {
      const { result } = renderHookWithProviders();
      const createTimeline = getCreateTimelineFn(result);

      await act(async () => {
        await createTimeline({
          timeline: { indexNames: [], filters: [] },
          ruleNote: '',
        });
      });

      expect(mockUpdateTimeline).toHaveBeenCalledWith(
        expect.objectContaining({
          timeline: expect.objectContaining({
            show: true,
          }),
        })
      );
    });
  });
});
