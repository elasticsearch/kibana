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
import { getStoredEditorView, getStoredGraphDirection } from '../lib/workflow_editor_preferences';

const createWrapper = (initialEntries: string[] = ['/']) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(MemoryRouter, { initialEntries }, children);
  return Wrapper;
};

describe('useWorkflowUrlState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

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

  it('should parse replayExecutionId from URL', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(['/?replayExecutionId=exec-1']),
    });

    expect(result.current.replayExecutionId).toBe('exec-1');
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

  it('should clear replayExecutionId when clearReplayExecutionId is called', () => {
    const { result } = renderHook(() => useWorkflowUrlState(), {
      wrapper: createWrapper(['/?replayExecutionId=exec-1']),
    });

    act(() => {
      result.current.clearReplayExecutionId();
    });

    expect(result.current.replayExecutionId).toBeUndefined();
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

  describe('localStorage persistence', () => {
    it('falls back to stored editorView when no URL param is present', () => {
      localStorage.setItem('workflowsUi.editor.view', '"graph"');

      const { result } = renderHook(() => useWorkflowUrlState(), {
        wrapper: createWrapper(),
      });

      expect(result.current.editorView).toBe('graph');
    });

    it('falls back to stored graphDirection when no URL param is present', () => {
      localStorage.setItem('workflowsUi.graph.direction', '"LR"');

      const { result } = renderHook(() => useWorkflowUrlState(), {
        wrapper: createWrapper(),
      });

      expect(result.current.graphDirection).toBe('LR');
    });

    it('stored editorView takes priority over URL param', () => {
      localStorage.setItem('workflowsUi.editor.view', '"graph"');

      const { result } = renderHook(() => useWorkflowUrlState(), {
        wrapper: createWrapper(['/?view=yaml']),
      });

      expect(result.current.editorView).toBe('graph');
    });

    it('stored graphDirection takes priority over URL param', () => {
      localStorage.setItem('workflowsUi.graph.direction', '"LR"');

      const { result } = renderHook(() => useWorkflowUrlState(), {
        wrapper: createWrapper(['/?direction=TB']),
      });

      expect(result.current.graphDirection).toBe('LR');
    });

    it('falls back to URL param for editorView when localStorage is not set', () => {
      const { result } = renderHook(() => useWorkflowUrlState(), {
        wrapper: createWrapper(['/?view=graph']),
      });

      expect(result.current.editorView).toBe('graph');
    });

    it('falls back to URL param for graphDirection when localStorage is not set', () => {
      const { result } = renderHook(() => useWorkflowUrlState(), {
        wrapper: createWrapper(['/?direction=LR']),
      });

      expect(result.current.graphDirection).toBe('LR');
    });

    it('setEditorView persists to localStorage', () => {
      const { result } = renderHook(() => useWorkflowUrlState(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setEditorView('graph');
      });

      expect(getStoredEditorView()).toBe('graph');
    });

    it('setEditorView persists default yaml to localStorage', () => {
      const { result } = renderHook(() => useWorkflowUrlState(), {
        wrapper: createWrapper(['/?view=graph']),
      });

      act(() => {
        result.current.setEditorView('yaml');
      });

      expect(getStoredEditorView()).toBe('yaml');
    });

    it('setGraphDirection persists to localStorage', () => {
      const { result } = renderHook(() => useWorkflowUrlState(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setGraphDirection('LR');
      });

      expect(getStoredGraphDirection()).toBe('LR');
    });

    it('setGraphDirection persists default TB to localStorage', () => {
      const { result } = renderHook(() => useWorkflowUrlState(), {
        wrapper: createWrapper(['/?direction=LR']),
      });

      act(() => {
        result.current.setGraphDirection('TB');
      });

      expect(getStoredGraphDirection()).toBe('TB');
    });

    it('ignores a garbage stored editorView and falls back to default', () => {
      localStorage.setItem('workflowsUi.editor.view', '"invalid"');

      const { result } = renderHook(() => useWorkflowUrlState(), {
        wrapper: createWrapper(),
      });

      expect(result.current.editorView).toBe('yaml');
    });

    it('ignores a garbage stored graphDirection and falls back to default', () => {
      localStorage.setItem('workflowsUi.graph.direction', '"XY"');

      const { result } = renderHook(() => useWorkflowUrlState(), {
        wrapper: createWrapper(),
      });

      expect(result.current.graphDirection).toBe('TB');
    });
  });
});
