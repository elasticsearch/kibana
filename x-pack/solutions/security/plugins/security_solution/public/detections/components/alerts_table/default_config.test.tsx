/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ExistsFilter, Filter } from '@kbn/es-query';
import { tableDefaults } from '@kbn/securitysolution-data-table';
import { createLicenseServiceMock } from '../../../../common/license/mocks';
import {
  buildAlertAssigneesFilter,
  buildAlertsFilter,
  buildAlertStatusesFilter,
  buildAlertStatusFilter,
  buildThreatMatchFilter,
  getAlertsDefaultModel,
  getAlertsPreviewDefaultModel,
  buildAlertsFilterByRuleIds,
} from './default_config';

jest.mock('./actions');

const basicBaseColumns = [
  {
    columnHeaderType: 'not-filtered',
    displayAsText: 'Severity',
    id: 'kibana.alert.severity',
    initialWidth: 105,
  },
  {
    columnHeaderType: 'not-filtered',
    displayAsText: 'Risk Score',
    id: 'kibana.alert.risk_score',
    initialWidth: 100,
  },
  {
    columnHeaderType: 'not-filtered',
    displayAsText: 'Reason',
    id: 'kibana.alert.reason',
    initialWidth: 450,
  },
  { columnHeaderType: 'not-filtered', id: 'host.name' },
  { columnHeaderType: 'not-filtered', id: 'user.name' },
  { columnHeaderType: 'not-filtered', id: 'process.name' },
  { columnHeaderType: 'not-filtered', id: 'file.name' },
  { columnHeaderType: 'not-filtered', id: 'source.ip' },
  { columnHeaderType: 'not-filtered', id: 'destination.ip' },
];

const platinumBaseColumns = [
  {
    columnHeaderType: 'not-filtered',
    displayAsText: 'Severity',
    id: 'kibana.alert.severity',
    initialWidth: 105,
  },
  {
    columnHeaderType: 'not-filtered',
    displayAsText: 'Risk Score',
    id: 'kibana.alert.risk_score',
    initialWidth: 100,
  },
  {
    columnHeaderType: 'not-filtered',
    displayAsText: 'Reason',
    id: 'kibana.alert.reason',
    initialWidth: 450,
  },
  { columnHeaderType: 'not-filtered', id: 'host.name' },
  { columnHeaderType: 'not-filtered', id: 'user.name' },
  {
    columnHeaderType: 'not-filtered',
    id: 'host.risk.calculated_level',
    displayAsText: 'Host Risk Level',
  },
  {
    columnHeaderType: 'not-filtered',
    id: 'user.risk.calculated_level',
    displayAsText: 'User Risk Level',
  },
  {
    columnHeaderType: 'not-filtered',
    id: 'service.risk.calculated_level',
    displayAsText: 'Service Risk Level',
  },
  {
    columnHeaderType: 'not-filtered',
    id: 'host.asset.criticality',
    displayAsText: 'Host Criticality',
  },
  {
    columnHeaderType: 'not-filtered',
    id: 'user.asset.criticality',
    displayAsText: 'User Criticality',
  },
  {
    columnHeaderType: 'not-filtered',
    id: 'service.asset.criticality',
    displayAsText: 'Service Criticality',
  },
  { columnHeaderType: 'not-filtered', id: 'process.name' },
  { columnHeaderType: 'not-filtered', id: 'file.name' },
  { columnHeaderType: 'not-filtered', id: 'source.ip' },
  { columnHeaderType: 'not-filtered', id: 'destination.ip' },
];

const dataViewId = 'security-solution-default';

