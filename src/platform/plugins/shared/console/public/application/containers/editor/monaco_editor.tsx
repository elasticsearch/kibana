/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CSSProperties } from 'react';
import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiButtonIcon, EuiToolTip, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { CodeEditor } from '@kbn/code-editor/code_editor';
import type { monaco } from '@kbn/monaco';
import { CONSOLE_LANG_ID, CONSOLE_THEME_ID, ConsoleLang } from '@kbn/monaco';

import { i18n } from '@kbn/i18n';
import { MonacoEditorActionsProvider } from './monaco_editor_actions_provider';
import type { EditorRequest } from './types';
import {
  useSetInitialValue,
  useSetupAutocompletePolling,
  useSetupAutosave,
  useResizeCheckerUtils,
  useKeyboardCommandsUtils,
  useConsoleEsqlCallbacks,
} from './hooks';
import {
  useServicesContext,
  useEditorReadContext,
  useRequestActionContext,
  useEditorActionContext,
} from '../../contexts';
import { ContextMenu } from './components';
import { useSetInputEditor } from '../../hooks';
import { useActionStyles, useHighlightedLinesClassName } from './styles';

const useStyles = () => {
  const { euiTheme } = useEuiTheme();
  const { actions } = useActionStyles();

  return {
    editorActions: css`
      ${actions}
      padding-left: ${euiTheme.size.xs};
      padding-right: ${euiTheme.size.xs};

      // For IE11
      min-width: calc(${euiTheme.size.l} * 2);
    `,
  };
};

export interface EditorProps {
  localStorageValue: string | undefined;
  value: string;
  setValue: (value: string) => void;
  customParsedRequestsProvider?: (model: any) => any;
}

