/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, render, waitFor, renderHook, act } from '@testing-library/react';
import { of } from 'rxjs';
import { TestProviders } from '../../../../common/mock';
import { useKibana } from '../../../../common/lib/kibana';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import { detectionExceptionList, useInvestigateInTimeline } from './use_investigate_in_timeline';
import * as actions from '../actions';
import { useAppToasts } from '../../../../common/hooks/use_app_toasts';
import type { AlertTableContextMenuItem } from '../types';
import React from 'react';
import { EuiPopover, EuiContextMenu } from '@elastic/eui';
import * as timelineActions from '../../../../timelines/store/actions';
import { getTimelineTemplate } from '../../../../timelines/containers/api';
import type { TimelineEventsDetailsItem } from '@kbn/timelines-plugin/common';
import { useUserPrivileges } from '../../../../common/components/user_privileges';

jest.mock('../../../../common/lib/kibana');
jest.mock('../../../../timelines/containers/api');
jest.mock('../../../../common/lib/apm/use_start_transaction');
jest.mock('../../../../common/hooks/use_app_toasts');
jest.mock('../../../../common/components/user_privileges');

const ecsRowData: Ecs = {
  _id: '1',
  agent: { type: ['blah'] },
  host: { name: ['some host name'] },
  kibana: {
    alert: {
      workflow_status: ['open'],
      rule: {
        parameters: {},
        uuid: ['testId'],
      },
    },
  },
};

const nonECSRowData: TimelineEventsDetailsItem[] = [
  {
    category: 'agent',
    isObjectArray: false,
    field: 'agent.type',
    values: ['blah'],
  },
  {
    category: 'kibana',
    isObjectArray: false,
    field: 'kibana.alert.workflow_status',
    values: ['open'],
  },
  {
    category: 'kibana',
    isObjectArray: false,
    field: 'kibana.alert.rule.uuid',
    values: ['testId'],
  },
  {
    category: 'host',
    isObjectArray: false,
    field: 'host.name',
    values: ['some host name'],
  },
];

const getEcsDataWithRuleTypeAndTimelineTemplate = (ruleType: string, ecsData: Ecs = ecsRowData) => {
  return {
    ...ecsData,
    kibana: {
      ...(ecsData?.kibana ?? {}),
      alert: {
        ...(ecsData.kibana?.alert ?? {}),
        rule: {
          ...(ecsData.kibana?.alert.rule ?? {}),
          type: [ruleType],
          timeline_id: ['dummyTimelineTemplateId'],
        },
      },
    },
  } as Ecs;
};

const getNonEcsDataWithRuleTypeAndTimelineTemplate = (
  ruleType: string,
  nonEcsData: TimelineEventsDetailsItem[] = nonECSRowData
) => {
  return [
    ...nonEcsData,
    {
      category: 'kibana',
      isObjectArray: false,
      field: 'kibana.alert.rule.type',
      values: [ruleType],
    },
    {
      category: 'kibana',
      isObjectArray: false,
      field: 'kibana.alert.rule.timeline_id',
      values: ['dummyTimelineTemplateId'],
    },
  ];
};

const mockSendAlertToTimeline = jest.spyOn(actions, 'sendAlertToTimelineAction');

(useAppToasts as jest.Mock).mockReturnValue({
  addError: jest.fn(),
});

