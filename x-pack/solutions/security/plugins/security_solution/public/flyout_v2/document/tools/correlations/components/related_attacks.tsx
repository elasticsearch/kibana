/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { PageScope } from '../../../../../data_view_manager/constants';
import { useDataView } from '../../../../../data_view_manager/hooks/use_data_view';
import {
  type CorrelationsCustomTableColumn,
  CorrelationsDetailsAlertsTable,
} from './correlations_details_alerts_table';
import { CORRELATIONS_DETAILS_RELATED_ATTACKS_SECTION_TEST_ID } from './test_ids';

export interface RelatedAttacksProps {
  /**
   * Value of the kibana.alert.attack_ids field
   */
  attackIds: string[];
  /**
   * Maintain backwards compatibility // TODO remove when possible
   */
  scopeId: string;
  /**
   * Id of the document
   */
  eventId: string;
  /**
   * Callback to open an attack preview when clicking the expand button.
   * When not provided, the expand button column is hidden.
   * // TODO make required once we have an attack flyout in the new flyout system
   */
  onShowAttack?: (id: string, indexName: string) => void;
}

/**
 * Show related attacks in an expandable panel with a table.
 */
export const RelatedAttacks: React.FC<RelatedAttacksProps> = ({
  attackIds,
  scopeId,
  eventId,
  onShowAttack,
}) => {
  const { dataView } = useDataView(PageScope.attacks);
  const attackIndexName = useMemo(() => dataView.getIndexPattern(), [dataView]);
  const columns = useMemo<Array<CorrelationsCustomTableColumn>>(
    () => [
      ...(onShowAttack
        ? [
            {
              render: (row: Record<string, unknown>) => (
                <EuiToolTip
                  content={i18n.translate(
                    'xpack.securitySolution.flyout.correlations.relatedAttacksPreviewButtonLabel',
                    {
                      defaultMessage: 'Preview attack with id {id}',
                      values: { id: row.id as string },
                    }
                  )}
                  disableScreenReaderOutput
                >
                  <EuiButtonIcon
                    iconType="expand"
                    data-test-subj={`${CORRELATIONS_DETAILS_RELATED_ATTACKS_SECTION_TEST_ID}AlertPreviewButton`}
                    onClick={() => onShowAttack(row.id as string, row.index as string)}
                    aria-label={i18n.translate(
                      'xpack.securitySolution.flyout.correlations.relatedAttacksPreviewButtonLabel',
                      {
                        defaultMessage: 'Preview attack with id {id}',
                        values: { id: row.id as string },
                      }
                    )}
                  />
                </EuiToolTip>
              ),
              width: '5%',
            } as CorrelationsCustomTableColumn,
          ]
        : []),
      {
        field: 'kibana.alert.attack_discovery.title',
        name: (
          <FormattedMessage
            id="xpack.securitySolution.flyout.correlations.relatedAttacksTitleColumnLabel"
            defaultMessage="Title"
          />
        ),
        truncateText: true,
        render: (value?: unknown) => String(value ?? ''),
      },
      {
        field: 'kibana.alert.workflow_status',
        name: (
          <FormattedMessage
            id="xpack.securitySolution.flyout.correlations.relatedAttacksStatusColumnLabel"
            defaultMessage="Status"
          />
        ),
        truncateText: true,
        width: '100px',
        render: (value?: unknown) => String(value ?? ''),
      },
      {
        field: 'kibana.alert.attack_discovery.alert_ids',
        name: (
          <FormattedMessage
            id="xpack.securitySolution.flyout.correlations.relatedAttacksAlertCountColumnLabel"
            defaultMessage="Alert count"
          />
        ),
        truncateText: true,
        preserveArray: true,
        width: '100px',
        render: (value: unknown) => (Array.isArray(value) ? value.length : ''),
      },
    ],
    [onShowAttack]
  );

  return (
    <CorrelationsDetailsAlertsTable
      title={
        <FormattedMessage
          id="xpack.securitySolution.flyout.correlations.relatedAttacksTitle"
          defaultMessage="Related attacks ({count})"
          values={{ count: attackIds.length }}
        />
      }
      loading={false}
      alertIds={attackIds}
      scopeId={scopeId}
      eventId={eventId}
      indexName={attackIndexName}
      columns={columns}
      timelineDataViewId={dataView.id}
      noItemsMessage={
        <FormattedMessage
          id="xpack.securitySolution.flyout.correlations.relatedAttacksNoDataDescription"
          defaultMessage="No related attacks."
        />
      }
      data-test-subj={CORRELATIONS_DETAILS_RELATED_ATTACKS_SECTION_TEST_ID}
    />
  );
};

RelatedAttacks.displayName = 'RelatedAttacks';
