/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { forwardRef, useMemo, useState } from 'react';
import type { DataTableRecord } from '@kbn/discover-utils';
import type { EuiBasicTableColumn } from '@elastic/eui';
import {
  EuiAccordion,
  EuiBadge,
  EuiBetaBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiTitle,
  EuiBasicTable,
  useGeneratedHtmlId,
  EuiHeaderLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { orderBy } from 'lodash';
import { getRouterLinkProps } from '@kbn/router-utils';
import type { DataQualityDetailsLocatorParams } from '@kbn/deeplinks-observability';
import { DATA_QUALITY_DETAILS_LOCATOR_ID } from '@kbn/deeplinks-observability';
import type { BrowserUrlService } from '@kbn/share-plugin/public';
import { isNonLocalIndexName } from '@kbn/es-query';
import { getUnifiedDocViewerServices } from '../../plugin';
import type { ScrollableSectionWrapperApi } from './scrollable_section_wrapper';
import { ScrollableSectionWrapper } from './scrollable_section_wrapper';

type Direction = 'asc' | 'desc';
type SortField = 'issue' | 'values';

const DEFAULT_SORT_FIELD = 'issue';
const DEFAULT_SORT_DIRECTION = 'asc';
const DEFAULT_ROWS_PER_PAGE = 5;

interface DegradedField {
  issue: string;
  values: string[];
}

interface TableOptions {
  page: {
    index: number;
    size: number;
  };
  sort: {
    field: SortField;
    direction: Direction;
  };
}

const DEFAULT_TABLE_OPTIONS: TableOptions = {
  page: {
    index: 0,
    size: 0,
  },
  sort: {
    field: DEFAULT_SORT_FIELD,
    direction: DEFAULT_SORT_DIRECTION,
  },
};

const qualityIssuesAccordionTitle = i18n.translate(
  'unifiedDocViewer.docView.logsOverview.accordion.title.qualityIssues',
  {
    defaultMessage: 'Quality Issues',
  }
);

const qualityIssuesAccordionTechPreviewBadge = i18n.translate(
  'unifiedDocViewer.docView.logsOverview.accordion.title.techPreview',
  {
    defaultMessage: 'TECH PREVIEW',
  }
);

const issueColumnName = i18n.translate(
  'unifiedDocViewer.docView.logsOverview.accordion.qualityIssues.table.field',
  {
    defaultMessage: 'Issue',
  }
);

const valuesColumnName = i18n.translate(
  'unifiedDocViewer.docView.logsOverview.accordion.qualityIssues.table.values',
  {
    defaultMessage: 'Values',
  }
);

const textFieldIgnored = i18n.translate(
  'unifiedDocViewer.docView.logsOverview.accordion.qualityIssues.table.textIgnored',
  {
    defaultMessage: 'field ignored',
  }
);

export const datasetQualityLinkTitle = i18n.translate(
  'unifiedDocViewer.docView.logsOverview.accordion.qualityIssues.table.datasetQualityLinkTitle',
  {
    defaultMessage: 'Data set details',
  }
);

export const LogsOverviewDegradedFields = forwardRef<
  ScrollableSectionWrapperApi,
  { rawDoc: DataTableRecord['raw'] }
>(({ rawDoc }, ref) => {
  const { ignored_field_values: ignoredFieldValues = {}, fields: sourceFields = {} } = rawDoc;
  const countOfDegradedFields = Object.keys(ignoredFieldValues)?.length;

  const columns = getDegradedFieldsColumns();
  const tableData = getDataFormattedForTable(ignoredFieldValues);

  const dataStream = getDataStreamRawName(sourceFields);

  const accordionId = useGeneratedHtmlId({
    prefix: qualityIssuesAccordionTitle,
  });

  const isCCSRemoteIndex = isNonLocalIndexName(rawDoc._index ?? '');

  const [tableOptions, setTableOptions] = useState<TableOptions>(DEFAULT_TABLE_OPTIONS);

  const onTableChange = (options: {
    page: { index: number; size: number };
    sort?: { field: SortField; direction: Direction };
  }) => {
    setTableOptions({
      page: {
        index: options.page.index,
        size: options.page.size,
      },
      sort: {
        field: options.sort?.field ?? DEFAULT_SORT_FIELD,
        direction: options.sort?.direction ?? DEFAULT_SORT_DIRECTION,
      },
    });
  };

  const pagination = useMemo(
    () => ({
      pageIndex: tableOptions.page.index,
      pageSize: DEFAULT_ROWS_PER_PAGE,
      totalItemCount: tableData?.length ?? 0,
      hidePerPageOptions: true,
    }),
    [tableData, tableOptions]
  );

  const renderedItems = useMemo(() => {
    const sortedItems = orderBy(tableData, tableOptions.sort.field, tableOptions.sort.direction);
    return sortedItems.slice(
      tableOptions.page.index * DEFAULT_ROWS_PER_PAGE,
      (tableOptions.page.index + 1) * DEFAULT_ROWS_PER_PAGE
    );
  }, [tableData, tableOptions]);

  const { share } = getUnifiedDocViewerServices();
  const { url: urlService } = share;

  const accordionTitle = (
    <EuiFlexGroup alignItems="center" gutterSize="s" direction="row">
      <EuiFlexItem grow={false}>
        <EuiTitle size="xs">
          <p>{qualityIssuesAccordionTitle}</p>
        </EuiTitle>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiBadge
          color="default"
          data-test-subj="unifiedDocViewLogsOverviewDegradedFieldTitleCount"
        >
          {countOfDegradedFields}
        </EuiBadge>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiBetaBadge
          label={qualityIssuesAccordionTechPreviewBadge}
          color="hollow"
          data-test-subj="unifiedDocViewLogsOverviewDegradedFieldsTechPreview"
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  const [isAccordionExpanded, setIsAccordionExpanded] = useState(false);

  return countOfDegradedFields > 0 ? (
    <ScrollableSectionWrapper ref={ref}>
      {({ forceState, onToggle }) => {
        return (
          <>
            <EuiAccordion
              id={accordionId}
              buttonContent={accordionTitle}
              forceState={forceState}
              onToggle={(isOpen: boolean) => {
                setIsAccordionExpanded(isOpen);
                if (onToggle) {
                  onToggle(isOpen);
                }
              }}
              extraAction={
                !isCCSRemoteIndex && (
                  <DatasetQualityLink urlService={urlService} dataStream={dataStream} />
                )
              }
              data-test-subj="unifiedDocViewLogsOverviewDegradedFieldsAccordion"
            >
              <EuiPanel hasBorder={true} hasShadow={false} paddingSize="s">
                <EuiBasicTable
                  tableCaption={qualityIssuesAccordionTitle}
                  tableLayout="fixed"
                  columns={columns}
                  items={renderedItems ?? []}
                  sorting={{ sort: tableOptions.sort }}
                  onChange={onTableChange}
                  pagination={pagination}
                  data-test-subj="unifiedDocViewLogsOverviewDegradedFieldsQualityIssuesTable"
                />
              </EuiPanel>
            </EuiAccordion>
            {!isAccordionExpanded ? <EuiHorizontalRule margin="xs" /> : <EuiSpacer size="s" />}
          </>
        );
      }}
    </ScrollableSectionWrapper>
  ) : null;
});

const getDegradedFieldsColumns = (): Array<EuiBasicTableColumn<DegradedField>> => [
  {
    name: issueColumnName,
    sortable: true,
    field: 'issue',
    render: (issue: string) => {
      return (
        <EuiText size="xs">
          <b>{issue}</b>&nbsp;{textFieldIgnored}
        </EuiText>
      );
    },
  },
  {
    name: valuesColumnName,
    sortable: true,
    field: 'values',
    render: (values: string[]) => {
      return values.map((value, idx) => <EuiBadge key={idx}>{JSON.stringify(value)}</EuiBadge>);
    },
  },
];

const getDataFormattedForTable = (
  ignoredFieldValues: Record<string, string[]>
): DegradedField[] => {
  return Object.entries(ignoredFieldValues).map(([field, values]) => ({
    issue: field,
    values,
  }));
};

const getDataStreamRawName = (
  sourceFields: DataTableRecord['raw']['fields']
): string | undefined => {
  if (sourceFields) {
    const dataStreamTypeArr = sourceFields['data_stream.type'];
    const dataStreamType = dataStreamTypeArr ? dataStreamTypeArr[0] : undefined;
    const dataStreamNameArr = sourceFields['data_stream.dataset'];
    const dataStreamName = dataStreamNameArr ? dataStreamNameArr[0] : undefined;
    const dataStreamNamespaceArr = sourceFields['data_stream.namespace'];
    const dataStreamNamespace = dataStreamNamespaceArr ? dataStreamNamespaceArr[0] : undefined;
    let dataStream;

    if (dataStreamType && dataStreamName && dataStreamNamespace) {
      dataStream = `${dataStreamType}-${dataStreamName}-${dataStreamNamespace}`;
    }

    return dataStream;
  }
};

const DatasetQualityLink = React.memo(
  ({
    urlService,
    dataStream,
  }: {
    urlService: BrowserUrlService;
    dataStream: string | undefined;
  }) => {
    const locator = urlService.locators.get<DataQualityDetailsLocatorParams>(
      DATA_QUALITY_DETAILS_LOCATOR_ID
    );

    if (!locator || !dataStream) return null;

    const datasetQualityUrl = locator?.getRedirectUrl({ dataStream });

    const navigateToDatasetQuality = () => {
      locator?.navigate({ dataStream });
    };

    const datasetQualityLinkProps = getRouterLinkProps({
      href: datasetQualityUrl,
      onClick: navigateToDatasetQuality,
    });

    return (
      <EuiHeaderLink
        {...datasetQualityLinkProps}
        color="primary"
        data-test-subj="unifiedDocViewLogsOverviewDegradedFieldDatasetLink"
        iconType="external"
        target="_blank"
        size="xs"
      >
        {datasetQualityLinkTitle}
      </EuiHeaderLink>
    );
  }
);
