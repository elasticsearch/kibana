/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import classnames from 'classnames';
import throttle from 'lodash/throttle';
import type { SchemasSettings } from 'monaco-yaml';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type YAML from 'yaml';
import { monaco, YAML_LANG_ID } from '@kbn/code-editor';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { isTriggerType } from '@kbn/workflows';
import { useWorkflowsMonacoTheme, WORKFLOWS_MONACO_EDITOR_THEME } from '@kbn/workflows-ui';
import type { z } from '@kbn/zod/v4';
import { ActionsMenuButton } from './actions_menu_button';
import {
  useAlertTriggerDecorations,
  useConnectorTypeDecorations,
  useFocusedStepDecoration,
  useLineDifferencesDecorations,
  useStepDecorationsInExecution,
  useTriggerTypeDecorations,
  useWorkflowEventsOnDecorations,
  useWorkflowIdDecorations,
} from './decorations';
import { EditorSettingsPopover } from './editor_settings_popover';
import type { ExtraAction } from './extra_actions_bar';
import { ExtraActionsBar } from './extra_actions_bar';
import { useAgentBuilderIntegration } from './hooks/use_agent_builder_integration';
import { useWorkflowYamlCompletionProvider } from './hooks/use_workflow_yaml_completion_provider';
import { KeyboardShortcutsPopover } from './keyboard_shortcuts_popover';
import { StepActions } from './step_actions';
import { WorkflowYamlValidationAccordion } from './workflow_yaml_validation_accordion';
import { useAvailableConnectors } from '../../../entities/connectors/model/use_available_connectors';
import { useSaveYaml } from '../../../entities/workflows/model/use_save_yaml';
import type { StepInfo } from '../../../entities/workflows/store';
import {
  selectEditorFocusedStepInfo,
  selectEditorYamlDocument,
  selectSchema,
  setCursorPosition,
  setIsYamlSynced,
  setYamlString,
} from '../../../entities/workflows/store';
import {
  selectEditorWorkflowLookup,
  selectEditorYaml,
  selectEditorYamlLineCounter,
  selectExecution,
  selectHasChanges,
  selectHighlightedStepId,
  selectIsExecutionsTab,
  selectIsSavingYaml,
  selectStepExecutions,
  selectWorkflow,
  selectWorkflowDefinition,
} from '../../../entities/workflows/store/workflow_detail/selectors';
import {
  HIGHLIGHTED_STEP_TRIGGER,
  setHasYamlSchemaValidationErrors,
  setIsTestModalOpen,
} from '../../../entities/workflows/store/workflow_detail/slice';
import { ActionsMenuPopover } from '../../../features/actions_menu_popover';
import type {
  ActionOptionData,
  EditorCommand,
  JumpToStepEntry,
} from '../../../features/actions_menu_popover/types';
import { useMonacoMarkersChangedInterceptor } from '../../../features/validate_workflow_yaml/lib/use_monaco_markers_changed_interceptor';
import { useYamlValidation } from '../../../features/validate_workflow_yaml/lib/use_yaml_validation';
import type { YamlValidationResult } from '../../../features/validate_workflow_yaml/model/types';
import { useWorkflowJsonSchema } from '../../../features/validate_workflow_yaml/model/use_workflow_json_schema';
import { useKibana } from '../../../hooks/use_kibana';
import { UnsavedChangesPrompt, YamlEditor } from '../../../shared/ui';
import { triggerSchemas } from '../../../trigger_schemas';
import { interceptMonacoYamlProvider } from '../lib/autocomplete/intercept_monaco_yaml_provider';
import type { ExecutionContext } from '../lib/execution_context/build_execution_context';
import { buildExecutionContext } from '../lib/execution_context/build_execution_context';
import { useLazyStepExecutionFetcher } from '../lib/execution_context/use_lazy_step_execution_fetcher';
import { setStabilityBadgeThemeContext } from '../lib/get_stability_note';
import { interceptMonacoYamlHoverProvider } from '../lib/hover/intercept_monaco_yaml_hover_provider';
import {
  ElasticsearchMonacoConnectorHandler,
  FlowControlMonacoStepHandler,
  GenericMonacoConnectorHandler,
  HttpMonacoConnectorStepHandler,
  KibanaMonacoConnectorHandler,
  WorkflowExecuteMonacoConnectorHandler,
} from '../lib/monaco_connectors';
import { CustomMonacoStepHandler } from '../lib/monaco_connectors/custom_monaco_step_handler';
import {
  registerMonacoConnectorHandler,
  registerUnifiedHoverProvider,
} from '../lib/monaco_providers';
import { registerWorkflowDefinitionProvider } from '../lib/monaco_providers/workflow_definition_provider';
import { insertStepSnippet } from '../lib/snippets/insert_step_snippet';
import { insertTriggerSnippet } from '../lib/snippets/insert_trigger_snippet';
import { useRegisterHoverCommands } from '../lib/use_register_hover_commands';
import { useRegisterKeyboardCommands } from '../lib/use_register_keyboard_commands';
import { navigateToErrorPosition } from '../lib/utils';
import { GlobalWorkflowEditorStyles } from '../styles/global_workflow_editor_styles';
import { useDynamicTypeIcons } from '../styles/use_dynamic_type_icons';
import {
  EXECUTION_YAML_SNAPSHOT_CLASS,
  useWorkflowEditorStyles,
} from '../styles/use_workflow_editor_styles';

const editorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  automaticLayout: true,
  lineNumbers: 'on',
  glyphMargin: true,
  scrollBeyondLastLine: false,
  folding: true,
  showFoldingControls: 'mouseover',
  tabSize: 2,
  lineNumbersMinChars: 2,
  insertSpaces: true,
  fontSize: 14,
  lineHeight: 23, // default ~21px + 2px
  renderWhitespace: 'none',
  roundedSelection: false,
  guides: { indentation: true },
  wordWrap: 'on',
  wordWrapColumn: 80,
  wrappingIndent: 'indent',
  theme: WORKFLOWS_MONACO_EDITOR_THEME,
  padding: {
    top: 24,
    bottom: 16,
  },
  quickSuggestions: {
    other: true,
    comments: false,
    strings: true,
  },
  suggest: {
    snippetsPreventQuickSuggestions: false,
    showSnippets: true,
    filterGraceful: true, // Better filtering
    localityBonus: true, // Prioritize matches near cursor
  },
  wordBasedSuggestions: false,
  hover: {
    enabled: true,
    delay: 300,
    sticky: true,
    above: false, // Force hover below cursor to avoid clipping
  },
  formatOnType: true,
  suggestLineHeight: 25, // default 21 + 4px for padding
};

export interface WorkflowYAMLEditorProps {
  highlightDiff?: boolean;
  onStepRun: (params: { stepId: string; actionType: string }) => void;
  editorRef: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
}

