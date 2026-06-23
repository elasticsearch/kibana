/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { monaco } from '@kbn/code-editor';
import { ESQL_APPLY_TEXT_REPLACEMENT_COMMAND } from '@kbn/esql-language';
import { coreMock } from '@kbn/core/public/mocks';
import { uiActionsPluginMock } from '@kbn/ui-actions-plugin/public/mocks';
import { ESQLVariableType, ControlTriggerSource } from '@kbn/esql-types';
import {
  registerCustomCommands,
  addEditorKeyBindings,
  type MonacoCommandDependencies,
} from './custom_editor_commands';
import type { ESQLEditorTelemetryService } from './telemetry/telemetry_service';
import { ESQL_CONTROL_TRIGGER } from '@kbn/ui-actions-plugin/common/trigger_ids';

const mockModel = {
  getValue: jest.fn(),
  getPositionAt: jest.fn(),
};

const mockEditor = {
  addCommand: jest.fn(),
  getPosition: jest.fn(),
  getValue: jest.fn(),
  getModel: jest.fn(() => mockModel),
  executeEdits: jest.fn(),
  setPosition: jest.fn(),
  focus: jest.fn(),
  trigger: jest.fn(),
} as unknown as monaco.editor.IStandaloneCodeEditor;

const mockUiActions = {
  ...uiActionsPluginMock.createStartContract(),
};

const mockTelemetryService = {
  trackEsqlControlFlyoutOpened: jest.fn(),
  trackRecommendedQueryClicked: jest.fn(),
} as unknown as ESQLEditorTelemetryService;

