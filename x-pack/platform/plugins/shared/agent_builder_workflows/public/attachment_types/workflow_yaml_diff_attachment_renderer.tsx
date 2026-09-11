/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UseEuiTheme } from '@elastic/eui';
import { EuiButtonEmpty, EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';
import { css } from '@emotion/react';
import type { Change } from 'diff';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AttachmentUIDefinition } from '@kbn/agent-builder-browser/attachments';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { i18n } from '@kbn/i18n';
import { monaco } from '@kbn/code-editor';
import {
  computeWorkflowYamlDiffStats,
  useWorkflowsMonacoTheme,
  WORKFLOWS_MONACO_EDITOR_THEME,
  type WorkflowYamlDiffStats,
} from '@kbn/workflows-ui';

interface WorkflowYamlDiffData {
  beforeYaml: string;
  afterYaml: string;
  proposalId: string;
  workflowId?: string;
  name?: string;
}

interface WorkflowYamlDiffAttachment {
  id: string;
  type: string;
  data: WorkflowYamlDiffData;
}

const COLLAPSED_HEIGHT = 200;
const LINE_HEIGHT = 23;
const PADDING = 8;
const HIDDEN_REGION_WIDGET_HEIGHT = 24;

/**
 * Estimates the pixel height Monaco's inline diff editor will occupy
 * after hideUnchangedRegions collapses unchanged hunks.
 *
 * Accepts pre-computed diff parts to avoid redundant `diffLines` calls.
 */
const estimateContentHeight = (
  parts: Change[],
  contextLineCount: number,
  minimumLineCount: number
): number => {
  const lineRanges: Array<{ kind: 'changed' | 'unchanged'; lineCount: number }> = [];
  for (const part of parts) {
    const count = part.count ?? part.value.replace(/\n$/, '').split('\n').length;
    if (part.added || part.removed) {
      const last = lineRanges[lineRanges.length - 1];
      if (last?.kind === 'changed') {
        last.lineCount += count;
      } else {
        lineRanges.push({ kind: 'changed', lineCount: count });
      }
    } else {
      lineRanges.push({ kind: 'unchanged', lineCount: count });
    }
  }

  let visibleLines = 0;
  let hiddenRegions = 0;

  for (let i = 0; i < lineRanges.length; i++) {
    const range = lineRanges[i];
    if (range.kind === 'changed') {
      visibleLines += range.lineCount;
    } else {
      const isFirst = i === 0;
      const isLast = i === lineRanges.length - 1;
      const contextNeeded = isFirst || isLast ? contextLineCount : 2 * contextLineCount;
      const threshold = minimumLineCount + contextNeeded;
      if (range.lineCount >= threshold) {
        hiddenRegions++;
        visibleLines += contextNeeded;
      } else {
        visibleLines += range.lineCount;
      }
    }
  }

  return visibleLines * LINE_HEIGHT + hiddenRegions * HIDDEN_REGION_WIDGET_HEIGHT + PADDING;
};

const MonacoDiffViewer: React.FC<{
  beforeYaml: string;
  afterYaml: string;
  parts: Change[];
}> = ({ beforeYaml, afterYaml, parts }) => {
  const styles = useMemoCss(componentStyles);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IDiffEditor | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  const contextLineCount = 3;
  const minimumLineCount = 3;

  const estimatedHeight = useMemo(
    () => estimateContentHeight(parts, contextLineCount, minimumLineCount),
    [parts]
  );

  const contentHeight = measuredHeight ?? estimatedHeight;
  const collapsedHeight = Math.min(contentHeight, COLLAPSED_HEIGHT);
  const needsExpansion = contentHeight > COLLAPSED_HEIGHT;
  const hiddenLines = Math.max(0, Math.ceil((contentHeight - collapsedHeight) / LINE_HEIGHT));

  const handleFocus = useCallback(() => {
    setIsActive(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsActive(false);
  }, []);

  useWorkflowsMonacoTheme();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const originalModel = monaco.editor.createModel(beforeYaml, 'yaml');
    const modifiedModel = monaco.editor.createModel(afterYaml, 'yaml');

    const diffEditor = monaco.editor.createDiffEditor(container, {
      theme: WORKFLOWS_MONACO_EDITOR_THEME,
      readOnly: true,
      renderSideBySide: false,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: 'off',
      lineNumbersMinChars: 0,
      folding: false,
      glyphMargin: false,
      overviewRulerLanes: 0,
      scrollbar: {
        vertical: 'hidden',
        horizontal: 'hidden',
        handleMouseWheel: false,
      },
      hideUnchangedRegions: {
        enabled: true,
        revealLineCount: 2,
        minimumLineCount,
        contextLineCount,
      },
      renderOverviewRuler: false,
      fontSize: 14,
      lineHeight: LINE_HEIGHT,
      padding: { top: 4, bottom: 4 },
      contextmenu: false,
      domReadOnly: true,
      lightbulb: { enabled: false },
      quickSuggestions: false,
      suggestOnTriggerCharacters: false,
      hover: { enabled: false },
      parameterHints: { enabled: false },
      renderIndicators: false,
      renderMarginRevertIcon: false,
    });

    diffEditor.setModel({ original: originalModel, modified: modifiedModel });

    editorRef.current = diffEditor;

    requestAnimationFrame(() => {
      const scrollable = container.querySelector(
        '.modified-in-monaco-diff-editor .monaco-scrollable-element'
      );
      if (scrollable && scrollable.clientHeight > 0) {
        setMeasuredHeight(scrollable.clientHeight);
      }
    });

    return () => {
      diffEditor.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
      editorRef.current = null;
    };
  }, [beforeYaml, afterYaml, minimumLineCount, contextLineCount]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const enableScroll = isActive && isExpanded;
    editor.updateOptions({
      scrollbar: {
        vertical: enableScroll ? 'auto' : 'hidden',
        horizontal: enableScroll ? 'auto' : 'hidden',
        handleMouseWheel: enableScroll,
      },
    });
  }, [isActive, isExpanded]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      setIsActive(true);
    }
  }, []);

  const handleExpand = useCallback(() => {
    setIsExpanded(true);
    requestAnimationFrame(() => {
      editorRef.current?.getModifiedEditor().layout();
    });
  }, []);

  const handleCollapse = useCallback(() => {
    setIsExpanded(false);
    requestAnimationFrame(() => {
      editorRef.current?.getModifiedEditor().layout();
    });
  }, []);

  return (
    <div css={styles.wrapper}>
      <div style={isExpanded ? undefined : { height: collapsedHeight, overflow: 'hidden' }}>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <div
          ref={containerRef}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="region"
          aria-label="Workflow diff"
          style={{ height: contentHeight, width: '100%' }}
        />
      </div>
      {needsExpansion && (
        <div css={styles.toggleBar}>
          <EuiButtonEmpty
            size="xs"
            color="primary"
            onClick={isExpanded ? handleCollapse : handleExpand}
          >
            {isExpanded
              ? i18n.translate('workflowsManagement.attachmentRenderers.diff.showLess', {
                  defaultMessage: 'Show less',
                })
              : i18n.translate('workflowsManagement.attachmentRenderers.diff.showMore', {
                  defaultMessage:
                    'Show {hiddenLines, plural, one {# more line} other {# more lines}}',
                  values: { hiddenLines },
                })}
          </EuiButtonEmpty>
        </div>
      )}
    </div>
  );
};

