/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactElement } from 'react';
import { renderHook } from '@testing-library/react';
import type { WorkflowsManagementCapabilities } from '@kbn/workflows-ui';
import { useWorkflowsCapabilities, useWorkflowsUIEnabledSetting } from '@kbn/workflows-ui';
import { createMockWorkflowsCapabilities } from '@kbn/workflows-ui/mocks';

import { RUN_WORKFLOW_BULK_PANEL_ID } from '../../../../components/alerts_table/timeline_actions/use_run_alert_workflow_panel';
import { useAttacksPrivileges } from '../use_attacks_privileges';
import { useKibana } from '../../../../../common/lib/kibana';
import { useBulkAttackRunWorkflowItems } from './use_bulk_attack_run_workflow_items';

const createCapabilities = (
  overrides: Partial<WorkflowsManagementCapabilities> = {}
): WorkflowsManagementCapabilities => ({
  ...createMockWorkflowsCapabilities(),
  ...overrides,
});

jest.mock('@kbn/workflows-ui');
jest.mock('../use_attacks_privileges');
jest.mock('../../../../../common/lib/kibana');
jest.mock(
  '../../../../components/alerts_table/timeline_actions/use_run_alert_workflow_panel',
  () => ({
    ...jest.requireActual(
      '../../../../components/alerts_table/timeline_actions/use_run_alert_workflow_panel'
    ),
    AlertWorkflowsPanel: () => null,
  })
);

const mockUseWorkflowsCapabilities = useWorkflowsCapabilities as jest.MockedFunction<
  typeof useWorkflowsCapabilities
>;
const mockUseWorkflowsUIEnabledSetting = useWorkflowsUIEnabledSetting as jest.MockedFunction<
  typeof useWorkflowsUIEnabledSetting
>;
const mockUseAttacksPrivileges = useAttacksPrivileges as jest.MockedFunction<
  typeof useAttacksPrivileges
>;

const reportEventMock = jest.fn();
(useKibana as jest.Mock).mockReturnValue({
  services: {
    telemetry: {
      reportEvent: reportEventMock,
    },
  },
});

const defaultAlertItems = [
  {
    _id: 'attack-1',
    data: [],
    ecs: { _id: 'attack-1', _index: '.alerts-security.attack.discovery.alerts-default-000001' },
  },
];

describe('useBulkAttackRunWorkflowItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAttacksPrivileges.mockReturnValue({
      hasIndexWrite: true,
      hasAttackIndexWrite: true,
      loading: false,
    });
    mockUseWorkflowsCapabilities.mockReturnValue(createCapabilities());
    mockUseWorkflowsUIEnabledSetting.mockReturnValue(true);
  });

  describe('when all permissions are granted', () => {
    it('should return one item with the correct key and panel', () => {
      const { result } = renderHook(() => useBulkAttackRunWorkflowItems());

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0]).toMatchObject({
        key: 'run-attack-workflow-action',
        panel: RUN_WORKFLOW_BULK_PANEL_ID,
        'data-test-subj': 'run-attack-workflow-action',
      });
    });

    it('should return one panel with the correct id and data-test-subj', () => {
      const { result } = renderHook(() => useBulkAttackRunWorkflowItems());

      expect(result.current.panels).toHaveLength(1);
      expect(result.current.panels[0]).toMatchObject({
        id: RUN_WORKFLOW_BULK_PANEL_ID,
        'data-test-subj': 'attack-workflow-context-menu-panel',
      });
    });

    it('should pass alert ids with the provided concrete index to panel content', () => {
      const { result } = renderHook(() => useBulkAttackRunWorkflowItems());

      const closePopoverMenu = jest.fn();
      const panelContent = result.current.panels[0].renderContent({
        alertItems: defaultAlertItems,
        closePopoverMenu,
        setIsBulkActionsLoading: jest.fn(),
      }) as ReactElement;
      expect(panelContent.props.alertIds).toEqual([
        { _id: 'attack-1', _index: '.alerts-security.attack.discovery.alerts-default-000001' },
      ]);
    });

    it('should use ecs._index from alertItems when provided', () => {
      const concreteIndex = '.alerts-security.attack.discovery.alerts-default-000001';
      const alertItemsWithIndex = [
        { _id: 'attack-1', data: [], ecs: { _id: 'attack-1', _index: concreteIndex } },
      ];

      const { result } = renderHook(() => useBulkAttackRunWorkflowItems());

      const closePopoverMenu = jest.fn();
      const panelContent = result.current.panels[0].renderContent({
        alertItems: alertItemsWithIndex,
        closePopoverMenu,
        setIsBulkActionsLoading: jest.fn(),
      }) as ReactElement;
      expect(panelContent.props.alertIds).toEqual([{ _id: 'attack-1', _index: concreteIndex }]);
    });

    it('should omit alerts with missing concrete index', () => {
      const { result } = renderHook(() => useBulkAttackRunWorkflowItems());

      const alertItemsWithoutIndex = [{ _id: 'attack-1', data: [], ecs: { _id: 'attack-1' } }];
      const closePopoverMenu = jest.fn();
      const panelContent = result.current.panels[0].renderContent({
        alertItems: alertItemsWithoutIndex,
        closePopoverMenu,
        setIsBulkActionsLoading: jest.fn(),
      }) as ReactElement;
      expect(panelContent.props.alertIds).toEqual([]);
    });

    it('should pass closePopoverMenu to the panel onClose', () => {
      const { result } = renderHook(() => useBulkAttackRunWorkflowItems());

      const closePopoverMenu = jest.fn();
      const panelContent = result.current.panels[0].renderContent({
        alertItems: defaultAlertItems,
        closePopoverMenu,
        setIsBulkActionsLoading: jest.fn(),
      }) as ReactElement;
      panelContent.props.onClose();
      expect(closePopoverMenu).toHaveBeenCalledTimes(1);
    });
  });

  describe('when canRunWorkflow is false', () => {
    it('should return empty items and panels when still loading', () => {
      mockUseAttacksPrivileges.mockReturnValue({
        hasIndexWrite: true,
        hasAttackIndexWrite: true,
        loading: true,
      });

      const { result } = renderHook(() => useBulkAttackRunWorkflowItems());

      expect(result.current.items).toHaveLength(0);
      expect(result.current.panels).toHaveLength(0);
    });

    it('should return empty items and panels when hasIndexWrite is false', () => {
      mockUseAttacksPrivileges.mockReturnValue({
        hasIndexWrite: false,
        hasAttackIndexWrite: true,
        loading: false,
      });

      const { result } = renderHook(() => useBulkAttackRunWorkflowItems());

      expect(result.current.items).toHaveLength(0);
      expect(result.current.panels).toHaveLength(0);
    });

    it('should return empty items and panels when hasAttackIndexWrite is false', () => {
      mockUseAttacksPrivileges.mockReturnValue({
        hasIndexWrite: true,
        hasAttackIndexWrite: false,
        loading: false,
      });

      const { result } = renderHook(() => useBulkAttackRunWorkflowItems());

      expect(result.current.items).toHaveLength(0);
      expect(result.current.panels).toHaveLength(0);
    });

    it('should return empty items and panels when workflowUIEnabled is false', () => {
      mockUseWorkflowsUIEnabledSetting.mockReturnValue(false);

      const { result } = renderHook(() => useBulkAttackRunWorkflowItems());

      expect(result.current.items).toHaveLength(0);
      expect(result.current.panels).toHaveLength(0);
    });

    it('should return empty items and panels when canExecuteWorkflow is false', () => {
      mockUseWorkflowsCapabilities.mockReturnValue(
        createCapabilities({ canExecuteWorkflow: false })
      );

      const { result } = renderHook(() => useBulkAttackRunWorkflowItems());

      expect(result.current.items).toHaveLength(0);
      expect(result.current.panels).toHaveLength(0);
    });
  });
});
