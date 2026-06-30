/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { useWorkflowUrlState } from './use_workflow_url_state';

const createWrapper = (initialEntries: string[] = ['/']) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(MemoryRouter, { initialEntries }, children);
  return Wrapper;
};

describe('useWorkflowUrlState', () => {
  it('should return default state when no query params are present', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(),
    });

    expect(result.current.activeTab).toBe('workflow');
    expect(result.current.editorView).toBe('yaml');
    expect(result.current.graphDirection).toBe('TB');
    expect(result.current.selectedExecutionId).toBeUndefined();
    expect(result.current.selectedStepExecutionId).toBeUndefined();
    expect(result.current.selectedStepId).toBeUndefined();
    expect(result.current.shouldAutoResume).toBe(false);
  });

  it('should parse view=graph and direction=LR from URL', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(['/?view=graph&direction=LR']),
    });

    expect(result.current.editorView).toBe('graph');
    expect(result.current.graphDirection).toBe('LR');
  });

  it('should update URL when setEditorView is called', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(['/?stepId=my-step']),
    });

    act(() => {
      result.current.setEditorView('graph');
    });

    expect(result.current.editorView).toBe('graph');
    expect(result.current.selectedStepId).toBeUndefined();
  });

  it('should update URL when setGraphDirection is called', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(['/?view=graph']),
    });

    act(() => {
      result.current.setGraphDirection('LR');
    });

    expect(result.current.graphDirection).toBe('LR');
  });

  it('should omit direction from URL when setGraphDirection is TB', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(['/?direction=LR']),
    });

    act(() => {
      result.current.setGraphDirection('TB');
    });

    expect(result.current.graphDirection).toBe('TB');
  });

  it('should parse tab from URL', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(['/?tab=executions']),
    });

    expect(result.current.activeTab).toBe('executions');
  });

  it('should parse executionId from URL', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(['/?executionId=exec-1']),
    });

    expect(result.current.selectedExecutionId).toBe('exec-1');
  });

  it('should parse stepExecutionId and stepId from URL', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(['/?stepExecutionId=step-exec-1&stepId=my-step']),
    });

    expect(result.current.selectedStepExecutionId).toBe('step-exec-1');
    expect(result.current.selectedStepId).toBe('my-step');
  });

  it('should parse resume=true from URL', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(['/?resume=true']),
    });

    expect(result.current.shouldAutoResume).toBe(true);
  });

  it('should treat resume as false when not "true"', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(['/?resume=false']),
    });

    expect(result.current.shouldAutoResume).toBe(false);
  });

  it('should update URL when setActiveTab is called', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper([
        '/?tab=workflow&executionId=exec-1&stepExecutionId=step-1&stepId=s1',
      ]),
    });

    act(() => {
      result.current.setActiveTab('executions');
    });

    expect(result.current.activeTab).toBe('executions');
    // setActiveTab clears execution-related params
    expect(result.current.selectedExecutionId).toBeUndefined();
    expect(result.current.selectedStepExecutionId).toBeUndefined();
    expect(result.current.selectedStepId).toBeUndefined();
  });

  it('should update URL when setSelectedExecution is called', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(['/?tab=executions']),
    });

    act(() => {
      result.current.setSelectedExecution('exec-42');
    });

    expect(result.current.selectedExecutionId).toBe('exec-42');
  });

  it('should clear execution when setSelectedExecution is called with null', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(['/?executionId=exec-1']),
    });

    act(() => {
      result.current.setSelectedExecution(null);
    });

    expect(result.current.selectedExecutionId).toBeUndefined();
  });

  it('should update URL when setSelectedStepExecution is called', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(['/?tab=executions']),
    });

    act(() => {
      result.current.setSelectedStepExecution('step-exec-7');
    });

    expect(result.current.selectedStepExecutionId).toBe('step-exec-7');
  });

  it('should update URL when setSelectedStep is called', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(['/?tab=executions']),
    });

    act(() => {
      result.current.setSelectedStep('my-step');
    });

    expect(result.current.selectedStepId).toBe('my-step');
  });

  it('should clear resume param when clearResumeParam is called', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(['/?resume=true&tab=workflow']),
    });

    expect(result.current.shouldAutoResume).toBe(true);

    act(() => {
      result.current.clearResumeParam();
    });

    expect(result.current.shouldAutoResume).toBe(false);
  });

  it('should support updateUrlState for arbitrary updates', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.updateUrlState({
        tab: 'executions',
        executionId: 'exec-99',
      });
    });

    expect(result.current.activeTab).toBe('executions');
    expect(result.current.selectedExecutionId).toBe('exec-99');
  });

  it('should apply sequential URL updates in one tick without stale search', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(['/?tab=executions&executionId=exec-1']),
    });

    act(() => {
      result.current.setActiveTab('workflow');
      result.current.setSelectedExecution(null);
    });

    expect(result.current.activeTab).toBe('workflow');
    expect(result.current.selectedExecutionId).toBeUndefined();
  });
});
