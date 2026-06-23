/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { css } from '@emotion/react';
import type { GutterOptions } from 'react-diff-view';
import { EuiCallOut, EuiEmptyPrompt, EuiPanel, EuiSkeletonText, EuiSpacer } from '@elastic/eui';
import { RuleChangeTrackingAction } from '@kbn/alerting-types';
import { stableStringify } from '@kbn/std';
import { SecurityRuleChangeTrackingAction } from '../../../../../common/detection_engine/rule_management/rule_change_tracking';
import type { RuleHistoryItem } from '../../../../../common/api/detection_engine/rule_management';
import {
  extractChangedFieldNames,
  IGNORED_DIFF_FIELDS,
} from '../../utils/extract_changed_field_names';
import { DiffView } from '../../../rule_management/components/rule_details/json_diff/diff_view';
import { reconstructBefore } from './utils';
import * as i18n from './translations';

const EDIT_ACTIONS_REQUIRING_PRIOR_STATE: string[] = [
  RuleChangeTrackingAction.ruleUpdate,
  SecurityRuleChangeTrackingAction.ruleImport,
  SecurityRuleChangeTrackingAction.ruleRevert,
];

interface ChangesPanelProps {
  item: RuleHistoryItem | undefined;
  isLoading?: boolean;
}

export function RuleChangesDiff({ item, isLoading }: ChangesPanelProps): JSX.Element {
  const { oldSource, newSource, numOfChangedFields, noDiffAvailable } = useMemo(() => {
    if (!item) {
      return { oldSource: '', newSource: '', numOfChangedFields: 0, noDiffAvailable: true };
    }

    const hasNoDiff = EDIT_ACTIONS_REQUIRING_PRIOR_STATE.includes(item.action) && !item.old_values;
    const after = Object.fromEntries(
      Object.entries(item.rule).filter(([k]) => !IGNORED_DIFF_FIELDS.has(k))
    );

    // old_values is null for create/install actions — there is no previous state.
    // In that case show the full rule as a pure insertion.
    if (!item.old_values) {
      return {
        oldSource: '',
        newSource: stableStringify(after, { space: 2 }),
        numOfChangedFields: 0,
        noDiffAvailable: hasNoDiff,
      };
    }

    const changedFields = extractChangedFieldNames(item);

    if (changedFields.length === 0) {
      return { oldSource: '', newSource: '', numOfChangedFields: 0, noDiffAvailable: hasNoDiff };
    }

    const before = reconstructBefore(after, item.old_values);

    return {
      oldSource: stableStringify(before, { space: 2 }),
      newSource: stableStringify(after, { space: 2 }),
      numOfChangedFields: changedFields.length,
      noDiffAvailable: hasNoDiff,
    };
  }, [item]);

  if (isLoading) {
    return (
      <EuiPanel hasBorder hasShadow={false} data-test-subj="ruleChangesHistoryDiffLoading">
        <EuiSkeletonText lines={10} size="s" isLoading />
      </EuiPanel>
    );
  }

  if (!item) {
    return (
      <EuiPanel hasBorder hasShadow={false} data-test-subj="ruleChangesHistoryNothingSelected">
        <EuiEmptyPrompt iconType="inspect" title={<h2>{i18n.NOTHING_TO_COMPARE_TITLE}</h2>} />
      </EuiPanel>
    );
  }

  if (item.old_values && numOfChangedFields === 0) {
    return (
      <EuiPanel hasBorder hasShadow={false} data-test-subj="ruleChangesHistoryNoChanges">
        <EuiEmptyPrompt
          iconType="checkInCircleFilled"
          title={<h2>{i18n.NO_VISIBLE_CHANGES_TITLE}</h2>}
        />
      </EuiPanel>
    );
  }

  if (noDiffAvailable) {
    return (
      <>
        <EuiCallOut
          announceOnMount
          color="warning"
          iconType="warning"
          data-test-subj="ruleChangesHistoryNoDiffCallout"
        >
          {i18n.NO_DIFF_AVAILABLE_CALLOUT}
        </EuiCallOut>
        <EuiSpacer size="m" />
        <div css={noInsertionHighlightCss}>
          <DiffView
            viewType="unified"
            oldSource={oldSource}
            newSource={newSource}
            renderGutter={renderLineNumberGutter}
            data-test-subj="ruleChangesHistoryDiff"
          />
        </div>
      </>
    );
  }

  return (
    <EuiPanel hasBorder hasShadow={false}>
      <DiffView
        viewType="unified"
        oldSource={oldSource}
        newSource={newSource}
        renderGutter={renderLineNumberGutter}
        data-test-subj="ruleChangesHistoryDiff"
      />
    </EuiPanel>
  );
}

const noInsertionHighlightCss = css`
  .rule-update-diff-code.diff-code-insert {
    background: transparent;
  }
  .rule-update-diff-gutter.diff-gutter-insert {
    background: transparent;
  }
  .rule-update-diff-code.diff-code-insert .diff-code-edit {
    background: transparent;
  }
`;

function renderLineNumberGutter({ change }: GutterOptions): JSX.Element {
  return <span>{change.type === 'normal' ? change.oldLineNumber : change.lineNumber}</span>;
}
