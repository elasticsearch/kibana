/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiButtonIcon, EuiFlexGroup, EuiFlexItem, EuiToolTip } from '@elastic/eui';
import type { Interpolation, Theme } from '@emotion/react';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import {
  LanguageDocumentationFlyout,
  LanguageDocumentationInline,
} from '@kbn/language-documentation';
import React, { memo, useCallback, useState } from 'react';
import type { MonacoMessage } from '@kbn/code-editor';
import type { QuerySource } from '@kbn/esql-types/src/esql_telemetry_types';
import type { ESQLQueryStats as QueryStats } from '@kbn/esql-types';
import type { DataErrorsControl, ESQLEditorDeps } from '../types';
import type { EsqlStarredQueriesService } from './esql_starred_queries_service';
import { HistoryAndStarredQueriesTabs } from './history_starred_queries';
import { KeyboardShortcuts } from './keyboard_shortcuts';
import { QueryWrapComponent } from './query_wrap_component';
import { ESQLQueryStats } from './query_stats';
import { ErrorsWarningsFooterPopover } from './errors_warnings_popover';

interface EditorFooterProps {
  styles: {
    bottomContainer: Interpolation<Theme>;
    historyContainer: Interpolation<Theme>;
  };
  errors?: MonacoMessage[];
  warnings?: MonacoMessage[];
  onErrorClick: (error: MonacoMessage) => void;
  onUpdateAndSubmitQuery: (newQuery: string, querySource: QuerySource) => void;
  onPrettifyQuery: () => void;
  isHistoryOpen: boolean;
  setIsHistoryOpen: (status: boolean) => void;
  isLanguageComponentOpen: boolean;
  setIsLanguageComponentOpen: (status: boolean) => void;
  measuredContainerWidth: number;
  resizableContainerButton?: JSX.Element;
  resizableContainerHeight: number;
  editorIsInline?: boolean;
  isSpaceReduced?: boolean;
  displayDocumentationAsFlyout?: boolean;
  dataErrorsControl?: DataErrorsControl;
  starredQueriesService: EsqlStarredQueriesService | null;
  queryStats?: QueryStats;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
}

const openDocumentationLabel = i18n.translate('esqlEditor.query.documentationAriaLabel', {
  defaultMessage: 'Open documentation',
});

const enterFullScreenLabel = i18n.translate('esqlEditor.query.enterFullScreenAriaLabel', {
  defaultMessage: 'Full screen',
});

const exitFullScreenLabel = i18n.translate('esqlEditor.query.exitFullScreenAriaLabel', {
  defaultMessage: 'Exit full screen',
});

export const EditorFooter = memo(function EditorFooter({
  styles,
  onUpdateAndSubmitQuery,
  onPrettifyQuery,
  editorIsInline,
  isSpaceReduced,
  resizableContainerButton,
  resizableContainerHeight,
  isHistoryOpen,
  setIsHistoryOpen,
  isLanguageComponentOpen,
  setIsLanguageComponentOpen,
  displayDocumentationAsFlyout,
  measuredContainerWidth,
  errors,
  warnings,
  onErrorClick,
  dataErrorsControl,
  starredQueriesService,
  queryStats,
  isFullScreen,
  onToggleFullScreen,
}: EditorFooterProps) {
  const kibana = useKibana<ESQLEditorDeps>();
  const { docLinks } = kibana.services;

  const [isErrorPopoverOpen, setIsErrorPopoverOpen] = useState(false);
  const [isWarningPopoverOpen, setIsWarningPopoverOpen] = useState(false);

  const toggleLanguageComponent = useCallback(async () => {
    setIsLanguageComponentOpen(!isLanguageComponentOpen);
    setIsHistoryOpen(false);
  }, [isLanguageComponentOpen, setIsHistoryOpen, setIsLanguageComponentOpen]);

  return (
    <EuiFlexGroup
      gutterSize="none"
      responsive={false}
      direction="column"
      css={css`
        width: 100%;
      `}
    >
      <EuiFlexItem grow={false}>
        <EuiFlexGroup
          gutterSize="s"
          justifyContent="spaceBetween"
          data-test-subj="ESQLEditor-footer"
          css={styles.bottomContainer}
          responsive={false}
        >
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="none" responsive={false} alignItems="center">
              {queryStats && <ESQLQueryStats queryStats={queryStats} />}
              {errors && errors.length > 0 && (
                <ErrorsWarningsFooterPopover
                  isPopoverOpen={isErrorPopoverOpen}
                  items={errors}
                  type="error"
                  setIsPopoverOpen={(isOpen) => {
                    if (isOpen) {
                      setIsWarningPopoverOpen(false);
                    }
                    setIsErrorPopoverOpen(isOpen);
                  }}
                  onErrorClick={onErrorClick}
                  dataErrorsControl={dataErrorsControl}
                />
              )}
              {warnings && warnings.length > 0 && (
                <ErrorsWarningsFooterPopover
                  isPopoverOpen={isWarningPopoverOpen}
                  items={warnings}
                  type="warning"
                  setIsPopoverOpen={(isOpen) => {
                    if (isOpen) {
                      setIsErrorPopoverOpen(false);
                    }
                    setIsWarningPopoverOpen(isOpen);
                  }}
                  onErrorClick={onErrorClick}
                />
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="xs" responsive={false} alignItems="center">
              <KeyboardShortcuts />
              <QueryWrapComponent onPrettifyQuery={onPrettifyQuery} />
              {displayDocumentationAsFlyout && (
                <>
                  <EuiToolTip
                    position="top"
                    content={openDocumentationLabel}
                    disableScreenReaderOutput
                  >
                    <EuiButtonIcon
                      iconType="documentation"
                      color="text"
                      data-test-subj="ESQLEditor-documentation"
                      size="xs"
                      onClick={() => toggleLanguageComponent()}
                      aria-label={openDocumentationLabel}
                    />
                  </EuiToolTip>
                  <LanguageDocumentationFlyout
                    searchInDescription
                    linkToDocumentation={docLinks?.links?.query?.queryESQL ?? ''}
                    isHelpMenuOpen={isLanguageComponentOpen}
                    onHelpMenuVisibilityChange={setIsLanguageComponentOpen}
                  />
                </>
              )}
              {onToggleFullScreen && (
                <EuiToolTip
                  position="top"
                  content={isFullScreen ? exitFullScreenLabel : enterFullScreenLabel}
                  disableScreenReaderOutput
                >
                  <EuiButtonIcon
                    iconType={isFullScreen ? 'fullScreenExit' : 'fullScreen'}
                    color="text"
                    data-test-subj="ESQLEditor-toggle-fullscreen"
                    size="xs"
                    onClick={onToggleFullScreen}
                    aria-label={isFullScreen ? exitFullScreenLabel : enterFullScreenLabel}
                  />
                </EuiToolTip>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      {isHistoryOpen && (
        <EuiFlexItem grow={false}>
          <HistoryAndStarredQueriesTabs
            containerCSS={styles.historyContainer}
            onUpdateAndSubmit={onUpdateAndSubmitQuery}
            onClose={() => setIsHistoryOpen(false)}
            containerWidth={measuredContainerWidth}
            height={resizableContainerHeight}
            isSpaceReduced={isSpaceReduced}
            starredQueriesService={starredQueriesService}
          />
        </EuiFlexItem>
      )}
      {isLanguageComponentOpen && editorIsInline && (
        <EuiFlexItem grow={false}>
          <LanguageDocumentationInline searchInDescription height={resizableContainerHeight} />
        </EuiFlexItem>
      )}
      {resizableContainerButton}
    </EuiFlexGroup>
  );
});
