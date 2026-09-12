/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, renderHook } from '@testing-library/react';
import type { WorkflowListItemDto } from '@kbn/workflows';
import {
  createCaseWorkflowComparator,
  createCaseWorkflowFilter,
  useRunCaseWorkflow,
} from './use_run_case_workflow';
import { CASE_WORKFLOW_ORIGIN_TYPE } from '../../../common/types/domain/user_action/workflow/constants';
import { CaseCreatedTriggerId, CaseUpdatedTriggerId } from '../../../common/workflows/triggers';
import { basicCase } from '../../containers/mock';

// ---- module mocks ----

jest.mock('../../common/lib/kibana');
jest.mock('../cases_context/use_cases_context');
jest.mock('./use_cases_workflow_executor', () => ({
  useCasesWorkflowExecutor: jest.fn().mockReturnValue(jest.fn()),
}));

const mockUseWorkflowsCapabilities = jest.fn();
const mockUseWorkflowsUIEnabledSetting = jest.fn();

jest.mock('@kbn/workflows-ui', () => ({
  useWorkflowsCapabilities: () => mockUseWorkflowsCapabilities(),
  useWorkflowsUIEnabledSetting: () => mockUseWorkflowsUIEnabledSetting(),
}));

// ---- helpers ----

const { useCasesContext } = jest.requireMock('../cases_context/use_cases_context');
const { useCasesConfig } = jest.requireMock('../../common/lib/kibana');

const setupMocks = ({
  permissionsUpdate = true,
  runWorkflowsEnabled = true,
  workflowsUIEnabled = true,
  canExecuteWorkflow = true,
}: {
  permissionsUpdate?: boolean;
  runWorkflowsEnabled?: boolean;
  workflowsUIEnabled?: boolean;
  canExecuteWorkflow?: boolean;
} = {}) => {
  useCasesContext.mockReturnValue({ permissions: { update: permissionsUpdate } });
  useCasesConfig.mockReturnValue({ runWorkflowsEnabled });
  mockUseWorkflowsCapabilities.mockReturnValue({ canExecuteWorkflow });
  mockUseWorkflowsUIEnabledSetting.mockReturnValue(workflowsUIEnabled);
};

// ---- tests ----

describe('useRunCaseWorkflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  const renderHookWithDefaults = () =>
    renderHook(() => useRunCaseWorkflow({ caseData: basicCase }));

  describe('canRunWorkflow gate', () => {
    it('returns canRunWorkflow=true when all conditions are met', () => {
      const { result } = renderHookWithDefaults();
      expect(result.current.canRunWorkflow).toBe(true);
    });

    it('is false when case update permission is missing', () => {
      setupMocks({ permissionsUpdate: false });
      const { result } = renderHookWithDefaults();
      expect(result.current.canRunWorkflow).toBe(false);
    });

    it('is false when the runWorkflows feature flag is off', () => {
      setupMocks({ runWorkflowsEnabled: false });
      const { result } = renderHookWithDefaults();
      expect(result.current.canRunWorkflow).toBe(false);
    });

    it('is false when the Workflows UI setting is disabled', () => {
      setupMocks({ workflowsUIEnabled: false });
      const { result } = renderHookWithDefaults();
      expect(result.current.canRunWorkflow).toBe(false);
    });

    it('is false when the user lacks workflow execute capability', () => {
      setupMocks({ canExecuteWorkflow: false });
      const { result } = renderHookWithDefaults();
      expect(result.current.canRunWorkflow).toBe(false);
    });
  });

  describe('modal state', () => {
    it('starts with the modal closed', () => {
      const { result } = renderHookWithDefaults();
      expect(result.current.isModalOpen).toBe(false);
    });

    it('opens the modal via openModal', () => {
      const { result } = renderHookWithDefaults();
      act(() => result.current.openModal());
      expect(result.current.isModalOpen).toBe(true);
    });

    it('closes the modal via closeModal', () => {
      const { result } = renderHookWithDefaults();
      act(() => result.current.openModal());
      act(() => result.current.closeModal());
      expect(result.current.isModalOpen).toBe(false);
    });
  });

  describe('inputs', () => {
    it('includes the case id in a caseIds array in the event payload', () => {
      const { result } = renderHookWithDefaults();
      expect(result.current.inputs).toEqual({
        event: { caseIds: [basicCase.id] },
      });
    });
  });

  it('suppresses the panel success toast because the executor owns toasting', () => {
    const { result } = renderHookWithDefaults();

    expect(result.current.showSuccessToast).toBe(false);
  });

  describe('origin', () => {
    it('uses the CASE_WORKFLOW_ORIGIN_TYPE for the case-level origin', () => {
      const { useCasesWorkflowExecutor } = jest.requireMock('./use_cases_workflow_executor');
      renderHookWithDefaults();
      expect(useCasesWorkflowExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          origin: { type: CASE_WORKFLOW_ORIGIN_TYPE, caseId: basicCase.id },
        })
      );
    });
  });
});

