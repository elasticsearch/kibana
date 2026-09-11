/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import {
  EuiCode,
  EuiCopy,
  EuiIcon,
  EuiLink,
  EuiSkeletonText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';

import { getRouterLinkProps } from '@kbn/router-utils';
import type { CustomCellRenderer } from '@kbn/unified-data-table';
import { ROWS_HEIGHT_OPTIONS } from '@kbn/unified-data-table';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { FindRulesResponse } from '@kbn/alerting-v2-schemas';
import { getBreachEsqlQuery } from '@kbn/alerting-v2-schemas';
import type { AlertEpisodeStatus } from '@kbn/alerting-v2-schemas';
import { DURATION_LOWER_BOUND_FIELD } from '@kbn/alerting-v2-common-queries';
import { parseEpisodeDataJson } from '@kbn/alerting-v2-utils';
import type { EpisodeActionState, EpisodeStatusGroupAction } from '../types/action';
import { AlertingEpisodeGroupingTags } from './grouping/alerting_episode_grouping_tags';
import { AlertEpisodeStatusBadges } from './status/status_badges';
import { TagBadges } from './actions/tags';
import { AlertEpisodeSeverityBadge } from './severity/episode_severity_badge';
import type { EpisodeSeverity } from './severity/severity_utils';
import { EMPTY_VALUE } from '../constants';
import * as i18n from './translations';

type Rule = FindRulesResponse['items'][number];
type CellRendererProps = Parameters<CustomCellRenderer[string]>[0];

/** Characters of the rule id shown when a rule has no name to display. */
const SHORT_RULE_ID_LENGTH = 7;

export const EpisodeStatusCell = ({ row, columnId }: CellRendererProps) => {
  const status = row.flattened[columnId] as AlertEpisodeStatus;

  const episodeAction: EpisodeActionState = {
    episodeId: row.flattened['episode.id'] as string,
    ruleId: row.flattened['rule.id'] as string | null,
    groupHash: row.flattened.group_hash as string | null,
    lastAckAction: (row.flattened.last_ack_action as string | undefined) ?? null,
    lastAssigneeUid: (row.flattened.last_assignee_uid as string | undefined) ?? null,
    lastAckActor: (row.flattened.last_ack_actor as string | undefined) ?? null,
  };

  const groupAction: EpisodeStatusGroupAction = {
    lastSnoozeAction: (row.flattened.last_snooze_action as string | undefined) ?? null,
    snoozeExpiry: (row.flattened.snooze_expiry as string | undefined) ?? null,
  };

  return (
    <AlertEpisodeStatusBadges
      status={status}
      episodeAction={episodeAction}
      groupAction={groupAction}
    />
  );
};

/**
 * Renders the episode duration, marked as a lower bound when the query did not
 * see the episode start because it predates the selected time range.
 */
export const EpisodeDurationCell = ({ row, columnId, dataView }: CellRendererProps) => {
  const duration = row.flattened[columnId] as number | null | undefined;
  if (duration == null) {
    return <>{EMPTY_VALUE}</>;
  }
  const field = dataView.getFieldByName(columnId);
  const formatted = field
    ? dataView.getFormatterForField(field).convertToText(duration)
    : `${duration}`;
  if (!row.flattened[DURATION_LOWER_BOUND_FIELD]) {
    return <>{formatted}</>;
  }
  return (
    <EuiToolTip content={i18n.DURATION_LOWER_BOUND_TOOLTIP}>
      <span tabIndex={0} data-test-subj="episodeDurationLowerBound">
        {i18n.getDurationLowerBoundLabel(formatted)}
      </span>
    </EuiToolTip>
  );
};

export const EpisodeTagsCell = ({ row }: CellRendererProps) => {
  const tags = (row.flattened.last_tags as string[] | undefined) ?? [];

  return <TagBadges tags={tags} data-test-subj="episodeTagsCell" />;
};

export interface EpisodeRuleTagsCellProps extends CellRendererProps {
  rulesCache: Record<string, Rule>;
  isLoadingRules: boolean;
}

export const EpisodeRuleTagsCell = ({
  row,
  rulesCache,
  isLoadingRules,
}: EpisodeRuleTagsCellProps) => {
  const ruleId = row.flattened['rule.id'] as string | undefined;
  const rule = ruleId ? rulesCache[ruleId] : undefined;

  if (isLoadingRules && ruleId && !rule) {
    return <EuiSkeletonText lines={1} />;
  }

  return <TagBadges tags={rule?.metadata.tags ?? []} data-test-subj="episodeRuleTagsCell" />;
};

export const EpisodeSeverityCell = ({ row }: CellRendererProps) => {
  const severity = row.flattened.severity as EpisodeSeverity | undefined | null;

  return <AlertEpisodeSeverityBadge severity={severity} />;
};

export interface EpisodeRuleCellProps extends CellRendererProps {
  rulesCache: Record<string, Rule>;
  isLoadingRules: boolean;
  rowHeight: number;
  /** Builds the href of the rule details page for a rule id. */
  getRuleDetailsHref: (ruleId: string) => string;
  /**
   * Called when the rule name is clicked, for hosts that show the rule somewhere on the page
   * instead of navigating to it. Modified and non-left clicks still follow the link.
   */
  onRuleNameClick?: (ruleId: string) => void;
  /** Source data views keyed by rule id, used to format grouping values via `fieldFormats`. */
  sourceDataViewsByRule?: Map<string, DataView>;
}

/**
 * Rule name, grouping values and breach query of an episode.
 *
 * Everything is laid out as inline content on purpose. For `lineCount` row heights the data grid
 * clamps the cell wrapper to a number of lines with `-webkit-line-clamp`, which only counts line
 * boxes: block children (a flex column, for instance) fall outside the clamp and get sliced
 * mid-line instead. Inline flow also gives us the priority we want for free, since the clamp cuts
 * from the end: the name and the grouping values keep the lines they need and the query fills
 * whatever is left.
 */
export const EpisodeRuleCell = ({
  row,
  columnId,
  rulesCache,
  isLoadingRules,
  rowHeight,
  getRuleDetailsHref,
  onRuleNameClick,
  sourceDataViewsByRule,
}: EpisodeRuleCellProps) => {
  const { euiTheme } = useEuiTheme();

  const ruleId = row.flattened[columnId] as string | undefined;
  const rule = ruleId ? rulesCache[ruleId] : undefined;

  const nameCss = css`
    font-weight: ${euiTheme.font.weight.semiBold};
  `;

  if (isLoadingRules && !rule) {
    return <EuiSkeletonText />;
  }

  if (!rule || !ruleId) {
    const eventRuleName = row.flattened['rule.name'] as string | undefined;
    const episodeData = parseEpisodeDataJson(row.flattened.episode_data);
    const dataRuleName =
      typeof episodeData.rule_name === 'string' ? episodeData.rule_name : undefined;
    const displayName = dataRuleName ?? eventRuleName;

    if (displayName) {
      return <span css={nameCss}>{displayName}</span>;
    }

    if (!ruleId) {
      return <span>{i18n.RULE_CELL_EMPTY_RULE}</span>;
    }

    return (
      <span
        css={css`
          display: inline-flex;
          align-items: center;
          block-size: 1lh;
          vertical-align: top;
          gap: ${euiTheme.size.xs};
          max-inline-size: 100%;
          color: ${euiTheme.colors.textSubdued};
        `}
        data-test-subj="episodeRuleCellMissingRule"
      >
        <EuiToolTip content={i18n.RULE_CELL_MISSING_RULE_TOOLTIP}>
          <span
            tabIndex={0}
            css={css`
              display: inline-flex;
              align-items: center;
              gap: ${euiTheme.size.xs};
              min-inline-size: 0;
            `}
          >
            <EuiIcon type="linkSlash" size="s" aria-hidden={true} />
            <span
              css={css`
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
              `}
            >
              {i18n.RULE_CELL_MISSING_RULE_LABEL}
            </span>
          </span>
        </EuiToolTip>
        <EuiCopy
          textToCopy={ruleId}
          beforeMessage={i18n.getRuleCellCopyRuleIdTooltip(ruleId)}
          afterMessage={i18n.RULE_CELL_RULE_ID_COPIED}
        >
          {(copy) => (
            // eslint-disable-next-line @elastic/eui/require-href-for-link
            <EuiLink color="subdued" onClick={copy} data-test-subj="episodeRuleCellCopyRuleId">
              <EuiCode
                css={css`
                  display: inline-flex;
                  align-items: center;
                  padding-block: 0;
                  padding-inline: ${euiTheme.size.xs};
                  line-height: ${euiTheme.size.base};
                  font-weight: ${euiTheme.font.weight.regular};
                  color: ${euiTheme.colors.textSubdued};
                `}
              >
                {ruleId.slice(0, SHORT_RULE_ID_LENGTH)}
              </EuiCode>
            </EuiLink>
          )}
        </EuiCopy>
      </span>
    );
  }

  const episodeData = parseEpisodeDataJson(row.flattened.episode_data);
  const groupingFields = rule.grouping?.fields ?? [];
  const showQuery = rowHeight !== ROWS_HEIGHT_OPTIONS.single;
  const detailsHref = getRuleDetailsHref(ruleId);
  // The href stays on the link either way, so opening the rule page in a new tab keeps working.
  const nameLinkProps = onRuleNameClick
    ? getRouterLinkProps({ href: detailsHref, onClick: () => onRuleNameClick(ruleId) })
    : { href: detailsHref };

  return (
    <span data-test-subj="episodeRuleCell">
      <EuiLink {...nameLinkProps} css={nameCss} data-test-subj="episodeRuleCellNameLink">
        {rule.metadata.name}
      </EuiLink>
      {groupingFields.length > 0 ? (
        <>
          {' '}
          <AlertingEpisodeGroupingTags
            inline
            fields={groupingFields}
            data={episodeData}
            dataView={sourceDataViewsByRule?.get(ruleId)}
            data-test-subj="episodeRuleCellGroupingTags"
          />
        </>
      ) : null}
      {showQuery && rule.query ? (
        <>
          <br />
          <EuiCode
            transparentBackground
            css={css`
              padding: 0;
              color: ${euiTheme.colors.mediumShade};
              font-weight: ${euiTheme.font.weight.regular};
            `}
            data-test-subj="episodeRuleCellBreachQuery"
          >
            {getBreachEsqlQuery(rule.query)}
          </EuiCode>
        </>
      ) : null}
    </span>
  );
};
