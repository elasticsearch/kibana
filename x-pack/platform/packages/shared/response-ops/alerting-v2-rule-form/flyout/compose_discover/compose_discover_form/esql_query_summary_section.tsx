/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiButton,
  EuiButtonIcon,
  EuiCallOut,
  EuiCopy,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { RuleQuery } from '../../../form/types';
import { QuerySummary } from '../query_summary';

/**
 * Read-only summary of the applied ES|QL query on step 1. The heuristic split
 * is no longer shown in the editor (unified create flow) — it is surfaced here,
 * read-only, with copy + an edit CTA. A successful split is a `composed` query
 * (base + alert segment); a base-only query with no alert condition is persisted
 * as `standalone` (the whole query is the breach query, so every row is a breach).
 */
export type EsqlSummaryState =
  | 'before_apply'
  | 'success'
  | 'no_alert_condition'
  | 'split_failed'
  | 'empty';

/**
 * Derives the summary state from the committed query. Callout priority is
 * encoded by the branch order: empty → split failed → no alert condition.
 */
export const getEsqlSummaryState = (
  queryCommitted: boolean,
  query: RuleQuery
): EsqlSummaryState => {
  if (!queryCommitted) return 'before_apply';

  // A standalone alert query has no separate alert condition — every row is a breach.
  if (query.format === 'standalone') {
    return query.breach.query.trim().length > 0 ? 'no_alert_condition' : 'empty';
  }

  const hasBase = query.base.trim().length > 0;
  const hasSegment = query.breach.segment.trim().length > 0;

  if (!hasBase && !hasSegment) return 'empty';
  if (!hasBase) return 'split_failed';
  if (!hasSegment) return 'no_alert_condition';
  return 'success';
};

const NOT_DEFINED = i18n.translate('xpack.alertingV2.composeDiscover.esqlSummary.notDefined', {
  defaultMessage: 'Not defined',
});

const COPY_LABEL = i18n.translate('xpack.alertingV2.composeDiscover.esqlSummary.copyAriaLabel', {
  defaultMessage: 'Copy query',
});

const DESCRIPTIONS: Record<EsqlSummaryState, string> = {
  before_apply: i18n.translate(
    'xpack.alertingV2.composeDiscover.esqlSummary.beforeApplyDescription',
    {
      defaultMessage: 'Open the editor to write your ES|QL query',
    }
  ),
  success: i18n.translate('xpack.alertingV2.composeDiscover.esqlSummary.successDescription', {
    defaultMessage: 'Search query and alert condition identified',
  }),
  no_alert_condition: i18n.translate(
    'xpack.alertingV2.composeDiscover.esqlSummary.noAlertConditionDescription',
    { defaultMessage: 'Base query defined — no separate alert condition' }
  ),
  split_failed: i18n.translate(
    'xpack.alertingV2.composeDiscover.esqlSummary.splitFailedDescription',
    {
      defaultMessage: 'Review your query or separate it manually',
    }
  ),
  empty: i18n.translate('xpack.alertingV2.composeDiscover.esqlSummary.emptyDescription', {
    defaultMessage: 'Define an ES|QL query in the editor',
  }),
};

interface QueryBlockProps {
  label: React.ReactNode;
  query: string;
}