describe('Custom Editor Commands', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockModel.getValue.mockReturnValue('');
    mockModel.getPositionAt.mockReturnValue({ lineNumber: 1, column: 1 });
    // Mock monaco.editor.registerCommand to return a disposable
    jest.spyOn(monaco.editor, 'registerCommand').mockReturnValue({
      dispose: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('registerCustomCommands', () => {
    it('should use current ref values for esqlVariables and controlsContext when command is executed', async () => {
      const initialVariables = [{ key: 'var1', type: ESQLVariableType.VALUES, value: 'initial' }];
      const updatedVariables = [{ key: 'var2', type: ESQLVariableType.VALUES, value: 'updated' }];

      const initialContext = {
        onSaveControl: jest.fn(),
        onCancelControl: jest.fn(),
        supportsControls: false,
      };
      const updatedContext = {
        onSaveControl: jest.fn(),
        onCancelControl: jest.fn(),
        supportsControls: true,
      };

      // Create refs
      const esqlVariablesRef = { current: initialVariables };
      const controlsContextRef = { current: initialContext };
      const editorRef = { current: mockEditor };

      const deps = {
        application: coreMock.createStart().application,
        uiActions: mockUiActions,
        telemetryService: mockTelemetryService,
        editorRef,
        getCurrentQuery: jest.fn().mockReturnValue('FROM index'),
        esqlVariables: esqlVariablesRef,
        controlsContext: controlsContextRef,
        openTimePickerPopover: jest.fn(),
      } as unknown as MonacoCommandDependencies;

      registerCustomCommands(deps);

      const registerCommandCalls = (monaco.editor.registerCommand as jest.Mock).mock.calls;
      const controlCommandCall = registerCommandCalls.find(
        ([commandId]) => commandId === 'esql.control.values.create'
      );
      expect(controlCommandCall).toBeDefined();

      const commandHandler = controlCommandCall[1];

      // Simulate state changes
      esqlVariablesRef.current = updatedVariables;
      controlsContextRef.current = updatedContext;

      await commandHandler(null, { triggerSource: ControlTriggerSource.ADD_CONTROL_BTN });

      expect(mockUiActions.executeTriggerActions).toHaveBeenCalledWith(
        ESQL_CONTROL_TRIGGER,
        expect.objectContaining({
          esqlVariables: updatedVariables,
          onSaveControl: updatedContext.onSaveControl,
          onCancelControl: updatedContext.onCancelControl,
        })
      );
    });

    it('should use getCurrentQuery function that accesses current editor state', async () => {
      const getCurrentQuery = jest.fn().mockReturnValue('FROM updated_index');
      const esqlVariablesRef = { current: [] };
      const controlsContextRef = { current: null };
      const editorRef = { current: mockEditor };

      const deps = {
        application: coreMock.createStart().application,
        uiActions: mockUiActions,
        telemetryService: mockTelemetryService,
        editorRef,
        getCurrentQuery,
        esqlVariables: esqlVariablesRef,
        controlsContext: controlsContextRef,
        openTimePickerPopover: jest.fn(),
      } as unknown as MonacoCommandDependencies;

      registerCustomCommands(deps);

      const registerCommandCalls = (monaco.editor.registerCommand as jest.Mock).mock.calls;
      const controlCommandCall = registerCommandCalls.find(
        ([commandId]) => commandId === 'esql.control.values.create'
      );
      const commandHandler = controlCommandCall[1];

      await commandHandler(null, { triggerSource: ControlTriggerSource.ADD_CONTROL_BTN });

      expect(getCurrentQuery).toHaveBeenCalled();
      expect(mockTelemetryService.trackEsqlControlFlyoutOpened).toHaveBeenCalledWith(
        true,
        ESQLVariableType.VALUES,
        ControlTriggerSource.ADD_CONTROL_BTN,
        'FROM updated_index'
      );
    });

    it('applies text replacement commands with absolute offsets', () => {
      mockModel.getValue.mockReturnValue('ROW a = 1\nFROM my_timeseries_index');
      mockModel.getPositionAt
        .mockReturnValueOnce({ lineNumber: 2, column: 1 })
        .mockReturnValueOnce({ lineNumber: 2, column: 25 })
        .mockReturnValueOnce({ lineNumber: 2, column: 23 });

      const deps = {
        application: coreMock.createStart().application,
        uiActions: mockUiActions,
        telemetryService: mockTelemetryService,
        editorRef: { current: mockEditor },
        getCurrentQuery: jest.fn(),
        esqlVariables: { current: [] },
        controlsContext: { current: null },
        openTimePickerPopover: jest.fn(),
      } as unknown as MonacoCommandDependencies;

      registerCustomCommands(deps);

      const registerCommandCalls = (monaco.editor.registerCommand as jest.Mock).mock.calls;
      const acceptCommandCall = registerCommandCalls.find(
        ([commandId]) => commandId === ESQL_APPLY_TEXT_REPLACEMENT_COMMAND
      );
      const commandHandler = acceptCommandCall[1];

      commandHandler(null, {
        replacementText: 'TS my_timeseries_index',
        replaceStart: '10',
        replaceEnd: '34',
      });

      expect(mockEditor.executeEdits).toHaveBeenCalledWith('applyTextReplacement', [
        {
          range: new monaco.Range(2, 1, 2, 25),
          text: 'TS my_timeseries_index',
        },
      ]);
      expect(mockEditor.setPosition).toHaveBeenCalledWith({
        lineNumber: 2,
        column: 23,
      });
    });
  });

  describe('addEditorKeyBindings', () => {
    it('should call toggleVisor function when command is executed', () => {
      const mockOnQuerySubmit = jest.fn();
      const mockToggleVisor = jest.fn();
      const mockOnPrettifyQuery = jest.fn();

      addEditorKeyBindings(mockEditor, mockOnQuerySubmit, mockToggleVisor, mockOnPrettifyQuery);

      expect(mockEditor.addCommand).toHaveBeenCalledTimes(4);

      const cmdKCall = (mockEditor.addCommand as jest.Mock).mock.calls.find(
        // eslint-disable-next-line no-bitwise
        ([keyMod]) => keyMod === (monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK)
      );
      expect(cmdKCall).toBeDefined();

      const cmdKHandler = cmdKCall[1];

      cmdKHandler();

      expect(mockToggleVisor).toHaveBeenCalledTimes(1);
    });

    it('should call onQuerySubmit when CMD+Enter is pressed', () => {
      const mockOnQuerySubmit = jest.fn();
      const mockToggleVisor = jest.fn();
      const mockOnPrettifyQuery = jest.fn();

      addEditorKeyBindings(mockEditor, mockOnQuerySubmit, mockToggleVisor, mockOnPrettifyQuery);

      const cmdEnterCall = (mockEditor.addCommand as jest.Mock).mock.calls.find(
        // eslint-disable-next-line no-bitwise
        ([keyMod]) => keyMod === (monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter)
      );
      expect(cmdEnterCall).toBeDefined();

      const cmdEnterHandler = cmdEnterCall[1];

      cmdEnterHandler();

      expect(mockOnQuerySubmit).toHaveBeenCalledWith('manual');
    });

    it('should call onPrettifyQuery when CMD+I is pressed', () => {
      const mockOnQuerySubmit = jest.fn();
      const mockToggleVisor = jest.fn();
      const mockOnPrettifyQuery = jest.fn();

      addEditorKeyBindings(mockEditor, mockOnQuerySubmit, mockToggleVisor, mockOnPrettifyQuery);

      const cmdICall = (mockEditor.addCommand as jest.Mock).mock.calls.find(
        // eslint-disable-next-line no-bitwise
        ([keyMod]) => keyMod === (monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI)
      );
      expect(cmdICall).toBeDefined();

      const cmdIHandler = cmdICall[1];

      cmdIHandler();

      expect(mockOnPrettifyQuery).toHaveBeenCalledTimes(1);
    });

    it('inserts a newline when Shift+Enter is pressed', () => {
      addEditorKeyBindings(mockEditor, jest.fn(), jest.fn(), jest.fn());

      const shiftEnterCall = (mockEditor.addCommand as jest.Mock).mock.calls.find(
        // eslint-disable-next-line no-bitwise
        ([keyMod]) => keyMod === (monaco.KeyMod.Shift | monaco.KeyCode.Enter)
      );
      expect(shiftEnterCall).toBeDefined();

      shiftEnterCall[1]();

      expect(mockEditor.trigger).toHaveBeenCalledWith('keyboard', 'type', { text: '\n' });
    });
  });
});