describe('alerts default_config', () => {
  describe('buildAlertsRuleIdFilter', () => {
    test('given a rule id this will return an array with a single filter', () => {
      const filters: Filter[] = buildAlertsFilter('rule-id-1');
      const expectedFilter: Filter = {
        meta: {
          alias: null,
          negate: false,
          index: dataViewId,
          disabled: false,
          type: 'phrase',
          key: 'kibana.alert.rule.rule_id',
          params: {
            query: 'rule-id-1',
          },
        },
        query: {
          match_phrase: {
            'kibana.alert.rule.rule_id': 'rule-id-1',
          },
        },
      };
      expect(filters).toHaveLength(1);
      expect(filters[0]).toEqual(expectedFilter);
    });

    describe('buildThreatMatchFilter', () => {
      test('given a showOnlyThreatIndicatorAlerts=true this will return an array with a single filter', () => {
        const filters: Filter[] = buildThreatMatchFilter(true);
        const expectedFilter: ExistsFilter = {
          meta: {
            alias: null,
            disabled: false,
            index: dataViewId,
            negate: false,
            key: 'kibana.alert.rule.type',
            type: 'term',
          },
          query: { term: { 'kibana.alert.rule.type': 'threat_match' } },
        };
        expect(filters).toHaveLength(1);
        expect(filters[0]).toEqual(expectedFilter);
      });
      test('given a showOnlyThreatIndicatorAlerts=false this will return an empty filter', () => {
        const filters: Filter[] = buildThreatMatchFilter(false);
        expect(filters).toHaveLength(0);
      });
    });
  });

  describe('buildAlertStatusFilter', () => {
    test('when status is acknowledged, filter will build for both `in-progress` and `acknowledged`', () => {
      const filters = buildAlertStatusFilter('acknowledged');
      const expected = {
        meta: {
          alias: null,
          disabled: false,
          key: 'kibana.alert.workflow_status',
          negate: false,
          params: {
            query: 'acknowledged',
          },
          type: 'phrase',
        },
        query: {
          bool: {
            should: [
              {
                term: {
                  'kibana.alert.workflow_status': 'acknowledged',
                },
              },
              {
                term: {
                  'kibana.alert.workflow_status': 'in-progress',
                },
              },
            ],
          },
        },
      };
      expect(filters).toHaveLength(1);
      expect(filters[0]).toEqual(expected);
    });

    test('when status is `open` or `closed`, filter will build for solely that status', () => {
      const filters = buildAlertStatusFilter('open');
      const expected = {
        meta: {
          alias: null,
          disabled: false,
          key: 'kibana.alert.workflow_status',
          negate: false,
          params: {
            query: 'open',
          },
          type: 'phrase',
        },
        query: {
          term: {
            'kibana.alert.workflow_status': 'open',
          },
        },
      };
      expect(filters).toHaveLength(1);
      expect(filters[0]).toEqual(expected);
    });
  });

  describe('buildAlertStatusesFilter', () => {
    test('builds filter containing all statuses passed into function', () => {
      const filters = buildAlertStatusesFilter(['open', 'acknowledged', 'in-progress']);
      const expected = {
        meta: {
          alias: null,
          disabled: false,
          negate: false,
        },
        query: {
          bool: {
            should: [
              {
                term: {
                  'kibana.alert.workflow_status': 'open',
                },
              },
              {
                term: {
                  'kibana.alert.workflow_status': 'acknowledged',
                },
              },
              {
                term: {
                  'kibana.alert.workflow_status': 'in-progress',
                },
              },
            ],
          },
        },
      };
      expect(filters).toHaveLength(1);
      expect(filters[0]).toEqual(expected);
    });
  });

  describe('buildAlertAssigneesFilter', () => {
    test('given an empty list of assignees ids will return an empty filter', () => {
      const filters: Filter[] = buildAlertAssigneesFilter([]);
      expect(filters).toHaveLength(0);
    });

    test('builds filter containing all assignees ids passed into function', () => {
      const filters = buildAlertAssigneesFilter(['user-id-1', 'user-id-2', 'user-id-3']);
      const expected = {
        meta: {
          alias: null,
          disabled: false,
          index: dataViewId,
          negate: false,
        },
        query: {
          bool: {
            should: [
              {
                term: {
                  'kibana.alert.workflow_assignee_ids': 'user-id-1',
                },
              },
              {
                term: {
                  'kibana.alert.workflow_assignee_ids': 'user-id-2',
                },
              },
              {
                term: {
                  'kibana.alert.workflow_assignee_ids': 'user-id-3',
                },
              },
            ],
          },
        },
      };
      expect(filters).toHaveLength(1);
      expect(filters[0]).toEqual(expected);
    });
  });

  describe('buildAlertsFilterByRuleIds', () => {
    it('given an empty list of rule ids will return an empty filter', () => {
      const filters = buildAlertsFilterByRuleIds([]);
      expect(filters).toHaveLength(0);
    });

    it('builds filter containing 1 rule id passed into function', () => {
      const filters = buildAlertsFilterByRuleIds(['rule-id-1']);
      const expected = {
        meta: {
          alias: null,
          disabled: false,
          negate: false,
        },
        query: {
          bool: {
            should: [
              {
                term: {
                  'kibana.alert.rule.rule_id': 'rule-id-1',
                },
              },
            ],
            minimum_should_match: 1,
          },
        },
      };

      expect(filters).toHaveLength(1);
      expect(filters[0]).toEqual(expected);
    });

    it('builds filter containing 3 rule ids passed into function', () => {
      const filters = buildAlertsFilterByRuleIds(['rule-id-1', 'rule-id-2', 'rule-id-3']);
      const expected = {
        meta: {
          alias: null,
          disabled: false,
          negate: false,
        },
        query: {
          bool: {
            should: [
              {
                term: {
                  'kibana.alert.rule.rule_id': 'rule-id-1',
                },
              },
              {
                term: {
                  'kibana.alert.rule.rule_id': 'rule-id-2',
                },
              },
              {
                term: {
                  'kibana.alert.rule.rule_id': 'rule-id-3',
                },
              },
            ],
            minimum_should_match: 1,
          },
        },
      };

      expect(filters).toHaveLength(1);
      expect(filters[0]).toEqual(expected);
    });
  });

  describe('getAlertsDefaultModel', () => {
    test('returns correct model for Basic license', () => {
      const licenseServiceMock = createLicenseServiceMock();
      licenseServiceMock.isPlatinumPlus.mockReturnValue(false);
      const model = getAlertsDefaultModel(licenseServiceMock);

      const expected = {
        ...tableDefaults,
        itemsPerPage: 50,
        showCheckboxes: true,
        columns: [
          { columnHeaderType: 'not-filtered', id: '@timestamp', initialWidth: 200 },
          {
            columnHeaderType: 'not-filtered',
            displayAsText: 'Rule',
            id: 'kibana.alert.rule.name',
            initialWidth: 180,
            linkField: 'kibana.alert.rule.uuid',
          },
          {
            columnHeaderType: 'not-filtered',
            displayAsText: 'Assignees',
            id: 'kibana.alert.workflow_assignee_ids',
            initialWidth: 190,
          },
          ...basicBaseColumns,
        ],
      };
      expect(model).toEqual(expected);
    });

    test('returns correct model for Platinum license', () => {
      const licenseServiceMock = createLicenseServiceMock();
      const model = getAlertsDefaultModel(licenseServiceMock);

      const expected = {
        ...tableDefaults,
        itemsPerPage: 50,
        showCheckboxes: true,
        columns: [
          { columnHeaderType: 'not-filtered', id: '@timestamp', initialWidth: 200 },
          {
            columnHeaderType: 'not-filtered',
            displayAsText: 'Rule',
            id: 'kibana.alert.rule.name',
            initialWidth: 180,
            linkField: 'kibana.alert.rule.uuid',
          },
          {
            columnHeaderType: 'not-filtered',
            displayAsText: 'Assignees',
            id: 'kibana.alert.workflow_assignee_ids',
            initialWidth: 190,
          },
          ...platinumBaseColumns,
        ],
      };
      expect(model).toEqual(expected);
    });
  });

  describe('getAlertsPreviewDefaultModel', () => {
    test('returns correct model for Basic license', () => {
      const licenseServiceMock = createLicenseServiceMock();
      licenseServiceMock.isPlatinumPlus.mockReturnValue(false);
      const model = getAlertsPreviewDefaultModel(licenseServiceMock);

      const expected = {
        ...tableDefaults,
        showCheckboxes: false,
        defaultColumns: [
          { columnHeaderType: 'not-filtered', id: 'kibana.alert.original_time', initialWidth: 200 },
          ...basicBaseColumns,
        ],
        columns: [
          { columnHeaderType: 'not-filtered', id: 'kibana.alert.original_time', initialWidth: 200 },
          ...basicBaseColumns,
        ],
        sort: [
          {
            columnId: 'kibana.alert.original_time',
            columnType: 'date',
            esTypes: ['date'],
            sortDirection: 'desc',
          },
        ],
      };
      expect(model).toEqual(expected);
    });

    test('returns correct model for Platinum license', () => {
      const licenseServiceMock = createLicenseServiceMock();
      const model = getAlertsPreviewDefaultModel(licenseServiceMock);

      const expected = {
        ...tableDefaults,
        showCheckboxes: false,
        defaultColumns: [
          { columnHeaderType: 'not-filtered', id: 'kibana.alert.original_time', initialWidth: 200 },
          ...platinumBaseColumns,
        ],
        columns: [
          { columnHeaderType: 'not-filtered', id: 'kibana.alert.original_time', initialWidth: 200 },
          ...platinumBaseColumns,
        ],
        sort: [
          {
            columnId: 'kibana.alert.original_time',
            columnType: 'date',
            esTypes: ['date'],
            sortDirection: 'desc',
          },
        ],
      };
      expect(model).toEqual(expected);
    });
  });

  // TODO: move these tests to ../timelines/components/timeline/body/events/event_column_view.tsx
  // describe.skip('getAlertActions', () => {
  //   let setEventsLoading: ({ eventIds, isLoading }: SetEventsLoadingProps) => void;
  //   let setEventsDeleted: ({ eventIds, isDeleted }: SetEventsDeletedProps) => void;
  //   let createTimeline: CreateTimeline;
  //   let updateTimelineIsLoading: UpdateTimelineLoading;
  //
  //   let onAlertStatusUpdateSuccess: (count: number, status: string) => void;
  //   let onAlertStatusUpdateFailure: (status: string, error: Error) => void;
  //
  //   beforeEach(() => {
  //     setEventsLoading = jest.fn();
  //     setEventsDeleted = jest.fn();
  //     createTimeline = jest.fn();
  //     updateTimelineIsLoading = jest.fn();
  //     onAlertStatusUpdateSuccess = jest.fn();
  //     onAlertStatusUpdateFailure = jest.fn();
  //   });
  //
  //   describe('timeline tooltip', () => {
  //     test('it invokes sendAlertToTimelineAction when button clicked', () => {
  //       const alertsActions = getAlertActions({
  //         canUserCRUD: true,
  //         hasIndexWrite: true,
  //         setEventsLoading,
  //         setEventsDeleted,
  //         createTimeline,
  //         status: 'open',
  //         updateTimelineIsLoading,
  //         onAlertStatusUpdateSuccess,
  //         onAlertStatusUpdateFailure,
  //       });
  //       const timelineAction = alertsActions[0].getAction({
  //         eventId: 'even-id',
  //         ecsData: mockEcsDataWithAlert,
  //       });
  //       const wrapper = mount<React.ReactElement>(timelineAction as React.ReactElement);
  //       wrapper.find(EuiButtonIcon).simulate('click');
  //
  //       expect(sendAlertToTimelineAction).toHaveBeenCalled();
  //     });
  //   });
  //
  //   describe('alert open action', () => {
  //     let alertsActions: TimelineAction[];
  //     let alertOpenAction: JSX.Element;
  //     let wrapper: ReactWrapper<React.ReactElement, unknown>;
  //
  //     beforeEach(() => {
  //       alertsActions = getAlertActions({
  //         canUserCRUD: true,
  //         hasIndexWrite: true,
  //         setEventsLoading,
  //         setEventsDeleted,
  //         createTimeline,
  //         status: 'open',
  //         updateTimelineIsLoading,
  //         onAlertStatusUpdateSuccess,
  //         onAlertStatusUpdateFailure,
  //       });
  //
  //       alertOpenAction = alertsActions[1].getAction({
  //         eventId: 'event-id',
  //         ecsData: mockEcsDataWithAlert,
  //       });
  //
  //       wrapper = mount<React.ReactElement>(alertOpenAction as React.ReactElement);
  //     });
  //
  //     afterEach(() => {
  //       wrapper.unmount();
  //     });
  //
  //     test('it invokes updateAlertStatusAction when button clicked', () => {
  //       wrapper.find(EuiButtonIcon).simulate('click');
  //
  //       expect(updateAlertStatusAction).toHaveBeenCalledWith({
  //         alertIds: ['event-id'],
  //         status: 'open',
  //         setEventsLoading,
  //         setEventsDeleted,
  //         onAlertStatusUpdateSuccess,
  //         onAlertStatusUpdateFailure,
  //       });
  //     });
  //
  //     test('it displays expected text on hover', () => {
  //       const openAlert = wrapper.find(EuiToolTip);
  //       openAlert.simulate('mouseOver');
  //       const tooltip = wrapper.find('.euiToolTipPopover').text();
  //
  //       expect(tooltip).toEqual(i18n.ACTION_OPEN_ALERT);
  //     });
  //
  //     test('it displays expected icon', () => {
  //       const icon = wrapper.find(EuiButtonIcon).props().iconType;
  //
  //       expect(icon).toEqual('securityAlertDetected');
  //     });
  //   });
  //
  //   describe('alert close action', () => {
  //     let alertsActions: TimelineAction[];
  //     let alertCloseAction: JSX.Element;
  //     let wrapper: ReactWrapper<React.ReactElement, unknown>;
  //
  //     beforeEach(() => {
  //       alertsActions = getAlertActions({
  //         canUserCRUD: true,
  //         hasIndexWrite: true,
  //         setEventsLoading,
  //         setEventsDeleted,
  //         createTimeline,
  //         status: 'closed',
  //         updateTimelineIsLoading,
  //         onAlertStatusUpdateSuccess,
  //         onAlertStatusUpdateFailure,
  //       });
  //
  //       alertCloseAction = alertsActions[1].getAction({
  //         eventId: 'event-id',
  //         ecsData: mockEcsDataWithAlert,
  //       });
  //
  //       wrapper = mount<React.ReactElement>(alertCloseAction as React.ReactElement);
  //     });
  //
  //     afterEach(() => {
  //       wrapper.unmount();
  //     });
  //
  //     test('it invokes updateAlertStatusAction when status button clicked', () => {
  //       wrapper.find(EuiButtonIcon).simulate('click');
  //
  //       expect(updateAlertStatusAction).toHaveBeenCalledWith({
  //         alertIds: ['event-id'],
  //         status: 'closed',
  //         setEventsLoading,
  //         setEventsDeleted,
  //         onAlertStatusUpdateSuccess,
  //         onAlertStatusUpdateFailure,
  //       });
  //     });
  //
  //     test('it displays expected text on hover', () => {
  //       const closeAlert = wrapper.find(EuiToolTip);
  //       closeAlert.simulate('mouseOver');
  //       const tooltip = wrapper.find('.euiToolTipPopover').text();
  //       expect(tooltip).toEqual(i18n.ACTION_CLOSE_ALERT);
  //     });
  //
  //     test('it displays expected icon', () => {
  //       const icon = wrapper.find(EuiButtonIcon).props().iconType;
  //
  //       expect(icon).toEqual('securityAlertResolved');
  //     });
  //   });
  // });
});
