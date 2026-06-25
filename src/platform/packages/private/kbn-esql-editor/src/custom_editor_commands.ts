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
import {
  ESQLVariableType,
  QuerySource,
  type ESQLControlsContext,
  ControlTriggerSource,
  type ESQLControlVariable,
  type ESQLSourceResult,
  type IndexAutocompleteItem,
} from '@kbn/esql-types';
import type { CoreStart } from '@kbn/core/public';
import type { ESQLEditorDeps } from './types';
import type { ESQLEditorTelemetryService } from './telemetry/telemetry_service';
import { IndicesBrowserOpenMode } from './resource_browser/types';
import { getRangeFromOffsets } from './resource_browser/utils';

export interface MonacoCommandDependencies {
  application?: CoreStart['application'];
  uiActions: ESQLEditorDeps['uiActions'];
  telemetryService: ESQLEditorTelemetryService;
  editorRef: React.RefObject<monaco.editor.IStandaloneCodeEditor>;
  getCurrentQuery: () => string;
  esqlVariables: React.RefObject<ESQLControlVariable[] | undefined>;
  controlsContext: React.RefObject<ESQLControlsContext | undefined>;
  openTimePickerPopover: () => void;
  openIndicesBrowser?: (options?: {
    openedFrom?: IndicesBrowserOpenMode;
    preloadedSources?: ESQLSourceResult[];
    preloadedTimeSeriesSources?: IndexAutocompleteItem[];
  }) => void;
  openFieldsBrowser?: (options?: {
    preloadedFields?: Array<{ name: string; type?: string }>;
  }) => void;
}

interface TextReplacementCommandPayload {
  replacementText?: string;
  replaceStart?: string;
  replaceEnd?: string;
}

const applyTextReplacement = (
  editor: monaco.editor.IStandaloneCodeEditor,
  payload: TextReplacementCommandPayload | undefined
) => {
  if (!payload?.replacementText) {
    return;
  }

  const model = editor.getModel();

  if (!model) {
    return;
  }

  // Suggestion command arguments are serialized as string maps by contract.
  const replaceStart = Number(payload.replaceStart);
  const replaceEnd = Number(payload.replaceEnd);

  if (!Number.isFinite(replaceStart) || !Number.isFinite(replaceEnd) || replaceStart > replaceEnd) {
    return;
  }

  const modelLength = model.getValue().length;
  const boundedStart = Math.max(0, Math.min(replaceStart, modelLength));
  const boundedEnd = Math.max(boundedStart, Math.min(replaceEnd, modelLength));

  editor.executeEdits('applyTextReplacement', [
    {
      range: getRangeFromOffsets(model, boundedStart, boundedEnd),
      text: payload.replacementText,
    },
  ]);

  editor.setPosition(model.getPositionAt(boundedStart + payload.replacementText.length));
};

const triggerControl = async (
  queryString: string,
  variableType: ESQLVariableType,
  position: monaco.Position | null | undefined,
  uiActions: ESQLEditorDeps['uiActions'],
  triggerSource: ControlTriggerSource,
  esqlVariables?: ESQLControlVariable[],
  onSaveControl?: ESQLControlsContext['onSaveControl'],
  onCancelControl?: ESQLControlsContext['onCancelControl']
) => {
  await uiActions.executeTriggerActions('ESQL_CONTROL_TRIGGER', {
    queryString,
    variableType,
    cursorPosition: position,
    triggerSource,
    esqlVariables,
    onSaveControl,
    onCancelControl,
  });
};

