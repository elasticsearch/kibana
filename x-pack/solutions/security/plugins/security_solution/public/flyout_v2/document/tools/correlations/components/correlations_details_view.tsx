/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo } from 'react';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { DataTableRecord } from '@kbn/discover-utils';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import { useShowRelatedAttacks } from '../hooks/use_show_related_attacks';
import { useShowRelatedAlertsByAncestry } from '../hooks/use_show_related_alerts_by_ancestry';
import { useShowRelatedAlertsBySameSourceEvent } from '../hooks/use_show_related_alerts_by_same_source_event';
import { useShowRelatedAlertsBySession } from '../hooks/use_show_related_alerts_by_session';
import { useShowRelatedCases } from '../hooks/use_show_related_cases';
import { useShowSuppressedAlerts } from '../hooks/use_show_suppressed_alerts';
import { SuppressedAlerts } from './suppressed_alerts';
import { RelatedCases } from './related_cases';
import { RelatedAlertsBySameSourceEvent } from './related_alerts_by_same_source_event';
import { RelatedAlertsBySession } from './related_alerts_by_session';
import { RelatedAlertsByAncestry } from './related_alerts_by_ancestry';
import { RelatedAttacks } from './related_attacks';

export interface CorrelationsDetailsViewProps {
  /**
   * Alert/event document
   */
  hit: DataTableRecord;
  /**
   * Scope ID for the document
   */
  scopeId: string;
  /**
   * Whether the document is being displayed in a rule preview
   */
  isRulePreview: boolean;
  /**
   * Callback to open an alert preview when clicking the preview button in the correlations table
   */
  onShowAlert: (id: string, indexName: string) => void;
  /**
   * Callback to open an attack preview when clicking the expand button in the related attacks table.
   * When not provided, the expand button column is hidden.
   * // TODO make required once we have an attack flyout in the new flyout system
   */
  onShowAttack?: (id: string, indexName: string) => void;
  /**
   * Whether to render rule links as PreviewLink (legacy expandable flyout) instead of OpenFlyoutLink (new flyout system)
   */
  useLegacyExpandableFlyout: boolean;
}

/**
 * Correlations content view. Renders the correlations sections without any flyout chrome,
 * so it can be used both inside a flyout body and inline in a tab panel.
 */
export const CorrelationsDetailsView = memo(
  ({
    hit,
    scopeId,
    isRulePreview,
    onShowAlert,
    onShowAttack,
    useLegacyExpandableFlyout,
  }: CorrelationsDetailsViewProps) => {
    const eventId = hit.raw._id ?? '';
    const ecsData = useMemo<Ecs>(
      () => ({
        ...(hit.raw._source ?? {}),
        _id: hit.raw._id ?? '',
        _index: hit.raw._index,
      }),
      [hit]
    );

    const { show: showAlertsByAncestry, ancestryDocumentId } = useShowRelatedAlertsByAncestry({
      hit,
      isRulePreview,
    });
    const { show: showSameSourceAlerts, originalEventId } = useShowRelatedAlertsBySameSourceEvent({
      hit,
    });
    const { show: showAlertsBySession, entityId } = useShowRelatedAlertsBySession({ hit });
    const showCases = useShowRelatedCases({ hit });
    const { show: showSuppressedAlerts, alertSuppressionCount } = useShowSuppressedAlerts({
      hit,
    });
    const { show: showRelatedAttacks, attackIds } = useShowRelatedAttacks({ hit });

    const canShowAtLeastOneInsight =
      showAlertsByAncestry ||
      showSameSourceAlerts ||
      showAlertsBySession ||
      showRelatedAttacks ||
      showCases ||
      showSuppressedAlerts;

    return (
      <>
        {canShowAtLeastOneInsight ? (
          <EuiFlexGroup gutterSize="l" direction="column">
            {showSuppressedAlerts && (
              <EuiFlexItem>
                <SuppressedAlerts
                  alertSuppressionCount={alertSuppressionCount}
                  ecsData={ecsData}
                  showInvestigateInTimeline={!isRulePreview}
                />
              </EuiFlexItem>
            )}
            {showCases && (
              <EuiFlexItem>
                <RelatedCases eventId={eventId} />
              </EuiFlexItem>
            )}
            {showSameSourceAlerts && (
              <EuiFlexItem>
                <RelatedAlertsBySameSourceEvent
                  originalEventId={originalEventId}
                  scopeId={scopeId}
                  eventId={eventId}
                  onShowAlert={onShowAlert}
                  useLegacyExpandableFlyout={useLegacyExpandableFlyout}
                />
              </EuiFlexItem>
            )}
            {showAlertsBySession && entityId && (
              <EuiFlexItem>
                <RelatedAlertsBySession
                  entityId={entityId}
                  scopeId={scopeId}
                  eventId={eventId}
                  onShowAlert={onShowAlert}
                  useLegacyExpandableFlyout={useLegacyExpandableFlyout}
                />
              </EuiFlexItem>
            )}
            {showAlertsByAncestry && (
              <EuiFlexItem>
                <RelatedAlertsByAncestry
                  scopeId={scopeId}
                  documentId={ancestryDocumentId}
                  onShowAlert={onShowAlert}
                  useLegacyExpandableFlyout={useLegacyExpandableFlyout}
                />
              </EuiFlexItem>
            )}
            {showRelatedAttacks && (
              <EuiFlexItem>
                <RelatedAttacks
                  attackIds={attackIds}
                  scopeId={scopeId}
                  eventId={eventId}
                  onShowAttack={onShowAttack}
                />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        ) : (
          <FormattedMessage
            id="xpack.securitySolution.flyout.correlations.noDataDescription"
            defaultMessage="No correlations data available."
          />
        )}
      </>
    );
  }
);

CorrelationsDetailsView.displayName = 'CorrelationsDetailsView';