const DiffInlineContent: React.FC<{
  attachment: WorkflowYamlDiffAttachment;
}> = ({ attachment }) => {
  const styles = useMemoCss(componentStyles);
  const { beforeYaml, afterYaml, name } = attachment.data;

  const stats: WorkflowYamlDiffStats = useMemo(
    () => computeWorkflowYamlDiffStats(beforeYaml, afterYaml),
    [beforeYaml, afterYaml]
  );
  const { parts, added, removed } = stats;

  const displayName =
    name ??
    i18n.translate('workflowsManagement.attachmentRenderers.diff.defaultName', {
      defaultMessage: 'Workflow',
    });

  if (beforeYaml === afterYaml) {
    return (
      <EuiText size="s" color="subdued" css={styles.noChanges}>
        {i18n.translate('workflowsManagement.attachmentRenderers.diff.noChanges', {
          defaultMessage: 'No changes detected',
        })}
      </EuiText>
    );
  }

  return (
    <div>
      <div css={styles.header}>
        <EuiFlexGroup
          alignItems="center"
          justifyContent="spaceBetween"
          gutterSize="s"
          responsive={false}
        >
          <EuiFlexItem grow={true}>
            <EuiText size="s" css={styles.headerName}>
              <strong>{displayName}</strong>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs">
              <span css={styles.added}>+{added}</span>
              <span css={styles.removed}>−{removed}</span>
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </div>
      <MonacoDiffViewer beforeYaml={beforeYaml} afterYaml={afterYaml} parts={parts} />
    </div>
  );
};

const componentStyles = {
  wrapper: ({ euiTheme }: UseEuiTheme) =>
    css({
      position: 'relative',
      padding: '10px 0',
      backgroundColor: euiTheme.colors.backgroundBaseSubdued,
      '.diff-hidden-lines .center': {
        gap: euiTheme.size.s,
      },
    }),
  toggleBar: ({ euiTheme }: UseEuiTheme) =>
    css({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderTop: euiTheme.border.thin,
      backgroundColor: euiTheme.colors.backgroundBaseSubdued,
      '.euiButtonEmpty': {
        width: '100%',
        height: 40,
        borderRadius: 0,
      },
    }),
  header: ({ euiTheme }: UseEuiTheme) =>
    css({
      padding: `${euiTheme.size.s} ${euiTheme.size.m}`,
      borderBottom: euiTheme.border.thin,
      backgroundColor: euiTheme.colors.backgroundBaseSubdued,
    }),
  headerName: css({
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  added: ({ euiTheme }: UseEuiTheme) =>
    css({
      color: euiTheme.colors.textSuccess,
      fontFamily: euiTheme.font.familyCode,
      marginRight: euiTheme.size.xs,
    }),
  removed: ({ euiTheme }: UseEuiTheme) =>
    css({
      color: euiTheme.colors.textDanger,
      fontFamily: euiTheme.font.familyCode,
    }),
  noChanges: ({ euiTheme }: UseEuiTheme) =>
    css({
      padding: euiTheme.size.s,
    }),
};

export const workflowYamlDiffAttachmentUiDefinition: AttachmentUIDefinition<WorkflowYamlDiffAttachment> =
  {
    getLabel: (attachment) =>
      attachment.data.name
        ? i18n.translate('workflowsManagement.attachmentRenderers.diff.labelWithName', {
            defaultMessage: '{name} changes',
            values: { name: attachment.data.name },
          })
        : i18n.translate('workflowsManagement.attachmentRenderers.diff.label', {
            defaultMessage: 'Workflow changes',
          }),
    getIcon: () => 'compare',
    renderInlineContent: ({ attachment }) => <DiffInlineContent attachment={attachment} />,
  };
