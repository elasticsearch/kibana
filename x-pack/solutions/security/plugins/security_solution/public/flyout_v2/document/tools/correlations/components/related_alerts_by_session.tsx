/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { CorrelationsDetailsAlertsTable } from './correlations_details_alerts_table';
import { useFetchRelatedAlertsBySession } from '../../../main/hooks/use_fetch_related_alerts_by_session';
import { CORRELATIONS_DETAILS_BY_SESSION_SECTION_TEST_ID } from './test_ids';
import { getColumns } from '../utils/get_columns';

export interface RelatedAlertsBySessionProps {
  /**
   * Value of the process.entry_leader.entity_id field
   */
  entityId: string;
  /**
   * Maintain backwards compatibility // TODO remove when possible
   */
  scopeId: string;
  /**
   * Id of the document
   */
  eventId: string;
  /**
   * Callback to open the alert preview
   */
  onShowAlert: (id: string, indexName: string) => void;
  /**
   * Whether to render rule links as PreviewLink (legacy expandable flyout) instead of OpenFlyoutLink (new flyout system)
   */
  useLegacyExpandableFlyout: boolean;
}

/**
 * Show related alerts by session in an expandable panel with a table
 */
export const RelatedAlertsBySession: React.FC<RelatedAlertsBySessionProps> = ({
  entityId,
  scopeId,
  eventId,
  onShowAlert,
  useLegacyExpandableFlyout,
}) => {
  const { loading, error, data, dataCount } = useFetchRelatedAlertsBySession({
    entityId,
    scopeId,
  });

  const columns = useMemo(
    () =>
      getColumns({
        scopeId,
        dataTestSubj: CORRELATIONS_DETAILS_BY_SESSION_SECTION_TEST_ID,
        onShowAlert,
        useLegacyExpandableFlyout,
      }),
    [scopeId, onShowAlert, useLegacyExpandableFlyout]
  );

  if (error) {
    return null;
  }

  return (
    <CorrelationsDetailsAlertsTable
      title={
        <FormattedMessage
          id="xpack.securitySolution.flyout.correlations.sessionAlertsTitle"
          defaultMessage="{count} {count, plural, one {alert} other {alerts}} related by session"
          values={{ count: dataCount }}
        />
      }
      loading={loading}
      alertIds={data}
      scopeId={scopeId}
      eventId={eventId}
      noItemsMessage={
        <FormattedMessage
          id="xpack.securitySolution.flyout.correlations.sessionAlertsNoDataDescription"
          defaultMessage="No alerts related by session."
        />
      }
      columns={columns}
      data-test-subj={CORRELATIONS_DETAILS_BY_SESSION_SECTION_TEST_ID}
    />
  );
};

RelatedAlertsBySession.displayName = 'RelatedAlertsBySession';
