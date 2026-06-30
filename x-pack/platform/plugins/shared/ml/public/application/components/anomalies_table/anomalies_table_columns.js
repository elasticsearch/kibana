/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButtonIcon, EuiLink, EuiScreenReaderOnly, EuiIconTip, EuiToolTip } from '@elastic/eui';

import React from 'react';
import { get } from 'lodash';

import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { ML_JOB_AGGREGATION, isRuleSupported, isMultiBucketAnomaly } from '@kbn/ml-anomaly-utils';
import {
  formatHumanReadableDate,
  formatHumanReadableDateTime,
  formatHumanReadableDateTimeSeconds,
} from '@kbn/ml-date-utils';

import { DescriptionCell } from './description_cell';
import { DetectorCell } from './detector_cell';
import { EntityCell } from '../entity_cell';
import { InfluencersCell } from './influencers_cell';
import { LinksMenu } from './links_menu';
import { checkPermission } from '../../capabilities/check_capabilities';
import { INFLUENCERS_LIMIT, ANOMALIES_TABLE_TABS } from './anomalies_table_constants';
import { SeverityCell } from './severity_cell';
import { AnomalyValueDisplay } from './anomaly_value_display';

function renderTime(date, aggregationInterval) {
  if (aggregationInterval === 'hour') {
    return formatHumanReadableDateTime(date);
  } else if (aggregationInterval === 'second') {
    return formatHumanReadableDateTimeSeconds(date);
  } else {
    return formatHumanReadableDate(date);
  }
}

function showLinksMenuForItem(item, showViewSeriesLink, sourceIndicesWithGeoFields) {
  const canConfigureRules = isRuleSupported(item.source) && checkPermission('canUpdateJob');
  return (
    canConfigureRules ||
    (showViewSeriesLink && item.isTimeSeriesViewRecord) ||
    item.entityName === 'mlcategory' ||
    item.customUrls !== undefined ||
    item.detector.includes(ML_JOB_AGGREGATION.LAT_LONG) ||
    (item.sourceIndices &&
      item.sourceIndices(
        (sourceIndex) => sourceIndicesWithGeoFields[item.jobId][sourceIndex] !== undefined
      ))
  );
}