export const WorkflowYAMLEditor = ({
  highlightDiff = false,
  onStepRun,
  editorRef: parentEditorRef,
}: WorkflowYAMLEditorProps) => {
  const { notifications, http } = useKibana().services;
  const euiThemeContext = useEuiTheme();

  useEffect(() => {
    setStabilityBadgeThemeContext(euiThemeContext);
  }, [euiThemeContext]);

  const saveYaml = useSaveYaml();
  const isSaving = useSelector(selectIsSavingYaml);
  const dispatch = useDispatch();
  const workflow = useSelector(selectWorkflow);
  const isExecutionYaml = useSelector(selectIsExecutionsTab);
  const isManagedWorkflow = workflow?.managed === true;
  const isReadOnlyYaml = isExecutionYaml || isManagedWorkflow;
  const isReadOnlyYamlRef = useRef(isReadOnlyYaml);
  isReadOnlyYamlRef.current = isReadOnlyYaml;
  const onChange = useCallback(
    (yaml: string) => {
      if (isReadOnlyYaml) {
        return;
      }
      dispatch(setYamlString(yaml));
    },
    [dispatch, isReadOnlyYaml]
  );

  const onSyncStateChange = useCallback(
    (isSynced: boolean) => {
      dispatch(setIsYamlSynced(isSynced));
    },
    [dispatch]
  );

  const workflowYaml = useSelector(selectEditorYaml) ?? '';
  const hasChanges = useSelector(selectHasChanges);

  const originalValue = workflow?.yaml ?? '';

  // Refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const stepExecutions = useSelector(selectStepExecutions);

  const execution = useSelector(selectExecution);
  const executionContextRef = useRef<ExecutionContext | null>(null);

  // Build execution context when step executions are available
  // Steps will have status/error/state but no I/O - those are lazy-loaded on hover
  useEffect(() => {
    if (isExecutionYaml && stepExecutions) {
      executionContextRef.current = buildExecutionContext(stepExecutions, execution?.context);
    } else {
      executionContextRef.current = null;
    }
  }, [isExecutionYaml, stepExecutions, execution?.context]);

  const fetchStepExecutionDataRef = useLazyStepExecutionFetcher(execution?.id, stepExecutions);

  // Ref to track saving state for keyboard handlers
  const isSavingRef = useRef<boolean>(false);
  isSavingRef.current = isSaving;

  // Refs / Disposables for Monaco providers
  const disposablesRef = useRef<monaco.IDisposable[]>([]);
  const workflowYamlSchema = useSelector(selectSchema);
  const workflowDefinition = useSelector(selectWorkflowDefinition);
  // The current yaml document in the editor (could be unsaved)
  const yamlDocument = useSelector(selectEditorYamlDocument);
  const yamlLineCounter = useSelector(selectEditorYamlLineCounter);
  const yamlDocumentRef = useRef<YAML.Document | null>(yamlDocument ?? null);
  yamlDocumentRef.current = yamlDocument || null;

  const focusedStepInfo = useSelector(selectEditorFocusedStepInfo);
  const focusedStepInfoRef = useRef<StepInfo | undefined>(focusedStepInfo);
  focusedStepInfoRef.current = focusedStepInfo;

  const highlightedStepId = useSelector(selectHighlightedStepId);
  const workflowLookup = useSelector(selectEditorWorkflowLookup);
  const workflowLookupRef = useRef(workflowLookup);
  workflowLookupRef.current = workflowLookup;
  const lastRevealedHighlightedStepIdRef = useRef<string | undefined>(undefined);

  // Data
  const connectorsData = useAvailableConnectors();

  // Styles
  const styles = useWorkflowEditorStyles();
  const [positionStyles, setPositionStyles] = useState<{ top: string; right: string } | null>(null);
  const { styles: stepExecutionStyles } = useStepDecorationsInExecution(editorRef.current);

  useWorkflowsMonacoTheme();
  useDynamicTypeIcons(connectorsData);

  // Only show debug features in development
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // Lifecycle
  const [isEditorMounted, setIsEditorMounted] = useState(false);

  // Initialize monkey-patch to intercept monaco-yaml's provider BEFORE it loads
  useEffect(() => {
    interceptMonacoYamlProvider();
    interceptMonacoYamlHoverProvider();
  }, []);

  // Validation
  const { jsonSchema: workflowJsonSchemaStrict, uri: workflowSchemaUriStrict } =
    useWorkflowJsonSchema({ loose: false });
  const schemas: SchemasSettings[] = useMemo(() => {
    if (!workflowSchemaUriStrict || !workflowJsonSchemaStrict) {
      return [];
    }
    return [
      {
        fileMatch: ['*'],
        // casting here because zod-to-json-schema returns a more complex type than JSONSchema7 expected by monaco-yaml
        schema: workflowJsonSchemaStrict as SchemasSettings['schema'],
        uri: workflowSchemaUriStrict,
      },
    ];
  }, [workflowJsonSchemaStrict, workflowSchemaUriStrict]);

  const {
    error: errorValidating,
    isLoading: isLoadingValidation,
    validationResults: customValidationResults,
  } = useYamlValidation(editorRef.current);

  const {
    validationErrors: interceptorValidationErrors,
    transformMonacoMarkers,
    handleMarkersChanged,
  } = useMonacoMarkersChangedInterceptor({
    yamlDocumentRef,
    workflowYamlSchema: workflowYamlSchema as z.ZodSchema,
  });

  const transformMonacoMarkersRef = useRef(transformMonacoMarkers);
  transformMonacoMarkersRef.current = transformMonacoMarkers;
  const handleMarkersChangedRef = useRef(handleMarkersChanged);
  handleMarkersChangedRef.current = handleMarkersChanged;

  // Custom validations from the hook are the source of truth; add Monaco YAML schema errors from the interceptor
  const validationErrors = useMemo(
    () => [
      ...customValidationResults,
      ...(interceptorValidationErrors?.filter((e) => e.owner === 'yaml') ?? []),
    ],
    [customValidationResults, interceptorValidationErrors]
  );

  // Sync validation error state to Redux so sibling components (e.g. header toggle) can react
  useEffect(() => {
    const hasErrors = validationErrors.some((e) => e.severity === 'error');
    dispatch(setHasYamlSchemaValidationErrors(hasErrors));
  }, [validationErrors, dispatch]);

  // Agent Builder integration for AI-assisted editing
  const { openAgentChat, isAgentBuilderAvailable } = useAgentBuilderIntegration({
    editorRef,
    isEditorMounted,
    workflowId: workflow?.id,
    workflowName: workflow?.name ?? workflowDefinition?.name,
    validationErrors,
  });

  const handleErrorClick = useCallback((error: YamlValidationResult) => {
    if (!editorRef.current) {
      return;
    }
    navigateToErrorPosition(editorRef.current, error.startLineNumber, error.startColumn);
  }, []);

  useEffect(() => {
    if (!isEditorMounted) {
      return;
    }

    const disposeListener = editorRef.current?.onDidScrollChange(
      throttle(() => {
        if (!focusedStepInfoRef.current || !editorRef.current) {
          return;
        }

        updateContainerPosition(focusedStepInfoRef.current, editorRef.current);
      }, 50)
    );
    return () => disposeListener?.dispose();
  }, [isEditorMounted]);

  const { registerKeyboardCommands, unregisterKeyboardCommands } = useRegisterKeyboardCommands();
  const { registerHoverCommands, unregisterHoverCommands } = useRegisterHoverCommands();

  // handlers for the keyboard commands, passed only the first time the component is mounted
  // they should not have any dependencies, so they are not affected by the changes in the component
  const keyboardHandlers = useMemo(
    () => ({
      save: () => {
        if (isSavingRef.current || isReadOnlyYamlRef.current) {
          return;
        }
        saveYaml();
      },
      run: () => dispatch(setIsTestModalOpen(true)),
      saveAndRun: () => {
        if (isSavingRef.current || isReadOnlyYamlRef.current) {
          return;
        }
        saveYaml().then(() => dispatch(setIsTestModalOpen(true)));
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const completionProvider = useWorkflowYamlCompletionProvider();

  const handleEditorDidMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      editorRef.current = editor;
      // Sync with parent ref
      parentEditorRef.current = editor;

      registerKeyboardCommands({ editor, openActionsPopover, ...keyboardHandlers });
      registerHoverCommands();

      if (completionProvider) {
        const disposable = monaco.languages.registerCompletionItemProvider(
          YAML_LANG_ID,
          completionProvider
        );
        disposablesRef.current.push(disposable);
      }

      // Listen to content changes to detect typing
      const model = editor.getModel();
      if (!model) {
        return;
      }

      // If no model, just set the mounted state
      setTimeout(() => {
        setIsEditorMounted(true);
      }, 0);

      // Setup Elasticsearch step providers if we have the required services
      if (http && notifications) {
        // Register Elasticsearch connector handler
        const elasticsearchHandler = new ElasticsearchMonacoConnectorHandler({
          http,
          notifications,
        });
        registerMonacoConnectorHandler(elasticsearchHandler);

        // Register Kibana connector handler
        const kibanaHandler = new KibanaMonacoConnectorHandler({
          http,
          notifications,
          kibanaHost: window.location.origin,
        });
        registerMonacoConnectorHandler(kibanaHandler);

        const workflowExecuteHandler = new WorkflowExecuteMonacoConnectorHandler();
        registerMonacoConnectorHandler(workflowExecuteHandler);

        const flowControlHandler = new FlowControlMonacoStepHandler();
        registerMonacoConnectorHandler(flowControlHandler);

        const customHandler = new CustomMonacoStepHandler();
        registerMonacoConnectorHandler(customHandler);

        const genericHandler = new GenericMonacoConnectorHandler();
        registerMonacoConnectorHandler(genericHandler);

        const httpHandler = new HttpMonacoConnectorStepHandler();
        registerMonacoConnectorHandler(httpHandler);

        // Create unified providers with template expression support
        const providerConfig = {
          getYamlDocument: () => yamlDocumentRef.current || null,
          getExecutionContext: () => executionContextRef.current,
          fetchStepExecutionData: (stepId: string) => fetchStepExecutionDataRef.current(stepId),
          options: {
            http,
            notifications,
            esHost: 'http://localhost:9200',
            kibanaHost: window.location.origin,
          },
        };

        // Register the unified hover provider for API documentation and template expressions
        const hoverDisposable = registerUnifiedHoverProvider(providerConfig);
        disposablesRef.current.push(hoverDisposable);

        // Register go-to-definition for step/consts/inputs/variables/foreach references (Cmd+Click)
        const definitionDisposable = registerWorkflowDefinitionProvider({
          getWorkflowLookup: () => workflowLookupRef.current,
          getYamlDocument: () => yamlDocumentRef.current,
        });
        disposablesRef.current.push(definitionDisposable);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleEditorWillUnmount = useCallback(() => {
    unregisterKeyboardCommands();
    unregisterHoverCommands();
  }, [unregisterKeyboardCommands, unregisterHoverCommands]);

  // Clean up the monaco model and editor on unmount
  useEffect(() => {
    return () => {
      // Dispose of Monaco providers
      disposablesRef.current.forEach((disposable) => disposable.dispose());
      disposablesRef.current = [];

      // Clear parent ref
      parentEditorRef.current = null;
      editorRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusedStepDecoration(editorRef.current);

  // Decorations
  useTriggerTypeDecorations({
    editor: editorRef.current,
    yamlDocument: yamlDocument || null,
    isEditorMounted,
  });

  useConnectorTypeDecorations({
    editor: editorRef.current,
    yamlDocument: yamlDocument || null,
    isEditorMounted,
  });

  useLineDifferencesDecorations({
    editor: editorRef.current,
    isEditorMounted,
    highlightDiff,
    originalValue,
    currentValue: workflowYaml,
  });

  useAlertTriggerDecorations({
    editor: editorRef.current,
    yamlDocument: yamlDocument || null,
    isEditorMounted,
    readOnly: isReadOnlyYaml,
  });

  useWorkflowEventsOnDecorations({
    editor: editorRef.current,
    yamlDocument: yamlDocument || null,
    yamlLineCounter,
    isEditorMounted,
    readOnly: isReadOnlyYaml,
  });

  useWorkflowIdDecorations({
    editor: editorRef.current,
    yamlDocument: yamlDocument || null,
    isEditorMounted,
  });

  const updateContainerPosition = (
    stepInfo: StepInfo,
    _editor: monaco.editor.IStandaloneCodeEditor
  ) => {
    if (!_editor || !stepInfo) {
      return;
    }

    setPositionStyles({
      top: `${_editor.getTopForLineNumber(stepInfo.lineStart, true) - _editor.getScrollTop()}px`,
      right: '0px',
    });
  };

  useEffect(() => {
    if (!focusedStepInfo || !editorRef.current) {
      return;
    }
    updateContainerPosition(focusedStepInfo, editorRef.current);
  }, [isEditorMounted, focusedStepInfo]);

  useEffect(() => {
    if (!isEditorMounted) {
      return;
    }

    const disposable = editorRef.current?.onDidChangeCursorPosition((event) => {
      dispatch(
        setCursorPosition({
          lineNumber: event.position.lineNumber,
          column: event.position.column,
        })
      );
    });

    return () => disposable?.dispose();
  }, [isEditorMounted, dispatch]);

  // Scroll editor to highlighted step when selected from execution flyout.
  // Do not re-scroll on workflow lookup updates; editing can change line numbers
  // while a step remains highlighted for reference.
  useEffect(() => {
    if (!highlightedStepId) {
      lastRevealedHighlightedStepIdRef.current = undefined;
      return;
    }
    if (!isEditorMounted) {
      return;
    }
    if (lastRevealedHighlightedStepIdRef.current === highlightedStepId) {
      return;
    }
    const currentWorkflowLookup = workflowLookupRef.current;
    if (!currentWorkflowLookup) {
      return;
    }

    const lineStart =
      highlightedStepId === HIGHLIGHTED_STEP_TRIGGER
        ? currentWorkflowLookup.triggersLineStart
        : currentWorkflowLookup.steps[highlightedStepId]?.lineStart;
    if (lineStart != null) {
      editorRef.current?.revealLineInCenter(lineStart);
      lastRevealedHighlightedStepIdRef.current = highlightedStepId;
    }
  }, [isEditorMounted, highlightedStepId]);

  // Actions
  const [actionsPopoverOpen, setActionsPopoverOpen] = useState(false);
  const openActionsPopover = useCallback(() => {
    if (isReadOnlyYamlRef.current) {
      return;
    }
    setActionsPopoverOpen(true);
  }, []);
  const closeActionsPopover = useCallback(() => {
    setActionsPopoverOpen(false);
  }, []);
  const onActionSelected = useCallback(
    (action: ActionOptionData) => {
      if (isReadOnlyYaml) {
        return;
      }
      const model = editorRef.current?.getModel();
      const yamlDocumentCurrent = yamlDocumentRef.current;
      const cursorPosition = editorRef.current?.getPosition();
      const editor = editorRef.current;
      if (!model || !editor) {
        return;
      }
      if (isTriggerType(action.id) || triggerSchemas.isRegisteredTriggerId(action.id)) {
        const triggerDefinition = triggerSchemas.getTriggerDefinition(action.id);
        insertTriggerSnippet(
          model,
          yamlDocumentCurrent,
          action.id,
          editor,
          triggerDefinition?.snippets?.condition
        );
      } else {
        insertStepSnippet(model, yamlDocumentCurrent, action.id, cursorPosition, editor);
      }
      closeActionsPopover();
    },
    [closeActionsPopover, isReadOnlyYaml]
  );

  const editorCommands: EditorCommand[] = useMemo(
    () => [
      {
        id: 'foldAll',
        label: i18n.translate('workflows.yamlEditor.commands.collapseAll', {
          defaultMessage: 'Collapse all',
        }),
        iconType: 'minusInCircle',
      },
      {
        id: 'unfoldAll',
        label: i18n.translate('workflows.yamlEditor.commands.expandAll', {
          defaultMessage: 'Expand all',
        }),
        iconType: 'plusInCircle',
      },
      {
        id: 'find',
        label: i18n.translate('workflows.yamlEditor.commands.findReplace', {
          defaultMessage: 'Find and Replace',
        }),
        iconType: 'search',
      },
    ],
    []
  );

  const jumpToStepEntries: JumpToStepEntry[] = useMemo(() => {
    if (!workflowLookup) return [];
    return Object.entries(workflowLookup.steps).map(([stepId, stepInfo]) => ({
      id: stepId,
      label: `#${stepId}`,
      lineStart: stepInfo.lineStart,
    }));
  }, [workflowLookup]);

  const handleCommandSelected = useCallback(
    (commandId: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      switch (commandId) {
        case 'foldAll':
          editor.trigger('actionsMenu', 'editor.foldAll', null);
          break;
        case 'unfoldAll':
          editor.trigger('actionsMenu', 'editor.unfoldAll', null);
          break;
        case 'find':
          editor.trigger('actionsMenu', 'editor.action.startFindReplaceAction', null);
          break;
      }
      closeActionsPopover();
      editor.focus();
    },
    [closeActionsPopover]
  );

  const handleJumpToStep = useCallback(
    (lineNumber: number) => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.revealLineInCenter(lineNumber);
      editor.setPosition({ lineNumber, column: 1 });
      closeActionsPopover();
      editor.focus();
    },
    [closeActionsPopover]
  );

  const options = useMemo(() => {
    return { ...editorOptions, readOnly: isReadOnlyYaml };
  }, [isReadOnlyYaml]);

  useEffect(() => {
    // Patch setModelMarkers to set initial markers (monaco-react#70) and to intercept/format
    // validation messages. Effect has empty deps and uses refs for callbacks so it never
    // re-runs; re-running would briefly restore the original and drop validation markers.
    const setModelMarkers = monaco.editor.setModelMarkers;
    monaco.editor.setModelMarkers = function (model, owner, markers) {
      const editorUri = editorRef.current?.getModel()?.uri;
      if (model.uri.path !== editorUri?.path) {
        setModelMarkers.call(monaco.editor, model, owner, markers);
        return;
      }
      const transformedMarkers = transformMonacoMarkersRef.current(model, owner, markers);
      setModelMarkers.call(monaco.editor, model, owner, transformedMarkers);
      handleMarkersChangedRef.current(model, owner, transformedMarkers);
    };

    return () => {
      monaco.editor.setModelMarkers = setModelMarkers;
    };
  }, []);

  // Debug
  const downloadSchema = useCallback(() => {
    try {
      const blob = new Blob([JSON.stringify(workflowJsonSchemaStrict, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'workflow-schema.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      // to download schema:', error);
      notifications?.toasts.addError(error as Error, {
        title: 'Failed to download schema',
      });
    }
  }, [workflowJsonSchemaStrict, notifications]);

  const extraActions = useMemo<ExtraAction[]>(
    () => [
      {
        id: 'actions-menu',
        content: <ActionsMenuButton onClick={openActionsPopover} />,
        showInReadOnly: false,
      },
      {
        id: 'keyboard-shortcuts',
        content: <KeyboardShortcutsPopover />,
        showInReadOnly: true,
      },
      {
        id: 'editor-settings',
        content: <EditorSettingsPopover editorRef={editorRef} />,
        showInReadOnly: true,
      },
    ],
    [openActionsPopover, editorRef]
  );

  // These were triggering rerendering of the actions containers on every scroll, because they were
  // being re-created on every render. Memoizing them prevents unnecessary child re-renders.
  const extraActionElement = useMemo(
    () => <ExtraActionsBar actions={extraActions} isReadOnly={isReadOnlyYaml} />,
    [extraActions, isReadOnlyYaml]
  );

  const actionsMenuPanelProps = useMemo(() => {
    return {
      Button: <EuiButton iconType="plusCircle" css={styles.hiddenButtonCss} />,
      css: { css: styles.actionsMenuPopoverPanel },
    };
  }, [styles.actionsMenuPopoverPanel, styles.hiddenButtonCss]);

  const editorWrapperCss = useMemo(
    () => css([styles.container, stepExecutionStyles]),
    [styles.container, stepExecutionStyles]
  );

  return (
    <div css={editorWrapperCss} ref={containerRef}>
      <GlobalWorkflowEditorStyles />
      <ActionsMenuPopover
        anchorPosition="upCenter"
        offset={32}
        button={actionsMenuPanelProps.Button}
        container={containerRef.current ?? undefined}
        closePopover={closeActionsPopover}
        onActionSelected={onActionSelected}
        isOpen={actionsPopoverOpen}
        panelProps={actionsMenuPanelProps.css}
        commands={editorCommands}
        jumpToStepEntries={jumpToStepEntries}
        onCommandSelected={handleCommandSelected}
        onJumpToStep={handleJumpToStep}
      />
      <UnsavedChangesPrompt hasUnsavedChanges={hasChanges} shouldPromptOnNavigation={true} />
      {/* Floating Elasticsearch step actions */}
      <div
        css={styles.stepActionsContainer}
        style={positionStyles ?? {}}
        data-test-subj={`workflowStepActionsContainer-${focusedStepInfo?.stepId}`}
      >
        <StepActions onStepRun={onStepRun} />
      </div>
      {(isAgentBuilderAvailable || isDevelopment) && !isReadOnlyYaml ? (
        <div css={styles.agentBuilderSectionCss}>
          <WorkflowYamlEditorAssistActions
            isAgentBuilderAvailable={isAgentBuilderAvailable}
            isDevelopment={isDevelopment}
            workflowJsonSchema={
              (workflowJsonSchemaStrict ?? null) as SchemasSettings['schema'] | null
            }
            onOpenAgentChat={openAgentChat}
            onDownloadSchema={downloadSchema}
          />
        </div>
      ) : null}
      <div
        css={styles.editorContainer}
        className={classnames({ [EXECUTION_YAML_SNAPSHOT_CLASS]: isExecutionYaml })}
      >
        <YamlEditor
          editorDidMount={handleEditorDidMount}
          editorWillUnmount={handleEditorWillUnmount}
          onChange={onChange}
          onSyncStateChange={onSyncStateChange}
          options={options}
          schemas={schemas}
          value={workflowYaml}
          enableFindAction={true}
          dataTestSubj="workflowYamlEditor"
        />
      </div>
      <div css={styles.validationErrorsContainer}>
        <WorkflowYamlValidationAccordion
          isMounted={isEditorMounted}
          isLoading={isLoadingValidation}
          error={errorValidating}
          validationErrors={validationErrors}
          onErrorClick={handleErrorClick}
          extraAction={extraActionElement}
        />
      </div>
    </div>
  );
};

const WorkflowYamlEditorAssistActions = React.memo(function WorkflowYamlEditorAssistActions({
  isAgentBuilderAvailable,
  isDevelopment,
  workflowJsonSchema,
  onOpenAgentChat,
  onDownloadSchema,
}: {
  isAgentBuilderAvailable: boolean;
  isDevelopment: boolean;
  workflowJsonSchema: SchemasSettings['schema'] | null;
  onOpenAgentChat: () => void;
  onDownloadSchema: () => void;
}) {
  const styles = useWorkflowEditorStyles();
  return (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      {isAgentBuilderAvailable && (
        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={
              <FormattedMessage
                id="workflows.yamlEditor.aiAgentTooltip"
                defaultMessage="Ask AI to help edit this workflow"
              />
            }
          >
            <EuiButtonEmpty
              iconType="sparkles"
              size="xs"
              aria-label="Open AI Agent"
              onClick={onOpenAgentChat}
              data-test-subj="workflowYamlEditorAiAgentButton"
            >
              <FormattedMessage
                id="workflows.yamlEditor.aiAgentButtonLabel"
                defaultMessage="AI Agent"
              />
            </EuiButtonEmpty>
          </EuiToolTip>
        </EuiFlexItem>
      )}
      {isDevelopment && (
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            css={styles.downloadSchemaButton}
            iconType={workflowJsonSchema === null ? 'warning' : 'download'}
            size="xs"
            aria-label="Download JSON schema for debugging"
            onClick={onDownloadSchema}
            tabIndex={0}
            disabled={workflowJsonSchema === null}
            onKeyDown={(e: React.KeyboardEvent<HTMLButtonElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.currentTarget.click();
              }
            }}
          >
            <FormattedMessage
              id="workflows.yamlEditor.downloadSchemaButtonLabel"
              defaultMessage="JSON Schema"
            />
          </EuiButtonEmpty>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
});
