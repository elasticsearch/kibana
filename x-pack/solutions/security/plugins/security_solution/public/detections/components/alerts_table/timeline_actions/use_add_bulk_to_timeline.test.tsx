/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { useAddBulkToTimelineAction } from './use_add_bulk_to_timeline';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { TableId } from '@kbn/securitysolution-data-table';
import { PageScope } from '../../../../data_view_manager/constants';
import { TestProviders } from '../../../../common/mock';

// Mock all dependencies
jest.mock('../../../../common/components/user_privileges');
jest.mock('../../../../data_view_manager/hooks/use_data_view', () => ({
  useDataView: jest.fn().mockReturnValue({
    dataView: { getRuntimeMappings: jest.fn().mockReturnValue({}) },
  }),
}));
jest.mock('../../../../data_view_manager/hooks/use_browser_fields', () => ({
  useBrowserFields: jest.fn().mockReturnValue({}),
}));
jest.mock('../../../../data_view_manager/hooks/use_selected_patterns', () => ({
  useSelectedPatterns: jest.fn().mockReturnValue([]),
}));
jest.mock('../../../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: jest.fn().mockReturnValue(false),
}));
jest.mock('../../../../timelines/containers', () => ({
  useTimelineEventsHandler: jest.fn().mockReturnValue([null, null, jest.fn()]),
}));
jest.mock('../../../../common/lib/kuery', () => ({
  combineQueries: jest.fn().mockReturnValue({ filterQuery: '' }),
}));

jest.mock('./use_send_bulk_to_timeline', () => ({
  useSendBulkToTimeline: jest.fn().mockReturnValue({
    sendBulkEventsToTimelineHandler: jest.fn(),
  }),
}));

const mockUseUserPrivileges = useUserPrivileges as jest.Mock;

const defaultProps = {
  localFilters: [],
  tableId: TableId.alertsOnAlertsPage,
  from: '2020-07-07T08:20:18.966Z',
  to: '2020-07-08T08:20:18.966Z',
  scopeId: PageScope.alerts,
};

describe('useAddBulkToTimelineAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when the user has timeline read privileges', () => {
    beforeEach(() => {
      mockUseUserPrivileges.mockReturnValue({
        timelinePrivileges: { read: true },
      });
    });

    it('should return timeline action', () => {
      const { result } = renderHook(() => useAddBulkToTimelineAction(defaultProps), {
        wrapper: TestProviders,
      });

      expect(result.current).toHaveLength(1);
      expect(result.current[0]).toMatchObject({
        label: expect.any(String),
        onClick: expect.any(Function),
        key: 'add-bulk-to-timeline',
        'data-test-subj': 'investigate-bulk-in-timeline',
        icon: 'timeline',
        groupId: 'timeline',
      });
    });
  });

  describe('when the user does not have timeline read privileges', () => {
    beforeEach(() => {
      mockUseUserPrivileges.mockReturnValue({
        timelinePrivileges: { read: false },
      });
    });

    it('should return empty actions array', () => {
      const { result } = renderHook(() => useAddBulkToTimelineAction(defaultProps), {
        wrapper: TestProviders,
      });

      expect(result.current).toHaveLength(0);
      expect(result.current).toEqual([]);
    });
  });
});
