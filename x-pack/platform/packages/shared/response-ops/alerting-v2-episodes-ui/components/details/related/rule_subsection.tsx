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
import { useFetchSameRuleEpisodesQuery } from '../../../hooks/use_fetch_same_rule_episodes_query';
import { RelatedAlertEpisodesList } from './related_list';
import * as i18n from './translations';

interface RelatedEpisodesRuleSubsectionServices {
  notifications: CoreStart['notifications'];
  expressions: ExpressionsStart;
  spaces: SpacesPluginStart;
}

export interface RelatedEpisodesRuleSubsectionProps {
  currentEpisodeId: string | undefined;
  currentGroupHash: string | undefined;
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
 * Related episodes for the same rule: other group_hash values, or all other rule episodes if there is no group.
 */
export function RelatedEpisodesRuleSubsection({
  currentEpisodeId,
  currentGroupHash,
  ruleState,
  getEpisodeDetailsHref,
  compressed = false,
}: RelatedEpisodesRuleSubsectionProps) {
  const { euiTheme } = useEuiTheme();
  const {
    services: { notifications, expressions, spaces },
  } = useKibana<RelatedEpisodesRuleSubsectionServices>();
  const toastDanger = useCallback(
    (message: string) => {
      notifications.toasts.addDanger(message);
    },
    [notifications]
  );

  const ruleId = getRuleIdFromRuleState(ruleState);

  const { data: otherGroupRows = [], isLoading: isLoadingOtherGroupRows } =
    useFetchSameRuleEpisodesQuery({
      ruleId,
      excludeEpisodeId: currentEpisodeId,
      pageSize: RELATED_ALERT_EPISODES_PAGE_SIZE,
      currentGroupHash,
      services: { expressions, spaces },
      toastDanger,
    });

  const otherEpisodeIds = useMemo(
    () => otherGroupRows.map((row) => row['episode.id']).filter(Boolean) as string[],
    [otherGroupRows]
  );

  const otherGroupHashes = useMemo(
    () => [
      ...new Set(
        otherGroupRows.map((row) => row.group_hash).filter((hash): hash is string => Boolean(hash))
      ),
    ],
    [otherGroupRows]
  );

  const { data: otherEpisodeActionsMap } = useFetchEpisodeActions({
    episodeIds: otherEpisodeIds,
    services: { expressions, spaces },
  });

  const { data: otherGroupActionsMap } = useFetchGroupActions({
    groupHashes: otherGroupHashes,
    services: { expressions, spaces },
  });

  if (!ruleId) {
    return null;
  }

  return (
    <div
      data-test-subj="alertingV2RelatedEpisodesRuleSubsection"
      css={
        compressed
          ? css`
              padding-bottom: ${euiTheme.size.m};
            `
          : css`
              padding-inline: ${euiTheme.size.m};
              padding-bottom: ${euiTheme.size.m};
            `
      }
    >
      <EuiTitle size={compressed ? 'xxs' : 'xs'}>
        <h4>
          {currentGroupHash ? i18n.RELATED_OTHER_GROUPS_TITLE : i18n.RELATED_RULE_ONLY_LIST_TITLE}
        </h4>
      </EuiTitle>
      <EuiText
        size={compressed ? 'xs' : 's'}
        color="subdued"
        css={{ marginBlockStart: euiTheme.size.xs }}
      >
        {currentGroupHash
          ? i18n.RELATED_OTHER_GROUPS_DESCRIPTION
          : i18n.RELATED_RULE_ONLY_LIST_DESCRIPTION}
      </EuiText>
      <EuiSpacer size="s" />
      {isLoadingOtherGroupRows ? (
        <EuiFlexGroup justifyContent="center" data-test-subj="alertingV2RelatedEpisodesRuleLoading">
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="l" />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : otherGroupRows.length === 0 ? (
        <EuiPanel
          color="subdued"
          hasShadow={false}
          paddingSize="m"
          data-test-subj="alertingV2RelatedEpisodesRuleEmpty"
        >
          <EuiText size="s" color="subdued" textAlign="center">
            {i18n.RELATED_OTHER_GROUPS_EMPTY}
          </EuiText>
        </EuiPanel>
      ) : (
        <RelatedAlertEpisodesList
          rows={otherGroupRows}
          ruleState={ruleState}
          getEpisodeAction={(id) => otherEpisodeActionsMap?.get(id)}
          getGroupAction={(gh) => otherGroupActionsMap?.get(gh)}
          getEpisodeDetailsHref={getEpisodeDetailsHref}
          compressed={compressed}
        />
      )}
    </div>
  );
}