const QueryBlock: React.FC<QueryBlockProps> = ({ label, query }) => {
  const hasQuery = query.trim().length > 0;
  return (
    <>
      <EuiFlexGroup
        justifyContent="spaceBetween"
        alignItems="center"
        responsive={false}
        gutterSize="xs"
      >
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <strong>{label}</strong>
          </EuiText>
        </EuiFlexItem>
        {hasQuery && (
          <EuiFlexItem grow={false}>
            <EuiCopy textToCopy={query}>
              {(copy) => (
                <EuiButtonIcon
                  iconType="copyClipboard"
                  color="text"
                  aria-label={COPY_LABEL}
                  onClick={copy}
                  data-test-subj="esqlSummaryCopy"
                />
              )}
            </EuiCopy>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size="xs" />
      <QuerySummary query={query} emptyMessage={NOT_DEFINED} />
    </>
  );
};

const EmptyCallout: React.FC = () => (
  <EuiCallOut
    announceOnMount={false}
    size="s"
    color="warning"
    iconType="warning"
    data-test-subj="esqlSummaryEmptyCallout"
    title={i18n.translate('xpack.alertingV2.composeDiscover.esqlSummary.emptyCalloutTitle', {
      defaultMessage: 'No query defined',
    })}
  >
    <FormattedMessage
      id="xpack.alertingV2.composeDiscover.esqlSummary.emptyCalloutBody"
      defaultMessage="Enter an ES|QL query in the editor before continuing."
    />
  </EuiCallOut>
);

const SplitFailedCallout: React.FC = () => (
  <EuiCallOut
    announceOnMount={false}
    size="s"
    color="primary"
    iconType="info"
    data-test-subj="esqlSummarySplitFailedCallout"
    title={i18n.translate('xpack.alertingV2.composeDiscover.esqlSummary.splitFailedCalloutTitle', {
      defaultMessage: "Couldn't automatically separate base query from alert condition.",
    })}
  />
);

const NoAlertConditionCallout: React.FC = () => (
  <EuiCallOut
    announceOnMount={false}
    size="s"
    color="primary"
    iconType="info"
    data-test-subj="esqlSummaryNoAlertConditionCallout"
    title={i18n.translate(
      'xpack.alertingV2.composeDiscover.esqlSummary.noAlertConditionCalloutTitle',
      { defaultMessage: 'No alert condition' }
    )}
  >
    <FormattedMessage
      id="xpack.alertingV2.composeDiscover.esqlSummary.noAlertConditionCalloutBody"
      defaultMessage="Without an alert condition, every row returned by the base query is treated as a breach."
    />
  </EuiCallOut>
);

const getSummaryCallout = (state: EsqlSummaryState): React.ReactElement | null => {
  if (state === 'empty') return <EmptyCallout />;
  if (state === 'split_failed') return <SplitFailedCallout />;
  if (state === 'no_alert_condition') return <NoAlertConditionCallout />;
  return null;
};

interface EsqlQuerySummarySectionProps {
  query: RuleQuery;
  queryCommitted: boolean;
  /** Disables the edit CTA while the sandbox is already open. */
  isEditorOpen: boolean;
  onOpenEditor: () => void;
}

export const EsqlQuerySummarySection: React.FC<EsqlQuerySummarySectionProps> = ({
  query,
  queryCommitted,
  isEditorOpen,
  onOpenEditor,
}) => {
  const state = getEsqlSummaryState(queryCommitted, query);
  // Once a query is committed, the read-only Base query / Alert condition blocks are
  // always shown (empty ones render "Not defined"); only the pre-Apply state hides them.
  const showBlocks = state !== 'before_apply';
  const baseQuery = query.format === 'composed' ? query.base : query.breach.query;
  const alertBlock = query.format === 'composed' ? query.breach.segment : '';

  const ctaLabel =
    state === 'before_apply' || state === 'empty'
      ? i18n.translate('xpack.alertingV2.composeDiscover.esqlSummary.openEditorButtonLabel', {
          defaultMessage: 'Open query editor',
        })
      : i18n.translate('xpack.alertingV2.composeDiscover.esqlSummary.editQueryButtonLabel', {
          defaultMessage: 'Edit query',
        });

  return (
    <div data-test-subj={`esqlQuerySummarySection-${state}`}>
      <EuiText size="s" color="subdued">
        {DESCRIPTIONS[state]}
      </EuiText>
      <EuiSpacer size="s" />

      {getSummaryCallout(state)}
      {state !== 'success' && state !== 'before_apply' && <EuiSpacer size="m" />}

      {showBlocks ? (
        <>
          <QueryBlock
            label={
              <FormattedMessage
                id="xpack.alertingV2.composeDiscover.esqlSummary.baseQueryLabel"
                defaultMessage="Base query"
              />
            }
            query={baseQuery}
          />
          <EuiSpacer size="m" />
          <QueryBlock
            label={
              <FormattedMessage
                id="xpack.alertingV2.composeDiscover.esqlSummary.alertConditionLabel"
                defaultMessage="Alert condition"
              />
            }
            query={alertBlock}
          />
        </>
      ) : (
        <EuiPanel color="subdued" paddingSize="m">
          <EuiText size="s" color="subdued">
            {NOT_DEFINED}
          </EuiText>
        </EuiPanel>
      )}

      <EuiSpacer size="s" />
      <EuiButton
        size="s"
        iconType="editorCodeBlock"
        isDisabled={isEditorOpen}
        onClick={onOpenEditor}
        data-test-subj="esqlSummaryOpenEditor"
      >
        {ctaLabel}
      </EuiButton>
    </div>
  );
};
