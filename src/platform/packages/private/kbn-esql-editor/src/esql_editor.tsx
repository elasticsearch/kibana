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
  EuiDatePicker,
  EuiFlexGroup,
  EuiFlexItem,
  useEuiTheme,
  useGeneratedHtmlId,
  type EuiButtonColor,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { isEqual } from 'lodash';
import { EMPTY } from 'rxjs';
import { Global, css } from '@emotion/react';
import { fixESQLQueryWithVariables } from '@kbn/esql-utils';
import { CodeEditor } from '@kbn/code-editor';
import type { AggregateQuery } from '@kbn/es-query';
import type { ESQLTelemetryCallbacks, ESQLRegistrySolutionId } from '@kbn/esql-types';
import { ESQL_CLASSIC_SOLUTION_ID } from '@kbn/esql-types';
import { FavoritesClient } from '@kbn/content-management-favorites-public';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { ESQL_LANG_ID, monaco } from '@kbn/code-editor';
import { DataSourceBrowser } from '@kbn/esql-resource-browser';
import { FieldsBrowser } from '@kbn/esql-resource-browser';
import { useStableCallback } from '@kbn/react-hooks';
import type { ComponentProps } from 'react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createPortal } from 'react-dom';
import useObservable from 'react-use/lib/useObservable';
import { QuerySource } from '@kbn/esql-types';
import { isMac } from '@kbn/shared-ux-utility';
import { useLookupIndexCommand } from './lookup_join';
import { useCommentToEsql, useGhostLineHint } from './comment_to_esql';
import { useSuggestFix } from './suggest_fix/use_suggest_fix';
import { useEditorAiStyle } from './editor_ai.styles';
import { useFieldsBrowser } from './resource_browser/use_fields_browser';
import { EditorFooter } from './editor_footer';
import { QuickSearchVisor } from './editor_visor';
import { ESQLMenu } from './editor_menu';
import { getTrimmedQuery } from './history_local_storage';
import { useEsqlEditorActions } from './hooks/use_esql_editor_actions';
import { useNlToEsqlCheck } from './hooks/use_nl_to_esql_check';
import {
  EDITOR_INITIAL_HEIGHT,
  EDITOR_INITIAL_HEIGHT_INLINE_EDITING,
  EDITOR_MAX_HEIGHT,
  RESIZABLE_CONTAINER_INITIAL_HEIGHT,
  esqlEditorStyles,
} from './esql_editor.styles';
import { ESQLEditorTelemetryService } from './telemetry/telemetry_service';
import { useEsqlEditorActionsRegistration } from './editor_actions_context';
import {
  getEditorOverwrites,
  shouldAutoTriggerSuggestions,
  trackSuggestionPopupState,
  onKeyDownResizeHandler,
  onMouseDownResizeHandler,
  isCodeActionMenuVisible,
} from './helpers';
import {
  useInitLatencyTracking,
  useInputLatencyTracking,
  useSuggestionsLatencyTracking,
  useValidationLatencyTracking,
} from './hooks/use_latency_tracking';
import { ResizableButton } from './resizable_button';
import { useRestorableState, withRestorableState } from './restorable_state';
import {
  EsqlStarredQueriesService,
  type StarredQueryMetadata,
} from './editor_footer/esql_starred_queries_service';
import type { ESQLEditorDeps, ESQLEditorProps as ESQLEditorPropsInternal } from './types';
import {
  EsqlEditorActionsProvider,
  useHasEsqlEditorActionsProvider,
} from './editor_actions_context';
import {
  registerCustomCommands,
  addEditorKeyBindings,
  addTabKeybindingRules,
} from './custom_editor_commands';
import { useEsqlCallbacks } from './hooks/use_esql_callbacks';
import { useMemoizedCaches } from './hooks/use_memoized_caches';
import { useQueryActions } from './hooks/use_query_actions';
import { useQueryValidation } from './hooks/use_query_validation';
import { useEditorConfig } from './hooks/use_editor_config';
import { useTimePickerPopover } from './hooks/use_time_picker_popover';
import { useDataSourceBrowser } from './resource_browser/use_data_source_browser';
import { useSourcesBadge } from './resource_browser/use_resource_browser_badge';

const BREAKPOINT_WIDTH = 540;

