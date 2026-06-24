/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { useFetchRelatedAlertsBySameSourceEvent } from '../../../main/hooks/use_fetch_related_alerts_by_same_source_event';
import { CORRELATIONS_DETAILS_BY_SOURCE_SECTION_TEST_ID } from './test_ids';
import { CorrelationsDetailsAlertsTable } from './correlations_details_alerts_table';
import { getColumns } from '../utils/get_columns';

export interface RelatedAlertsBySameSourceEventProps {
  /**
   * Value of the kibana.alert.original_event.id field
   */
  originalEventId: string;
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
 * Show related alerts by same source event in an expandable panel with a table
 */
export const RelatedAlertsBySameSourceEvent: React.FC<RelatedAlertsBySameSourceEventProps> = ({
  originalEventId,
  scopeId,
  eventId,
  onShowAlert,
  useLegacyExpandableFlyout,
}) => {
  const { loading, data, dataCount } = useFetchRelatedAlertsBySameSourceEvent({
    originalEventId,
    scopeId,
  });

  const columns = useMemo(
    () =>
      getColumns({
        scopeId,
        dataTestSubj: CORRELATIONS_DETAILS_BY_SOURCE_SECTION_TEST_ID,
        onShowAlert,
        useLegacyExpandableFlyout,
      }),
    [scopeId, onShowAlert, useLegacyExpandableFlyout]
  );

  return (
    <CorrelationsDetailsAlertsTable
      title={
        <FormattedMessage
          id="xpack.securitySolution.flyout.correlations.sourceAlertsTitle"
          defaultMessage="{count} {count, plural, one {alert} other {alerts}} related by source event"
          values={{ count: dataCount }}
        />
      }
      loading={loading}
      alertIds={data}
      scopeId={scopeId}
      eventId={eventId}
      noItemsMessage={
        <FormattedMessage
          id="xpack.securitySolution.flyout.correlations.sourceAlertsNoDataDescription"
          defaultMessage="No related source events."
        />
      }
      columns={columns}
      data-test-subj={CORRELATIONS_DETAILS_BY_SOURCE_SECTION_TEST_ID}
    />
  );
};

RelatedAlertsBySameSourceEvent.displayName = 'RelatedAlertsBySameSourceEvent';
