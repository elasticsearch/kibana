/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import React, { Suspense, useRef, useState } from 'react';
import { css } from '@emotion/react';
import type { EuiFlyoutProps } from '@elastic/eui';
import { EuiButtonIcon, EuiFlexGroup, EuiFlexItem, EuiToolTip, useEuiTheme } from '@elastic/eui';
import { isMac } from '@kbn/shared-ux-utility';
import { StardustWrapper } from '@kbn/content-management-favorites-public';
import { useEsqlEditorActions } from '../editor_actions_context';
import { searchPlaceholder } from '../editor_visor';
import { useNlToEsqlCheck } from '../hooks/use_nl_to_esql_check';
import { MagnifySparklesIcon } from './magnify_sparkles_icon';
import {
  addStarredQueryLabel,
  helpLabel,
  hideHistoryLabel,
  searchTooltipLabel,
  searchWithNlTooltipLabel,
  removeStarredQueryLabel,
  showHistoryLabel,
} from './menu_i18n';

const LazyHelpPopover = React.lazy(async () => {
  const module = await import('./help_popover');
  return { default: module.HelpPopover };
});

export function ESQLMenu({
  hideHistory,
  onESQLDocsFlyoutVisibilityChanged,
  docsFlyoutSize,
}: {
  hideHistory?: boolean;
  onESQLDocsFlyoutVisibilityChanged?: (isOpen: boolean) => void;
  /** Size for the docs flyout. Pass a named size when embedding the menu in another flyout. */
  docsFlyoutSize?: EuiFlyoutProps['size'];
} = {}) {
  const editorActions = useEsqlEditorActions();
  const { euiTheme } = useEuiTheme();
  const isNlToEsqlEnabled = useNlToEsqlCheck();
  const commandKey = isMac ? '⌘' : 'Ctrl';
  const visorTooltip = isNlToEsqlEnabled
    ? searchWithNlTooltipLabel(commandKey)
    : searchTooltipLabel(commandKey);
  const onToggleVisor = editorActions?.toggleVisor;
  const onToggleHistory = editorActions?.toggleHistory;
  const onToggleStarredQuery = editorActions?.toggleStarredQuery;
  const historyLabel = editorActions?.isHistoryOpen ? hideHistoryLabel : showHistoryLabel;
  const isStarred = Boolean(editorActions?.isCurrentQueryStarred);
  const starredQueryLabel = isStarred ? removeStarredQueryLabel : addStarredQueryLabel;

  const [showStardust, setShowStardust] = useState(false);
  const wasStarredRef = useRef(isStarred);
  if (isStarred && !wasStarredRef.current) {
    setShowStardust(true);
  } else if (!isStarred && wasStarredRef.current) {
    setShowStardust(false);
  }
  wasStarredRef.current = isStarred;

  return (
    <EuiFlexGroup
      gutterSize="none"
      alignItems="center"
      justifyContent="center"
      responsive={false}
      css={css`
        border-radius: ${euiTheme.border.radius.small};
        border: ${euiTheme.border.thin};
        background: ${euiTheme.colors.emptyShade};
        padding: ${euiTheme.size.xs};
      `}
    >
      <EuiFlexItem grow={false}>
        <EuiToolTip position="top" content={visorTooltip} disableScreenReaderOutput>
          <EuiButtonIcon
            iconType={isNlToEsqlEnabled ? MagnifySparklesIcon : 'magnify'}
            size="xs"
            aria-label={searchPlaceholder}
            onClick={onToggleVisor}
            isDisabled={!onToggleVisor}
            data-test-subj="esql-menu-button"
            color="text"
          />
        </EuiToolTip>
      </EuiFlexItem>
      {!hideHistory && (
        <EuiFlexItem grow={false}>
          <EuiToolTip position="top" content={starredQueryLabel} disableScreenReaderOutput>
            <StardustWrapper active={showStardust}>
              <EuiButtonIcon
                iconType={isStarred ? 'starFill' : 'star'}
                size="xs"
                aria-label={starredQueryLabel}
                className={!isStarred ? 'cm-favorite-button--empty' : ''}
                onClick={onToggleStarredQuery}
                isDisabled={!editorActions?.canToggleStarredQuery}
                data-test-subj="ESQLEditor-toggle-starred-query-icon"
                color="text"
              />
            </StardustWrapper>
          </EuiToolTip>
        </EuiFlexItem>
      )}
      {!hideHistory && (
        <EuiFlexItem grow={false}>
          <EuiToolTip position="top" content={historyLabel} disableScreenReaderOutput>
            <EuiButtonIcon
              iconType="clockCounter"
              size="xs"
              aria-label={historyLabel}
              onClick={(e: React.MouseEvent) => {
                onToggleHistory?.();
                (e.currentTarget as HTMLElement).blur();
              }}
              isDisabled={!onToggleHistory}
              data-test-subj="ESQLEditor-toggle-query-history-icon"
              color="text"
            />
          </EuiToolTip>
        </EuiFlexItem>
      )}
      <EuiFlexItem grow={false}>
        <Suspense
          fallback={
            <EuiToolTip position="top" content={helpLabel} disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="question"
                size="xs"
                aria-label={helpLabel}
                data-test-subj="esql-help-popover-button"
                color="text"
                isDisabled
              />
            </EuiToolTip>
          }
        >
          <LazyHelpPopover
            onESQLDocsFlyoutVisibilityChanged={onESQLDocsFlyoutVisibilityChanged}
            docsFlyoutSize={docsFlyoutSize}
          />
        </Suspense>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
