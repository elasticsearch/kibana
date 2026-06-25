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
  EuiFlexGroup,
  EuiFlexItem,
  EuiSkeletonText,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';

import type { CustomCellRenderer } from '@kbn/unified-data-table';
import type { FindRulesResponse } from '@kbn/alerting-v2-schemas';
import { getBreachEsqlQuery } from '@kbn/alerting-v2-schemas';
import type { AlertEpisodeStatus } from '@kbn/alerting-v2-schemas';
import type { EpisodeActionState } from '../types/action';
import type { AlertEpisodeGroupAction } from '../types/action';

import { parseEpisodeDataJson } from '../utils/episode_grouping_data';
import { AlertingEpisodeGroupingTags } from './grouping/alerting_episode_grouping_tags';
import { AlertEpisodeStatusBadges } from './status/status_badges';
import { AlertEpisodeTags } from './actions/tags';
import { AlertEpisodeSeverityBadge } from './severity/episode_severity_badge';
import type { EpisodeSeverity } from './severity/severity_utils';

type Rule = FindRulesResponse['items'][number];
type CellRendererProps = Parameters<CustomCellRenderer[string]>[0];

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

  const groupAction: AlertEpisodeGroupAction = {
    groupHash: row.flattened.group_hash as string,
    ruleId: row.flattened['rule.id'] as string | null,
    lastDeactivateAction: (row.flattened.last_deactivate_action as string | undefined) ?? null,
    lastSnoozeAction: (row.flattened.last_snooze_action as string | undefined) ?? null,
    snoozeExpiry: (row.flattened.snooze_expiry as string | undefined) ?? null,
    tags: (row.flattened.last_tags as string[] | undefined) ?? [],
    lastSnoozeActor: (row.flattened.last_snooze_actor as string | undefined) ?? null,
    lastDeactivateActor: (row.flattened.last_deactivate_actor as string | undefined) ?? null,
  };

  return (
    <AlertEpisodeStatusBadges
      status={status}
      episodeAction={episodeAction}
      groupAction={groupAction}
    />
  );
};

export const EpisodeTagsCell = ({ row }: CellRendererProps) => {
  const tags = (row.flattened.last_tags as string[] | undefined) ?? [];

  return <AlertEpisodeTags tags={tags} />;
};

export const EpisodeSeverityCell = ({ row }: CellRendererProps) => {
  const severity = row.flattened.severity as EpisodeSeverity | undefined | null;

  return <AlertEpisodeSeverityBadge severity={severity} />;
};

export interface EpisodeRuleCellProps extends CellRendererProps {
  rulesCache: Record<string, Rule>;
  isLoadingRules: boolean;
  rowHeight: number;
}

export const EpisodeRuleCell = ({
  row,
  columnId,
  rulesCache,
  isLoadingRules,
  rowHeight,
}: EpisodeRuleCellProps) => {
  const { euiTheme } = useEuiTheme();

  const ruleId = row.flattened[columnId] as string;
  const rule = rulesCache[ruleId];

  if (isLoadingRules && !rule) {
    return <EuiSkeletonText />;
  }

  if (!rule) {
    return <>{ruleId}</>;
  }
  const ruleName = (
    <EuiText
      size="s"
      css={css`
        font-weight: ${euiTheme.font.weight.semiBold};
      `}
    >
      {rule.metadata.name}
    </EuiText>
  );
  if (rowHeight === 1) {
    return ruleName;
  }

  const episodeData = parseEpisodeDataJson(row.flattened.episode_data);
  const groupingFields = rule.grouping?.fields ?? [];

  return (
    <EuiFlexGroup direction="column" gutterSize="xs">
      <EuiFlexItem grow={false}>
        <EuiFlexGroup direction="row" gutterSize="xs" alignItems="center" wrap responsive={false}>
          <EuiFlexItem grow={false}>{ruleName}</EuiFlexItem>
          {groupingFields.length > 0 ? (
            <EuiFlexItem grow={false}>
              <AlertingEpisodeGroupingTags
                fields={groupingFields}
                data={episodeData}
                data-test-subj="episodeRuleCellGroupingTags"
              />
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiCode
          color="subdued"
          css={css`
            background: none;
            color: ${euiTheme.colors.mediumShade};
            font-size: ${euiTheme.font.scale.s};
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            padding: 0;
          `}
        >
          {getBreachEsqlQuery(rule.query)}
        </EuiCode>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
