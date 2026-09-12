/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, act } from '@testing-library/react';
import { MAX_CASES_PER_WORKFLOW_RUN } from '../../../../common/constants';
import { basicCase } from '../../../containers/mock';
import type { CaseUI } from '../../../containers/types';
import { useRunWorkflowAction } from './use_run_workflow_action';

// Hoist mock state so factories can reference them
const mockCanRunWorkflow = jest.fn<boolean, []>();
const mockUseWorkflowsCapabilities = jest.fn();
const mockUseWorkflowsUIEnabledSetting = jest.fn();

// useRunCasesWorkflow delegates to useCanRunCaseWorkflow which calls
// useWorkflowsCapabilities, useWorkflowsUIEnabledSetting, useCasesConfig,
// and useCasesContext — all mocked below.
jest.mock('../../../common/lib/kibana');
jest.mock('../../cases_context/use_cases_context');
jest.mock('@kbn/workflows-ui', () => ({
  useWorkflowsCapabilities: () => mockUseWorkflowsCapabilities(),
  useWorkflowsUIEnabledSetting: () => mockUseWorkflowsUIEnabledSetting(),
}));
// Mock the executor to keep tests deterministic
jest.mock('../../workflows/use_run_workflow_on_cases', () => ({
  useRunWorkflowOnCases: jest.fn().mockReturnValue(jest.fn()),
}));

const { useCasesContext } = jest.requireMock('../../cases_context/use_cases_context');
const { useCasesConfig } = jest.requireMock('../../../common/lib/kibana');

const setupMocks = ({
  permissionsUpdate = true,
  runWorkflowsEnabled = true,
  workflowsUIEnabled = true,
  canExecuteWorkflow = true,
} = {}) => {
  useCasesContext.mockReturnValue({ permissions: { update: permissionsUpdate } });
  useCasesConfig.mockReturnValue({ runWorkflowsEnabled });
  mockUseWorkflowsCapabilities.mockReturnValue({ canExecuteWorkflow });
  mockUseWorkflowsUIEnabledSetting.mockReturnValue(workflowsUIEnabled);
  mockCanRunWorkflow.mockReturnValue(
    permissionsUpdate && runWorkflowsEnabled && workflowsUIEnabled && canExecuteWorkflow
  );
};

const renderAction = () => {
  const onAction = jest.fn();
  const onActionSuccess = jest.fn();
  const { result } = renderHook(() => useRunWorkflowAction({ onAction, onActionSuccess }));
  return { result, onAction, onActionSuccess };
};

const makeCase = (id: string): CaseUI => ({ ...basicCase, id });

describe('useRunWorkflowAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  describe('canRunWorkflow gate', () => {
    it('is true when all four conditions are met', () => {
      const { result } = renderAction();
      expect(result.current.canRunWorkflow).toBe(true);
    });

    it('is false when update permission is missing', () => {
      setupMocks({ permissionsUpdate: false });
      const { result } = renderAction();
      expect(result.current.canRunWorkflow).toBe(false);
    });

    it('is false when runWorkflowsEnabled is false', () => {
      setupMocks({ runWorkflowsEnabled: false });
      const { result } = renderAction();
      expect(result.current.canRunWorkflow).toBe(false);
    });

    it('is false when workflowsUIEnabled is false', () => {
      setupMocks({ workflowsUIEnabled: false });
      const { result } = renderAction();
      expect(result.current.canRunWorkflow).toBe(false);
    });

    it('is false when canExecuteWorkflow is false', () => {
      setupMocks({ canExecuteWorkflow: false });
      const { result } = renderAction();
      expect(result.current.canRunWorkflow).toBe(false);
    });
  });

  describe('getAction', () => {
    it('returns an item with the correct key and data-test-subj', () => {
      const { result } = renderAction();
      const item = result.current.getAction([basicCase]);
      expect(item.key).toBe('cases-bulk-action-run-workflow');
      expect(item['data-test-subj']).toBe('cases-bulk-action-run-workflow');
    });

    it('is not disabled when selection is within the cap', () => {
      const { result } = renderAction();
      const cases = Array.from({ length: MAX_CASES_PER_WORKFLOW_RUN }, (_, i) =>
        makeCase(`case-${i}`)
      );
      const item = result.current.getAction(cases);
      expect(item.disabled).toBe(false);
    });

    it('is disabled when selection exceeds the cap', () => {
      const { result } = renderAction();
      const cases = Array.from({ length: MAX_CASES_PER_WORKFLOW_RUN + 1 }, (_, i) =>
        makeCase(`case-${i}`)
      );
      const item = result.current.getAction(cases);
      expect(item.disabled).toBe(true);
      expect(item.toolTipContent).toBeTruthy();
    });

    it('has no tooltip when selection is within the cap', () => {
      const { result } = renderAction();
      const item = result.current.getAction([basicCase]);
      expect(item.toolTipContent).toBeUndefined();
    });

    it('calls onAction (closes popover) when clicked', () => {
      const { result, onAction } = renderAction();
      const item = result.current.getAction([basicCase]);
      act(() => {
        (item.onClick as () => void)();
      });
      expect(onAction).toHaveBeenCalledTimes(1);
    });
  });

  describe('modal state', () => {
    it('starts with the modal closed', () => {
      const { result } = renderAction();
      expect(result.current.isModalVisible).toBe(false);
    });

    it('opens the modal when the item is clicked', () => {
      const { result } = renderAction();
      act(() => {
        (result.current.getAction([basicCase]).onClick as () => void)();
      });
      expect(result.current.isModalVisible).toBe(true);
    });

    it('closes the modal without calling onActionSuccess when no workflow ran', () => {
      const { result, onActionSuccess } = renderAction();
      act(() => {
        (result.current.getAction([basicCase]).onClick as () => void)();
      });
      act(() => {
        result.current.modalProps.onClose();
      });
      expect(result.current.isModalVisible).toBe(false);
      expect(onActionSuccess).not.toHaveBeenCalled();
    });

    it('calls onActionSuccess after workflow execution settles', () => {
      const { result, onActionSuccess } = renderAction();

      act(() => {
        result.current.modalProps.onExecutionSettled?.();
      });

      expect(onActionSuccess).toHaveBeenCalledTimes(1);
    });
  });

  describe('modalProps', () => {
    it('contains lifecycle callbacks, inputs, runWorkflow, filterWorkflow, sortWorkflow', () => {
      const { result } = renderAction();
      const { modalProps } = result.current;
      expect(typeof modalProps.onClose).toBe('function');
      expect(typeof modalProps.onExecutionSettled).toBe('function');
      expect(modalProps.inputs).toBeDefined();
      expect(typeof modalProps.runWorkflow).toBe('function');
      expect(typeof modalProps.filterWorkflow).toBe('function');
      expect(typeof modalProps.sortWorkflow).toBe('function');
    });

    it('sets showSuccessToast=false so the executor always owns the success toast', () => {
      const { result } = renderAction();
      act(() => {
        (result.current.getAction([basicCase]).onClick as () => void)();
      });
      expect(result.current.modalProps.showSuccessToast).toBe(false);
    });
  });
});
