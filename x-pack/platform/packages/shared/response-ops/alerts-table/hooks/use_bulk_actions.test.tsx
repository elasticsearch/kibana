/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PropsWithChildren } from 'react';
import React from 'react';
import { renderHook } from '@testing-library/react';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { notificationServiceMock } from '@kbn/core-notifications-browser-mocks';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { AlertsQueryContext } from '@kbn/alerts-ui-shared/src/common/contexts/alerts_query_context';
import {
  useBulkActions,
  useBulkAddToCaseActions,
  useBulkAddToChatActions,
  useBulkUntrackActions,
  useBulkMuteActions,
} from './use_bulk_actions';
import { createCasesServiceMock } from '../mocks/cases.mock';
import { BulkActionsVerbs, type PublicAlertsDataGridProps } from '../types';
import type { AdditionalContext, OpenChatService, RenderContext, TimelineItem } from '../types';
import { useAlertsTableContext } from '../contexts/alerts_table_context';
import { createPartialObjectMock, testQueryClientConfig } from '../utils/test';
import { applicationServiceMock } from '@kbn/core-application-browser-mocks';

jest.mock('../apis/bulk_get_cases');
jest.mock('../contexts/alerts_table_context');
const mockCasesService = createCasesServiceMock();
const http = httpServiceMock.createStartContract();
const notifications = notificationServiceMock.createStartContract();
jest.mocked(useAlertsTableContext).mockReturnValue(
  createPartialObjectMock<RenderContext<AdditionalContext>>({
    bulkActionsStore: [{}, jest.fn()],
    services: {
      http,
      notifications,
    },
  })
);
const application = applicationServiceMock.createStartContract();
application.capabilities = { ...application.capabilities, infrastructure: { show: true } };
const queryClient = new QueryClient(testQueryClientConfig);
const wrapper = ({ children }: PropsWithChildren) => {
  return (
    <QueryClientProvider client={queryClient} context={AlertsQueryContext}>
      {children}
    </QueryClientProvider>
  );
};

const caseId = 'test-case';
const casesConfig: PublicAlertsDataGridProps['casesConfiguration'] = {
  featureId: 'test-feature-id',
  owner: ['cases'],
};