// ---- createCaseWorkflowFilter ----

describe('createCaseWorkflowFilter', () => {
  const makeWorkflow = (tags: string[] = []): WorkflowListItemDto =>
    ({
      id: 'wf-1',
      name: 'Test',
      enabled: true,
      valid: true,
      definition: { tags },
    } as unknown as WorkflowListItemDto);

  it('passes all workflows when the configured tag list is empty', () => {
    const filter = createCaseWorkflowFilter([]);
    expect(filter(makeWorkflow(['security', 'cases']))).toBe(true);
    expect(filter(makeWorkflow([]))).toBe(true);
  });

  it('allows workflows that carry at least one configured tag', () => {
    const filter = createCaseWorkflowFilter(['cases', 'triage']);
    expect(filter(makeWorkflow(['cases']))).toBe(true);
    expect(filter(makeWorkflow(['triage', 'other']))).toBe(true);
  });

  it('blocks workflows that carry none of the configured tags', () => {
    const filter = createCaseWorkflowFilter(['cases']);
    expect(filter(makeWorkflow(['security', 'other']))).toBe(false);
    expect(filter(makeWorkflow([]))).toBe(false);
  });
});

// ---- createCaseWorkflowComparator ----

describe('createCaseWorkflowComparator', () => {
  const makeWorkflow = (
    id: string,
    tags: string[] = [],
    triggerTypes: string[] = []
  ): WorkflowListItemDto =>
    ({
      id,
      name: id,
      enabled: true,
      valid: true,
      definition: {
        tags,
        triggers: triggerTypes.map((type) => ({ type })),
      },
    } as unknown as WorkflowListItemDto);

  it('sorts workflows with a configured tag before those without', () => {
    const compare = createCaseWorkflowComparator(['cases']);
    const tagged = makeWorkflow('tagged', ['cases']);
    const untagged = makeWorkflow('untagged', ['security']);
    expect(compare(tagged, untagged)).toBeLessThan(0);
    expect(compare(untagged, tagged)).toBeGreaterThan(0);
  });

  it('sorts case-trigger workflows before plain workflows when no tags are configured', () => {
    const compare = createCaseWorkflowComparator([]);
    const caseTrigger = makeWorkflow('case-wf', [], [CaseCreatedTriggerId]);
    const plain = makeWorkflow('plain-wf', [], ['manual']);
    expect(compare(caseTrigger, plain)).toBeLessThan(0);
    expect(compare(plain, caseTrigger)).toBeGreaterThan(0);
  });

  it('tagged workflows rank above case-trigger workflows', () => {
    const compare = createCaseWorkflowComparator(['cases']);
    const tagged = makeWorkflow('tagged', ['cases'], ['manual']);
    const caseTrigger = makeWorkflow('case-wf', [], [CaseUpdatedTriggerId]);
    expect(compare(tagged, caseTrigger)).toBeLessThan(0);
  });

  it('returns 0 for two workflows with equal rank', () => {
    const compare = createCaseWorkflowComparator([]);
    const a = makeWorkflow('a', [], ['manual']);
    const b = makeWorkflow('b', [], ['manual']);
    expect(compare(a, b)).toBe(0);
  });
});
