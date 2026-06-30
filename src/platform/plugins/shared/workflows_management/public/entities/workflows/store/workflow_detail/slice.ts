/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createSlice } from '@reduxjs/toolkit';
import type { EsWorkflow, WorkflowDetailDto, WorkflowExecutionDto } from '@kbn/workflows';
import { WORKFLOW_GRAPH_FOCUS_TRIGGER } from '@kbn/workflows';
import type { ActiveTab, ComputedData, LineColumnPosition, WorkflowDetailState } from './types';
import { addLoadingStateReducers, initialLoadingState } from './utils/loading_states';
import { findStepByLine } from './utils/step_finder';
import { getWorkflowZodSchema } from '../../../../../common/schema';
import { triggerSchemas } from '../../../../trigger_schemas';
import type { WorkflowsResponse } from '../../model/types';

/**
 * Sentinel value dispatched as `highlightedStepId` to scroll the editor to the
 * triggers section.  Shared between the execution-detail component (producer)
 * and the YAML editor (consumer).
 */
export const HIGHLIGHTED_STEP_TRIGGER = WORKFLOW_GRAPH_FOCUS_TRIGGER;

export const initialWorkflowsState: WorkflowsResponse = {
  workflows: {},
  totalWorkflows: 0,
};

// Initial state
const initialState: WorkflowDetailState = {
  yamlString: '',
  isYamlSynced: true,
  computed: undefined,
  workflow: undefined,
  execution: undefined,
  computedExecution: undefined,
  activeTab: undefined,
  connectors: undefined,
  workflows: initialWorkflowsState,
  schema: getWorkflowZodSchema({}, triggerSchemas.getRegisteredIds()),
  cursorPosition: undefined,
  focusedStepId: undefined,
  highlightedStepId: undefined,
  isTestModalOpen: false,
  testStepModalOpenStepId: undefined,
  replay: undefined,
  loading: initialLoadingState,
  hasYamlSchemaValidationErrors: false,
  aiAssisted: false,
  connectorFlyout: {
    isOpen: false,
    connectorType: undefined,
    connectorIdToEdit: undefined,
    insertPosition: undefined,
  },
};