const mockTimelineTemplateResponse = {
  savedObjectId: '15bc8185-06ef-4956-b7e7-be8e289b13c2',
  version: 'WzIzMzUsMl0=',
  columns: [
    {
      columnHeaderType: 'not-filtered',
      id: '@timestamp',
      type: 'date',
    },
    {
      columnHeaderType: 'not-filtered',
      id: 'host.name',
    },
    {
      columnHeaderType: 'not-filtered',
      id: 'user.name',
    },
  ],
  dataProviders: [
    {
      and: [],
      enabled: true,
      id: 'some-random-id',
      name: 'host.name',
      excluded: false,
      kqlQuery: '',
      queryMatch: {
        field: 'host.name',
        value: '{host.name}',
        operator: ':',
      },
      type: 'template',
    },
  ],
  dataViewId: 'security-solution-default',
  description: '',
  eqlOptions: {
    eventCategoryField: 'event.category',
    tiebreakerField: '',
    timestampField: '@timestamp',
    query: '',
    size: 100,
  },
  eventType: 'all',
  excludedRowRendererIds: [
    'alert',
    'alerts',
    'auditd',
    'auditd_file',
    'library',
    'netflow',
    'plain',
    'registry',
    'suricata',
    'system',
    'system_dns',
    'system_endgame_process',
    'system_file',
    'system_fim',
    'system_security_event',
    'system_socket',
    'threat_match',
    'zeek',
  ],
  favorite: [],
  filters: [],
  indexNames: ['.alerts-security.alerts-default', 'auditbeat-*', 'filebeat-*', 'packetbeat-*'],
  kqlMode: 'filter',
  kqlQuery: {
    filterQuery: {
      kuery: {
        kind: 'kuery',
        expression: '*',
      },
      serializedQuery: '{"query_string":{"query":"*"}}',
    },
  },
  title: 'Named Template',
  templateTimelineId: 'c755cda6-8a65-4ec2-b6ff-35a5356de8b9',
  templateTimelineVersion: 1,
  dateRange: {
    start: '2024-08-13T22:00:00.000Z',
    end: '2024-08-14T21:59:59.999Z',
  },
  savedQueryId: null,
  created: 1723625359467,
  createdBy: 'elastic',
  updated: 1723625359988,
  updatedBy: 'elastic',
  timelineType: 'template',
  status: 'active',
  sort: [
    {
      columnId: '@timestamp',
      columnType: 'date',
      sortDirection: 'desc',
      esTypes: ['date'],
    },
  ],
  savedSearchId: null,
  eventIdToNoteIds: [],
  noteIds: [],
  notes: [],
  pinnedEventIds: [],
  pinnedEventsSaveObject: [],
};

const props = {
  ecsRowData,
  onInvestigateInTimelineAlertClick: jest.fn(),
};

const addTimelineSpy = jest.spyOn(timelineActions, 'addTimeline');

const RULE_TYPES_TO_BE_TESTED = [
  'query',
  'esql',
  'eql',
  'machine_learning',
  /* TODO: Complete test suites for below rule types */
  // 'new_terms',
  // 'eql',
  // 'threshold',
  // 'threat_match',
];

const renderContextMenu = (items: AlertTableContextMenuItem[]) => {
  const panels = [{ id: 0, items }];
  return render(
    <EuiPopover
      aria-label="Context menu"
      isOpen={true}
      panelPaddingSize="none"
      anchorPosition="downLeft"
      closePopover={() => {}}
      button={<></>}
    >
      <EuiContextMenu initialPanelId={0} panels={panels} />
    </EuiPopover>
  );
};

describe('detectionExceptionList', () => {
  test('returns detection exception lists from canonical array values', () => {
    const ecsData = {
      kibana: {
        alert: {
          rule: {
            exceptions_list: [
              {
                id: 'exception-list-id',
                list_id: 'detection-list-id',
                type: 'detection',
                namespace_type: 'single',
              },
            ],
          },
        },
      },
    } as unknown as Ecs;

    expect(detectionExceptionList(ecsData)).toEqual([
      {
        exception_list_id: 'detection-list-id',
        namespace_type: 'single',
      },
    ]);
  });

  test('does not throw when rule parameters contain a single exception list object', () => {
    const ecsData = {
      kibana: {
        alert: {
          rule: {
            exceptions_list: [],
            parameters: [
              JSON.stringify({
                exceptions_list: {
                  id: 'exception-list-id',
                  list_id: 'rule-default-list-id',
                  type: 'rule_default',
                  namespace_type: 'single',
                },
              }),
            ],
          },
        },
      },
    } as unknown as Ecs;

    expect(() => detectionExceptionList(ecsData)).not.toThrow();
    expect(detectionExceptionList(ecsData)).toEqual([]);
  });
});

