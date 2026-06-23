/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiButton, EuiFilterGroup, useEuiTheme } from '@elastic/eui';
import { mergeWith, isEqual } from 'lodash';
import { css } from '@emotion/react';
import { MoreFiltersSelectable } from '../../../all_cases/table_filter_config/more_filters_selectable';
import { ViewToggle } from './view_toggle';
import { VIEW_TOGGLE_TABLE_ID, type ViewToggleId } from '../constants';
import type { CaseStatuses } from '../../../../../common/types/domain';
import type { FilterOptions } from '../../../../containers/types';
import * as i18n from '../translations';
import { useGetTags } from '../../../../containers/use_get_tags';
import { useGetCategories } from '../../../../containers/use_get_categories';
import type { CurrentUserProfile } from '../../../types';
import { useCasesFeatures } from '../../../../common/use_cases_features';
import { useSystemFilterConfig } from '../../../all_cases/table_filter_config/use_system_filter_config';
import { useFilterConfig } from '../../../all_cases/table_filter_config/use_filter_config';
import { useGetCaseConfiguration } from '../../../../containers/configure/use_get_case_configuration';
import { TableSearch } from '../../../all_cases/search';
import { DateRangeFilter } from '../../../all_cases/date_range_filter';
import type { CasesColumnSelection } from '../types';
import { ColumnsPopover } from './columns_popover';
import { SortFilter } from './sort_filter';

export interface CasesTableFiltersProps {
  countClosedCases: number | null;
  countInProgressCases: number | null;
  countOpenCases: number | null;
  onFilterChanged: (filterOptions: Partial<FilterOptions>) => void;
  hiddenStatuses?: CaseStatuses[];
  availableSolutions: string[];
  isSelectorView?: boolean;
  onCreateCasePressed?: () => void;
  isLoading: boolean;
  currentUserProfile: CurrentUserProfile;
  filterOptions: FilterOptions;
  deselectCases: () => void;
  viewMode: ViewToggleId;
  onViewModeChange: (mode: ViewToggleId) => void;
  selectedColumns: CasesColumnSelection[];
  onSelectedColumnsChange: (columns: CasesColumnSelection[]) => void;
  listFields: CasesColumnSelection[];
  onListFieldsChange: (fields: CasesColumnSelection[]) => void;
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: (sortOrder: 'asc' | 'desc') => void;
}

const mergeCustomizer = (objValue: string | string[], srcValue: string | string[], key: string) => {
  if (Array.isArray(objValue)) {
    return srcValue;
  }
};

const CasesTableFiltersComponent = ({
  countClosedCases,
  countOpenCases,
  countInProgressCases,
  onFilterChanged,
  hiddenStatuses,
  availableSolutions,
  isSelectorView = false,
  onCreateCasePressed,
  isLoading,
  currentUserProfile,
  filterOptions,
  deselectCases,
  viewMode,
  onViewModeChange,
  selectedColumns,
  onSelectedColumnsChange,
  listFields,
  onListFieldsChange,
  sortOrder,
  onSortOrderChange,
}: CasesTableFiltersProps) => {
  const { data: tags = [], isLoading: isLoadingTags } = useGetTags();
  const { data: categories = [], isLoading: isLoadingCategories } = useGetCategories();
  const { caseAssignmentAuthorized } = useCasesFeatures();
  const {
    data: { customFields },
    isFetching: isLoadingCasesConfiguration,
  } = useGetCaseConfiguration();

  const onFilterOptionsChange = useCallback(
    (partialFilterOptions: Partial<FilterOptions>) => {
      const newFilterOptions = mergeWith({}, filterOptions, partialFilterOptions, mergeCustomizer);
      if (!isEqual(newFilterOptions, filterOptions)) {
        onFilterChanged(newFilterOptions);
      }
    },
    [filterOptions, onFilterChanged]
  );

  const isLoadingFilters =
    isLoading || isLoadingTags || isLoadingCategories || isLoadingCasesConfiguration;

  const { systemFilterConfig } = useSystemFilterConfig({
    availableSolutions,
    caseAssignmentAuthorized,
    categories,
    countClosedCases,
    countInProgressCases,
    countOpenCases,
    currentUserProfile,
    hiddenStatuses,
    isLoading: isLoadingFilters,
    isSelectorView,
    onFilterOptionsChange,
    tags,
  });

  const {
    filters: activeFilters,
    selectableOptions,
    activeSelectableOptionKeys,
    onFilterConfigChange,
  } = useFilterConfig({
    systemFilterConfig,
    onFilterOptionsChange,
    isSelectorView,
    filterOptions,
    customFields,
    isLoading: isLoadingFilters,
  });

  const { euiTheme } = useEuiTheme();

  const handleOnCreateCasePressed = useCallback(() => {
    if (onCreateCasePressed) {
      onCreateCasePressed();
    }
  }, [onCreateCasePressed]);

  return (
    <EuiFlexGroup
      gutterSize="s"
      justifyContent="flexStart"
      wrap={true}
      data-test-subj="cases-table-filters"
      css={css`
        padding-top: ${euiTheme.size.m};
      `}
    >
      {isSelectorView && onCreateCasePressed ? (
        <EuiFlexItem grow={false}>
          <EuiButton
            fill
            onClick={handleOnCreateCasePressed}
            iconType="plusCircle"
            data-test-subj="cases-table-add-case-filter-bar"
          >
            {i18n.CREATE_CASE_TITLE}
          </EuiButton>
        </EuiFlexItem>
      ) : null}
      <EuiFlexItem>
        <TableSearch
          filterOptionsSearch={filterOptions.search}
          /**
           * we need this to reset the internal state of the
           * TableSearch component each time the search in
           * the all cases state changes
           */
          key={filterOptions.search}
          onFilterOptionsChange={onFilterOptionsChange}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiFilterGroup
          css={css`
            background-color: transparent;
          `}
        >
          {activeFilters.map((filter) => filter.render({ filterOptions }))}
          {isSelectorView || (
            <MoreFiltersSelectable
              options={selectableOptions}
              activeFilters={activeSelectableOptionKeys}
              onChange={onFilterConfigChange}
              isLoading={isLoadingFilters}
            />
          )}
        </EuiFilterGroup>
      </EuiFlexItem>
      {viewMode !== VIEW_TOGGLE_TABLE_ID && (
        <EuiFlexItem grow={false}>
          <SortFilter sortOrder={sortOrder} onChange={onSortOrderChange} />
        </EuiFlexItem>
      )}
      <EuiFlexItem grow={false}>
        {viewMode === VIEW_TOGGLE_TABLE_ID ? (
          <ColumnsPopover
            selectedColumns={selectedColumns}
            onSelectedColumnsChange={onSelectedColumnsChange}
          />
        ) : (
          <ColumnsPopover
            selectedColumns={listFields}
            onSelectedColumnsChange={onListFieldsChange}
            buttonLabel={i18n.FIELDS_BUTTON_LABEL}
            buttonIconType="list"
          />
        )}
      </EuiFlexItem>
      {!isSelectorView && (
        <EuiFlexItem grow={false}>
          <ViewToggle idSelected={viewMode} onChange={onViewModeChange} />
        </EuiFlexItem>
      )}
      <EuiFlexItem grow={false}>
        <DateRangeFilter
          isLoading={isLoadingFilters}
          filterOptions={filterOptions}
          onFilterOptionsChange={onFilterOptionsChange}
          deselectCases={deselectCases}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

CasesTableFiltersComponent.displayName = 'CasesTableFiltersComponent';

export const CasesTableFilters = React.memo(CasesTableFiltersComponent);

CasesTableFilters.displayName = 'CasesTableFilters';
