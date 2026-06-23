/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CSSProperties, FunctionComponent } from 'react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CodeEditor } from '@kbn/code-editor';
import { css as cssClassName } from '@emotion/css';
import { css } from '@emotion/react';
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import { i18n } from '@kbn/i18n';
import {
  EuiScreenReaderOnly,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButtonIcon,
  EuiToolTip,
  useEuiTheme,
  transparentize,
} from '@elastic/eui';
import type { monaco } from '@kbn/monaco';
import { CONSOLE_OUTPUT_THEME_ID, CONSOLE_OUTPUT_LANG_ID } from '@kbn/monaco';
import {
  getStatusCodeDecorations,
  isJSONContentType,
  isMapboxVectorTile,
  safeExpandLiteralStrings,
  languageForContentType,
  convertMapboxVectorTileToJson,
} from './utils';
import {
  useEditorReadContext,
  useRequestReadContext,
  useServicesContext,
  useOutputFilterReadContext,
} from '../../contexts';
import { applyResponseFilter, isFilterableStatusCode } from '../../lib/apply_response_filter';
import { MonacoEditorOutputActionsProvider } from './monaco_editor_output_actions_provider';
import { useResizeCheckerUtils } from './hooks';
import { useActionStyles, useHighlightedLinesClassName } from './styles';
import type { StatusCodeClassNames } from './types';

const useStyles = () => {
  const { euiTheme } = useEuiTheme();
  const { actions } = useActionStyles();

  return {
    outputActions: css`
      ${actions}

      // For IE11
      min-width: ${euiTheme.size.l};
    `,
  };
};

const useStatusCodeClassNames = (): StatusCodeClassNames => {
  const { euiTheme } = useEuiTheme();

  return useMemo(
    () => ({
      monacoStatusCodeLinePrimary: cssClassName`
        background-color: ${transparentize(euiTheme.colors.primary, 0.1)};
      `,
      monacoStatusCodeLineNumberPrimary: cssClassName`
        background-color: ${transparentize(euiTheme.colors.primary, 0.5)};
      `,
      monacoStatusCodeLineSuccess: cssClassName`
        background-color: ${transparentize(euiTheme.colors.success, 0.1)};
      `,
      monacoStatusCodeLineNumberSuccess: cssClassName`
        background-color: ${transparentize(euiTheme.colors.success, 0.5)};
      `,
      monacoStatusCodeLineDefault: cssClassName`
        background-color: ${transparentize(euiTheme.colors.lightShade, 0.1)};
      `,
      monacoStatusCodeLineNumberDefault: cssClassName`
        background-color: ${transparentize(euiTheme.colors.lightShade, 0.5)};
      `,
      monacoStatusCodeLineWarning: cssClassName`
        background-color: ${transparentize(euiTheme.colors.warning, 0.1)};
      `,
      monacoStatusCodeLineNumberWarning: cssClassName`
        background-color: ${transparentize(euiTheme.colors.warning, 0.5)};
      `,
      monacoStatusCodeLineDanger: cssClassName`
        background-color: ${transparentize(euiTheme.colors.danger, 0.1)};
      `,
      monacoStatusCodeLineNumberDanger: cssClassName`
        background-color: ${transparentize(euiTheme.colors.danger, 0.5)};
      `,
    }),
    [
      euiTheme.colors.primary,
      euiTheme.colors.success,
      euiTheme.colors.lightShade,
      euiTheme.colors.warning,
      euiTheme.colors.danger,
    ]
  );
};