describe('useInvestigateInTimeline', () => {
  let mockSearchStrategyClient = {
    search: jest
      .fn()
      .mockReturnValue(of({ data: getNonEcsDataWithRuleTypeAndTimelineTemplate('query') })),
  };
  beforeEach(() => {
    (getTimelineTemplate as jest.Mock).mockResolvedValue(mockTimelineTemplateResponse);
    // by default we return data for query rule type
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        data: {
          search: mockSearchStrategyClient,
          query: jest.fn(),
        },
      },
    });
    (useUserPrivileges as jest.Mock).mockReturnValue({
      timelinePrivileges: { read: true },
    });
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  test('creates a component and click handler', () => {
    const { result } = renderHook(() => useInvestigateInTimeline(props), {
      wrapper: TestProviders,
    });
    expect(result.current.investigateInTimelineActionItems).toBeTruthy();
    expect(typeof result.current.investigateInTimelineAlertClick).toBe('function');
  });

  describe('the click handler calls createTimeline once and only once', () => {
    test('runs 0 times on render, once on click', async () => {
      const { result } = renderHook(() => useInvestigateInTimeline(props), {
        wrapper: TestProviders,
      });
      const actionItem = result.current.investigateInTimelineActionItems[0];
      const { getByTestId } = renderContextMenu([actionItem]);
      expect(mockSendAlertToTimeline).toHaveBeenCalledTimes(0);
      act(() => {
        fireEvent.click(getByTestId('investigate-in-timeline-action-item'));
      });
      expect(mockSendAlertToTimeline).toHaveBeenCalledTimes(1);
    });
  });

  describe('investigate an alert with timeline template', () => {
    describe.each(RULE_TYPES_TO_BE_TESTED)('Rule type : %s', (ruleType: string) => {
      test('should copy columns over from template', async () => {
        mockSearchStrategyClient = {
          search: jest
            .fn()
            .mockReturnValue(of({ data: getNonEcsDataWithRuleTypeAndTimelineTemplate(ruleType) })),
        };
        const ecsData = getEcsDataWithRuleTypeAndTimelineTemplate(ruleType);
        const { result } = renderHook(
          () => useInvestigateInTimeline({ ...props, ecsRowData: ecsData }),
          {
            wrapper: TestProviders,
          }
        );

        const expectedColumns = [
          {
            columnHeaderType: 'not-filtered',
            id: '@timestamp',
            type: 'date',
            initialWidth: 215,
          },
          {
            columnHeaderType: 'not-filtered',
            id: 'host.name',
            initialWidth: undefined,
          },
          {
            columnHeaderType: 'not-filtered',
            id: 'user.name',
            initialWidth: undefined,
          },
        ];

        const investigateAction = result.current.investigateInTimelineAlertClick;
        await investigateAction();

        await waitFor(() => {
          expect(addTimelineSpy).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
              timeline: expect.objectContaining({
                columns: expectedColumns,
              }),
            })
          );
        });
      });
      test('should copy dataProviders over from template', async () => {
        mockSearchStrategyClient = {
          search: jest
            .fn()
            .mockReturnValue(of({ data: getNonEcsDataWithRuleTypeAndTimelineTemplate(ruleType) })),
        };
        const ecsData: Ecs = getEcsDataWithRuleTypeAndTimelineTemplate(ruleType);
        const { result } = renderHook(
          () => useInvestigateInTimeline({ ...props, ecsRowData: ecsData }),
          {
            wrapper: TestProviders,
          }
        );

        const expectedDataProvider = [
          {
            and: [],
            enabled: true,
            id: 'some-random-id',
            name: 'some host name',
            excluded: false,
            kqlQuery: '',
            queryMatch: {
              field: 'host.name',
              value: 'some host name',
              operator: ':',
            },
            type: 'default',
          },
        ];

        const investigateAction = result.current.investigateInTimelineAlertClick;
        await investigateAction();

        await waitFor(() => {
          expect(addTimelineSpy).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
              timeline: expect.objectContaining({
                dataProviders: expectedDataProvider,
              }),
            })
          );
        });
      });
    });
  });

  describe('privileges', () => {
    test('should not return a timeline action when the user does not have sufficient privileges', () => {
      (useUserPrivileges as jest.Mock).mockReturnValue({
        timelinePrivileges: { read: false },
      });

      const { result } = renderHook(() => useInvestigateInTimeline(props), {
        wrapper: TestProviders,
      });
      expect(result.current.investigateInTimelineActionItems).toHaveLength(0);
    });
  });
});