export function getColumns(
  mlFieldFormatService,
  items,
  jobIds,
  examplesByJobId,
  isAggregatedData,
  interval,
  bounds,
  showViewSeriesLink,
  showRuleEditorFlyout,
  itemIdToExpandedRowMap,
  toggleRow,
  filter,
  influencerFilter,
  sourceIndicesWithGeoFields,
  showAnomalyAlertFlyout
) {
  const columns = [
    {
      name: (
        <EuiScreenReaderOnly>
          <p>
            <FormattedMessage
              id="xpack.ml.anomaliesTable.showDetailsColumn.screenReaderDescription"
              defaultMessage="This column contains clickable controls for showing more details on each anomaly"
            />
          </p>
        </EuiScreenReaderOnly>
      ),
      render: (item) => {
        const toggleLabel = itemIdToExpandedRowMap[item.rowId]
          ? i18n.translate('xpack.ml.anomaliesTable.hideDetailsAriaLabel', {
              defaultMessage: 'Hide details',
            })
          : i18n.translate('xpack.ml.anomaliesTable.showDetailsAriaLabel', {
              defaultMessage: 'Show details',
            });
        return (
          <EuiToolTip content={toggleLabel} disableScreenReaderOutput>
            <EuiButtonIcon
              onClick={() => toggleRow(item)}
              iconType={
                itemIdToExpandedRowMap[item.rowId] ? 'chevronSingleDown' : 'chevronSingleRight'
              }
              aria-label={toggleLabel}
              data-row-id={item.rowId}
              data-test-subj="mlAnomaliesListRowDetailsToggle"
            />
          </EuiToolTip>
        );
      },
    },
    {
      field: 'time',
      'data-test-subj': 'mlAnomaliesListColumnTime',
      name: i18n.translate('xpack.ml.anomaliesTable.timeColumnName', {
        defaultMessage: 'Time',
      }),
      dataType: 'date',
      scope: 'row',
      render: (date) => renderTime(date, interval),
      textOnly: true,
      sortable: true,
    },
    {
      field: 'severity',
      'data-test-subj': 'mlAnomaliesListColumnSeverity',
      name: (
        <span>
          {i18n.translate('xpack.ml.anomaliesTable.severityColumnName', {
            defaultMessage: 'Score',
          })}
          &nbsp;
          <EuiIconTip
            size="s"
            color="subdued"
            type="question"
            className="eui-alignTop"
            content={i18n.translate('xpack.ml.overview.anomalyDetection.tableSeverityTooltip', {
              defaultMessage:
                'A normalized score between 0-100, which indicates the relative significance of the anomaly record results.',
            })}
          />
        </span>
      ),
      render: (score, item) => (
        <SeverityCell score={score} isMultiBucketAnomaly={isMultiBucketAnomaly(item.source)} />
      ),
      sortable: true,
    },
    {
      field: 'detector',
      'data-test-subj': 'mlAnomaliesListColumnDetector',
      name: i18n.translate('xpack.ml.anomaliesTable.detectorColumnName', {
        defaultMessage: 'Detector',
      }),
      render: (detectorDescription, item) => (
        <DetectorCell detectorDescription={detectorDescription} numberOfRules={item.rulesLength} />
      ),
      textOnly: true,
      sortable: true,
    },
  ];

  if (items.some((item) => item.entityValue !== undefined)) {
    columns.push({
      field: 'entityValue',
      'data-test-subj': 'mlAnomaliesListColumnFoundFor',
      name: i18n.translate('xpack.ml.anomaliesTable.entityValueColumnName', {
        defaultMessage: 'Found for',
      }),
      render: (entityValue, item) => (
        <EntityCell
          entityName={item.entityName}
          entityValue={entityValue}
          filter={filter}
          wrapText={true}
        />
      ),
      textOnly: true,
      sortable: true,
    });
  }

  if (items.some((item) => item.influencers !== undefined)) {
    columns.push({
      field: 'influencers',
      'data-test-subj': 'mlAnomaliesListColumnInfluencers',
      name: i18n.translate('xpack.ml.anomaliesTable.influencersColumnName', {
        defaultMessage: 'Influenced by',
      }),
      render: (influencers) => (
        <InfluencersCell
          limit={INFLUENCERS_LIMIT}
          influencers={influencers}
          influencerFilter={influencerFilter}
        />
      ),
      textOnly: true,
      sortable: true,
    });
  }

  // Map the additional 'sort' fields to the actual, typical and description
  // fields to ensure sorting is done correctly on the underlying metric value
  // and not on e.g. the actual values array as a String.
  if (items.some((item) => item.actual !== undefined)) {
    columns.push({
      field: 'actualSort',
      'data-test-subj': 'mlAnomaliesListColumnActual',
      name: (
        <span>
          {i18n.translate('xpack.ml.anomaliesTable.actualSortColumnName', {
            defaultMessage: 'Actual',
          })}
          &nbsp;
          <EuiIconTip
            size="s"
            color="subdued"
            type="question"
            className="eui-alignTop"
            content={i18n.translate('xpack.ml.overview.anomalyDetection.tableActualTooltip', {
              defaultMessage: 'The actual values in the anomaly record results.',
            })}
          />
        </span>
      ),
      render: (actual, item) => {
        const fieldFormat = mlFieldFormatService.getFieldFormat(
          item.jobId,
          item.source.detector_index
        );
        return (
          <AnomalyValueDisplay
            value={item.actual}
            function={item.source.function}
            fieldFormat={fieldFormat}
            record={item.source}
          />
        );
      },
      sortable: true,
      className: 'eui-textBreakNormal',
    });
  }

  if (items.some((item) => item.typical !== undefined)) {
    columns.push({
      field: 'typicalSort',
      'data-test-subj': 'mlAnomaliesListColumnTypical',
      name: (
        <span>
          {i18n.translate('xpack.ml.anomaliesTable.typicalSortColumnName', {
            defaultMessage: 'Typical',
          })}
          &nbsp;
          <EuiIconTip
            size="s"
            color="subdued"
            type="question"
            className="eui-alignTop"
            content={i18n.translate('xpack.ml.overview.anomalyDetection.tableTypicalTooltip', {
              defaultMessage: 'The typical values in the anomaly record results.',
            })}
          />
        </span>
      ),
      render: (typical, item) => {
        const fieldFormat = mlFieldFormatService.getFieldFormat(
          item.jobId,
          item.source.detector_index
        );
        return (
          <AnomalyValueDisplay
            value={item.typical}
            function={item.source.function}
            fieldFormat={fieldFormat}
            record={item.source}
          />
        );
      },
      sortable: true,
      className: 'eui-textBreakNormal',
    });

    // Assume that if we are showing typical, there will be an actual too,
    // so we can add a column to describe how actual compares to typical.
    const nonTimeOfDayOrWeek = items.some((item) => {
      const summaryRecFunc = item.source.function;
      return summaryRecFunc !== 'time_of_day' && summaryRecFunc !== 'time_of_week';
    });
    if (nonTimeOfDayOrWeek === true) {
      columns.push({
        field: 'metricDescriptionSort',
        'data-test-subj': 'mlAnomaliesListColumnDescription',
        name: i18n.translate('xpack.ml.anomaliesTable.metricDescriptionSortColumnName', {
          defaultMessage: 'Description',
        }),
        render: (metricDescriptionSort, item) => (
          <DescriptionCell actual={item.actual} typical={item.typical} />
        ),
        textOnly: true,
        sortable: true,
      });
    }
  }

  if (jobIds && jobIds.length > 1) {
    columns.push({
      field: 'jobId',
      'data-test-subj': 'mlAnomaliesListColumnJobID',
      name: i18n.translate('xpack.ml.anomaliesTable.jobIdColumnName', {
        defaultMessage: 'Job ID',
      }),
      sortable: true,
    });
  }

  const showExamples = items.some((item) => item.entityName === 'mlcategory');
  if (showExamples === true) {
    columns.push({
      'data-test-subj': 'mlAnomaliesListColumnCategoryExamples',
      name: i18n.translate('xpack.ml.anomaliesTable.categoryExamplesColumnName', {
        defaultMessage: 'Category examples',
      }),
      truncateText: true,
      render: (item) => {
        const examples = get(examplesByJobId, [item.jobId, item.entityValue], []);
        return (
          <EuiLink
            css={{
              width: '100%',
            }}
            onClick={() => toggleRow(item, ANOMALIES_TABLE_TABS.CATEGORY_EXAMPLES)}
          >
            {examples.map((example, i) => {
              return (
                <span
                  key={`example${i}`}
                  css={{
                    display: 'block',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {example}
                </span>
              );
            })}
          </EuiLink>
        );
      },
      width: '13%',
    });
  }

  const showLinks = items.some((item) =>
    showLinksMenuForItem(item, showViewSeriesLink, sourceIndicesWithGeoFields)
  );

  if (showLinks === true) {
    columns.push({
      'data-test-subj': 'mlAnomaliesListColumnAction',
      name: i18n.translate('xpack.ml.anomaliesTable.actionsColumnName', {
        defaultMessage: 'Actions',
      }),
      render: (item) => {
        if (showLinksMenuForItem(item, showViewSeriesLink, sourceIndicesWithGeoFields) === true) {
          return (
            <LinksMenu
              anomaly={item}
              bounds={bounds}
              showViewSeriesLink={showViewSeriesLink}
              isAggregatedData={isAggregatedData}
              interval={interval}
              showRuleEditorFlyout={showRuleEditorFlyout}
              sourceIndicesWithGeoFields={sourceIndicesWithGeoFields}
              showAnomalyAlertFlyout={showAnomalyAlertFlyout}
            />
          );
        } else {
          return null;
        }
      },
    });
  }

  return columns;
}
