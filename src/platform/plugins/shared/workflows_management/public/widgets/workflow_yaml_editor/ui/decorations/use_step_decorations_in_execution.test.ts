/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import type { monaco } from '@kbn/monaco';
import { ExecutionStatus } from '@kbn/workflows';
import type { WorkflowExecutionDto, WorkflowStepExecutionDto, WorkflowYaml } from '@kbn/workflows';
import { useStepDecorationsInExecution } from './use_step_decorations_in_execution';
import { createMockStore } from '../../../../entities/workflows/store/__mocks__/store.mock';
import {
  _setComputedDataInternal,
  _setComputedExecution,
  setActiveTab,
  setExecution,
  setHighlightedStepId,
  setYamlString,
} from '../../../../entities/workflows/store/workflow_detail/slice';
import type { ComputedData } from '../../../../entities/workflows/store/workflow_detail/types';
import { createStepInfo } from '../../../../shared/test_utils';

// Mock Monaco Range
jest.mock('@kbn/monaco', () => {
  const actualMonaco = jest.requireActual('@kbn/monaco');
  return {
    ...actualMonaco,
    monaco: {
      ...actualMonaco.monaco,
      Range: jest.fn((startLine: number, startCol: number, endLine: number, endCol: number) => ({
        startLineNumber: startLine,
        startColumn: startCol,
        endLineNumber: endLine,
        endColumn: endCol,
      })),
    },
  };
});

// Mock useEuiTheme
jest.mock('@elastic/eui', () => {
  const actualEui = jest.requireActual('@elastic/eui');
  return {
    ...actualEui,
    useEuiTheme: jest.fn(() => ({
      euiTheme: {
        colors: {
          backgroundBaseFormsControlDisabled: '#e0e0e0',
          backgroundLightWarning: '#fff3cd',
          backgroundLightPrimary: '#cfe2ff',
          backgroundLightSuccess: '#d1e7dd',
          backgroundLightDanger: '#f8d7da',
          backgroundFilledText: '#6c757d',
          backgroundFilledWarning: '#ffc107',
          backgroundFilledPrimary: '#0d6efd',
          vis: {
            euiColorVis0: '#54b399',
          },
          danger: '#dc3545',
        },
      },
    })),
    transparentize: jest.fn((color: string, opacity: number) => `${color}${opacity}`),
  };
});

// Helper function to create a valid WorkflowStepExecutionDto
const createStepExecution = (
  overrides: Partial<WorkflowStepExecutionDto> = {}
): WorkflowStepExecutionDto => ({
  id: 'default-id',
  stepId: 'default-step',
  stepType: 'action',
  scopeStack: [],
  workflowRunId: 'workflow-run-1',
  workflowId: 'workflow-1',
  status: ExecutionStatus.COMPLETED,
  startedAt: '2023-01-01T00:00:00Z',
  topologicalIndex: 0,
  globalExecutionIndex: 0,
  stepExecutionIndex: 0,
  ...overrides,
});

// Helper function to create a mock workflow definition
const createMockWorkflowDefinition = (): WorkflowYaml => ({
  version: '1' as const,
  name: 'test-workflow',
  enabled: true,
  triggers: [
    {
      type: 'manual' as const,
    },
  ],
  steps: [],
});

// Helper function to create a valid WorkflowExecutionDto
const createExecution = (
  stepExecutions: WorkflowStepExecutionDto[] = []
): WorkflowExecutionDto => ({
  id: 'execution-1',
  isTestRun: false,
  spaceId: 'default',
  status: ExecutionStatus.COMPLETED,
  error: null,
  startedAt: '2023-01-01T00:00:00Z',
  finishedAt: '2023-01-01T00:01:00Z',
  workflowId: 'workflow-1',
  workflowName: 'test-workflow',
  workflowDefinition: createMockWorkflowDefinition(),
  stepExecutions,
  duration: 60000,
  triggeredBy: 'manual',
  yaml: 'version: "1"\nname: test',
});

// Helper function to create a mock editor
const createMockEditor = () => {
  const decorationsCollection = {
    clear: jest.fn(),
    set: jest.fn(),
  };

  return {
    createDecorationsCollection: jest.fn(() => decorationsCollection),
    getModel: jest.fn(() => ({
      getValue: jest.fn(() => ''),
    })),
  } as unknown as monaco.editor.IStandaloneCodeEditor;
};

// createStepInfo imported from shared/test_utils

