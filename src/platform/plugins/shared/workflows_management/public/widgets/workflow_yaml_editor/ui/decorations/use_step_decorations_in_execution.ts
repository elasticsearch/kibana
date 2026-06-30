/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { transparentize, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { monaco } from '@kbn/monaco';
import {
  selectEditorWorkflowLookup,
  selectHighlightedStepId,
  selectIsExecutionsTab,
  selectStepExecutions,
} from '../../../../entities/workflows/store';

export const useStepDecorationsInExecution = (
  editor: monaco.editor.IStandaloneCodeEditor | null
) => {
  const isExecutionsTab = useSelector(selectIsExecutionsTab);
  const stepExecutions = useSelector(selectStepExecutions);
  const workflowLookup = useSelector(selectEditorWorkflowLookup);
  const highlightedStepId = useSelector(selectHighlightedStepId);
  const decorationsCollection = useMemo(() => {
    if (!editor) {
      return null;
    }
    return editor.createDecorationsCollection();
  }, [editor]);

  useEffect(() => {
    decorationsCollection?.clear();

    // Execution decorations are only meaningful on the read-only executions tab.
    // On the editable workflow tab the editor content diverges from the saved execution
    // (the user may be editing), so painting step-execution colours would be misleading.
    if (!isExecutionsTab || !stepExecutions?.length || !workflowLookup?.steps) {
      return;
    }

    const decorations = stepExecutions.flatMap((stepExecution) => {
      const { stepId, status } = stepExecution;
      const stepInfo = workflowLookup.steps[stepId];

      if (!stepInfo) {
        return [];
      }

      const glyphClassNames = ['step-execution-glyph', `step-execution-${status}-glyph`];
      const bgClassNames = ['step-execution-background', `step-execution-${status}`];

      if (!!highlightedStepId && highlightedStepId !== stepId) {
        glyphClassNames.push('dimmed');
        bgClassNames.push('dimmed');
      }

      // Glyph decoration for status icon - position at the dash line
      const glyphDecoration: monaco.editor.IModelDeltaDecoration = {
        range: new monaco.Range(stepInfo.lineStart, 1, stepInfo.lineStart, 1),
        options: { glyphMarginClassName: glyphClassNames.join(' ') },
      };

      // Only apply background decoration if the step is not nested
      // This prevents overlapped backgrounds (double transparency) when parent and child are both decorated
      const isNested =
        stepInfo.parentStepId &&
        stepExecutions.some((otherStepExecution) => {
          return otherStepExecution.stepId === stepInfo.parentStepId;
        });
      if (isNested) {
        // For nested steps, only show the glyph decoration
        return [glyphDecoration];
      }

      // Background decoration for execution status - from dash line to end of step
      const backgroundDecoration: monaco.editor.IModelDeltaDecoration = {
        range: new monaco.Range(stepInfo.lineStart, 1, stepInfo.lineEnd, 0),
        options: {
          className: bgClassNames.join(' '),
          marginClassName: bgClassNames.join(' '),
          isWholeLine: true,
        },
      };

      return [glyphDecoration, backgroundDecoration];
    });
    decorationsCollection?.set(decorations);
  }, [isExecutionsTab, stepExecutions, decorationsCollection, workflowLookup, highlightedStepId]);

  const { colors } = useEuiTheme().euiTheme;
  const styles = useMemo(
    () =>
      css({
        '.step-execution-skipped': {
          backgroundColor: transparentize(colors.backgroundBaseFormsControlDisabled, 0.5),
        },
        '.step-execution-waiting_for_input': {
          backgroundColor: transparentize(colors.backgroundLightWarning, 0.5),
        },
        '.step-execution-running': {
          backgroundColor: transparentize(colors.backgroundLightPrimary, 0.5),
        },
        '.step-execution-completed': {
          backgroundColor: transparentize(colors.backgroundLightSuccess, 0.5),
        },
        '.step-execution-failed': {
          backgroundColor: transparentize(colors.backgroundLightDanger, 0.5),
        },
        '.step-execution-glyph:before': {
          content: '""',
          display: 'block',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
        },
        '.step-execution-skipped-glyph:before': {
          backgroundColor: colors.backgroundFilledText,
        },
        '.step-execution-waiting_for_input-glyph:before': {
          backgroundColor: colors.backgroundFilledWarning,
        },
        '.step-execution-running-glyph:before': {
          backgroundColor: colors.backgroundFilledPrimary,
        },
        '.step-execution-completed-glyph:before': {
          backgroundColor: colors.vis.euiColorVis0,
        },
        '.step-execution-failed-glyph:before': {
          backgroundColor: colors.danger,
        },
      }),
    [colors]
  );

  return { styles };
};
