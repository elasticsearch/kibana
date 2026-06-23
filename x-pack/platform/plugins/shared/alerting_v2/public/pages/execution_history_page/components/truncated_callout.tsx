/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiCallOut, EuiSpacer } from '@elastic/eui';
import type { SearchMatchCounts } from '@kbn/alerting-v2-schemas';
import { i18n } from '@kbn/i18n';

type TruncatedType = 'policies' | 'rules';

interface Props {
  searchParam?: string;
  data?: {
    searchMatches: SearchMatchCounts | null;
  };
}

export const TruncatedCallout = ({ data, searchParam }: Props) => {
  const searchMatches = data?.searchMatches ?? null;
  const truncatedTypes: TruncatedType[] =
    searchMatches !== null
      ? (['policies', 'rules'] as const).filter((t) => searchMatches[t] > searchMatches.cap)
      : [];
  const showSearchTruncatedCallout =
    searchParam !== undefined && truncatedTypes.length > 0 && searchMatches !== null;

  return showSearchTruncatedCallout ? (
    <>
      <EuiCallOut
        announceOnMount
        size="s"
        color="warning"
        iconType="warning"
        title={buildSearchTruncatedCalloutTitle(searchMatches, truncatedTypes)}
      />
      <EuiSpacer size="m" />
    </>
  ) : null;
};

const renderTruncatedPart = (matches: SearchMatchCounts, type: TruncatedType): string =>
  type === 'policies'
    ? i18n.translate('xpack.alertingV2.executionHistory.searchTruncatedCallout.policiesPart', {
        defaultMessage: '{cap} of {total} matching policies',
        values: { cap: matches.cap, total: matches.policies },
      })
    : i18n.translate('xpack.alertingV2.executionHistory.searchTruncatedCallout.rulesPart', {
        defaultMessage: '{cap} of {total} matching rules',
        values: { cap: matches.cap, total: matches.rules },
      });

const buildSearchTruncatedCalloutTitle = (
  matches: SearchMatchCounts,
  truncatedTypes: TruncatedType[]
): string => {
  const summary = truncatedTypes.map((t) => renderTruncatedPart(matches, t));
  const summaryText =
    summary.length === 2
      ? i18n.translate('xpack.alertingV2.executionHistory.searchTruncatedCallout.joinedSummary', {
          defaultMessage: '{first} and {second}',
          values: { first: summary[0], second: summary[1] },
        })
      : summary[0];

  return i18n.translate('xpack.alertingV2.executionHistory.searchTruncatedCallout', {
    defaultMessage: 'Showing events for the first {summary}. Refine your search to narrow results.',
    values: { summary: summaryText },
  });
};
