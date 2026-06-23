/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { AlertsTable as ResponseOpsAlertsTable } from '@kbn/response-ops-alerts-table';
import type { TimelineItem } from '@kbn/response-ops-alerts-table/types';
import { TableId } from '@kbn/securitysolution-data-table';
import { TestProviders } from '../../../common/mock';
import { BULK_ALERTS_ATTACHMENT_PROMPT } from '../../../agent_builder/components/prompts';
import { alertsToAttachmentGroup } from '../../../agent_builder/helpers';
import { useReportAddToChat } from '../../../agent_builder/hooks/use_report_add_to_chat';
import { AlertsTable } from '.';

jest.mock('@kbn/response-ops-alerts-table', () => ({
  AlertsTable: jest.fn(() => null),
}));
jest.mock('../../../agent_builder/hooks/use_report_add_to_chat');
jest.mock('../../../agent_builder/hooks/use_agent_builder_availability', () => ({
  useAgentBuilderAvailability: jest.fn(() => ({
    isAgentBuilderEnabled: true,
    hasAgentBuilderPrivilege: true,
    isAgentChatExperienceEnabled: true,
    hasValidAgentBuilderLicense: false,
  })),
}));
jest.mock('../../../agent_builder/helpers', () => ({
  alertsToAttachmentGroup: jest.fn(),
}));
jest.mock('../../../common/lib/kibana', () => ({
  useKibana: jest.fn(() => ({
    services: {
      data: {},
      http: {},
      notifications: {},
      rendering: {},
      fieldFormats: {},
      application: {},
      licensing: {},
      uiSettings: { get: jest.fn() },
      settings: {},
      cases: {},
      agentBuilder: {},
    },
  })),
  KibanaServices: {
    getKibanaVersion: jest.fn(() => '8.0.0'),
  },
  KibanaContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../../../common/containers/use_global_time', () => ({
  useGlobalTime: jest.fn(() => ({
    from: '2020-01-01T00:00:00Z',
    to: '2020-01-02T00:00:00Z',
    setQuery: jest.fn(),
    deleteQuery: jest.fn(),
  })),
}));
jest.mock('../../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: jest.fn(() => false),
}));
jest.mock('../../../data_view_manager/hooks/use_data_view', () => ({
  useDataView: jest.fn(() => ({
    dataView: { getRuntimeMappings: jest.fn(() => ({})) },
    status: 'ready',
  })),
}));
jest.mock('../../../data_view_manager/hooks/use_browser_fields', () => ({
  useBrowserFields: jest.fn(() => ({})),
}));
jest.mock('../../../common/hooks/use_license', () => ({
  useLicense: jest.fn(() => ({
    isEnterprise: jest.fn(() => false),
    isPlatinumPlus: jest.fn(() => false),
    isGold: jest.fn(() => false),
    getType: jest.fn(() => 'basic'),
  })),
}));
jest.mock('../../../common/hooks/use_selector', () => ({
  useDeepEqualSelector: jest.fn(() => []),
  useShallowEqualSelector: jest.fn(() => ({})),
}));
jest.mock('../../hooks/trigger_actions_alert_table/use_bulk_actions', () => ({
  useBulkActionsByTableType: jest.fn(() => []),
}));
jest.mock('../../../common/components/user_privileges', () => ({
  useUserPrivileges: jest.fn(() => ({
    timelinePrivileges: { read: true },
    notesPrivileges: { read: true },
    kibanaSecuritySolutionsPrivileges: { crud: true, read: true },
  })),
}));
jest.mock('../../../notes/hooks/use_fetch_notes', () => ({
  useFetchNotes: jest.fn(() => ({ onLoad: jest.fn() })),
}));
jest.mock('../../configurations/security_solution_detections/fetch_page_context', () => ({
  useFetchUserProfilesFromAlerts: jest.fn(() => new Map()),
}));
jest.mock('../../hooks/trigger_actions_alert_table/use_cell_actions', () => ({
  useCellActionsOptions: jest.fn(() => undefined),
}));
jest.mock(
  '../../hooks/trigger_actions_alert_table/use_trigger_actions_browser_fields_options',
  () => ({
    useAlertsTableFieldsBrowserOptions: jest.fn(() => undefined),
  })
);
jest.mock('../../../common/hooks/use_invalid_filter_query', () => ({
  useInvalidFilterQuery: jest.fn(),
}));
jest.mock('../../../common/lib/kuery', () => ({
  combineQueries: jest.fn(() => null),
}));
jest.mock('../../configurations/security_solution_detections', () => ({
  CellValue: () => null,
  getColumns: jest.fn(() => []),
}));
jest.mock('../../../timelines/components/timeline/body/control_columns', () => ({
  getDefaultControlColumn: jest.fn(() => [{ width: 124 }]),
}));

const makeItem = (id: string): TimelineItem =>
  ({ _id: id, data: [], ecs: { _id: id, _index: '' } } as unknown as TimelineItem);

describe('Alerts Page Table — bulkAddToChatConfig', () => {
  let mockReportAddToChat: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReportAddToChat = jest.fn();
    (useReportAddToChat as jest.Mock).mockReturnValue(mockReportAddToChat);
  });

  const renderAndGetBulkConfig = (tableType?: TableId) => {
    render(
      <TestProviders>
        <AlertsTable tableType={tableType} isLoading={false} />
      </TestProviders>
    );
    return (ResponseOpsAlertsTable as jest.Mock).mock.calls[0][0].bulkAddToChatConfig;
  };

  it('passes BULK_ALERTS_ATTACHMENT_PROMPT as initialMessage', () => {
    const { initialMessage } = renderAndGetBulkConfig();
    expect(initialMessage).toBe(BULK_ALERTS_ATTACHMENT_PROMPT);
  });

  it('uses bulk_alerts_alerts_page pathway for the default alerts page table', () => {
    const { convertAlertToAttachment } = renderAndGetBulkConfig(TableId.alertsOnAlertsPage);
    const items = [makeItem('a'), makeItem('b')];
    convertAlertToAttachment(items);
    expect(mockReportAddToChat).toHaveBeenCalledWith({
      pathway: 'bulk_alerts_alerts_page',
      attachments: ['alert'],
      item_count: 2,
    });
  });

  it('uses bulk_alerts_rule_details pathway for the rule details table', () => {
    const { convertAlertToAttachment } = renderAndGetBulkConfig(TableId.alertsOnRuleDetailsPage);
    const items = [makeItem('a')];
    convertAlertToAttachment(items);
    expect(mockReportAddToChat).toHaveBeenCalledWith({
      pathway: 'bulk_alerts_rule_details',
      attachments: ['alert'],
      item_count: 1,
    });
  });

  it('delegates to alertsToAttachmentGroup and returns its result', () => {
    const mockGroup = { type: 'group', id: 'x', label: '1 Alert', items: [] };
    (alertsToAttachmentGroup as jest.Mock).mockReturnValueOnce(mockGroup);
    const { convertAlertToAttachment } = renderAndGetBulkConfig();
    const items = [makeItem('a')];
    const result = convertAlertToAttachment(items);
    expect(alertsToAttachmentGroup).toHaveBeenCalledWith(items);
    expect(result).toEqual([mockGroup]);
  });
});
