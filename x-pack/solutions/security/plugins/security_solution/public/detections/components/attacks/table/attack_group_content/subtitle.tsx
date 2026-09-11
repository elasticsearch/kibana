/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiAvatar, EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';
import { css } from '@emotion/react';
import {
  replaceAnonymizedValuesWithOriginalValues,
  type AttackDiscoveryAlert,
  ATTACK_DISCOVERY_AD_HOC_RULE_ID,
} from '@kbn/elastic-assistant-common';
import { i18n } from '@kbn/i18n';
import { TableId } from '@kbn/securitysolution-data-table';

import { UserAvatar } from '@kbn/user-profile-components';
import { useBulkGetUserProfiles } from '../../../../../common/components/user_profiles/use_bulk_get_user_profiles';
import { getOriginalAlertIds } from '../../../../../attack_discovery/helpers';
import {
  AttackDetectedOn,
  useFormattedAttackTimestamp,
} from '../../../../../attack_discovery/components/attack_detected_on';
import { AttackEntitySummary } from '../../../../../attack_discovery/components/attack_entity_summary';

export { getSummaryPlainText } from '../../../../../attack_discovery/components/attack_entity_summary';

export const RUN_BY_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.attacks.group.subtitle.runByLabel',
  {
    defaultMessage: 'Run by:',
  }
);

export const UNKNOWN_USER_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.attacks.group.subtitle.unknownUserLabel',
  {
    defaultMessage: 'Unknown',
  }
);

export interface SubtitleProps {
  /**
   * The attack discovery alert object containing details about the attack.
   */
  attack: AttackDiscoveryAlert;
  /**
   * Whether to show anonymized values in the summary.
   * @default false
   */
  showAnonymized?: boolean;
}

/**
 * A component that displays the subtitle for an attack group, including the detection timestamp and a summary.
 */
export const Subtitle = React.memo<SubtitleProps>(({ attack, showAnonymized = false }) => {
  const summary = useMemo(() => {
    return attack.entitySummaryMarkdown
      ? showAnonymized
        ? attack.entitySummaryMarkdown
        : replaceAnonymizedValuesWithOriginalValues({
            messageContent: attack.entitySummaryMarkdown,
            replacements: attack.replacements,
          })
      : undefined;
  }, [attack.entitySummaryMarkdown, attack.replacements, showAnonymized]);

  const formattedTimestamp = useFormattedAttackTimestamp(attack.timestamp);

  const isManual = attack.alertRuleUuid === ATTACK_DISCOVERY_AD_HOC_RULE_ID;
  const separator = '|';
  const userName = attack.userName || UNKNOWN_USER_LABEL;

  const originalAlertIds = useMemo(
    () => getOriginalAlertIds(attack.alertIds, attack.replacements),
    [attack.alertIds, attack.replacements]
  );

  const uids = useMemo(() => new Set(attack.userId ? [attack.userId] : []), [attack.userId]);
  const { data: userProfiles } = useBulkGetUserProfiles({ uids });
  const runByProfile = userProfiles?.[0];

  return (
    <EuiFlexGroup
      alignItems="center"
      gutterSize="s"
      responsive={false}
      wrap={false}
      data-test-subj="attack-subtitle"
    >
      {formattedTimestamp && (
        <EuiFlexItem grow={false}>
          <AttackDetectedOn timestamp={attack.timestamp} />
        </EuiFlexItem>
      )}

      {isManual && (
        <>
          {formattedTimestamp && (
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {separator}
              </EuiText>
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>
            <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false} wrap={false}>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  {RUN_BY_LABEL}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                {attack.userId ? (
                  <UserAvatar
                    // Fall back to a synthetic user object when the profile is still loading
                    // or the UID has no matching profile, so initials are shown instead of "?".
                    user={
                      runByProfile?.user ??
                      (attack.userName ? { username: attack.userName } : undefined)
                    }
                    avatar={runByProfile?.data?.avatar}
                    size="s"
                    data-test-subj="attack-run-by-avatar"
                  />
                ) : (
                  <EuiAvatar size="s" name={userName} data-test-subj="attack-run-by-avatar" />
                )}
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </>
      )}

      {summary && (
        <>
          {(formattedTimestamp || isManual) && (
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {separator}
              </EuiText>
            </EuiFlexItem>
          )}
          <EuiFlexItem
            grow
            css={css`
              min-width: 0;
            `}
            data-test-subj="attack-subtitle-summary"
          >
            <AttackEntitySummary
              alertIds={originalAlertIds}
              disableActions={showAnonymized}
              entitySummaryMarkdown={summary}
              scopeId={TableId.alertsOnAttacksPage}
            />
          </EuiFlexItem>
        </>
      )}
    </EuiFlexGroup>
  );
});
Subtitle.displayName = 'Subtitle';
