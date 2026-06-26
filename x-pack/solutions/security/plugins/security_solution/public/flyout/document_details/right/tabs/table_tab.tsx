/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { getOr } from 'lodash/fp';
import memoizeOne from 'memoize-one';
import { css } from '@emotion/react';
import { EuiInMemoryTable, useEuiFontSize, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { dataTableSelectors, tableDefaults } from '@kbn/securitysolution-data-table';
import type { BrowserFields, TimelineEventsDetailsItem } from '@kbn/timelines-plugin/common';
import type { FieldSpec } from '@kbn/data-plugin/common';
import { getCategory } from '@kbn/response-ops-alerts-fields-browser/helpers';
import type { DataTableRecord, EsHitRecord } from '@kbn/discover-utils';
import { buildDataTableRecord } from '@kbn/discover-utils';
import { useEntityStoreEuidApi } from '@kbn/entity-store/public';
import { TABLE_TAB_CONTENT_TEST_ID, TABLE_TAB_SEARCH_INPUT_TEST_ID } from './test_ids';
import { getAllFieldsByName } from '../../../../common/containers/source';
import { useDeepEqualSelector } from '../../../../common/hooks/use_selector';
import { timelineDefaults } from '../../../../timelines/store/defaults';
import { timelineSelectors } from '../../../../timelines/store';
import { useDocumentDetailsContext } from '../../shared/context';
import { isInTableScope, isTimelineScope } from '../../../../helpers';
import { useBasicDataFromDetailsData } from '../../shared/hooks/use_basic_data_from_details_data';
import { getTableItems } from '../utils/table_tab_utils';
import { TableTabSettingButton } from '../components/table_tab_setting_button';
import { useEntityFromStore } from '../../../entity_details/shared/hooks/use_entity_from_store';
import { useKibana } from '../../../../common/lib/kibana';
import { FLYOUT_STORAGE_KEYS } from '../../shared/constants/local_storage';
import { getTableTabColumns } from '../utils/table_tab_columns';
import { useHighlightedFields } from '../../../../flyout_v2/document/main/hooks/use_highlighted_fields';
import { TableTabTour } from '../components/table_tab_tour';

const COUNT_PER_PAGE_OPTIONS = [25, 50, 100];

const PLACEHOLDER = i18n.translate('xpack.securitySolution.flyout.table.filterPlaceholderLabel', {
  defaultMessage: 'Filter by field or value...',
});

const PIN_ACTION_CSS = css`
  .flyout_table__unPinAction {
    opacity: 1;
  }
  .flyout_table__pinAction {
    opacity: 0;
  }
  &:hover {
    .flyout_table__pinAction {
      opacity: 1;
    }
  }
`;

export interface TableTabState {
  /**
   * The fields that are pinned
   */
  pinnedFields: string[];
  /**
   * Whether to show highlighted fields only
   */
  showHighlightedFields: boolean;
  /**
   * Whether to hide empty fields
   */
  hideEmptyFields: boolean;
  /**
   * Whether to hide alert fields
   */
  hideAlertFields: boolean;
}

const DEFAULT_TABLE_TAB_STATE: TableTabState = {
  pinnedFields: [],
  showHighlightedFields: false,
  hideEmptyFields: false,
  hideAlertFields: false,
};

/**
 * Defines the behavior of the search input that appears above the table of data
 */
const SEARCH_CONFIG = {
  box: {
    incremental: true,
    placeholder: PLACEHOLDER,
    schema: true,
    'data-test-subj': TABLE_TAB_SEARCH_INPUT_TEST_ID,
  },
};

/**
 * Retrieve the correct field from the BrowserField
 */
export const getFieldFromBrowserField = memoizeOne(
  (field: string, browserFields: BrowserFields): FieldSpec | undefined => {
    const category = getCategory(field);

    return browserFields[category]?.fields?.[field] as FieldSpec;
  },
  (newArgs, lastArgs) => newArgs[0] === lastArgs[0]
);

/**
 * Table view displayed in the document details expandable flyout right section Table tab
 */
export const TableTab = memo(() => {
  const smallFontSize = useEuiFontSize('xs').fontSize;
  const { euiTheme } = useEuiTheme();
  const {
    services: { storage },
  } = useKibana();

  const {
    browserFields,
    dataFormattedForFieldBrowser,
    scopeId,
    isRulePreview,
    eventId,
    investigationFields,
    searchHit,
  } = useDocumentDetailsContext();

  const { ruleId, isAlert } = useBasicDataFromDetailsData(dataFormattedForFieldBrowser);

  const hit: DataTableRecord = useMemo(
    () => buildDataTableRecord(searchHit as EsHitRecord),
    [searchHit]
  );

  const euidApi = useEntityStoreEuidApi();
  const hostDocumentIdentityFields = useMemo(
    () => euidApi?.euid.getEntityIdentifiersFromDocument('host', hit.flattened) ?? null,
    [euidApi?.euid, hit.flattened]
  );
  const userDocumentIdentityFields = useMemo(
    () => euidApi?.euid.getEntityIdentifiersFromDocument('user', hit.flattened) ?? null,
    [euidApi?.euid, hit.flattened]
  );
  const isHostEntity = hostDocumentIdentityFields != null;
  const hostEuidFromDocument = useMemo(
    () => euidApi?.euid.getEuidFromObject('host', hit.flattened),
    [euidApi?.euid, hit.flattened]
  );
  const userEuidFromDocument = useMemo(
    () => euidApi?.euid.getEuidFromObject('user', hit.flattened),
    [euidApi?.euid, hit.flattened]
  );
  const hostEntityFromStore = useEntityFromStore({
    entityId: hostEuidFromDocument,
    identityFields: hostDocumentIdentityFields ?? undefined,
    entityType: 'host',
    skip: !isHostEntity,
  });
  const userEntityFromStore = useEntityFromStore({
    entityId: userEuidFromDocument,
    identityFields: userDocumentIdentityFields ?? undefined,
    entityType: 'user',
    skip: isHostEntity,
  });
  const entityId = useMemo(() => {
    if (isHostEntity) {
      return (
        hostEntityFromStore.entityRecord?.entity?.id ?? hostDocumentIdentityFields?.['entity.id']
      );
    }
    return (
      userEntityFromStore.entityRecord?.entity?.id ?? userDocumentIdentityFields?.['entity.id']
    );
  }, [
    isHostEntity,
    hostDocumentIdentityFields,
    userDocumentIdentityFields,
    hostEntityFromStore.entityRecord,
    userEntityFromStore.entityRecord,
  ]);

  const highlightedFieldsResult = useHighlightedFields({
    hit,
    investigationFields,
  });
  const highlightedFields = useMemo(
    () => Object.keys(highlightedFieldsResult),
    [highlightedFieldsResult]
  );

  const [tableTabState, setTableTabState] = useState<TableTabState>(() => {
    const restoredTableTabState = storage.get(FLYOUT_STORAGE_KEYS.TABLE_TAB_STATE);
    if (restoredTableTabState != null) {
      return restoredTableTabState;
    }
    return DEFAULT_TABLE_TAB_STATE;
  });

  useEffect(() => {
    storage.set(FLYOUT_STORAGE_KEYS.TABLE_TAB_STATE, tableTabState);
  }, [tableTabState, storage]);

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const renderToolsRight = useCallback(
    () => [
      <TableTabSettingButton
        tableTabState={tableTabState}
        setTableTabState={setTableTabState}
        isPopoverOpen={isPopoverOpen}
        setIsPopoverOpen={setIsPopoverOpen}
        isAlert={isAlert}
      />,
    ],
    [tableTabState, setTableTabState, isPopoverOpen, setIsPopoverOpen, isAlert]
  );

  const [pagination, setPagination] = useState<{ pageIndex: number }>({
    pageIndex: 0,
  });
  const onTableChange = useCallback(({ page: { index } }: { page: { index: number } }) => {
    setPagination({ pageIndex: index });
  }, []);

  const paginationSettings = useMemo(
    () => ({
      ...pagination,
      pageSizeOptions: COUNT_PER_PAGE_OPTIONS,
    }),
    [pagination]
  );

  const getScope = useMemo(() => {
    if (isTimelineScope(scopeId)) {
      return timelineSelectors.getTimelineByIdSelector();
    } else if (isInTableScope(scopeId)) {
      return dataTableSelectors.getTableByIdSelector();
    }
  }, [scopeId]);

  const defaults = useMemo(
    () => (isTimelineScope(scopeId) ? timelineDefaults : tableDefaults),
    [scopeId]
  );

  const columnHeaders = useDeepEqualSelector((state) => {
    const { columns } = (getScope && getScope(state, scopeId)) ?? defaults;
    return columns;
  });

  const fieldsByName = useMemo(() => getAllFieldsByName(browserFields), [browserFields]);

  const { pinnedFields } = useMemo(() => tableTabState, [tableTabState]);
  const onTogglePinned = useCallback(
    (field: string, action: 'pin' | 'unpin') => {
      if (action === 'pin') {
        setTableTabState({
          ...tableTabState,
          pinnedFields: [...pinnedFields, field],
        });
      } else if (action === 'unpin') {
        setTableTabState({
          ...tableTabState,
          pinnedFields: pinnedFields.filter((f) => f !== field),
        });
      }
    },
    [pinnedFields, tableTabState, setTableTabState]
  );

  const items = useMemo(
    () =>
      getTableItems({
        dataFormattedForFieldBrowser,
        fieldsByName,
        highlightedFields,
        tableTabState,
      }),
    [dataFormattedForFieldBrowser, highlightedFields, tableTabState, fieldsByName]
  );

  const getLinkValue = useCallback(
    (field: string) => {
      const columnHeader = columnHeaders.find((col) => col.id === field);
      if (!columnHeader || !columnHeader.linkField) {
        return null;
      }
      const linkFieldData = (dataFormattedForFieldBrowser ?? []).find(
        (d) => d.field === columnHeader.linkField
      );
      const linkFieldValue = getOr(null, 'originalValue', linkFieldData);
      return Array.isArray(linkFieldValue) ? linkFieldValue[0] : linkFieldValue;
    },
    [dataFormattedForFieldBrowser, columnHeaders]
  );

  // forces the rows of the table to render smaller fonts
  const onSetRowProps = useCallback(
    ({ field }: TimelineEventsDetailsItem) => ({
      className: 'flyout-table-row-small-font',
      'data-test-subj': `flyout-table-row-${field}`,
      ...(highlightedFields.includes(field) && {
        style: { backgroundColor: euiTheme.colors.backgroundBaseWarning },
      }),
      css: PIN_ACTION_CSS,
    }),
    [highlightedFields, euiTheme.colors]
  );

  const columns = useMemo(
    () =>
      getTableTabColumns({
        browserFields,
        eventId,
        scopeId,
        getLinkValue,
        ruleId,
        isRulePreview,
        onTogglePinned,
        entityId,
      }),
    [browserFields, entityId, eventId, scopeId, getLinkValue, ruleId, isRulePreview, onTogglePinned]
  );

  const search = useMemo(() => {
    return { ...SEARCH_CONFIG, toolsRight: renderToolsRight() };
  }, [renderToolsRight]);
  return (
    <>
      <TableTabTour setIsPopoverOpen={setIsPopoverOpen} />
      <EuiInMemoryTable
        items={items}
        itemId="field"
        columns={columns}
        onTableChange={onTableChange}
        pagination={paginationSettings}
        rowProps={onSetRowProps}
        search={search}
        sorting={false}
        data-test-subj={TABLE_TAB_CONTENT_TEST_ID}
        tableCaption={i18n.translate('xpack.securitySolution.flyout.table.documentFieldsCaption', {
          defaultMessage: 'Document fields',
        })}
        css={css`
          .euiTableRow {
            font-size: ${smallFontSize};
          }
        `}
      />
    </>
  );
});

TableTab.displayName = 'TableTab';