describe('bulk action hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const refresh = jest.fn();
  const clearSelection = jest.fn();
  const setIsBulkActionsLoading = jest.fn();

  const mockOpenExistingCase = jest.fn().mockImplementation(({ getAttachments }) => {
    getAttachments({ theCase: { id: caseId, owner: 'cases' } });
  });

  mockCasesService.helpers.canUseCases = jest.fn().mockReturnValue({ create: true, read: true });
  mockCasesService.ui.getCasesContext = jest.fn().mockReturnValue(() => 'Cases context');

  const mockAddExistingCase = mockCasesService.hooks.useCasesAddToExistingCaseModal.mockReturnValue(
    {
      open: mockOpenExistingCase,
      close: jest.fn(),
    }
  );

  describe('useBulkAddToCaseActions', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should refetch when calling onSuccess of useCasesAddToExistingCaseModal', async () => {
      renderHook(
        () =>
          useBulkAddToCaseActions({
            casesConfig,
            refresh,
            clearSelection,
            http,
            notifications,
            casesService: mockCasesService,
          }),
        {
          wrapper,
        }
      );

      mockAddExistingCase.mock.calls[0][0]!.onSuccess({ id: caseId, owner: 'cases' }, false);
      expect(refresh).toHaveBeenCalled();
    });

    it('should useCasesAddToExistingCaseModal with correct toaster params', async () => {
      renderHook(
        () =>
          useBulkAddToCaseActions({
            casesConfig,
            refresh,
            clearSelection,
            http,
            notifications,
            casesService: mockCasesService,
          }),
        {
          wrapper,
        }
      );

      expect(mockAddExistingCase).toHaveBeenCalledWith({
        noAttachmentsToaster: {
          title: 'No alerts added to the case',
          content: 'All selected alerts are already attached to the case',
        },
        onSuccess: expect.anything(),
      });
    });

    it('should open the case modal', async () => {
      const { result } = renderHook(
        () =>
          useBulkAddToCaseActions({
            casesConfig,
            refresh,
            clearSelection,
            http,
            notifications,
            casesService: mockCasesService,
          }),
        {
          wrapper,
        }
      );

      // @ts-expect-error: cases do not need all arguments
      result.current[0].onClick([]);

      expect(mockCasesService.helpers.groupAlertsByRule).toHaveBeenCalled();
      expect(mockOpenExistingCase).toHaveBeenCalled();
    });

    it('should open the flyout from the case modal', async () => {
      mockOpenExistingCase.mockImplementationOnce(({ getAttachments }) => {
        getAttachments({ theCase: undefined });
      });

      const alerts = [
        {
          _id: 'alert0',
          _index: 'idx0',
          data: [
            {
              field: 'kibana.alert.case_ids',
              value: [caseId],
            },
          ],
          ecs: {
            _id: 'alert0',
            _index: 'idx0',
          },
        },
        {
          _id: 'alert1',
          _index: 'idx1',
          data: [
            {
              field: 'kibana.alert.case_ids',
              value: ['test-case-2'],
            },
          ],
          ecs: {
            _id: 'alert1',
            _index: 'idx1',
          },
        },
      ];

      const { result } = renderHook(
        () =>
          useBulkAddToCaseActions({
            casesConfig,
            refresh,
            clearSelection,
            http,
            notifications,
            casesService: mockCasesService,
          }),
        {
          wrapper,
        }
      );

      // @ts-expect-error: cases do not need all arguments
      result.current[0].onClick(alerts);

      expect(mockCasesService.helpers.groupAlertsByRule).toHaveBeenCalledWith(alerts, 'cases');
    });

    it('should remove alerts that are already attached to the case', async () => {
      const { result } = renderHook(
        () =>
          useBulkAddToCaseActions({
            casesConfig,
            refresh,
            clearSelection,
            http,
            notifications,
            casesService: mockCasesService,
          }),
        {
          wrapper,
        }
      );

      // @ts-expect-error: cases do not need all arguments
      result.current[0].onClick([
        {
          _id: 'alert0',
          _index: 'idx0',
          data: [
            {
              field: 'kibana.alert.case_ids',
              value: [caseId],
            },
          ],
          ecs: {
            _id: 'alert0',
            _index: 'idx0',
          },
        },
        {
          _id: 'alert1',
          _index: 'idx1',
          data: [
            {
              field: 'kibana.alert.case_ids',
              value: ['test-case-2'],
            },
          ],
          ecs: {
            _id: 'alert1',
            _index: 'idx1',
          },
        },
      ]);

      expect(mockCasesService.helpers.groupAlertsByRule).toHaveBeenCalledWith(
        [
          {
            _id: 'alert1',
            _index: 'idx1',
            data: [
              {
                field: 'kibana.alert.case_ids',
                value: ['test-case-2'],
              },
            ],
            ecs: {
              _id: 'alert1',
              _index: 'idx1',
            },
          },
        ],
        'cases'
      );
    });

    it('should not show the bulk actions when the user does not have write access', async () => {
      mockCasesService.helpers.canUseCases = jest
        .fn()
        .mockReturnValue({ create: false, read: true });

      const { result } = renderHook(
        () =>
          useBulkAddToCaseActions({
            casesConfig,
            refresh,
            clearSelection,
            http,
            notifications,
            casesService: mockCasesService,
          }),
        {
          wrapper,
        }
      );

      expect(result.current.length).toBe(0);
    });

    it('should not show the bulk actions when the user does not have read access', async () => {
      mockCasesService.helpers.canUseCases = jest
        .fn()
        .mockReturnValue({ create: true, read: false });

      const { result } = renderHook(
        () =>
          useBulkAddToCaseActions({
            casesConfig,
            refresh,
            clearSelection,
            http,
            notifications,
            casesService: mockCasesService,
          }),
        {
          wrapper,
        }
      );

      expect(result.current.length).toBe(0);
    });

    it('should call canUseCases with an empty owner when casesConfig is missing', async () => {
      renderHook(
        () =>
          useBulkAddToCaseActions({
            refresh,
            clearSelection,
            http,
            notifications,
            casesService: mockCasesService,
          }),
        {
          wrapper,
        }
      );

      expect(mockCasesService.helpers.canUseCases).toHaveBeenCalledWith([]);
    });

    it('should not show the bulk actions when the cases context is missing', async () => {
      mockCasesService.ui.getCasesContext = jest.fn().mockReturnValue(() => null);

      const { result } = renderHook(
        () =>
          useBulkAddToCaseActions({
            refresh,
            clearSelection,
            http,
            notifications,
            casesService: mockCasesService,
          }),
        {
          wrapper,
        }
      );

      expect(result.current.length).toBe(0);
    });

    it('should not show the bulk actions when the case service is not available', async () => {
      const { result } = renderHook(
        () =>
          useBulkAddToCaseActions({
            casesConfig,
            refresh,
            clearSelection,
            http,
            notifications,
            casesService: mockCasesService,
          }),
        {
          wrapper,
        }
      );

      expect(result.current.length).toBe(0);
    });
  });

  describe('useBulkAddToChatActions', () => {
    const mockOpenChat = jest.fn();
    const agentBuilderService: OpenChatService = { openChat: mockOpenChat };
    const mockAttachments = [{ type: 'security.alerts', data: { alertIds: ['id1'] } }];
    const convertAlertToAttachment = jest.fn().mockReturnValue(mockAttachments);

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('returns empty array when agentBuilderService is not provided', () => {
      const { result } = renderHook(
        () =>
          useBulkAddToChatActions({
            bulkAddToChatConfig: { convertAlertToAttachment },
          }),
        { wrapper }
      );

      expect(result.current).toEqual([]);
    });

    it('returns empty array when bulkAddToChatConfig is not provided', () => {
      const { result } = renderHook(() => useBulkAddToChatActions({ agentBuilderService }), {
        wrapper,
      });

      expect(result.current).toEqual([]);
    });

    it('returns the add-to-chat action when both service and config are provided', () => {
      const { result } = renderHook(
        () =>
          useBulkAddToChatActions({
            agentBuilderService,
            bulkAddToChatConfig: { convertAlertToAttachment },
          }),
        { wrapper }
      );

      expect(result.current).toHaveLength(1);
      expect(result.current[0].key).toBe('bulk-add-to-chat');
      expect(result.current[0]['data-test-subj']).toBe('bulk-add-to-chat');
    });

    it('calls openChat with converted attachments when the action is clicked', () => {
      const alerts: TimelineItem[] = [
        { _id: 'id1', _index: 'idx', data: [], ecs: { _id: 'id1', _index: 'idx' } },
      ];

      const { result } = renderHook(
        () =>
          useBulkAddToChatActions({
            agentBuilderService,
            bulkAddToChatConfig: { convertAlertToAttachment },
          }),
        { wrapper }
      );

      result.current[0].onClick(alerts);

      expect(convertAlertToAttachment).toHaveBeenCalledWith(alerts);
      expect(mockOpenChat).toHaveBeenCalledWith({
        autoSendInitialMessage: false,
        newConversation: true,
        initialMessage: undefined,
        attachments: mockAttachments,
      });
    });

    it('passes initialMessage to openChat', () => {
      const { result } = renderHook(
        () =>
          useBulkAddToChatActions({
            agentBuilderService,
            bulkAddToChatConfig: {
              convertAlertToAttachment,
              initialMessage: 'Please triage these alerts.',
            },
          }),
        { wrapper }
      );

      result.current[0].onClick([]);

      expect(mockOpenChat).toHaveBeenCalledWith(
        expect.objectContaining({ initialMessage: 'Please triage these alerts.' })
      );
    });
  });

  describe('useBulkUntrackActions', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    it('should not show the bulk actions when the user lacks any observability permissions', () => {
      const { result } = renderHook(
        () =>
          useBulkUntrackActions({
            setIsBulkActionsLoading,
            refresh,
            clearSelection,
            isAllSelected: true,
            query: {
              bool: {
                must: {
                  term: {
                    test: 'test',
                  },
                },
              },
            },
            http,
            notifications,
            application: {
              ...application,
              // Force no permissions
              capabilities: {} as unknown as typeof application.capabilities,
            },
          }),
        {
          wrapper,
        }
      );

      expect(result.current.length).toBe(0);
    });
  });

  describe('useBulkMuteActions', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return mute/unmute actions', () => {
      const { result } = renderHook(
        () =>
          useBulkMuteActions({
            setIsBulkActionsLoading,
            refresh,
            clearSelection,
            http,
            notifications,
          }),
        {
          wrapper,
        }
      );

      expect(result.current.length).toBe(2);
      expect(result.current[0].key).toBe('bulk-mute');
      expect(result.current[1].key).toBe('bulk-unmute');
      expect(result.current[0]['data-test-subj']).toBe('bulk-mute');
      expect(result.current[1]['data-test-subj']).toBe('bulk-unmute');
    });
  });

  describe('useBulkActions', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockCasesService.helpers.canUseCases = jest
        .fn()
        .mockReturnValue({ create: true, read: true });
    });

    it('appends the internal bulk actions correctly for non siem rule types', async () => {
      const { result } = renderHook(
        () =>
          useBulkActions({
            alertsCount: 0,
            query: {},
            casesConfig,
            refresh,
            http,
            notifications,
            application,
            casesService: mockCasesService,
          }),
        {
          wrapper,
        }
      );

      expect(result.current.bulkActions).toMatchInlineSnapshot(`
        Array [
          Object {
            "id": 0,
            "items": Array [
              Object {
                "data-test-subj": "alerts-table-add-to-case",
                "disableOnQuery": true,
                "disabledLabel": "Add to case",
                "key": "alerts-table-add-to-case",
                "label": "Add to case",
                "onClick": [Function],
              },
              Object {
                "data-test-subj": "mark-as-untracked",
                "disableOnQuery": false,
                "disabledLabel": "Mark as untracked",
                "key": "mark-as-untracked",
                "label": "Mark as untracked",
                "onClick": [Function],
              },
              Object {
                "data-test-subj": "edit-tags",
                "disableOnQuery": true,
                "disabledLabel": "Edit tags",
                "key": "edit-tags",
                "label": "Edit tags",
                "onClick": [Function],
              },
              Object {
                "data-test-subj": "bulk-mute",
                "disableOnQuery": true,
                "disabledLabel": "Mute selected",
                "key": "bulk-mute",
                "label": "Mute selected",
                "onClick": [Function],
              },
              Object {
                "data-test-subj": "bulk-unmute",
                "disableOnQuery": true,
                "disabledLabel": "Unmute selected",
                "key": "bulk-unmute",
                "label": "Unmute selected",
                "onClick": [Function],
              },
            ],
          },
        ]
      `);
    });

    it('appends only the case bulk actions for SIEM', async () => {
      const { result } = renderHook(
        () =>
          useBulkActions({
            alertsCount: 0,
            query: {},
            casesConfig,
            refresh,
            ruleTypeIds: ['siem.esqlRule'],
            http,
            notifications,
            application,
            casesService: mockCasesService,
          }),
        {
          wrapper,
        }
      );

      expect(result.current.bulkActions).toMatchInlineSnapshot(`
        Array [
          Object {
            "id": 0,
            "items": Array [
              Object {
                "data-test-subj": "alerts-table-add-to-case",
                "disableOnQuery": true,
                "disabledLabel": "Add to case",
                "key": "alerts-table-add-to-case",
                "label": "Add to case",
                "onClick": [Function],
              },
            ],
          },
        ]
      `);
    });

    it('should not append duplicate items on rerender', async () => {
      const onClick = () => {};
      const items = [
        {
          label: 'test',
          key: 'test',
          'data-test-subj': 'test',
          disableOnQuery: true,
          disabledLabel: 'test',
          onClick,
        },
      ];
      const customBulkActionConfig = [
        {
          id: 0,
          items,
        },
      ];
      const useBulkActionsConfig = customBulkActionConfig;
      const { result, rerender } = renderHook(
        () =>
          useBulkActions({
            alertsCount: 0,
            query: {},
            casesConfig,
            refresh,
            additionalBulkActions: useBulkActionsConfig,
            http,
            notifications,
            application,
          }),
        {
          wrapper,
        }
      );
      const initialBulkActions = result.current.bulkActions[0].items
        ? [...result.current.bulkActions[0].items]
        : [];
      result.current.updateBulkActionsState({ action: BulkActionsVerbs.selectCurrentPage });
      rerender();
      result.current.updateBulkActionsState({ action: BulkActionsVerbs.clear });
      rerender();
      result.current.updateBulkActionsState({ action: BulkActionsVerbs.selectCurrentPage });
      rerender();
      result.current.updateBulkActionsState({ action: BulkActionsVerbs.selectAll });
      rerender();
      const newBulkActions = result.current.bulkActions[0].items;
      expect(initialBulkActions).toEqual(newBulkActions);
    });

    it('hides bulk actions if hideBulkActions == true', () => {
      // make sure by default some actions are returned for this
      // config
      const { result: resultWithoutHideBulkActions } = renderHook(
        () =>
          useBulkActions({
            alertsCount: 0,
            query: {},
            casesConfig,
            refresh,
            ruleTypeIds: ['observability'],
            http,
            notifications,
            application,
          }),
        {
          wrapper,
        }
      );

      expect(resultWithoutHideBulkActions.current.bulkActions.length).toBeGreaterThan(0);

      const { result: resultWithHideBulkActions } = renderHook(
        () =>
          useBulkActions({
            alertsCount: 0,
            query: {},
            casesConfig,
            refresh,
            ruleTypeIds: ['observability'],
            hideBulkActions: true,
            http,
            notifications,
            application,
          }),
        {
          wrapper,
        }
      );

      expect(resultWithHideBulkActions.current.bulkActions.length).toBe(0);
    });
  });
});