// Slice
const workflowDetailSlice = createSlice({
  name: 'detail',
  initialState,
  reducers: {
    setWorkflow: (state, action: { payload: WorkflowDetailDto }) => {
      state.workflow = action.payload;
    },
    updateWorkflow: (state, action: { payload: Partial<EsWorkflow> }) => {
      if (state.workflow) {
        Object.assign(state.workflow, action.payload);
      }
    },
    setYamlString: (state, action: { payload: string }) => {
      state.yamlString = action.payload;
    },
    setIsYamlSynced: (state, action: { payload: boolean }) => {
      state.isYamlSynced = action.payload;
    },
    setCursorPosition: (state, action: { payload: LineColumnPosition }) => {
      state.cursorPosition = action.payload;
      if (!state.computed?.workflowLookup) {
        state.focusedStepId = undefined;
        return;
      }
      state.focusedStepId = findStepByLine(
        action.payload.lineNumber,
        state.computed.workflowLookup
      );
    },
    setHighlightedStepId: (state, action: { payload: { stepId: string | undefined } }) => {
      state.highlightedStepId = action.payload.stepId;
    },
    setIsTestModalOpen: (state, action: { payload: boolean }) => {
      state.isTestModalOpen = action.payload;
    },
    setReplayExecutionId: (state, action: { payload: string | null }) => {
      if (state.replay === undefined) {
        state.replay = {};
      }
      state.replay.executionId = action.payload ?? undefined;
      state.replay.stepExecutionId = undefined; // only one replay type at a time
    },
    setReplayStepExecutionId: (state, action: { payload: string | null }) => {
      if (state.replay === undefined) {
        state.replay = {};
      }
      state.replay.stepExecutionId = action.payload ?? undefined;
      state.replay.executionId = undefined; // only one replay type at a time
    },
    setTestStepModalOpenStepId: (state, action: { payload: string | undefined }) => {
      state.testStepModalOpenStepId = action.payload;
    },
    clearReplay: (state) => {
      state.replay = undefined;
    },
    setConnectors: (state, action: { payload: WorkflowDetailState['connectors'] }) => {
      state.connectors = action.payload;
    },
    setWorkflows: (state, action: { payload: WorkflowDetailState['workflows'] }) => {
      state.workflows = action.payload;
    },
    setExecution: (state, action: { payload: WorkflowExecutionDto | undefined }) => {
      state.execution = action.payload;
    },
    clearExecution: (state) => {
      state.execution = undefined;
      state.computedExecution = undefined;
    },
    setActiveTab: (state, action: { payload: ActiveTab | undefined }) => {
      state.activeTab = action.payload;
    },

    setHasYamlSchemaValidationErrors: (state, action: { payload: boolean }) => {
      state.hasYamlSchemaValidationErrors = action.payload;
    },
    setAiAssisted: (state, action: { payload: boolean }) => {
      state.aiAssisted = action.payload;
    },

    // Connector flyout actions
    openCreateConnectorFlyout: (
      state,
      action: { payload: { connectorType: string; insertPosition?: LineColumnPosition } }
    ) => {
      state.connectorFlyout = { isOpen: true, ...action.payload };
    },
    openEditConnectorFlyout: (
      state,
      action: { payload: { connectorType: string; connectorIdToEdit: string } }
    ) => {
      state.connectorFlyout = { isOpen: true, ...action.payload };
    },
    closeConnectorFlyout: (state) => {
      state.connectorFlyout = { isOpen: false }; // connectorType, connectorToEdit, and insertPosition are undefined
    },

    // Internal actions - these are not for components usage
    _setComputedDataInternal: (state, action: { payload: ComputedData }) => {
      state.computed = action.payload;
      // Recalculate the focused step now that workflowLookup may have changed.
      // This handles the case where the cursor was positioned before the
      // debounced YAML computation completed.
      if (state.cursorPosition && action.payload.workflowLookup) {
        state.focusedStepId = findStepByLine(
          state.cursorPosition.lineNumber,
          action.payload.workflowLookup
        );
      }
    },
    _clearComputedData: (state) => {
      state.computed = {};
      state.focusedStepId = undefined;
    },
    _setGeneratedSchemaInternal: (state, action: { payload: WorkflowDetailState['schema'] }) => {
      state.schema = action.payload;
    },
    _setComputedExecution: (state, action: { payload: ComputedData }) => {
      state.computedExecution = action.payload;
    },
  },
  extraReducers: (builder) => {
    addLoadingStateReducers(builder);
  },
});

// Export the reducer
export const workflowDetailReducer = workflowDetailSlice.reducer;

export const {
  // Public action creators
  setWorkflow,
  updateWorkflow,
  setYamlString,
  setIsYamlSynced,
  setCursorPosition,
  setHighlightedStepId,
  setIsTestModalOpen,
  setReplayExecutionId,
  setReplayStepExecutionId,
  setTestStepModalOpenStepId,
  clearReplay,
  setConnectors,
  setWorkflows,
  setExecution,
  clearExecution,
  setActiveTab,
  setHasYamlSchemaValidationErrors,
  setAiAssisted,
  openCreateConnectorFlyout,
  openEditConnectorFlyout,
  closeConnectorFlyout,

  // Internal action creators for middleware use only
  _setComputedDataInternal,
  _clearComputedData,
  _setGeneratedSchemaInternal,
  _setComputedExecution,
} = workflowDetailSlice.actions;

// Ignore these non-serializable fields in the state
export const ignoredPaths: Array<string | RegExp> = [
  /detail\.computed\.*/, // All computed data is not serializable
  /detail\.computedExecution\.*/, // All computed execution data is not serializable
  'detail.schema', // Zod schema is not serializable
  'detail.workflow.definition', // WorkflowYaml definition schema is not serializable
  'detail.execution.definition', // WorkflowYaml definition schema is not serializable
];
// Ignore these specific action types that contain non-serializable data
export const ignoredActions: Array<string> = [
  'detail/_setComputedDataInternal',
  'detail/_setGeneratedSchemaInternal',
  'detail/_setComputedExecution',
];
