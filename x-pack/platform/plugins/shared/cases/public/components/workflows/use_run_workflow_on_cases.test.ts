/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, act } from '@testing-library/react';
import type { HttpStart } from '@kbn/core/public';
import { notificationServiceMock } from '@kbn/core/public/mocks';
import { basicCase } from '../../containers/mock';
import type { CaseUI } from '../../containers/types';
import { useRunWorkflowOnCases } from './use_run_workflow_on_cases';
import * as api from './api';

jest.mock('../../common/lib/kibana');
// toMountPoint is a DOM utility — return the element as-is so tests can assert
// on the text field without a full rendering environment.
jest.mock('@kbn/react-kibana-mount', () => ({
  toMountPoint: (node: unknown) => node,
}));

const mockRunCaseWorkflow = jest.spyOn(api, 'runCaseWorkflow');

describe('useRunWorkflowOnCases', () => {
  const mockHttp = {} as HttpStart;
  const mockToasts = notificationServiceMock.createStartContract().toasts;

  const { useHttp, useToasts, useKibana } = jest.requireMock('../../common/lib/kibana');

  beforeEach(() => {
    jest.clearAllMocks();
    useHttp.mockReturnValue(mockHttp);
    useToasts.mockReturnValue(mockToasts);
    useKibana.mockReturnValue({ services: { rendering: {} } });
  });

  const caseA: CaseUI = { ...basicCase, id: 'case-a', owner: 'securitySolution', title: 'Case A' };
  const caseB: CaseUI = { ...basicCase, id: 'case-b', owner: 'securitySolution', title: 'Case B' };

  it('sends caseIds in the body (single case)', async () => {
    mockRunCaseWorkflow.mockResolvedValueOnce({
      workflowExecutionId: 'exec-1',
      activityStatus: 'succeeded',
    });

    const { result } = renderHook(() => useRunWorkflowOnCases({ cases: [caseA] }));
    await act(async () => {
      await result.current({ workflowId: 'wf-1', inputs: {} });
    });

    expect(mockRunCaseWorkflow).toHaveBeenCalledWith({
      http: mockHttp,
      workflowId: 'wf-1',
      body: {
        caseIds: ['case-a'],
        inputs: {},
      },
    });
  });

  it('sends all selected caseIds in one execution (multi-case)', async () => {
    mockRunCaseWorkflow.mockResolvedValueOnce({
      workflowExecutionId: 'exec-a',
      activityStatus: 'succeeded',
    });

    const { result } = renderHook(() => useRunWorkflowOnCases({ cases: [caseA, caseB] }));
    await act(async () => {
      await result.current({ workflowId: 'wf-1', inputs: {} });
    });

    expect(mockRunCaseWorkflow).toHaveBeenCalledTimes(1);
    expect(mockRunCaseWorkflow).toHaveBeenCalledWith({
      http: mockHttp,
      workflowId: 'wf-1',
      body: {
        caseIds: ['case-a', 'case-b'],
        inputs: {},
      },
    });
  });

  it('does not inject event.caseIds on the client — the server owns that field', async () => {
    mockRunCaseWorkflow.mockResolvedValueOnce({
      workflowExecutionId: 'exec-1',
      activityStatus: 'succeeded',
    });

    const { result } = renderHook(() => useRunWorkflowOnCases({ cases: [caseA, caseB] }));
    await act(async () => {
      await result.current({ workflowId: 'wf-1', inputs: {} });
    });

    const callArgs = mockRunCaseWorkflow.mock.calls[0][0];
    expect((callArgs.body.inputs as Record<string, unknown>).event).toBeUndefined();
  });

  it('shows a success toast with a right-floated "View execution" button', async () => {
    const mockGetAppUrl = jest.fn().mockReturnValue('/app/workflows/wf-1?executionId=exec-1');
    const { useAppUrl } = jest.requireMock('../../common/lib/kibana');
    useAppUrl.mockReturnValue({ getAppUrl: mockGetAppUrl });

    mockRunCaseWorkflow.mockResolvedValueOnce({
      workflowExecutionId: 'exec-1',
      activityStatus: 'succeeded',
    });

    const { result } = renderHook(() => useRunWorkflowOnCases({ cases: [caseA] }));
    await act(async () => {
      await result.current({ workflowId: 'wf-1', inputs: {} });
    });

    expect(mockToasts.addSuccess).toHaveBeenCalledTimes(1);
    expect(mockToasts.addSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.anything() })
    );
    expect(mockToasts.addWarning).not.toHaveBeenCalled();
  });

  it('shows a warning toast (with "View execution" button) when activityStatus is "failed"', async () => {
    const mockGetAppUrl = jest.fn().mockReturnValue('/app/workflows/wf-1?executionId=exec-1');
    const { useAppUrl } = jest.requireMock('../../common/lib/kibana');
    useAppUrl.mockReturnValue({ getAppUrl: mockGetAppUrl });

    mockRunCaseWorkflow.mockResolvedValueOnce({
      workflowExecutionId: 'exec-1',
      activityStatus: 'failed',
    });

    const { result } = renderHook(() => useRunWorkflowOnCases({ cases: [caseA] }));
    await act(async () => {
      await result.current({ workflowId: 'wf-1', inputs: {} });
    });

    expect(mockToasts.addWarning).toHaveBeenCalledTimes(1);
    expect(mockToasts.addWarning).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.anything() })
    );
    expect(mockToasts.addSuccess).not.toHaveBeenCalled();
  });

  it('returns the execution id', async () => {
    mockRunCaseWorkflow.mockResolvedValueOnce({
      workflowExecutionId: 'exec-1',
      activityStatus: 'succeeded',
    });

    const { result } = renderHook(() => useRunWorkflowOnCases({ cases: [caseA] }));
    let response: { workflowExecutionId: string } | undefined;
    await act(async () => {
      response = await result.current({ workflowId: 'wf-1', inputs: {} });
    });

    expect(response?.workflowExecutionId).toBe('exec-1');
  });

  it('rethrows API errors so the panel can show its error toast', async () => {
    mockRunCaseWorkflow.mockRejectedValueOnce(new Error('server error'));

    const { result } = renderHook(() => useRunWorkflowOnCases({ cases: [caseA] }));
    await expect(
      act(async () => {
        await result.current({ workflowId: 'wf-1', inputs: {} });
      })
    ).rejects.toThrow('server error');

    expect(mockToasts.addSuccess).not.toHaveBeenCalled();
    expect(mockToasts.addWarning).not.toHaveBeenCalled();
  });

  it('passes caller-supplied manual inputs unmodified to the body', async () => {
    mockRunCaseWorkflow.mockResolvedValueOnce({
      workflowExecutionId: 'exec-a',
      activityStatus: 'succeeded',
    });

    const { result } = renderHook(() => useRunWorkflowOnCases({ cases: [caseA, caseB] }));
    await act(async () => {
      await result.current({ workflowId: 'wf-1', inputs: { manual_field: 'value' } });
    });

    expect(mockRunCaseWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          caseIds: ['case-a', 'case-b'],
          inputs: { manual_field: 'value' },
        }),
      })
    );
  });
});
