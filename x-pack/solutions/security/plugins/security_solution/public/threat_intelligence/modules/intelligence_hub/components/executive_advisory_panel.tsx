/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage, FormattedRelative } from '@kbn/i18n-react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiListGroup,
  EuiListGroupItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { DashboardLatestAdvisory } from '../../../../../common/threat_intelligence/hub';
import { MarkdownRenderer } from '../../../../common/components/markdown_editor';

export const ExecutiveAdvisoryPanel: React.FC<{
  advisory?: DashboardLatestAdvisory;
  isGenerating: boolean;
  onGenerateSummary: () => void;
  onHighlightReport: (reportId: string) => void;
  onFocusSourceReports: () => void;
}> = ({ advisory, isGenerating, onGenerateSummary, onHighlightReport, onFocusSourceReports }) => {
  const handleFirstSourceReport = useCallback(() => {
    const firstId = advisory?.report_ids[0];
    if (firstId) {
      onHighlightReport(firstId);
    }
    onFocusSourceReports();
  }, [advisory?.report_ids, onFocusSourceReports, onHighlightReport]);

  return (
    <EuiPanel hasBorder paddingSize="m" data-test-subj="threatIntelExecutiveAdvisory">
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
        <EuiFlexItem>
          <EuiTitle size="s">
            <h2>
              {i18n.translate(
                'xpack.securitySolution.threatIntelligence.app.executiveAdvisoryTitle',
                { defaultMessage: 'Executive summary' }
              )}
            </h2>
          </EuiTitle>
          <EuiText size="xs" color="subdued">
            {i18n.translate(
              'xpack.securitySolution.threatIntelligence.app.executiveAdvisoryDescription',
              {
                defaultMessage:
                  'Cross-report narrative synthesised from ingested threat intelligence for the selected window.',
              }
            )}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            size="s"
            iconType="sparkles"
            onClick={onGenerateSummary}
            isLoading={isGenerating}
            data-test-subj="threatIntelGenerateAdvisoryBtn"
          >
            {advisory
              ? i18n.translate(
                  'xpack.securitySolution.threatIntelligence.app.regenerateAdvisoryBtn',
                  { defaultMessage: 'Refresh summary' }
                )
              : i18n.translate(
                  'xpack.securitySolution.threatIntelligence.app.generateAdvisoryBtn',
                  { defaultMessage: 'Generate summary' }
                )}
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiHorizontalRule margin="m" />

      {!advisory ? (
        <EuiText size="s" color="subdued">
          {i18n.translate('xpack.securitySolution.threatIntelligence.app.executiveAdvisoryEmpty', {
            defaultMessage:
              'No executive summary yet. Generate one to see a narrative and recommended actions for the reports in this view.',
          })}
        </EuiText>
      ) : (
        <>
          {advisory.stale ? (
            <>
              <EuiCallOut
                announceOnMount
                size="s"
                color="warning"
                iconType="alert"
                title={i18n.translate(
                  'xpack.securitySolution.threatIntelligence.app.executiveAdvisoryStaleTitle',
                  { defaultMessage: 'Summary may be out of date' }
                )}
              >
                {i18n.translate(
                  'xpack.securitySolution.threatIntelligence.app.executiveAdvisoryStaleBody',
                  {
                    defaultMessage:
                      'Filters or the time range changed since this summary was generated. Refresh to align with the current view.',
                  }
                )}
              </EuiCallOut>
              <EuiSpacer size="m" />
            </>
          ) : null}

          <EuiTitle size="xs">
            <h3>{advisory.theme_title}</h3>
          </EuiTitle>
          <EuiSpacer size="s" />
          <MarkdownRenderer textSize="s">{advisory.narrative_markdown}</MarkdownRenderer>

          {advisory.recommended_actions.length > 0 ? (
            <>
              <EuiSpacer size="m" />
              <EuiText size="xs">
                <strong>
                  {i18n.translate(
                    'xpack.securitySolution.threatIntelligence.app.executiveAdvisoryActionsTitle',
                    { defaultMessage: 'What you should do this week' }
                  )}
                </strong>
              </EuiText>
              <EuiSpacer size="s" />
              <EuiListGroup bordered={false} maxWidth={false} wrapText>
                {advisory.recommended_actions.map((action) => (
                  <EuiListGroupItem key={action} label={action} />
                ))}
              </EuiListGroup>
            </>
          ) : null}

          <EuiSpacer size="m" />
          <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                <FormattedMessage
                  id="xpack.securitySolution.threatIntelligence.app.executiveAdvisoryMeta"
                  defaultMessage="From {reportCount, plural, one {# report} other {# reports}} · {envHits, plural, one {# with env hits} other {# with env hits}} · Generated {generatedAt}"
                  values={{
                    reportCount: advisory.report_ids.length,
                    envHits: advisory.source_reports_with_env_hits,
                    generatedAt: <FormattedRelative value={new Date(advisory.generated_at)} />,
                  }}
                />
              </EuiText>
            </EuiFlexItem>
            {advisory.report_ids.length > 0 ? (
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty size="xs" onClick={handleFirstSourceReport}>
                  {i18n.translate(
                    'xpack.securitySolution.threatIntelligence.app.executiveAdvisoryViewSources',
                    { defaultMessage: 'View source reports' }
                  )}
                </EuiButtonEmpty>
              </EuiFlexItem>
            ) : null}
          </EuiFlexGroup>
        </>
      )}
    </EuiPanel>
  );
};
