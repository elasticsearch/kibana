/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, renderHook, screen } from '@testing-library/react';
import type { RenderContentPanelProps, TimelineItem } from '@kbn/response-ops-alerts-table/types';
import { useWorkflowsCapabilities, useWorkflowsUIEnabledSetting } from '@kbn/workflows-ui';
import { createMockWorkflowsCapabilities } from '@kbn/workflows-ui/mocks';
import { useBulkRunAlertWorkflowPanel } from './use_bulk_run_alert_workflow_panel';
import { RUN_WORKFLOW_BULK_PANEL_ID } from '../../components/alerts_table/timeline_actions/use_run_alert_workflow_panel';
import { TestProviders } from '../../../common/mock';
import { useAlertsPrivileges } from '../../containers/detection_engine/alerts/use_alerts_privileges';
import * as i18n from '../../components/alerts_table/translations';

jest.mock('@kbn/workflows-ui', () => ({
  useWorkflowsCapabilities: jest.fn(),
  useWorkflowsUIEnabledSetting: jest.fn(),
}));
jest.mock('../../containers/detection_engine/alerts/use_alerts_privileges');

const useWorkflowsCapabilitiesMock = useWorkflowsCapabilities as jest.MockedFunction<
  typeof useWorkflowsCapabilities
>;
const useWorkflowsUIEnabledSettingMock = useWorkflowsUIEnabledSetting as jest.MockedFunction<
  typeof useWorkflowsUIEnabledSetting
>;

const createCapabilities = (
  overrides: {
    canExecuteWorkflow?: boolean;
  } = {}
) => {
  const { canExecuteWorkflow = true } = overrides;

  return {
    ...createMockWorkflowsCapabilities(),
    canExecuteWorkflow,
  };
};

jest.mock('../../components/alerts_table/timeline_actions/use_run_alert_workflow_panel', () => {
  const actual = jest.requireActual(
    '../../components/alerts_table/timeline_actions/use_run_alert_workflow_panel'
  );
  const MockAlertWorkflowsPanel = ({
    alertIds,
  }: {
    alertIds: Array<{ _id: string; _index: string }>;
  }) => (
    <div data-test-subj="bulk-alert-workflows-panel">
      {alertIds.map((a) => (
        <span key={a._id} data-test-subj={`alert-id-${a._id}`}>
          {`${a._id}:${a._index}`}
        </span>
      ))}
    </div>
  );
  return {
    ...actual,
    AlertWorkflowsPanel: MockAlertWorkflowsPanel,
  };
});

describe('useBulkRunAlertWorkflowPanel', () => {
  beforeEach(() => {
    (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasIndexWrite: true });
    useWorkflowsCapabilitiesMock.mockReturnValue(createCapabilities());
    useWorkflowsUIEnabledSettingMock.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hook return values', () => {
    it('returns run workflow items and panels when user has write, workflow UI enabled, and execute capability', () => {
      const { result } = renderHook(() => useBulkRunAlertWorkflowPanel(), {
        wrapper: TestProviders,
      });

      expect(result.current.runWorkflowItems).toHaveLength(1);
      expect(result.current.runWorkflowItems[0].key).toBe('bulk-run-alert-workflow');
      expect(result.current.runWorkflowItems[0]['data-test-subj']).toBe(
        'bulk-run-alert-workflow-action'
      );
      expect(result.current.runWorkflowItems[0].label).toBe(i18n.CONTEXT_MENU_RUN_WORKFLOW);
      expect(result.current.runWorkflowItems[0].panel).toBe(RUN_WORKFLOW_BULK_PANEL_ID);
      expect(result.current.runWorkflowItems[0].disableOnQuery).toBe(false);

      expect(result.current.runWorkflowPanels).toHaveLength(1);
      expect(result.current.runWorkflowPanels[0].id).toBe(RUN_WORKFLOW_BULK_PANEL_ID);
      expect(result.current.runWorkflowPanels[0].title).toBe(i18n.SELECT_WORKFLOW_PANEL_TITLE);
      expect(result.current.runWorkflowPanels[0]['data-test-subj']).toBe(
        'bulk-alert-workflow-context-menu-panel'
      );
      expect(result.current.runWorkflowPanels[0].renderContent).toBeDefined();
    });

    it('returns empty arrays when workflow UI is disabled', () => {
      useWorkflowsUIEnabledSettingMock.mockReturnValue(false);

      const { result } = renderHook(() => useBulkRunAlertWorkflowPanel(), {
        wrapper: TestProviders,
      });

      expect(result.current.runWorkflowItems).toEqual([]);
      expect(result.current.runWorkflowPanels).toEqual([]);
    });

    it('returns empty arrays when user does not have executeWorkflow capability', () => {
      useWorkflowsCapabilitiesMock.mockReturnValue(
        createCapabilities({ canExecuteWorkflow: false })
      );

      const { result } = renderHook(() => useBulkRunAlertWorkflowPanel(), {
        wrapper: TestProviders,
      });

      expect(result.current.runWorkflowItems).toEqual([]);
      expect(result.current.runWorkflowPanels).toEqual([]);
    });

    it('returns empty arrays when user does not have index write', () => {
      (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasIndexWrite: false });

      const { result } = renderHook(() => useBulkRunAlertWorkflowPanel(), {
        wrapper: TestProviders,
      });

      expect(result.current.runWorkflowItems).toEqual([]);
      expect(result.current.runWorkflowPanels).toEqual([]);
    });
  });

  describe('panel renderContent', () => {
    it('renders AlertWorkflowsPanel with alertIds derived from alertItems and passes closePopoverMenu as onClose', () => {
      const { result } = renderHook(() => useBulkRunAlertWorkflowPanel(), {
        wrapper: TestProviders,
      });

      const closePopoverMenu = jest.fn();
      const renderContent = result.current.runWorkflowPanels[0].renderContent;
      const alertItems: TimelineItem[] = [
        { _id: 'alert-1', _index: 'index-1', data: [], ecs: { _id: 'alert-1', _index: 'index-1' } },
        { _id: 'alert-2', _index: 'index-2', data: [], ecs: { _id: 'alert-2', _index: 'index-2' } },
      ];
      const props: RenderContentPanelProps = {
        alertItems,
        setIsBulkActionsLoading: jest.fn(),
        closePopoverMenu,
      };

      render(<TestProviders>{renderContent(props)}</TestProviders>);

      expect(screen.getByTestId('bulk-alert-workflows-panel')).toBeInTheDocument();
      expect(screen.getByTestId('alert-id-alert-1')).toHaveTextContent('alert-1:index-1');
      expect(screen.getByTestId('alert-id-alert-2')).toHaveTextContent('alert-2:index-2');
    });

    it('uses empty string for _index when alertItem._index is undefined', () => {
      const { result } = renderHook(() => useBulkRunAlertWorkflowPanel(), {
        wrapper: TestProviders,
      });

      const renderContent = result.current.runWorkflowPanels[0].renderContent;
      const alertItems: TimelineItem[] = [{ _id: 'no-index', data: [], ecs: { _id: 'no-index' } }];
      const props: RenderContentPanelProps = {
        alertItems,
        setIsBulkActionsLoading: jest.fn(),
        closePopoverMenu: jest.fn(),
      };

      render(<TestProviders>{renderContent(props)}</TestProviders>);

      expect(screen.getByTestId('alert-id-no-index')).toHaveTextContent('no-index:');
    });
  });
});
