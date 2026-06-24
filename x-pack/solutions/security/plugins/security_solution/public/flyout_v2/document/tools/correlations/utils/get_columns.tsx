/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { type EuiBasicTableColumn, EuiButtonIcon, EuiToolTip, formatDate } from '@elastic/eui';
import { Severity } from '@kbn/securitysolution-io-ts-alerting-types';
import { isRight } from 'fp-ts/Either';
import { ALERT_REASON, ALERT_RULE_NAME } from '@kbn/rule-data-utils';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { SeverityBadge } from '../../../../../common/components/severity_badge';
import { PreviewLink } from '../../../../../flyout/shared/components/preview_link';
import { OpenFlyoutLink } from '../../../../shared/components/open_flyout_link';

export const TIMESTAMP_DATE_FORMAT = 'MMM D, YYYY @ HH:mm:ss.SSS';

/**
 * Returns the default columns for the correlations alerts table.
 */
export const getColumns = ({
  scopeId,
  dataTestSubj,
  onShowAlert,
  useLegacyExpandableFlyout,
}: {
  scopeId: string;
  dataTestSubj?: string;
  onShowAlert: (id: string, indexName: string) => void;
  useLegacyExpandableFlyout?: boolean;
}): Array<EuiBasicTableColumn<Record<string, unknown>>> => [
  {
    render: (row: Record<string, unknown>) => (
      <EuiToolTip
        content={i18n.translate(
          'xpack.securitySolution.flyout.correlations.alertPreview.ariaLabel',
          {
            defaultMessage: 'Preview alert with id {id}',
            values: { id: row.id as string },
          }
        )}
        disableScreenReaderOutput
      >
        <EuiButtonIcon
          iconType="expand"
          data-test-subj={`${dataTestSubj}AlertPreviewButton`}
          onClick={() => onShowAlert(row.id as string, row.index as string)}
          aria-label={i18n.translate(
            'xpack.securitySolution.flyout.correlations.alertPreview.ariaLabel',
            {
              defaultMessage: 'Preview alert with id {id}',
              values: { id: row.id as string },
            }
          )}
        />
      </EuiToolTip>
    ),
    width: '5%',
  },
  {
    field: '@timestamp',
    name: (
      <FormattedMessage
        id="xpack.securitySolution.flyout.correlations.timestampColumnLabel"
        defaultMessage="Timestamp"
      />
    ),
    truncateText: true,
    dataType: 'date' as const,
    render: (value: string) => {
      const date = formatDate(value, TIMESTAMP_DATE_FORMAT);
      return (
        <EuiToolTip content={date}>
          <span>{date}</span>
        </EuiToolTip>
      );
    },
  },
  {
    name: (
      <FormattedMessage
        id="xpack.securitySolution.flyout.correlations.ruleColumnLabel"
        defaultMessage="Rule"
      />
    ),
    truncateText: true,
    render: (row: Record<string, unknown>) => {
      const ruleName = row[ALERT_RULE_NAME] as string;
      const ruleId = row['kibana.alert.rule.uuid'] as string;
      return (
        <EuiToolTip content={ruleName}>
          {useLegacyExpandableFlyout ? (
            <PreviewLink
              field={ALERT_RULE_NAME}
              value={ruleName}
              scopeId={scopeId}
              ruleId={ruleId}
              data-test-subj={`${dataTestSubj}RulePreview`}
            >
              <span>{ruleName}</span>
            </PreviewLink>
          ) : (
            <OpenFlyoutLink
              field={ALERT_RULE_NAME}
              value={ruleId}
              data-test-subj={`${dataTestSubj}RuleLink`}
            >
              <span>{ruleName}</span>
            </OpenFlyoutLink>
          )}
        </EuiToolTip>
      );
    },
  },
  {
    field: ALERT_REASON,
    name: (
      <FormattedMessage
        id="xpack.securitySolution.flyout.correlations.reasonColumnLabel"
        defaultMessage="Reason"
      />
    ),
    truncateText: true,
    render: (value: string) => (
      <EuiToolTip content={value} position="left">
        <span>{value}</span>
      </EuiToolTip>
    ),
  },
  {
    field: 'kibana.alert.severity',
    name: (
      <FormattedMessage
        id="xpack.securitySolution.flyout.correlations.severityColumnLabel"
        defaultMessage="Severity"
      />
    ),
    truncateText: true,
    render: (value: string) => {
      const decodedSeverity = Severity.decode(value);
      const renderValue = isRight(decodedSeverity) ? (
        <SeverityBadge value={decodedSeverity.right} />
      ) : (
        <p>{value}</p>
      );
      return <EuiToolTip content={value}>{renderValue}</EuiToolTip>;
    },
  },
];
