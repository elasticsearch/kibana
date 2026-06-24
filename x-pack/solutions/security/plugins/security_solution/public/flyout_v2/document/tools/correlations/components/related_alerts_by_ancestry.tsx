/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { CorrelationsDetailsAlertsTable } from './correlations_details_alerts_table';
import { useFetchRelatedAlertsByAncestry } from '../../../main/hooks/use_fetch_related_alerts_by_ancestry';
import { CORRELATIONS_DETAILS_BY_ANCESTRY_SECTION_TEST_ID } from './test_ids';
import { getColumns } from '../utils/get_columns';
import { useSecurityDefaultPatterns } from '../../../../../data_view_manager/hooks/use_security_default_patterns';

export interface RelatedAlertsByAncestryProps {
  /**
   * Id of the document
   */
  documentId: string;
  /**
   * Maintain backwards compatibility // TODO remove when possible
   */
  scopeId: string;
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
 * Show related alerts by ancestry in an expandable panel with a table
 */
export const RelatedAlertsByAncestry: React.FC<RelatedAlertsByAncestryProps> = ({
  documentId,
  scopeId,
  onShowAlert,
  useLegacyExpandableFlyout,
}) => {
  const { indexPatterns } = useSecurityDefaultPatterns();

  const { loading, error, data, dataCount } = useFetchRelatedAlertsByAncestry({
    documentId,
    indices: indexPatterns,
  });

  const columns = useMemo(
    () =>
      getColumns({
        scopeId,
        dataTestSubj: CORRELATIONS_DETAILS_BY_ANCESTRY_SECTION_TEST_ID,
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
          id="xpack.securitySolution.flyout.correlations.ancestryAlertsTitle"
          defaultMessage="{count} {count, plural, one {alert} other {alerts}} related by ancestry"
          values={{ count: dataCount }}
        />
      }
      loading={loading}
      alertIds={data}
      scopeId={scopeId}
      eventId={documentId}
      noItemsMessage={
        <FormattedMessage
          id="xpack.securitySolution.flyout.correlations.ancestryAlertsNoDataDescription"
          defaultMessage="No alerts related by ancestry."
        />
      }
      columns={columns}
      data-test-subj={CORRELATIONS_DETAILS_BY_ANCESTRY_SECTION_TEST_ID}
    />
  );
};

RelatedAlertsByAncestry.displayName = 'RelatedAlertsByAncestry';