export const registerCustomCommands = (deps: MonacoCommandDependencies): monaco.IDisposable[] => {
  const {
    application,
    uiActions,
    telemetryService,
    editorRef,
    getCurrentQuery,
    esqlVariables,
    controlsContext,
    openTimePickerPopover,
    openIndicesBrowser,
    openFieldsBrowser,
  } = deps;

  const commandDisposables: monaco.IDisposable[] = [];

  // Command to redirect users to the index management page
  commandDisposables.push(
    monaco.editor.registerCommand('esql.policies.create', (...args) => {
      application?.navigateToApp('management', {
        path: 'data/index_management/enrich_policies/create',
        openInNewTab: true,
      });
    })
  );

  // Choose timepicker command
  commandDisposables.push(
    monaco.editor.registerCommand('esql.timepicker.choose', (...args) => {
      openTimePickerPopover();
    })
  );

  commandDisposables.push(
    monaco.editor.registerCommand(ESQL_APPLY_TEXT_REPLACEMENT_COMMAND, (...args) => {
      const [, payload] = args;
      const editor = editorRef.current;

      if (!editor) {
        return;
      }

      applyTextReplacement(editor, payload);
    })
  );

  // Open indices browser command
  if (openIndicesBrowser) {
    commandDisposables.push(
      monaco.editor.registerCommand('esql.indicesBrowser.open', (...args) => {
        const [, payload] = args;
        let preloadedSources: ESQLSourceResult[] | undefined;
        let preloadedTimeSeriesSources: IndexAutocompleteItem[] | undefined;

        if (payload?.sources) {
          try {
            preloadedSources = JSON.parse(payload.sources) as ESQLSourceResult[];
          } catch {
            preloadedSources = undefined;
          }
        }

        if (payload?.timeSeriesSources) {
          try {
            preloadedTimeSeriesSources = JSON.parse(
              payload.timeSeriesSources
            ) as IndexAutocompleteItem[];
          } catch {
            preloadedTimeSeriesSources = undefined;
          }
        }

        openIndicesBrowser({
          openedFrom: IndicesBrowserOpenMode.Autocomplete,
          preloadedSources,
          preloadedTimeSeriesSources,
        });
      })
    );
  }

  // Open fields browser command (triggered by the "Browse fields" autocomplete item)
  if (openFieldsBrowser) {
    commandDisposables.push(
      monaco.editor.registerCommand('esql.fieldsBrowser.open', (...args) => {
        const [, payload] = args;
        let preloadedFields: Array<{ name: string; type?: string }> | undefined;

        if (payload?.fields) {
          try {
            const parsed = JSON.parse(payload.fields) as unknown;
            if (Array.isArray(parsed) && parsed.length > 0) {
              preloadedFields = parsed as Array<{ name: string; type?: string }>;
            }
          } catch {
            preloadedFields = undefined;
          }
        }

        openFieldsBrowser({
          preloadedFields,
        });
      })
    );
  }

  // Accept recommended query command
  commandDisposables.push(
    monaco.editor.registerCommand('esql.recommendedQuery.accept', (...args) => {
      const [, { queryLabel, queryText }] = args;
      telemetryService.trackRecommendedQueryClicked(QuerySource.AUTOCOMPLETE, queryLabel);

      // When queryText is provided (standalone queries), replaces the entire editor content.
      // If the queryText is not provided, the recommended query is inserted at the current cursor position
      // acting as a snippet.
      if (queryText) {
        const editor = editorRef.current;
        const model = editor?.getModel();
        if (editor && model) {
          const fullRange = model.getFullModelRange();
          editor.executeEdits('standaloneQuery', [{ range: fullRange, text: queryText }]);
          const lastLine = model.getLineCount();
          const lastColumn = model.getLineMaxColumn(lastLine);
          editor.setPosition({ lineNumber: lastLine, column: lastColumn });
        }
      }
    })
  );

  // Execute multiple commands
  // The payload is expected to be of the form:
  // {
  //   commands: JSON.stringify([
  //     { id: 'commandId1', payload: { ... } },
  //     { id: 'commandId2', payload: { ... } },
  //     ...
  //   ])
  // }
  commandDisposables.push(
    monaco.editor.registerCommand('esql.multiCommands', (...args) => {
      const [, { commands }] = args;
      let commandsToExecute: { id: string; payload?: unknown; arguments?: unknown[] }[];
      try {
        commandsToExecute = JSON.parse(commands);
      } catch {
        return;
      }
      commandsToExecute.forEach((command) => {
        const payload = command.payload ?? command.arguments?.[0] ?? {};
        editorRef.current?.trigger(undefined, command.id, payload);
      });
    })
  );

  // ESQL Control creation commands
  const controlCommands = [
    {
      command: 'esql.control.multi_values.create',
      variableType: ESQLVariableType.MULTI_VALUES,
    },
    {
      command: 'esql.control.time_literal.create',
      variableType: ESQLVariableType.TIME_LITERAL,
    },
    {
      command: 'esql.control.fields.create',
      variableType: ESQLVariableType.FIELDS,
    },
    {
      command: 'esql.control.values.create',
      variableType: ESQLVariableType.VALUES,
    },
    {
      command: 'esql.control.functions.create',
      variableType: ESQLVariableType.FUNCTIONS,
    },
  ];

  controlCommands.forEach(({ command, variableType }) => {
    commandDisposables.push(
      monaco.editor.registerCommand(command, async (...args) => {
        const [, { triggerSource }] = args;
        const prefilled = triggerSource !== ControlTriggerSource.QUESTION_MARK;
        const currentQuery = getCurrentQuery();
        telemetryService.trackEsqlControlFlyoutOpened(
          prefilled,
          variableType,
          triggerSource,
          currentQuery
        );
        const position = editorRef.current?.getPosition();
        await triggerControl(
          currentQuery,
          variableType,
          position,
          uiActions,
          triggerSource,
          esqlVariables.current ?? undefined,
          controlsContext.current?.onSaveControl,
          controlsContext.current?.onCancelControl
        );
      })
    );
  });

  return commandDisposables;
};

export const addEditorKeyBindings = (
  editor: monaco.editor.IStandaloneCodeEditor,
  onQuerySubmit: (source: QuerySource) => void,
  toggleVisor: () => void,
  onPrettifyQuery: () => void,
  onGenerateFromComment?: () => void
) => {
  // Add editor key bindings
  editor.addCommand(
    // eslint-disable-next-line no-bitwise
    monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
    () => onQuerySubmit(QuerySource.MANUAL)
  );

  editor.addCommand(
    // eslint-disable-next-line no-bitwise
    monaco.KeyMod.Shift | monaco.KeyCode.Enter,
    () => editor.trigger('keyboard', 'type', { text: '\n' })
  );

  editor.addCommand(
    // eslint-disable-next-line no-bitwise
    monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
    () => toggleVisor()
  );

  editor.addCommand(
    // eslint-disable-next-line no-bitwise
    monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI,
    () => {
      onPrettifyQuery();
    }
  );

  if (onGenerateFromComment) {
    editor.addCommand(
      // eslint-disable-next-line no-bitwise
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ,
      () => onGenerateFromComment()
    );
  }
};

export const addTabKeybindingRules = () => {
  // When both inline and suggestion widget are visible,
  // we want Tab to accept inline suggestions,
  // so we need to unbind the default suggestion widget behavior
  monaco.editor.addKeybindingRule({
    keybinding: monaco.KeyCode.Tab,
    command: '-acceptSelectedSuggestion',
    when: 'suggestWidgetHasFocusedSuggestion && suggestWidgetVisible && textInputFocus && inlineSuggestionVisible',
  });

  // Add explicit binding for Tab to accept inline suggestions when they're visible
  monaco.editor.addKeybindingRule({
    keybinding: monaco.KeyCode.Tab,
    command: 'editor.action.inlineSuggest.commit',
    when: 'inlineSuggestionVisible && textInputFocus',
  });
};