// Helper to render hook with Redux provider
// Defaults to 'executions' tab because execution decorations only apply in that context.
const renderHookWithProviders = (
  editor: monaco.editor.IStandaloneCodeEditor | null,
  initialYaml: string = 'version: "1"\nname: test',
  initialActiveTab: 'executions' | 'workflow' = 'executions'
) => {
  const store = createMockStore();

  // Set initial YAML to trigger lookup computation
  store.dispatch(setYamlString(initialYaml));
  store.dispatch(setActiveTab(initialActiveTab));

  // Set workflowLookup in computed state using internal action.
  // Both state.computed and state.computedExecution are populated because
  // selectEditorComputed switches to computedExecution once an execution with
  // YAML is loaded and isExecutionsTab is true. Pre-seeding both ensures the
  // workflowLookup is available regardless of which path the selector takes.
  const computedData: ComputedData = {
    workflowLookup: {
      steps: {
        'step-1': createStepInfo({ stepId: 'step-1', lineStart: 1, lineEnd: 3 }),
        'step-2': createStepInfo({ stepId: 'step-2', lineStart: 4, lineEnd: 6 }),
        'step-3': createStepInfo({
          stepId: 'step-3',
          lineStart: 7,
          lineEnd: 9,
          parentStepId: 'step-2',
        }),
      },
    },
  };
  store.dispatch(_setComputedDataInternal(computedData));
  store.dispatch(_setComputedExecution(computedData));

  const wrapper = ({ children }: { children: React.ReactNode }) => {
    return React.createElement(Provider, { store }, children);
  };

  return {
    ...renderHook(() => useStepDecorationsInExecution(editor), { wrapper }),
    store,
  };
};

