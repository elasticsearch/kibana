/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { ALERT_RULE_TYPE_ID, ALERT_RULE_CONSUMER, TIMESTAMP } from '@kbn/rule-data-utils';
import { useFetchAlertsIndexNamesQuery } from '@kbn/alerts-ui-shared';
import moment from 'moment';
import { useAlertsTableContext } from '../contexts/alerts_table_context';
import { useCreateCsvReport } from '../hooks/use_create_csv_report';

const CSV_EXPORT_LABEL = i18n.translate('responseOpsAlertsTable.csvExport.buttonLabel', {
  defaultMessage: 'CSV export',
});

export const CsvExportButton: React.FC = () => {
  const { services, kibanaVersion, ruleTypeIds, consumers, query, sort, columns } =
    useAlertsTableContext();
  const { http, notifications, rendering, settings, application } = services;
  const { data: indexNames } = useFetchAlertsIndexNamesQuery({ http, ruleTypeIds });

  const { capabilities } = application;
  const hasCsvReportingCapability =
    capabilities.dashboard_v2?.downloadCsv === true ||
    capabilities.reportingLegacy?.generateReport === true;

  const { mutate: createCsvReport, isLoading: isExporting } = useCreateCsvReport({
    http,
    notifications,
    rendering,
  });

  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(() => {
    buttonRef.current?.blur();

    const indexPattern = (indexNames ?? []).join(',');

    const timeZoneSetting = settings.client.get('dateFormat:tz');
    const browserTimezone = moment.tz.zone(timeZoneSetting)?.name ?? moment.tz.guess(true);

    const columnIds = columns.map((col) => col.id);

    const filters = [];

    if (query.bool) {
      filters.push({
        query: { bool: query.bool },
        meta: { disabled: false },
      });
    }

    if (query.ids) {
      filters.push({
        query: { ids: query.ids },
        meta: { disabled: false },
      });
    }

    if (ruleTypeIds.length > 0) {
      filters.push({
        query: { terms: { [ALERT_RULE_TYPE_ID]: ruleTypeIds } },
        meta: { disabled: false },
      });
    }

    if (consumers && consumers.length > 0) {
      filters.push({
        query: { terms: { [ALERT_RULE_CONSUMER]: consumers } },
        meta: { disabled: false },
      });
    }

    createCsvReport({
      title: 'Alerts',
      objectType: 'alert',
      browserTimezone,
      version: kibanaVersion ?? '',
      searchSource: {
        index: {
          title: indexPattern,
          timeFieldName: TIMESTAMP,
        },
        query: { query: '', language: 'kuery' },
        filter: filters,
        sort,
      },
      columns: columnIds,
    });
  }, [
    indexNames,
    settings.client,
    columns,
    query.bool,
    query.ids,
    ruleTypeIds,
    consumers,
    createCsvReport,
    kibanaVersion,
    sort,
  ]);

  if (!rendering || !hasCsvReportingCapability) {
    return null;
  }

  return (
    <EuiToolTip content={CSV_EXPORT_LABEL} disableScreenReaderOutput>
      <EuiButtonIcon
        buttonRef={buttonRef}
        color="text"
        iconType="exportAction"
        onClick={handleClick}
        isLoading={isExporting}
        aria-label={CSV_EXPORT_LABEL}
        data-test-subj="alerts-csv-export-button"
      />
    </EuiToolTip>
  );
};

// eslint-disable-next-line import/no-default-export
export default CsvExportButton;