export const MonacoEditorOutput: FunctionComponent = () => {
  const context = useServicesContext();
  const {
    services: { notifications },
  } = context;
  const { settings: readOnlySettings } = useEditorReadContext();
  const {
    lastResult: { data },
  } = useRequestReadContext();
  const [value, setValue] = useState('');
  const [mode, setMode] = useState('text');
  const divRef = useRef<HTMLDivElement | null>(null);
  const { setupResizeChecker, destroyResizeChecker } = useResizeCheckerUtils();
  const monacoEditorOutputStyles = useStyles();
  const statusCodeClassNames = useStatusCodeClassNames();
  const highlightedLinesClassName = useHighlightedLinesClassName();
  const lineDecorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);

  const filterState = useOutputFilterReadContext();
  const actionsProvider = useRef<MonacoEditorOutputActionsProvider | null>(null);
  const [editorActionsCss, setEditorActionsCss] = useState<CSSProperties>({});

  const editorDidMountCallback = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      const provider = new MonacoEditorOutputActionsProvider(
        editor,
        setEditorActionsCss,
        highlightedLinesClassName
      );
      actionsProvider.current = provider;

      setupResizeChecker(divRef.current!, editor);
      lineDecorations.current = editor.createDecorationsCollection();
    },
    [highlightedLinesClassName, setupResizeChecker]
  );

  const editorWillUnmountCallback = useCallback(() => {
    destroyResizeChecker();
  }, [destroyResizeChecker]);

  useEffect(() => {
    // Clean up any existing line decorations
    lineDecorations.current?.clear();
    if (data) {
      const isMultipleRequest = data.length > 1;
      setMode(
        isMultipleRequest
          ? CONSOLE_OUTPUT_LANG_ID
          : languageForContentType(data[0].response.contentType)
      );
      setValue(
        data
          .map((result) => {
            const { value: newValue, contentType } = result.response;

            let editorOutput;
            if (readOnlySettings.tripleQuotes && isJSONContentType(contentType)) {
              editorOutput = safeExpandLiteralStrings(newValue as string);
            } else if (isMapboxVectorTile(contentType)) {
              const vectorTile = new VectorTile(new Protobuf(newValue as ArrayBuffer));
              const vectorTileJson = convertMapboxVectorTileToJson(vectorTile);
              editorOutput = safeExpandLiteralStrings(vectorTileJson as string);
            } else {
              editorOutput = newValue;
            }

            return editorOutput;
          })
          .join('\n')
      );
      if (isMultipleRequest) {
        // If there are multiple responses, add decorations for their status codes
        const decorations = getStatusCodeDecorations(data, statusCodeClassNames);
        lineDecorations.current?.set(decorations);
        // Highlight first line of the output editor
        actionsProvider.current?.selectFirstLine();
      }
    } else {
      setValue('');
    }
  }, [readOnlySettings, data, value, statusCodeClassNames]);

  const displayValue = useMemo(() => {
    const statusCode = data?.length === 1 ? data[0].response.statusCode : undefined;
    if (
      data &&
      statusCode !== undefined &&
      isFilterableStatusCode(statusCode) &&
      filterState.expression
    ) {
      return applyResponseFilter({
        text: value,
        contentType: data[0].response.contentType,
        state: filterState,
      });
    }
    return value;
  }, [value, data, filterState]);

  const copyOutputCallback = useCallback(async () => {
    const selectedText = (await actionsProvider.current?.getParsedOutput()) as string;

    try {
      if (!window.navigator?.clipboard) {
        throw new Error('Could not copy to clipboard!');
      }

      await window.navigator.clipboard.writeText(selectedText);

      notifications.toasts.addSuccess({
        title: i18n.translate('console.outputPanel.copyOutputToast', {
          defaultMessage: 'Selected output copied to clipboard',
        }),
      });
    } catch (e) {
      notifications.toasts.addDanger({
        title: i18n.translate('console.outputPanel.copyOutputToastFailedMessage', {
          defaultMessage: 'Could not copy selected output to clipboard',
        }),
      });
    }
  }, [notifications.toasts]);

  return (
    <div
      css={css`
        width: 100%;
        height: 100%;
      `}
      ref={divRef}
    >
      <EuiFlexGroup
        css={monacoEditorOutputStyles.outputActions}
        responsive={false}
        style={editorActionsCss}
        justifyContent="center"
        alignItems="center"
      >
        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={i18n.translate('console.outputPanel.copyOutputButtonTooltipContent', {
              defaultMessage: 'Click to copy to clipboard',
            })}
          >
            <EuiButtonIcon
              iconType="copy"
              onClick={copyOutputCallback}
              data-test-subj="copyOutputButton"
              aria-label={i18n.translate('console.outputPanel.copyOutputButtonTooltipAriaLabel', {
                defaultMessage: 'Click to copy to clipboard',
              })}
            />
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiScreenReaderOnly>
        <label htmlFor={'ConAppOutputTextarea'}>
          {i18n.translate('console.monaco.outputTextarea', {
            defaultMessage: 'Dev Tools Console output',
          })}
        </label>
      </EuiScreenReaderOnly>
      <CodeEditor
        dataTestSubj={'consoleMonacoOutput'}
        languageId={mode}
        value={displayValue}
        fullWidth={true}
        editorDidMount={editorDidMountCallback}
        editorWillUnmount={editorWillUnmountCallback}
        enableFindAction={true}
        enableCustomContextMenu={true}
        options={{
          readOnly: true,
          fontSize: readOnlySettings.fontSize,
          wordWrap: readOnlySettings.wrapMode === true ? 'on' : 'off',
          theme: CONSOLE_OUTPUT_THEME_ID,
          automaticLayout: true,
        }}
      />
    </div>
  );
};