describe('useStepDecorationsInExecution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when editor is null', () => {
    it('should return styles without creating decorations', () => {
      const { result } = renderHookWithProviders(null);

      expect(result.current.styles).toBeDefined();
    });

    it('should not call createDecorationsCollection', () => {
      const mockEditor = createMockEditor();
      const spy = jest.spyOn(mockEditor, 'createDecorationsCollection');

      renderHookWithProviders(null);

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('when editor is provided', () => {
    it('should create decorations collection', () => {
      const mockEditor = createMockEditor();
      const spy = jest.spyOn(mockEditor, 'createDecorationsCollection');

      renderHookWithProviders(mockEditor);

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should clear decorations on mount', () => {
      const mockEditor = createMockEditor();
      renderHookWithProviders(mockEditor);

      const decorationsCollection = (mockEditor.createDecorationsCollection as jest.Mock).mock
        .results[0].value;

      expect(decorationsCollection.clear).toHaveBeenCalled();
    });

    it('should not set decorations when stepExecutions is empty', () => {
      const mockEditor = createMockEditor();
      const { store } = renderHookWithProviders(mockEditor);

      act(() => {
        store.dispatch(setExecution(createExecution([])));
      });

      const decorationsCollection = (mockEditor.createDecorationsCollection as jest.Mock).mock
        .results[0].value;

      expect(decorationsCollection.set).not.toHaveBeenCalled();
    });

    it('should not set decorations when workflowLookup.steps is undefined', () => {
      const mockEditor = createMockEditor();
      const store = createMockStore();

      act(() => {
        store.dispatch(setYamlString('version: "1"'));
        store.dispatch(
          _setComputedDataInternal({
            workflowLookup: { steps: undefined as any },
          })
        );
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => {
        return React.createElement(Provider, { store }, children);
      };

      const { rerender } = renderHook(() => useStepDecorationsInExecution(mockEditor), { wrapper });

      act(() => {
        store.dispatch(setExecution(createExecution([createStepExecution()])));
        rerender();
      });

      const decorationsCollection = (mockEditor.createDecorationsCollection as jest.Mock).mock
        .results[0].value;

      expect(decorationsCollection.set).not.toHaveBeenCalled();
    });

    it('should create decorations for step execution with completed status', async () => {
      const mockEditor = createMockEditor();
      const { store, rerender } = renderHookWithProviders(mockEditor);

      act(() => {
        store.dispatch(
          setExecution(
            createExecution([
              createStepExecution({ stepId: 'step-1', status: ExecutionStatus.COMPLETED }),
            ])
          )
        );
        rerender();
      });

      const decorationsCollection = (mockEditor.createDecorationsCollection as jest.Mock).mock
        .results[0].value;

      await waitFor(() => {
        expect(decorationsCollection.set).toHaveBeenCalled();
      });

      const decorations = decorationsCollection.set.mock.calls[0][0];

      expect(decorations).toHaveLength(2); // glyph + background
      expect(decorations[0].options.glyphMarginClassName).toContain(
        'step-execution-completed-glyph'
      );
      expect(decorations[1].options.className).toContain('step-execution-completed');
    });

    it('should create decorations for different execution statuses', async () => {
      const mockEditor = createMockEditor();
      const { store, rerender } = renderHookWithProviders(mockEditor);

      const statuses = [
        ExecutionStatus.SKIPPED,
        ExecutionStatus.WAITING_FOR_INPUT,
        ExecutionStatus.RUNNING,
        ExecutionStatus.COMPLETED,
        ExecutionStatus.FAILED,
      ];

      act(() => {
        store.dispatch(
          setExecution(
            createExecution(
              statuses.map((status, index) =>
                createStepExecution({
                  stepId: `step-${index + 1}`,
                  status,
                })
              )
            )
          )
        );
        rerender();
      });

      const decorationsCollection = (mockEditor.createDecorationsCollection as jest.Mock).mock
        .results[0].value;

      await waitFor(() => {
        expect(decorationsCollection.set).toHaveBeenCalled();
      });

      const decorations = decorationsCollection.set.mock.calls[0][0];

      expect(decorations.length).toBeGreaterThan(0);
    });

    it('should add dimmed class when step is highlighted and another step is not highlighted', async () => {
      const mockEditor = createMockEditor();
      const { store, rerender } = renderHookWithProviders(mockEditor);

      act(() => {
        store.dispatch(setHighlightedStepId({ stepId: 'step-1' }));
        store.dispatch(
          setExecution(
            createExecution([
              createStepExecution({ stepId: 'step-1', status: ExecutionStatus.COMPLETED }),
              createStepExecution({ stepId: 'step-2', status: ExecutionStatus.RUNNING }),
            ])
          )
        );
        rerender();
      });

      const decorationsCollection = (mockEditor.createDecorationsCollection as jest.Mock).mock
        .results[0].value;

      await waitFor(() => {
        expect(decorationsCollection.set).toHaveBeenCalled();
      });

      const decorations = decorationsCollection.set.mock.calls[0][0];

      // step-2 should be dimmed
      const step2GlyphDecoration = decorations.find((d: any) =>
        d.options.glyphMarginClassName?.includes('step-execution-running-glyph')
      );
      expect(step2GlyphDecoration?.options.glyphMarginClassName).toContain('dimmed');

      // step-1 should not be dimmed
      const step1GlyphDecoration = decorations.find((d: any) =>
        d.options.glyphMarginClassName?.includes('step-execution-completed-glyph')
      );
      expect(step1GlyphDecoration?.options.glyphMarginClassName).not.toContain('dimmed');
    });

    it('should only create glyph decoration for nested steps', async () => {
      const mockEditor = createMockEditor();
      const { store, rerender } = renderHookWithProviders(mockEditor);

      // step-3 has parentStepId 'step-2'
      act(() => {
        store.dispatch(
          setExecution(
            createExecution([
              createStepExecution({ stepId: 'step-2', status: ExecutionStatus.COMPLETED }),
              createStepExecution({ stepId: 'step-3', status: ExecutionStatus.RUNNING }),
            ])
          )
        );
        rerender();
      });

      const decorationsCollection = (mockEditor.createDecorationsCollection as jest.Mock).mock
        .results[0].value;

      await waitFor(() => {
        expect(decorationsCollection.set).toHaveBeenCalled();
      });

      const decorations = decorationsCollection.set.mock.calls[0][0];

      // step-3 (nested) should only have glyph decoration
      const step3Decorations = decorations.filter((d: any) =>
        d.options.glyphMarginClassName?.includes('step-execution-running-glyph')
      );
      expect(step3Decorations).toHaveLength(1); // Only glyph

      // step-2 (parent) should have both glyph and background
      const step2Decorations = decorations.filter(
        (d: any) =>
          d.options.className?.includes('step-execution-completed') ||
          d.options.glyphMarginClassName?.includes('step-execution-completed-glyph')
      );
      expect(step2Decorations.length).toBeGreaterThanOrEqual(2); // Glyph + background
    });

    it('should return empty array when stepInfo is not found', async () => {
      const mockEditor = createMockEditor();
      const { store, rerender } = renderHookWithProviders(mockEditor);

      act(() => {
        store.dispatch(
          setExecution(
            createExecution([
              createStepExecution({
                stepId: 'non-existent-step',
                status: ExecutionStatus.COMPLETED,
              }),
            ])
          )
        );
        rerender();
      });

      const decorationsCollection = (mockEditor.createDecorationsCollection as jest.Mock).mock
        .results[0].value;

      await waitFor(() => {
        expect(decorationsCollection.set).toHaveBeenCalled();
      });

      const decorations = decorationsCollection.set.mock.calls[0][0];

      expect(decorations).toHaveLength(0);
    });

    it('should NOT set decorations when stepExecutions are present but editor is on the workflow (editable) tab', async () => {
      // Regression: after a test-run the execution populates Redux, but the user is still
      // on the editable YAML tab. Decorations must NOT paint over the editable YAML.
      const mockEditor = createMockEditor();
      const { store, rerender } = renderHookWithProviders(mockEditor);

      act(() => {
        store.dispatch(setActiveTab('workflow')); // editable tab — NOT executions
        store.dispatch(
          setExecution(
            createExecution([
              createStepExecution({ stepId: 'step-1', status: ExecutionStatus.COMPLETED }),
            ])
          )
        );
        rerender();
      });

      const decorationsCollection = (mockEditor.createDecorationsCollection as jest.Mock).mock
        .results[0].value;

      // Must not paint decorations on the editable YAML editor
      await waitFor(() => {
        expect(decorationsCollection.set).not.toHaveBeenCalled();
      });
    });

    it('should set decorations when on the executions (read-only) tab', async () => {
      const mockEditor = createMockEditor();
      const { store, rerender } = renderHookWithProviders(mockEditor);

      act(() => {
        store.dispatch(setActiveTab('executions')); // read-only executions tab
        store.dispatch(
          setExecution(
            createExecution([
              createStepExecution({ stepId: 'step-1', status: ExecutionStatus.COMPLETED }),
            ])
          )
        );
        rerender();
      });

      const decorationsCollection = (mockEditor.createDecorationsCollection as jest.Mock).mock
        .results[0].value;

      await waitFor(() => {
        expect(decorationsCollection.set).toHaveBeenCalled();
      });

      const decorations = decorationsCollection.set.mock.calls[0][0];
      expect(decorations.length).toBeGreaterThan(0);
    });

    it('should update decorations when stepExecutions changes', () => {
      const mockEditor = createMockEditor();
      const { store, rerender } = renderHookWithProviders(mockEditor);

      act(() => {
        store.dispatch(
          setExecution(
            createExecution([
              createStepExecution({ stepId: 'step-1', status: ExecutionStatus.COMPLETED }),
            ])
          )
        );
        rerender();
      });

      const decorationsCollection = (mockEditor.createDecorationsCollection as jest.Mock).mock
        .results[0].value;
      const firstCallCount = decorationsCollection.set.mock.calls.length;

      act(() => {
        store.dispatch(
          setExecution(
            createExecution([
              createStepExecution({ stepId: 'step-1', status: ExecutionStatus.RUNNING }),
            ])
          )
        );
        rerender();
      });

      expect(decorationsCollection.set.mock.calls.length).toBeGreaterThan(firstCallCount);
    });

    it('should clear decorations before setting new ones', async () => {
      const mockEditor = createMockEditor();
      const { store, rerender } = renderHookWithProviders(mockEditor);

      act(() => {
        store.dispatch(
          setExecution(
            createExecution([
              createStepExecution({ stepId: 'step-1', status: ExecutionStatus.COMPLETED }),
            ])
          )
        );
        rerender();
      });

      const decorationsCollection = (mockEditor.createDecorationsCollection as jest.Mock).mock
        .results[0].value;

      await waitFor(() => {
        expect(decorationsCollection.set).toHaveBeenCalled();
      });

      // clear should be called before set
      const clearCallIndex = decorationsCollection.clear.mock.invocationCallOrder[0];
      const setCallIndex = decorationsCollection.set.mock.invocationCallOrder[0];

      if (clearCallIndex !== undefined && setCallIndex !== undefined) {
        expect(clearCallIndex).toBeLessThan(setCallIndex);
      }
    });
  });

  describe('styles', () => {
    it('should return styles object', () => {
      const { result } = renderHookWithProviders(null);

      expect(result.current.styles).toBeDefined();
      expect(typeof result.current.styles).toBe('object');
    });

    it('should include styles for all execution statuses', () => {
      const { result } = renderHookWithProviders(null);

      // The styles are CSS-in-JS, so we can't easily test the exact content
      // but we can verify the styles object exists
      expect(result.current.styles).toBeDefined();
    });
  });
});
