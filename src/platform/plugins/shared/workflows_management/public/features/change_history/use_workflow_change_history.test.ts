/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { renderHook } from '@testing-library/react';
import { useSelector } from 'react-redux';
import type { WorkflowDetailDto } from '@kbn/workflows';
import { useWorkflowsCapabilities } from '@kbn/workflows-ui';

import { useWorkflowChangeHistoryRestoreEligibility } from './use_workflow_change_history';

jest.mock('react-redux', () => ({
  useSelector: jest.fn(),
}));

jest.mock('@kbn/workflows-ui', () => ({
  useWorkflowsCapabilities: jest.fn(),
}));

const mockUseSelector = useSelector as jest.MockedFunction<typeof useSelector>;
const mockUseWorkflowsCapabilities = useWorkflowsCapabilities as jest.MockedFunction<
  typeof useWorkflowsCapabilities
>;

const sampleWorkflow: WorkflowDetailDto = {
  id: 'workflow-1',
  name: 'Sample workflow',
  yaml: 'name: sample\n',
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  lastUpdatedAt: '2026-01-01T00:00:00.000Z',
  lastUpdatedBy: 'user-1',
  definition: null,
  valid: true,
};

describe('useWorkflowChangeHistoryRestoreEligibility', () => {
  beforeEach(() => {
    mockUseWorkflowsCapabilities.mockReturnValue({
      canUpdateWorkflow: true,
    } as ReturnType<typeof useWorkflowsCapabilities>);
  });

  it('returns false while workflow detail is still loading', () => {
    mockUseSelector.mockReturnValue(undefined);

    const { result } = renderHook(() => useWorkflowChangeHistoryRestoreEligibility());

    expect(result.current).toBe(false);
  });

  it('returns false for managed workflows', () => {
    mockUseSelector.mockReturnValue({ ...sampleWorkflow, managed: true });

    const { result } = renderHook(() => useWorkflowChangeHistoryRestoreEligibility());

    expect(result.current).toBe(false);
  });

  it('returns true for loaded non-managed workflows when the user can update', () => {
    mockUseSelector.mockReturnValue(sampleWorkflow);

    const { result } = renderHook(() => useWorkflowChangeHistoryRestoreEligibility());

    expect(result.current).toBe(true);
  });

  it('returns false when the user cannot update workflows', () => {
    mockUseWorkflowsCapabilities.mockReturnValue({
      canUpdateWorkflow: false,
    } as ReturnType<typeof useWorkflowsCapabilities>);
    mockUseSelector.mockReturnValue(sampleWorkflow);

    const { result } = renderHook(() => useWorkflowChangeHistoryRestoreEligibility());

    expect(result.current).toBe(false);
  });
});
