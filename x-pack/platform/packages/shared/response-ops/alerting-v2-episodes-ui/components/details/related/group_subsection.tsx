/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import type { CoreStart } from '@kbn/core/public';
import type { ExpressionsStart } from '@kbn/expressions-plugin/public';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { css } from '@emotion/react';
import { getRuleIdFromRuleState, type RuleState } from '../../../types/rule_state';
import { RELATED_ALERT_EPISODES_PAGE_SIZE } from '../../../constants';
import { useFetchEpisodeActions } from '../../../hooks/use_fetch_episode_actions';
import { useFetchGroupActions } from '../../../hooks/use_fetch_group_actions';
import { useFetchSameGroupEpisodesQuery } from '../../../hooks/use_fetch_same_group_episodes_query';
import { RelatedAlertEpisodesList } from './related_list';
import * as i18n from './translations';

interface RelatedEpisodesGroupSubsectionServices {
  notifications: CoreStart['notifications'];
  expressions: ExpressionsStart;
  spaces: SpacesPluginStart;
}

export interface RelatedEpisodesGroupSubsectionProps {
  currentEpisodeId: string | undefined;
  groupHash: string | undefined;
  ruleState: RuleState;
  getEpisodeDetailsHref: (episodeId: string) => string;
  /**
   * When `true`, drop the inner horizontal padding so the subsection sits
   * flush with its consumer's edges. Useful when rendering inside a container
   * that already provides outer padding (e.g. a narrow flyout body).
   */
  compressed?: boolean;
}

/**
 * Related episodes that share the same rule id and group_hash
 */
export function RelatedEpisodesGroupSubsection({
  currentEpisodeId,
  groupHash,
  ruleState,
  getEpisodeDetailsHref,
  compressed = false,
}: RelatedEpisodesGroupSubsectionProps) {
  const { euiTheme } = useEuiTheme();
  const {
    services: { notifications, expressions, spaces },
  } = useKibana<RelatedEpisodesGroupSubsectionServices>();
  const toastDanger = useCallback(
    (message: string) => {
      notifications.toasts.addDanger(message);
    },
    [notifications]
  );

  const ruleId = getRuleIdFromRuleState(ruleState);

  const { data: sameGroupRows = [], isLoading: isLoadingSameGroupRows } =
    useFetchSameGroupEpisodesQuery({
      ruleId,
      excludeEpisodeId: currentEpisodeId,
      pageSize: RELATED_ALERT_EPISODES_PAGE_SIZE,
      groupHash,
      services: { expressions, spaces },
      toastDanger,
    });

  const sameGroupEpisodeIds = useMemo(
    () => sameGroupRows.map((row) => row['episode.id']).filter(Boolean) as string[],
    [sameGroupRows]
  );

  const sameGroupGroupHashes = useMemo(
    () => [
      ...new Set(
        sameGroupRows.map((row) => row.group_hash).filter((hash): hash is string => Boolean(hash))
      ),
    ],
    [sameGroupRows]
  );

  /** We need the actions to display the correct status badges. */
  const { data: sameGroupEpisodeActionsMap } = useFetchEpisodeActions({
    episodeIds: sameGroupEpisodeIds,
    services: { expressions, spaces },
  });

  const { data: sameGroupGroupActionsMap } = useFetchGroupActions({
    groupHashes: sameGroupGroupHashes,
    services: { expressions, spaces },
  });

  if (!ruleId || !groupHash) {
    return null;
  }

  return (
    <div
      data-test-subj="alertingV2RelatedEpisodesGroupSubsection"
      css={
        compressed
          ? undefined
          : css`
              padding-inline: ${euiTheme.size.m};
            `
      }
    >
      <EuiTitle size={compressed ? 'xxs' : 'xs'}>
        <h4>{i18n.RELATED_SAME_GROUP_TITLE}</h4>
      </EuiTitle>
      <EuiText
        size={compressed ? 'xs' : 's'}
        color="subdued"
        css={{ marginBlockStart: euiTheme.size.xs }}
      >
        {i18n.RELATED_SAME_GROUP_DESCRIPTION}
      </EuiText>
      <EuiSpacer size="s" />
      {isLoadingSameGroupRows ? (
        <EuiFlexGroup
          justifyContent="center"
          data-test-subj="alertingV2RelatedEpisodesGroupLoading"
        >
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : sameGroupRows.length === 0 ? (
        <EuiPanel
          color="subdued"
          hasShadow={false}
          paddingSize="m"
          data-test-subj="alertingV2RelatedEpisodesGroupEmpty"
        >
          <EuiText size="s" color="subdued" textAlign="center">
            {i18n.RELATED_SAME_GROUP_EMPTY}
          </EuiText>
        </EuiPanel>
      ) : (
        <RelatedAlertEpisodesList
          rows={sameGroupRows}
          ruleState={ruleState}
          getEpisodeAction={(id) => sameGroupEpisodeActionsMap?.get(id)}
          getGroupAction={(gh) => sameGroupGroupActionsMap?.get(gh)}
          getEpisodeDetailsHref={getEpisodeDetailsHref}
          compressed={compressed}
        />
      )}
    </div>
  );
}
