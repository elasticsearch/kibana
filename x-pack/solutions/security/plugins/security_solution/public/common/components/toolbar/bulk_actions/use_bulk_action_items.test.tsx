/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import type { MouseEvent } from 'react';
import type { BulkActionsProps } from './use_bulk_action_items';
import { useBulkActionItems } from './use_bulk_action_items';
import { useAppToasts } from '../../../hooks/use_app_toasts';
import { useAlertsPrivileges } from '../../../../detections/containers/detection_engine/alerts/use_alerts_privileges';

jest.mock('../../../hooks/use_app_toasts');
jest.mock('../../../lib/kibana');
jest.mock('../../../../detections/containers/detection_engine/alerts/use_alerts_privileges');
jest.mock('../../../hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: jest.fn(),
}));

const mockUseRunDocumentWorkflowPanel = jest.fn().mockReturnValue({
  runWorkflowMenuItem: [],
  runDocumentWorkflowPanel: [],
});
jest.mock(
  '../../../../detections/components/alerts_table/timeline_actions/use_run_document_workflow_panel',
  () => ({
    useRunDocumentWorkflowPanel: (...args: unknown[]) => mockUseRunDocumentWorkflowPanel(...args),
  })
);

const mockUseAlertsPrivileges = useAlertsPrivileges as jest.Mock;

(useAppToasts as jest.Mock).mockReturnValue({
  addSuccess: jest.fn(),
  addError: jest.fn(),
});

function renderUseBulkActionItems(props?: Partial<BulkActionsProps>) {
  return renderHook(() =>
    useBulkActionItems({
      eventIds: ['mockEventId'],
      setEventsDeleted: jest.fn(),
      setEventsLoading: jest.fn(),
      ...props,
    })
  );
}

describe('useBulkActionItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAlertsPrivileges.mockReturnValue({ hasAlertsUpdate: true });
  });

  it('should return "mark as open" option by default', () => {
    const { result } = renderUseBulkActionItems();
    expect(
      result.current.items.find((item) => item['data-test-subj'] === 'open-alert-status')
    ).not.toBeUndefined();
  });

  it('should return "mark as acknowledged" option by default', () => {
    const { result } = renderUseBulkActionItems();
    expect(
      result.current.items.find((item) => item['data-test-subj'] === 'acknowledged-alert-status')
    ).not.toBeUndefined();
  });

  it('should return "mark as closed" option by default', () => {
    const { result } = renderUseBulkActionItems();
    expect(
      result.current.items.find(
        (item) => item['data-test-subj'] === 'alert-close-context-menu-item'
      )
    ).not.toBeUndefined();
  });

  it('should not return alert status actions when user does not have alerts privileges', () => {
    mockUseAlertsPrivileges.mockReturnValue({ hasAlertsUpdate: false });

    const { result } = renderUseBulkActionItems();

    expect(
      result.current.items.find((item) => item['data-test-subj'] === 'open-alert-status')
    ).toBeUndefined();
    expect(
      result.current.items.find((item) => item['data-test-subj'] === 'acknowledged-alert-status')
    ).toBeUndefined();
    expect(
      result.current.items.find(
        (item) => item['data-test-subj'] === 'alert-close-context-menu-item'
      )
    ).toBeUndefined();
  });

  it('exposes custom actions for composed bulk action menus', () => {
    const onClick = jest.fn();
    // Use a neutral icon value — 'briefcase' is NOT set here because icon decoration for
    // the add-to-case action is the responsibility of EventsTableBulkActionMenu, not this hook.
    const { result } = renderUseBulkActionItems({
      customBulkActions: [
        {
          key: 'some-custom-action',
          label: 'Custom action',
          icon: 'gear',
          onClick,
        },
      ],
    });

    const customAction = result.current.items.find(({ key }) => key === 'some-custom-action');
    customAction?.onClick?.({} as MouseEvent<HTMLHRElement>);

    expect(onClick).toHaveBeenCalledWith(['mockEventId']);
    expect(customAction?.icon).toBe('gear');
  });

  describe('workflow actions', () => {
    it('should include workflow menu items when useRunDocumentWorkflowPanel returns items', () => {
      const mockMenuItem = {
        key: 'run-document-workflow-action',
        'data-test-subj': 'run-document-workflow-action',
        name: 'Run workflow',
        panel: 'RUN_DOCUMENT_WORKFLOW_PANEL_ID',
      };
      mockUseRunDocumentWorkflowPanel.mockReturnValue({
        runWorkflowMenuItem: [mockMenuItem],
        runDocumentWorkflowPanel: [{ id: 'RUN_DOCUMENT_WORKFLOW_PANEL_ID' }],
      });

      const { result } = renderUseBulkActionItems({
        data: [{ _id: 'mockEventId', _index: 'test-index', data: [], ecs: { _id: 'mockEventId' } }],
      });

      expect(
        result.current.items.find(
          (item) => item['data-test-subj'] === 'run-document-workflow-action'
        )
      ).not.toBeUndefined();
      expect(result.current.panels.length).toBeGreaterThan(0);
    });

    it('should not include workflow menu items when useRunDocumentWorkflowPanel returns empty', () => {
      mockUseRunDocumentWorkflowPanel.mockReturnValue({
        runWorkflowMenuItem: [],
        runDocumentWorkflowPanel: [],
      });

      const { result } = renderUseBulkActionItems();

      expect(
        result.current.items.find(
          (item) => item['data-test-subj'] === 'run-document-workflow-action'
        )
      ).toBeUndefined();
    });

    it('should not include workflow menu items when showRunWorkflowActions is false', () => {
      const mockMenuItem = {
        key: 'run-document-workflow-action',
        'data-test-subj': 'run-document-workflow-action',
        name: 'Run workflow',
        panel: 'RUN_DOCUMENT_WORKFLOW_PANEL_ID',
      };
      mockUseRunDocumentWorkflowPanel.mockReturnValue({
        runWorkflowMenuItem: [mockMenuItem],
        runDocumentWorkflowPanel: [{ id: 'RUN_DOCUMENT_WORKFLOW_PANEL_ID' }],
      });

      const { result } = renderUseBulkActionItems({
        showRunWorkflowActions: false,
        data: [{ _id: 'mockEventId', _index: 'test-index', data: [], ecs: { _id: 'mockEventId' } }],
      });

      expect(
        result.current.items.find(
          (item) => item['data-test-subj'] === 'run-document-workflow-action'
        )
      ).toBeUndefined();
      expect(
        result.current.panels.find((panel) => panel.id === 'RUN_DOCUMENT_WORKFLOW_PANEL_ID')
      ).toBeUndefined();
    });
  });
});