export const MonacoEditor = ({
  localStorageValue,
  value,
  setValue,
  customParsedRequestsProvider,
}: EditorProps) => {
  const context = useServicesContext();
  const {
    services: {
      http,
      notifications,
      settings: settingsService,
      autocompleteInfo,
      data,
      licensing,
      application,
    },
    docLinkVersion,
    config: { defaultEditorContent },
  } = context;
  const { toasts } = notifications;
  const {
    settings,
    restoreRequestFromHistory: requestToRestoreFromHistory,
    fileToImport,
  } = useEditorReadContext();
  const [editorInstance, setEditorInstace] = useState<
    monaco.editor.IStandaloneCodeEditor | undefined
  >();
  const divRef = useRef<HTMLDivElement | null>(null);
  const { setupResizeChecker, destroyResizeChecker } = useResizeCheckerUtils();
  const { registerKeyboardCommands, unregisterKeyboardCommands } = useKeyboardCommandsUtils();

  const dispatch = useRequestActionContext();
  const editorDispatch = useEditorActionContext();
  const actionsProvider = useRef<MonacoEditorActionsProvider | null>(null);
  const [editorActionsCss, setEditorActionsCss] = useState<CSSProperties>({});

  const setInputEditor = useSetInputEditor();
  const styles = useStyles();
  const highlightedLinesClassName = useHighlightedLinesClassName();

  const getRequestsCallback = useCallback(async (): Promise<EditorRequest[]> => {
    const requests = await actionsProvider.current?.getRequests();
    return requests ?? [];
  }, []);

  const getDocumenationLink = useCallback(async () => {
    return actionsProvider.current!.getDocumentationLink(docLinkVersion);
  }, [docLinkVersion]);

  const autoIndentCallback = useCallback(async () => {
    return actionsProvider.current!.autoIndent(context);
  }, [context]);

  const sendRequestsCallback = useCallback(async () => {
    await actionsProvider.current?.sendRequests(dispatch, context);
  }, [dispatch, context]);

  const isKbnRequestSelectedCallback = useCallback(async () => {
    return actionsProvider.current!.isKbnRequestSelected();
  }, []);

  const editorDidMountCallback = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      // Create custom provider if factory function is provided
      const customProvider = customParsedRequestsProvider
        ? customParsedRequestsProvider(editor.getModel())
        : undefined;

      const provider = new MonacoEditorActionsProvider(
        editor,
        setEditorActionsCss,
        highlightedLinesClassName,
        customProvider
      );
      setInputEditor(provider);
      actionsProvider.current = provider;
      setupResizeChecker(divRef.current!, editor);
      setEditorInstace(editor);
    },
    [
      setupResizeChecker,
      setInputEditor,
      setEditorInstace,
      customParsedRequestsProvider,
      highlightedLinesClassName,
    ]
  );

  useEffect(() => {
    if (settings.isKeyboardShortcutsEnabled && editorInstance) {
      registerKeyboardCommands({
        editor: editorInstance,
        sendRequest: sendRequestsCallback,
        autoIndent: async () => await actionsProvider.current?.autoIndent(context),
        getDocumentationLink: getDocumenationLink,
        moveToPreviousRequestEdge: async () =>
          await actionsProvider.current?.moveToPreviousRequestEdge(),
        moveToNextRequestEdge: async () => await actionsProvider.current?.moveToNextRequestEdge(),
      });
    } else {
      unregisterKeyboardCommands();
    }
  }, [
    editorInstance,
    getDocumenationLink,
    sendRequestsCallback,
    registerKeyboardCommands,
    unregisterKeyboardCommands,
    settings.isKeyboardShortcutsEnabled,
    context,
  ]);

  const editorWillUnmountCallback = useCallback(() => {
    destroyResizeChecker();
    unregisterKeyboardCommands();
  }, [destroyResizeChecker, unregisterKeyboardCommands]);

  const esqlCallbacks = useConsoleEsqlCallbacks({ application, http, licensing, data });

  const suggestionProvider = useMemo(
    () => ConsoleLang.getSuggestionProvider?.(esqlCallbacks, actionsProvider),
    [esqlCallbacks]
  );

  useSetInitialValue({ localStorageValue, setValue, toasts, defaultEditorContent });

  useSetupAutocompletePolling({ autocompleteInfo, settingsService });

  useSetupAutosave({ value });

  // Restore the request from history if there is one
  const updateEditor = useCallback(async () => {
    if (requestToRestoreFromHistory) {
      editorDispatch({ type: 'clearRequestToRestore' });
      await actionsProvider.current?.appendRequestToEditor(
        requestToRestoreFromHistory,
        dispatch,
        context
      );
    }

    // Import a request file if one is provided
    if (fileToImport) {
      editorDispatch({ type: 'setFileToImport', payload: null });
      await actionsProvider.current?.importRequestsToEditor(fileToImport);
    }
  }, [fileToImport, requestToRestoreFromHistory, dispatch, context, editorDispatch]);

  useEffect(() => {
    updateEditor();
  }, [updateEditor]);

  return (
    <div
      css={css`
        width: 100%;
        height: 100%;
      `}
      ref={divRef}
      data-test-subj="consoleMonacoEditorContainer"
    >
      <EuiFlexGroup
        css={styles.editorActions}
        id="ConAppEditorActions"
        gutterSize="xs"
        responsive={false}
        style={editorActionsCss}
        justifyContent="center"
        alignItems="center"
      >
        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={i18n.translate('console.monaco.sendRequestButtonTooltipContent', {
              defaultMessage: 'Click to send request',
            })}
          >
            <EuiButtonIcon
              display="fill"
              iconType="play"
              onClick={sendRequestsCallback}
              data-test-subj="sendRequestButton"
              aria-label={i18n.translate('console.monaco.sendRequestButtonTooltipAriaLabel', {
                defaultMessage: 'Click to send request',
              })}
            />
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <ContextMenu
            getRequests={getRequestsCallback}
            getDocumentation={getDocumenationLink}
            autoIndent={autoIndentCallback}
            notifications={notifications}
            getIsKbnRequestSelected={isKbnRequestSelectedCallback}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <CodeEditor
        dataTestSubj={'consoleMonacoEditor'}
        languageId={CONSOLE_LANG_ID}
        value={value}
        onChange={setValue}
        fullWidth={true}
        accessibilityOverlayEnabled={settings.isAccessibilityOverlayEnabled}
        editorDidMount={editorDidMountCallback}
        editorWillUnmount={editorWillUnmountCallback}
        links={true}
        options={{
          fontSize: settings.fontSize,
          wordWrap: settings.wrapMode === true ? 'on' : 'off',
          theme: CONSOLE_THEME_ID,
          // Force the hover views to always render below the cursor to avoid clipping
          // when the cursor is near the top of the editor.
          hover: {
            above: false,
          },
        }}
        suggestionProvider={suggestionProvider}
        enableFindAction={true}
        enableCustomContextMenu={true}
      />
    </div>
  );
};
