/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import type { AttackDiscoveryAlert } from '@kbn/elastic-assistant-common';
import { replaceAnonymizedValuesWithOriginalValues } from '@kbn/elastic-assistant-common';
import { TableId } from '@kbn/securitysolution-data-table';

import { InvestigateInTimelineButton } from '../../../../../common/components/event_details/investigate_in_timeline_button';
import { getOriginalAlertIds } from '../../../../../attack_discovery/helpers';
import { AttackSummarySections } from '../../../../../attack_discovery/components/attack_summary_sections';
import { buildAlertsKqlFilter } from '../../../alerts_table/actions';
import { AttackAiAssistantButton } from './attack_ai_assistant_button';

import * as i18n from './translations';

export {
  SUMMARY_CONTENT_TEST_ID,
  DETAILS_TITLE_TEST_ID,
  DETAILS_CONTENT_TEST_ID,
  ATTACK_CHAIN_TITLE_TEST_ID,
} from '../../../../../attack_discovery/components/attack_summary_sections';

export const SUMMARY_TAB_TEST_ID = 'attackSummaryTab';
export const INVESTIGATE_IN_TIMELINE_BUTTON_TEST_ID = 'investigateInTimelineButton';

interface SummaryTabProps {
  /** The attack discovery alert document. If undefined, only the Alerts tab will be shown. */
  attack: AttackDiscoveryAlert;
  /** Whether to show anonymized values instead of replacements */
  showAnonymized?: boolean;
}

/**
 * Component that displays the summary tab content, rendering markdown summaries, details,
 * and optionally the attack chain visualization.
 */
export const SummaryTab = React.memo<SummaryTabProps>(({ attack, showAnonymized = false }) => {
  const { detailsMarkdown, summaryMarkdown } = useMemo(() => attack, [attack]);

  const summaryMarkdownWithReplacements = useMemo(
    () =>
      replaceAnonymizedValuesWithOriginalValues({
        messageContent: summaryMarkdown,
        replacements: attack.replacements,
      }),
    [attack.replacements, summaryMarkdown]
  );

  const detailsMarkdownWithReplacements = useMemo(
    () =>
      replaceAnonymizedValuesWithOriginalValues({
        messageContent: detailsMarkdown,
        replacements: attack.replacements,
      }),
    [attack.replacements, detailsMarkdown]
  );

  const originalAlertIds = useMemo(
    () => getOriginalAlertIds(attack.alertIds, attack.replacements),
    [attack.alertIds, attack.replacements]
  );

  const investigateInTimelineFilters = useMemo(
    () => buildAlertsKqlFilter('_id', originalAlertIds),
    [originalAlertIds]
  );

  return (
    <div data-test-subj={SUMMARY_TAB_TEST_ID}>
      <AttackSummarySections
        alertIds={originalAlertIds}
        detailsMarkdown={showAnonymized ? detailsMarkdown : detailsMarkdownWithReplacements}
        disableActions={showAnonymized}
        mitreAttackTactics={attack.mitreAttackTactics}
        scopeId={TableId.alertsOnAttacksPage}
        summaryMarkdown={showAnonymized ? summaryMarkdown : summaryMarkdownWithReplacements}
      />

      <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
        <EuiFlexItem grow={false}>
          <AttackAiAssistantButton attack={attack} pathway="attacks_page_group_summary" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <InvestigateInTimelineButton
            asEmptyButton={true}
            data-test-subj={INVESTIGATE_IN_TIMELINE_BUTTON_TEST_ID}
            dataProviders={null}
            filters={investigateInTimelineFilters}
            flush="both"
            iconType="timeline"
            size="m"
          >
            {i18n.INVESTIGATE_IN_TIMELINE}
          </InvestigateInTimelineButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
});
SummaryTab.displayName = 'SummaryTab';
