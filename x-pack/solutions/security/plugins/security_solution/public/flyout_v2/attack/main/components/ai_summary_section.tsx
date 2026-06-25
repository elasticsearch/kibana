/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiSwitchEvent } from '@elastic/eui';
import { EuiPanel, EuiSpacer, EuiTitle } from '@elastic/eui';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { getFieldValue } from '@kbn/discover-utils';
import { TableId } from '@kbn/securitysolution-data-table';
import { AttackDiscoveryMarkdownFormatter } from '../../../../attack_discovery/pages/results/attack_discovery_markdown_formatter';
import { ExpandableSection } from '../../../shared/components/expandable_section';
import { useExpandSection } from '../../../shared/hooks/use_expand_section';
import { AISummarySectionSettings } from './ai_summary_section_settings';

const KEY = 'aisummary';
const STORAGE_KEY = 'securitySolution.attackDetailsFlyout.overviewSectionExpanded.v9.4';

const FIELD_SUMMARY_MARKDOWN = 'kibana.alert.attack_discovery.summary_markdown' as const;
const FIELD_SUMMARY_MARKDOWN_WITH_REPLACEMENTS =
  'kibana.alert.attack_discovery.summary_markdown_with_replacements' as const;
const FIELD_DETAILS_MARKDOWN = 'kibana.alert.attack_discovery.details_markdown' as const;
const FIELD_DETAILS_MARKDOWN_WITH_REPLACEMENTS =
  'kibana.alert.attack_discovery.details_markdown_with_replacements' as const;

export interface AISummarySectionProps {
  hit: DataTableRecord;
}

/**
 * Prop-driven AI Summary section for the attack flyout overview.
 * Reads the four markdown fields from hit via getFieldValue.
 * Manages local state for the anonymized toggle and settings popover.
 */
export const AISummarySection = memo(({ hit }: AISummarySectionProps) => {
  const expanded = useExpandSection({
    storageKey: STORAGE_KEY,
    title: KEY,
    defaultValue: true,
  });

  const summaryMarkdown = useMemo(
    () => (getFieldValue(hit, FIELD_SUMMARY_MARKDOWN) as string | null) ?? '',
    [hit]
  );
  const summaryMarkdownWithReplacements = useMemo(
    () => (getFieldValue(hit, FIELD_SUMMARY_MARKDOWN_WITH_REPLACEMENTS) as string | null) ?? '',
    [hit]
  );
  const detailsMarkdown = useMemo(
    () => (getFieldValue(hit, FIELD_DETAILS_MARKDOWN) as string | null) ?? '',
    [hit]
  );
  const detailsMarkdownWithReplacements = useMemo(
    () => (getFieldValue(hit, FIELD_DETAILS_MARKDOWN_WITH_REPLACEMENTS) as string | null) ?? '',
    [hit]
  );

  const hasAnonymizedContent = useMemo(
    () => summaryMarkdown.trim() !== '' || detailsMarkdown.trim() !== '',
    [detailsMarkdown, summaryMarkdown]
  );

  const [showAnonymized, setShowAnonymized] = useState<boolean>(false);
  const onChangeShowAnonymized = useCallback((event: EuiSwitchEvent) => {
    setShowAnonymized(event.target.checked);
  }, []);

  const [isPopoverOpen, setPopover] = useState(false);
  const openPopover = useCallback(() => {
    setPopover((open) => !open);
  }, []);
  const closePopover = useCallback(() => {
    setPopover(false);
  }, []);

  return (
    <ExpandableSection
      expanded={expanded}
      title={
        <FormattedMessage
          id="xpack.securitySolution.flyoutV2.attack.overview.AISummary.sectionTitle"
          defaultMessage="Attack Summary"
        />
      }
      localStorageKey={STORAGE_KEY}
      sectionId={KEY}
      gutterSize="s"
      data-test-subj={KEY}
      extraAction={
        <AISummarySectionSettings
          showAnonymized={showAnonymized}
          onChangeShowAnonymized={onChangeShowAnonymized}
          closePopover={closePopover}
          openPopover={openPopover}
          isPopoverOpen={isPopoverOpen}
          hasAnonymizedContent={hasAnonymizedContent}
        />
      }
    >
      <EuiPanel hasBorder data-test-subj="overview-tab-ai-summary-panel">
        <div data-test-subj="overview-tab-ai-summary-content">
          <AttackDiscoveryMarkdownFormatter
            scopeId={TableId.alertsOnAttacksPage}
            disableActions={showAnonymized}
            markdown={showAnonymized ? summaryMarkdown : summaryMarkdownWithReplacements}
          />
        </div>

        <EuiSpacer size="s" />

        <EuiTitle data-test-subj="overview-tab-background-title" size="xs">
          <h2>
            <FormattedMessage
              id="xpack.securitySolution.flyoutV2.attack.overview.AISummary.backgroundTitle"
              defaultMessage="Background"
            />
          </h2>
        </EuiTitle>

        <EuiSpacer size="s" />

        <div data-test-subj="overview-tab-ai-background-content">
          <AttackDiscoveryMarkdownFormatter
            disableActions={showAnonymized}
            scopeId={TableId.alertsOnAttacksPage}
            markdown={showAnonymized ? detailsMarkdown : detailsMarkdownWithReplacements}
          />
        </div>
      </EuiPanel>
      <EuiSpacer size="s" />
    </ExpandableSection>
  );
});

AISummarySection.displayName = 'AISummarySection';