// React.memo is applied inside the withRestorableState HOC (called below)
const ESQLEditorInternal = function ESQLEditor({
  query,
  onTextLangQueryChange,
  onTextLangQuerySubmit,
  errors: serverErrors,
  warning: serverWarning,
  isLoading,
  isDisabled,
  hideRunQueryButton,
  editorIsInline,
  disableSubmitAction,
  dataTestSubj,
  allowQueryCancellation,
  hideQueryHistory,
  hasOutline,
  displayDocumentationAsFlyout,
  disableAutoFocus,
  controlsContext,
  esqlVariables,
  onOpenQueryInNewTab,
  expandToFitQueryOnMount,
  dataErrorsControl,
  mergeExternalMessages,
  hideQuickSearch,
  queryStats,
  enableResourceBrowser = false,
}: ESQLEditorPropsInternal) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const editorModel = useRef<monaco.editor.ITextModel>();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor>();
  const editorModelUriRef = useRef<string | undefined>(undefined);
  const containerRef = useRef<HTMLElement>(null);
  const suppressSuggestionsRef = useRef(false);
  const isSuggestionPopupOpenRef = useRef(false);

  const editorCommandDisposables = useRef(
    new WeakMap<monaco.editor.IStandaloneCodeEditor, monaco.IDisposable[]>()
  );

  const sessionIdRef = useRef<string>(uuidv4());
  const interactionIdRef = useRef(0);

  const {
    openTimePickerPopover,
    popoverPosition,
    setPopoverPosition,
    timePickerDate,
    setTimePickerDate,
    datePickerOpenStatusRef,
  } = useTimePickerPopover({ editorRef, popoverRef });
  const isFirstFocusRef = useRef<boolean>(true);
  const theme = useEuiTheme();
  const kibana = useKibana<ESQLEditorDeps>();
  const {
    application,
    core,
    cps,
    fieldsMetadata,
    uiSettings,
    uiActions,
    data,
    usageCollection,
    kql,
    storage,
  } = kibana.services;

  const favoritesClient = useMemo(
    () =>
      new FavoritesClient<StarredQueryMetadata>('esql_editor', 'esql_query', {
        http: core.http,
        userProfile: core.userProfile,
        usageCollection,
      }),
    [core.http, core.userProfile, usageCollection]
  );

  const pickerProjectRouting = useObservable(cps?.cpsManager?.getProjectRouting$() ?? EMPTY);
  const activeSolutionNavId = useObservable(core.chrome.getActiveSolutionNavId$());
  const activeSolutionId: ESQLRegistrySolutionId =
    (activeSolutionNavId as ESQLRegistrySolutionId) ?? ESQL_CLASSIC_SOLUTION_ID;

  const telemetryService = useMemo(
    () => new ESQLEditorTelemetryService(core.analytics),
    [core.analytics]
  );

  const fixedQuery = useMemo(
    () => fixESQLQueryWithVariables(query.esql, esqlVariables),
    [esqlVariables, query.esql]
  );

  const esqlService = kibana.services?.esql;
  const variablesService = esqlService?.variablesService;
  const histogramBarTarget = uiSettings?.get('histogram:barTarget') ?? 50;
  const [code, setCode] = useState<string>(fixedQuery ?? '');

  // To make server side errors less "sticky", register the query that last errored
  const [lastErroredCode, setLastErroredCode] = useState<string | undefined>(() =>
    serverErrors?.length || serverWarning ? fixedQuery : undefined
  );

  const fixedQueryRef = useRef(fixedQuery);
  fixedQueryRef.current = fixedQuery;
  useEffect(() => {
    if (serverErrors?.length || serverWarning) {
      setLastErroredCode(fixedQueryRef.current);
    } else {
      setLastErroredCode(undefined);
    }
  }, [serverErrors, serverWarning]);

  const [editorHeight, setEditorHeight] = useRestorableState(
    'editorHeight',
    editorIsInline ? EDITOR_INITIAL_HEIGHT_INLINE_EDITING : EDITOR_INITIAL_HEIGHT
  );
  // the resizable container is the container that holds the history component or the inline docs
  // they are never open simultaneously
  const [resizableContainerHeight, setResizableContainerHeight] = useRestorableState(
    'resizableContainerHeight',
    RESIZABLE_CONTAINER_INITIAL_HEIGHT
  );
  const [measuredEditorWidth, setMeasuredEditorWidth] = useState(0);

  const isSpaceReduced = Boolean(editorIsInline) && measuredEditorWidth < BREAKPOINT_WIDTH;

  const [isHistoryOpen, setIsHistoryOpen] = useRestorableState('isHistoryOpen', false);
  const [starredQueriesService, setStarredQueriesService] =
    useState<EsqlStarredQueriesService | null>(null);
  const [isCurrentQueryStarred, setIsCurrentQueryStarred] = useState(false);
  const [isLanguageComponentOpen, setIsLanguageComponentOpen] = useState(false);
  const [isVisorOpen, setIsVisorOpen] = useRestorableState('isVisorOpen', false);

  // Refs for dynamic dependencies that commands need to access
  const esqlVariablesRef = useRef(esqlVariables);
  const controlsContextRef = useRef(controlsContext);
  const isVisorOpenRef = useRef(isVisorOpen);

  const trimmedQuery = useMemo(() => getTrimmedQuery(code ?? ''), [code]);

  useEffect(() => {
    let isMounted = true;
    const initializeStarredQueriesService = async () => {
      const service = await EsqlStarredQueriesService.initialize({
        http: core.http,
        userProfile: core.userProfile,
        usageCollection,
        storage,
      });
      if (isMounted) {
        setStarredQueriesService(service ?? null);
      }
    };

    initializeStarredQueriesService();

    return () => {
      isMounted = false;
    };
  }, [core.http, core.userProfile, storage, usageCollection]);

  useEffect(() => {
    if (!starredQueriesService) {
      setIsCurrentQueryStarred(false);
      return;
    }

    const updateStarredState = () => {
      setIsCurrentQueryStarred(
        Boolean(trimmedQuery) && starredQueriesService.checkIfQueryIsStarred(trimmedQuery)
      );
    };

    updateStarredState();
    const subscription = starredQueriesService.queries$.subscribe(() => {
      updateStarredState();
    });

    return () => subscription.unsubscribe();
  }, [starredQueriesService, trimmedQuery]);

  const onQueryUpdate = useCallback(
    (value: string) => {
      onTextLangQueryChange({ esql: value } as AggregateQuery);
    },
    [onTextLangQueryChange]
  );

  const { onSuggestionsReady, resetSuggestionsTracking } = useSuggestionsLatencyTracking({
    telemetryService,
    sessionIdRef,
    interactionIdRef,
  });

  const { trackInputLatencyOnKeystroke, reportInputLatency } = useInputLatencyTracking({
    telemetryService,
    sessionIdRef,
    interactionIdRef,
  });

  const { trackValidationLatencyStart, trackValidationLatencyEnd, resetValidationTracking } =
    useValidationLatencyTracking({
      telemetryService,
      sessionIdRef,
      interactionIdRef,
    });

  const { reportInitLatency } = useInitLatencyTracking({ telemetryService, sessionIdRef });

  const resetPendingTracking = useCallback(() => {
    resetValidationTracking();
    resetSuggestionsTracking();
  }, [resetValidationTracking, resetSuggestionsTracking]);

  const {
    onQuerySubmit,
    onUpdateAndSubmitQuery,
    onPrettifyQuery,
    onCommentLine,
    queryRunButtonProperties,
    isQueryLoading,
  } = useQueryActions({
    editorRef,
    editorModel,
    isLoading,
    allowQueryCancellation,
    measuredEditorWidth,
    onTextLangQuerySubmit,
    onQueryUpdate,
    telemetryService,
  });

  // Measure keystroke to React commit by waiting for the code state update.
  useEffect(() => {
    reportInputLatency();
  }, [code, reportInputLatency]);

  useEffect(() => {
    if (editorRef.current) {
      if (code !== fixedQuery) {
        setCode(fixedQuery);
      }
    }
  }, [code, fixedQuery]);

  // If variables are passed to the editor, sync them with the variables service.
  // This ensures that the latest variables are always available for suggestions.
  // The "Create control" suggestion is also enabled/disabled here based on the supportsControls flag
  useEffect(() => {
    const variables = variablesService?.esqlVariables;
    if (!isEqual(variables, esqlVariables)) {
      variablesService?.clearVariables();
      esqlVariables?.forEach((variable) => {
        variablesService?.addVariable(variable);
      });
    }
    // Enable or disable suggestions based on whether Create control suggestion is supported
    if (controlsContext?.supportsControls) {
      variablesService?.enableCreateControlSuggestion();
    } else {
      variablesService?.disableCreateControlSuggestion();
    }
  }, [variablesService, controlsContext, esqlVariables]);

  // Update refs used for the custom commands
  useEffect(() => {
    esqlVariablesRef.current = esqlVariables;
    controlsContextRef.current = controlsContext;
    isVisorOpenRef.current = isVisorOpen;
  }, [esqlVariables, controlsContext, isVisorOpen]);

  const triggerSuggestions = useCallback(() => {
    setTimeout(() => {
      if (suppressSuggestionsRef.current) {
        suppressSuggestionsRef.current = false;
        return;
      }

      if (!editorRef.current) {
        return;
      }

      // When the quick fix menu is displayed, it triggers onDidFocusEditorText,
      // calling then this method that makes the popup to close right away.
      // If the quick fix menu is visible, do not trigger suggestions to avoid this issue.
      if (isCodeActionMenuVisible(editorRef.current)) {
        return;
      }

      editorRef.current.trigger(undefined, 'editor.action.triggerSuggest', { auto: true });
    }, 0);
  }, []);

  const maybeTriggerSuggestions = useCallback(() => {
    const { current: editor } = editorRef;
    const { current: model } = editorModel;

    if (!editor || !model || isSuggestionPopupOpenRef.current || !editor.hasTextFocus()) {
      return;
    }

    const position = editor.getPosition();
    if (!position) {
      return;
    }

    const { lineNumber, column } = position;
    const lineContent = model.getLineContent(lineNumber);
    const lineContentBeforeCursor = lineContent.substring(0, column - 1);

    if (shouldAutoTriggerSuggestions(lineContentBeforeCursor)) {
      triggerSuggestions();
    }
  }, [triggerSuggestions]);

  const styles = useMemo(
    () =>
      esqlEditorStyles(theme.euiTheme, editorHeight, Boolean(editorIsInline), Boolean(hasOutline)),
    [theme.euiTheme, editorHeight, editorIsInline, hasOutline]
  );

  const onMouseDownResize = useCallback<typeof onMouseDownResizeHandler>(
    (
      mouseDownEvent,
      firstPanelHeight,
      setFirstPanelHeight,
      secondPanelHeight,
      setSecondPanelHeight
    ) => {
      onMouseDownResizeHandler(
        mouseDownEvent,
        firstPanelHeight,
        setFirstPanelHeight,
        secondPanelHeight,
        setSecondPanelHeight
      );
    },
    []
  );

  const onKeyDownResize = useCallback<typeof onKeyDownResizeHandler>(
    (
      keyDownEvent,
      firstPanelHeight,
      setFirstPanelHeight,
      secondPanelHeight,
      setSecondPanelHeight
    ) => {
      onKeyDownResizeHandler(
        keyDownEvent,
        firstPanelHeight,
        setFirstPanelHeight,
        secondPanelHeight,
        setSecondPanelHeight
      );
    },
    []
  );

  const resizableContainerButton = useMemo(() => {
    return (
      <ResizableButton
        onMouseDownResizeHandler={(mouseDownEvent) =>
          onMouseDownResize(mouseDownEvent, editorHeight, setEditorHeight, undefined, undefined)
        }
        onKeyDownResizeHandler={(keyDownEvent) =>
          onKeyDownResize(keyDownEvent, editorHeight, setEditorHeight, undefined, undefined)
        }
      />
    );
  }, [onMouseDownResize, editorHeight, onKeyDownResize, setEditorHeight]);

  const {
    esqlFieldsCache,
    memoizedFieldsFromESQL,
    dataSourcesCache,
    memoizedSources,
    historyStarredItemsCache,
    memoizedHistoryStarredItems,
    minimalQueryRef,
    getJoinIndicesCallback,
  } = useMemoizedCaches({
    code,
    core,
    favoritesClient,
    pickerProjectRouting,
  });

  const telemetryCallbacks = useMemo<ESQLTelemetryCallbacks>(
    () => ({
      onDecorationHoverShown: (hoverMessage: string) =>
        telemetryService.trackLookupJoinHoverActionShown(hoverMessage),
      onSuggestionsWithCustomCommandShown: (commands) =>
        telemetryService.trackSuggestionsWithCustomCommandShown(commands),
      onSuggestionsReady,
    }),
    [onSuggestionsReady, telemetryService]
  );

  const { editorActions, onClickQueryHistory, onToggleVisor } = useEsqlEditorActions({
    code,
    isHistoryOpen,
    isCurrentQueryStarred,
    onUpdateAndSubmitQuery,
    onVisorClosed: () => editorRef.current?.focus(),
    starredQueriesService,
    trimmedQuery,
    isVisorOpenRef,
    setIsHistoryOpen,
    setIsCurrentQueryStarred,
    setIsVisorOpen,
    trackQueryHistoryOpened: (isOpen) => telemetryService.trackQueryHistoryOpened(isOpen),
  });
  useEsqlEditorActionsRegistration(editorActions);

  // Stable proxies for callbacks captured by long-lived Monaco command closures
  const stableOnQuerySubmit = useStableCallback(onQuerySubmit);
  const stableOnToggleVisor = useStableCallback(onToggleVisor);
  const stableOnPrettifyQuery = useStableCallback(onPrettifyQuery);

  const esqlCallbacks = useEsqlCallbacks({
    core,
    data,
    kql,
    fieldsMetadata,
    esqlService,
    histogramBarTarget,
    activeSolutionId,
    minimalQueryRef,
    dataSourcesCache,
    memoizedSources,
    esqlFieldsCache,
    memoizedFieldsFromESQL,
    historyStarredItemsCache,
    memoizedHistoryStarredItems,
    favoritesClient,
    getJoinIndicesCallback,
    enableResourceBrowser,
  });

  const {
    isDataSourceBrowserOpen,
    setIsDataSourceBrowserOpen,
    browserPopoverPosition: dataSourceBrowserPosition,
    preloadedSources,
    isTimeseries,
    selectedSources,
    openIndicesBrowser,
    handleDataSourceBrowserSelect,
  } = useDataSourceBrowser({
    editorRef,
    editorModel,
    telemetryService,
  });

  const { addSourcesDecorator, sourcesBadgeStyle, sourcesLabelClickHandler } = useSourcesBadge({
    editorRef,
    editorModel,
    openIndicesBrowser,
    suppressSuggestionsRef,
  });

  const isNlToEsqlEnabled = useNlToEsqlCheck();

  // Forward-declared so the comment-to-esql hook can hide an already-visible
  // ghost hint when generation starts; populated below by useGhostLineHint.
  const clearGhostHintRef = useRef<() => void>(() => {});

  const editorAiStyle = useEditorAiStyle();

  const {
    generateFromComment: onGenerateFromComment,
    isReviewActiveRef,
    isGeneratingRef,
  } = useCommentToEsql({
    editorRef,
    editorModel,
    http: core.http,
    notifications: core.notifications,
    isEnabled: isNlToEsqlEnabled,
    clearGhostHintRef,
    telemetryService,
  });

  const onGenerateFromCommentRef = useRef(onGenerateFromComment);
  onGenerateFromCommentRef.current = onGenerateFromComment;

  const { ghostLineHintStyle, setupGhostLineHint } = useGhostLineHint({
    editorRef,
    editorModel,
    isReviewActiveRef,
    isEnabled: isNlToEsqlEnabled,
    isGeneratingRef,
    clearGhostHintRef,
  });

  const {
    isFieldsBrowserOpen,
    setIsFieldsBrowserOpen,
    browserPopoverPosition: fieldsBrowserPosition,
    preloadedFields,
    indexPattern: fieldsBrowserIndexPattern,
    fullQuery,
    openFieldsBrowser,
    handleFieldsBrowserSelect,
  } = useFieldsBrowser({
    editorRef,
    editorModel,
    telemetryService,
  });

  const { editorMessages, editorMessagesRef, onLookupIndexCreate, onNewFieldsAddedToLookupIndex } =
    useQueryValidation({
      code,
      lastErroredCode,
      editorRef,
      editorModel,
      esqlCallbacks,
      serverErrors,
      serverWarning,
      mergeExternalMessages,
      dataErrorsControl,
      isLoading,
      isQueryLoading,
      dataSourcesCache,
      esqlFieldsCache,
      getJoinIndicesCallback,
      onQueryUpdate,
      pickerProjectRouting,
      latencyTracking: {
        trackValidationLatencyStart,
        trackValidationLatencyEnd,
        resetValidationTracking,
      },
    });

  useSuggestFix({
    editorRef,
    editorModel,
    http: core.http,
    notifications: core.notifications,
    isEnabled: isNlToEsqlEnabled,
    telemetryService,
  });

  const { lookupIndexBadgeStyle, addLookupIndicesDecorator } = useLookupIndexCommand(
    editorRef,
    editorModel,
    getJoinIndicesCallback,
    query,
    onLookupIndexCreate,
    onNewFieldsAddedToLookupIndex,
    onOpenQueryInNewTab
  );

  const {
    esqlDepsByModelUri,
    suggestionProvider,
    codeActionsProvider,
    codeEditorHoverProvider,
    signatureProvider,
    inlineCompletionsProvider,
    documentHighlightProvider,
    onErrorClick,
    codeEditorOptions,
    onLayoutChangeRef,
  } = useEditorConfig({
    editorRef,
    editorModel,
    editorModelUriRef,
    editorCommandDisposables,
    esqlCallbacks,
    telemetryCallbacks,
    isSuggestFixEnabled: isNlToEsqlEnabled,
    isDisabled,
    measuredEditorWidth,
    setMeasuredEditorWidth,
    resetPendingTracking,
    editorMessagesRef,
  });

  const htmlId = useGeneratedHtmlId({ prefix: 'esql-editor' });

  const editorPanel = (
    <>
      <Global
        styles={css`
          ${lookupIndexBadgeStyle}
          ${sourcesBadgeStyle}
          ${ghostLineHintStyle}
          ${editorAiStyle}
        `}
      />
      {Boolean(editorIsInline) && !hideRunQueryButton ? (
        <EuiFlexGroup
          gutterSize="none"
          responsive={false}
          justifyContent="spaceBetween"
          alignItems="center"
          css={css`
            padding: ${theme.euiTheme.size.s};
          `}
        >
          <EuiFlexItem grow={false}>
            <EuiButton
              color={queryRunButtonProperties.color as EuiButtonColor}
              onClick={() => onQuerySubmit(QuerySource.MANUAL)}
              size="s"
              isLoading={isLoading && !allowQueryCancellation}
              isDisabled={Boolean(disableSubmitAction && !allowQueryCancellation)}
              data-test-subj="ESQLEditor-run-query-button"
              aria-label={queryRunButtonProperties.label}
            >
              {queryRunButtonProperties.label}
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <ESQLMenu hideHistory={hideQueryHistory} />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : null}
      <EuiFlexGroup
        gutterSize="none"
        css={{
          zIndex: theme.euiTheme.levels.flyout,
          position: 'relative',
        }}
        responsive={false}
        ref={containerRef}
      >
        <div css={styles.resizableContainer}>
          <EuiFlexItem
            data-test-subj={dataTestSubj ?? 'ESQLEditor'}
            className="ESQLEditor"
            css={css`
              max-width: 100%;
              position: relative;
            `}
          >
            <div css={styles.editorContainer}>
              <CodeEditor
                htmlId={htmlId}
                aria-label={i18n.translate('esqlEditor.ariaLabel', {
                  defaultMessage: 'ES|QL editor',
                })}
                languageId={ESQL_LANG_ID}
                classNameCss={getEditorOverwrites(theme)}
                value={code}
                placeholder={
                  isNlToEsqlEnabled
                    ? i18n.translate('esqlEditor.placeholder', {
                        defaultMessage:
                          "Start typing ES|QL, or describe what you're looking for in a // comment, then press {commandKey}+J to generate the query",
                        values: { commandKey: isMac ? '⌘' : 'Ctrl' },
                      })
                    : i18n.translate('esqlEditor.placeholder.basic', {
                        defaultMessage: 'Start typing ES|QL',
                      })
                }
                options={codeEditorOptions}
                width="100%"
                suggestionProvider={suggestionProvider}
                hoverProvider={codeEditorHoverProvider}
                signatureProvider={signatureProvider}
                inlineCompletionsProvider={inlineCompletionsProvider}
                documentHighlightProvider={documentHighlightProvider}
                codeActions={codeActionsProvider}
                onChange={onQueryUpdate}
                editorDidMount={async (editor) => {
                  // Track editor init time once per mount
                  reportInitLatency();

                  editorRef.current = editor;
                  const model = editor.getModel();
                  if (model) {
                    editorModel.current = model;
                    editorModelUriRef.current = model.uri.toString();
                    esqlDepsByModelUri.set(editorModelUriRef.current, {
                      ...esqlCallbacks,
                      telemetry: telemetryCallbacks,
                      isSuggestFixEnabled: isNlToEsqlEnabled,
                      getEditorMessages: () => editorMessagesRef.current,
                    });
                    await addLookupIndicesDecorator();
                    if (enableResourceBrowser) {
                      addSourcesDecorator();
                    }
                  }

                  // Register custom commands
                  const commandDisposables = registerCustomCommands({
                    application,
                    uiActions,
                    telemetryService,
                    editorRef: editorRef as React.RefObject<monaco.editor.IStandaloneCodeEditor>,
                    getCurrentQuery: () =>
                      fixESQLQueryWithVariables(
                        editorRef.current?.getValue() || '',
                        esqlVariablesRef.current
                      ),
                    esqlVariables: esqlVariablesRef,
                    controlsContext: controlsContextRef,
                    openTimePickerPopover,
                    openIndicesBrowser: enableResourceBrowser ? openIndicesBrowser : undefined,
                    openFieldsBrowser: enableResourceBrowser ? openFieldsBrowser : undefined,
                  });

                  // Add editor key bindings
                  addEditorKeyBindings(
                    editor,
                    stableOnQuerySubmit,
                    stableOnToggleVisor,
                    stableOnPrettifyQuery,
                    () => onGenerateFromCommentRef.current()
                  );

                  const ghostHintDisposables = setupGhostLineHint(editor);

                  // Store disposables for cleanup
                  const currentEditor = editorRef.current;
                  if (currentEditor) {
                    if (!editorCommandDisposables.current.has(currentEditor)) {
                      editorCommandDisposables.current.set(currentEditor, [
                        ...commandDisposables,
                        ...ghostHintDisposables,
                      ]);
                    }
                  }

                  // Add Tab keybinding rules for inline suggestions
                  addTabKeybindingRules();

                  const mouseDownDisposable = editor.onMouseDown((e) => {
                    if (datePickerOpenStatusRef.current) {
                      setPopoverPosition({});
                    }
                    if (isVisorOpenRef.current) {
                      setIsVisorOpen(false);
                    }
                    if (enableResourceBrowser) {
                      sourcesLabelClickHandler(e);
                    }
                  });

                  const focusDisposable = editor.onDidFocusEditorText(() => {
                    // Skip triggering suggestions on initial focus to avoid interfering
                    // with editor initialization and automated tests
                    // Also skip when date picker is open to prevent overlap
                    if (!isFirstFocusRef.current && !datePickerOpenStatusRef.current) {
                      triggerSuggestions();
                    }

                    isFirstFocusRef.current = false;
                  });

                  const suggestionPopupDisposable = trackSuggestionPopupState(
                    editor,
                    isSuggestionPopupOpenRef
                  );

                  // on CMD/CTRL + / comment out the entire line
                  editor.addCommand(
                    // eslint-disable-next-line no-bitwise
                    monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash,
                    onCommentLine
                  );

                  setMeasuredEditorWidth(editor.getLayoutInfo().width);
                  if (expandToFitQueryOnMount) {
                    const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
                    const lineCount = editor.getModel()?.getLineCount() || 1;
                    const padding = lineHeight * 1.25; // Extra line at the bottom, plus a bit more to compensate for hidden vertical scrollbars
                    const height = editor.getTopForLineNumber(lineCount + 1) + padding;
                    if (height > editorHeight && height < EDITOR_MAX_HEIGHT) {
                      setEditorHeight(height);
                    } else if (height >= EDITOR_MAX_HEIGHT) {
                      setEditorHeight(EDITOR_MAX_HEIGHT);
                    }
                  }
                  const layoutChangeDisposable = editor.onDidLayoutChange((layoutInfoEvent) => {
                    onLayoutChangeRef.current(layoutInfoEvent);
                  });

                  const modelContentDisposable = editor.onDidChangeModelContent(async () => {
                    trackInputLatencyOnKeystroke(editor.getValue() ?? '');
                    await addLookupIndicesDecorator();
                    if (enableResourceBrowser) {
                      addSourcesDecorator();
                    }
                    maybeTriggerSuggestions();
                  });

                  const listenerDisposables = [
                    mouseDownDisposable,
                    focusDisposable,
                    layoutChangeDisposable,
                    modelContentDisposable,
                    suggestionPopupDisposable,
                  ];
                  editorCommandDisposables.current.get(currentEditor)?.push(...listenerDisposables);

                  // Auto-focus the editor and move the cursor to the end.
                  if (!disableAutoFocus) {
                    editor.focus();
                    editor.setPosition({ column: Infinity, lineNumber: Infinity });
                  }
                }}
              />
            </div>
          </EuiFlexItem>
        </div>
      </EuiFlexGroup>
      {!hideQuickSearch && (
        <QuickSearchVisor
          query={code}
          isInline={Boolean(editorIsInline)}
          isSpaceReduced={Boolean(editorIsInline) || measuredEditorWidth < BREAKPOINT_WIDTH}
          isVisible={isVisorOpen}
          onUpdateAndSubmitQuery={(newQuery) =>
            onUpdateAndSubmitQuery(newQuery, QuerySource.QUICK_SEARCH)
          }
          onToggleVisor={onToggleVisor}
          telemetryService={telemetryService}
        />
      )}
      {(isHistoryOpen || (isLanguageComponentOpen && editorIsInline)) && (
        <ResizableButton
          onMouseDownResizeHandler={(mouseDownEvent) => {
            onMouseDownResize(
              mouseDownEvent,
              editorHeight,
              setEditorHeight,
              resizableContainerHeight,
              setResizableContainerHeight
            );
          }}
          onKeyDownResizeHandler={(keyDownEvent) =>
            onKeyDownResize(
              keyDownEvent,
              editorHeight,
              setEditorHeight,
              resizableContainerHeight,
              setResizableContainerHeight
            )
          }
        />
      )}
      <EditorFooter
        styles={{
          bottomContainer: styles.bottomContainer,
          historyContainer: styles.historyContainer,
        }}
        onUpdateAndSubmitQuery={onUpdateAndSubmitQuery}
        onPrettifyQuery={onPrettifyQuery}
        editorIsInline={editorIsInline}
        isSpaceReduced={isSpaceReduced}
        isHistoryOpen={isHistoryOpen}
        setIsHistoryOpen={onClickQueryHistory}
        isLanguageComponentOpen={isLanguageComponentOpen}
        setIsLanguageComponentOpen={setIsLanguageComponentOpen}
        measuredContainerWidth={measuredEditorWidth}
        resizableContainerButton={resizableContainerButton}
        resizableContainerHeight={resizableContainerHeight}
        displayDocumentationAsFlyout={displayDocumentationAsFlyout}
        dataErrorsControl={dataErrorsControl}
        starredQueriesService={starredQueriesService}
        queryStats={queryStats}
        {...editorMessages}
        onErrorClick={onErrorClick}
      />
      {createPortal(
        Object.keys(popoverPosition).length > 0 && (
          <div
            tabIndex={0}
            style={{
              ...popoverPosition,
              backgroundColor: theme.euiTheme.colors.emptyShade,
              borderRadius: theme.euiTheme.border.radius.small,
              position: 'absolute',
              overflow: 'auto',
              zIndex: theme.euiTheme.levels.modal,
              border: theme.euiTheme.border.thin,
            }}
            ref={popoverRef}
            data-test-subj="ESQLEditor-timepicker-popover"
          >
            <EuiDatePicker
              selected={timePickerDate}
              autoFocus
              onChange={(date) => {
                if (date) {
                  setTimePickerDate(date);
                }
              }}
              onSelect={(date, event) => {
                if (date && event) {
                  const currentCursorPosition = editorRef.current?.getPosition();
                  const lineContent = editorModel.current?.getLineContent(
                    currentCursorPosition?.lineNumber ?? 0
                  );
                  const contentAfterCursor = lineContent?.substring(
                    (currentCursorPosition?.column ?? 0) - 1,
                    lineContent.length + 1
                  );

                  const dateString = `"${date.toISOString()}"`;
                  const addition = `${dateString}${contentAfterCursor}`;

                  editorRef.current?.executeEdits('time', [
                    {
                      range: {
                        startLineNumber: currentCursorPosition?.lineNumber ?? 0,
                        startColumn: currentCursorPosition?.column ?? 0,
                        endLineNumber: currentCursorPosition?.lineNumber ?? 0,
                        endColumn: (currentCursorPosition?.column ?? 0) + addition.length + 1,
                      },
                      text: addition,
                      forceMoveMarkers: true,
                    },
                  ]);

                  setPopoverPosition({});

                  datePickerOpenStatusRef.current = false;

                  // move the cursor past the date we just inserted
                  editorRef.current?.setPosition({
                    lineNumber: currentCursorPosition?.lineNumber ?? 0,
                    column: (currentCursorPosition?.column ?? 0) + dateString.length,
                  });
                  // restore focus to the editor
                  editorRef.current?.focus();
                }
              }}
              inline
              showTimeSelect={true}
              shadow={true}
            />
          </div>
        ),
        document.body
      )}
      {enableResourceBrowser &&
        createPortal(
          <DataSourceBrowser
            isOpen={isDataSourceBrowserOpen}
            isTimeseries={isTimeseries}
            preloadedSources={preloadedSources}
            selectedSources={selectedSources}
            position={dataSourceBrowserPosition}
            onSelect={handleDataSourceBrowserSelect}
            onClose={() => {
              setIsDataSourceBrowserOpen(false);
              suppressSuggestionsRef.current = true;
            }}
            onCloseComplete={() => editorRef.current?.focus()}
          />,
          document.body
        )}
      {enableResourceBrowser &&
        createPortal(
          <FieldsBrowser
            isOpen={isFieldsBrowserOpen}
            preloadedFields={preloadedFields}
            indexPattern={fieldsBrowserIndexPattern}
            fullQuery={fullQuery}
            activeSolutionId={activeSolutionId ?? undefined}
            position={fieldsBrowserPosition}
            onSelect={handleFieldsBrowserSelect}
            onClose={() => {
              setIsFieldsBrowserOpen(false);
              suppressSuggestionsRef.current = true;
            }}
            onCloseComplete={() => editorRef.current?.focus()}
          />,
          document.body
        )}
    </>
  );

  return editorPanel;
};

const ESQLEditorWithState = withRestorableState(ESQLEditorInternal);

export const ESQLEditor = (props: ComponentProps<typeof ESQLEditorWithState>) => {
  const hasProvider = useHasEsqlEditorActionsProvider();

  if (hasProvider) {
    return <ESQLEditorWithState {...props} />;
  }

  return (
    <EsqlEditorActionsProvider>
      <ESQLEditorWithState {...props} />
    </EsqlEditorActionsProvider>
  );
};
export type ESQLEditorProps = ComponentProps<typeof ESQLEditor>;
