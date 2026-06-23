/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo, useState } from 'react';
import { BehaviorSubject } from 'rxjs';

import type { Direction, EuiButtonGroupOptionProps, EuiSelectableOption } from '@elastic/eui';
import {
  EuiButtonGroup,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiPopoverTitle,
  EuiSelectable,
  EuiToolTip,
} from '@elastic/eui';
import { ControlValuesSource, DEFAULT_DSL_OPTIONS_LIST_STATE } from '@kbn/controls-constants';
import type { OptionsListSortingType } from '@kbn/controls-schemas';
import { useBatchedPublishingSubjects, type PublishingSubject } from '@kbn/presentation-publishing';

import { getCompatibleSortingTypes } from '../../../../../common/options_list/suggestions_sorting';
import { isDSLOptionsListApi } from '../../../utils';
import type { DataControlApi } from '../../types';
import { useOptionsListContext } from '../options_list_context_provider';
import { OptionsListStrings } from '../options_list_strings';
import type { DSLOptionsListComponentApi } from '../types';

type SortByItem = EuiSelectableOption & {
  data: { sortBy: OptionsListSortingType['by'] };
};

const sortOrderOptions: EuiButtonGroupOptionProps[] = [
  {
    id: 'asc',
    iconType: `sortAscending`,
    'data-test-subj': `optionsList__sortOrder_asc`,
    label: OptionsListStrings.editorAndPopover.sortOrder.asc.getSortOrderLabel(),
  },
  {
    id: 'desc',
    iconType: `sortDescending`,
    'data-test-subj': `optionsList__sortOrder_desc`,
    label: OptionsListStrings.editorAndPopover.sortOrder.desc.getSortOrderLabel(),
  },
];

const panelStyle = {
  width: '224px',
};

const isDataControlApi = (api: unknown): api is Pick<DataControlApi, 'valuesSource$'> =>
  typeof api === 'object' && api !== null && 'valuesSource$' in api;

export const OptionsListPopoverSortingButton = ({
  showOnlySelected,
}: {
  showOnlySelected: boolean;
}) => {
  const { componentApi } = useOptionsListContext();

  const [isSortingPopoverOpen, setIsSortingPopoverOpen] = useState(false);

  const conditionalApiSubjects: [
    DSLOptionsListComponentApi['sort$'] | PublishingSubject<undefined>,
    DSLOptionsListComponentApi['field$'] | PublishingSubject<undefined>,
    PublishingSubject<ControlValuesSource | undefined>
  ] = useMemo(() => {
    const isDSLControl = isDSLOptionsListApi(componentApi);
    return [
      isDSLControl ? componentApi.sort$ : new BehaviorSubject(undefined),
      isDSLControl ? componentApi.field$ : new BehaviorSubject(undefined),
      isDataControlApi(componentApi)
        ? componentApi.valuesSource$
        : new BehaviorSubject<ControlValuesSource | undefined>(ControlValuesSource.FIELD),
    ];
  }, [componentApi]);

  const [sort, field, valuesSource] = useBatchedPublishingSubjects(...conditionalApiSubjects);

  const sortByOptions = useMemo(() => {
    return getCompatibleSortingTypes(field?.type, valuesSource).map((key) => {
      return {
        onFocusBadge: false,
        data: { sortBy: key },
        checked: key === sort?.by ? 'on' : undefined,
        'data-test-subj': `optionsList__sortBy_${key}`,
        label: OptionsListStrings.editorAndPopover.sortBy[key].getSortByLabel(field?.type),
      } as SortByItem;
    });
  }, [field?.type, sort?.by, valuesSource]);

  const onSortByChange = useCallback(
    (updatedOptions: SortByItem[]) => {
      if (!isDSLOptionsListApi(componentApi)) return;
      const selectedOption = updatedOptions.find(({ checked }) => checked === 'on');
      if (selectedOption) {
        componentApi.setSort({
          ...DEFAULT_DSL_OPTIONS_LIST_STATE.sort,
          ...sort,
          by: selectedOption.data.sortBy,
        });
      }
    },
    [sort, componentApi]
  );

  const SortButton = () => (
    <EuiToolTip
      position="top"
      content={
        showOnlySelected
          ? OptionsListStrings.popover.getSortDisabledTooltip()
          : OptionsListStrings.popover.getSortPopoverTitle()
      }
      disableScreenReaderOutput
    >
      <EuiButtonIcon
        size="xs"
        display="empty"
        color="text"
        iconType={sort?.direction === 'asc' ? 'sortAscending' : 'sortDescending'}
        isDisabled={showOnlySelected}
        className="optionsList__sortButton"
        data-test-subj="optionsListControl__sortingOptionsButton"
        onClick={() => setIsSortingPopoverOpen(!isSortingPopoverOpen)}
        aria-label={OptionsListStrings.popover.getSortPopoverDescription()}
      />
    </EuiToolTip>
  );

  return (
    <EuiPopover
      button={<SortButton />}
      panelPaddingSize="none"
      isOpen={isSortingPopoverOpen}
      aria-labelledby="optionsList_sortingOptions"
      closePopover={() => setIsSortingPopoverOpen(false)}
      panelStyle={panelStyle}
    >
      <span data-test-subj="optionsListControl__sortingOptionsPopover">
        <EuiPopoverTitle paddingSize="s">
          <EuiFlexGroup alignItems="center" responsive={false}>
            <EuiFlexItem>{OptionsListStrings.popover.getSortPopoverTitle()}</EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonGroup
                isIconOnly
                buttonSize="compressed"
                options={sortOrderOptions}
                idSelected={sort?.direction ?? DEFAULT_DSL_OPTIONS_LIST_STATE.sort.direction}
                legend={OptionsListStrings.editorAndPopover.getSortDirectionLegend()}
                onChange={(value) => {
                  if (!isDSLOptionsListApi(componentApi)) return;
                  componentApi.setSort({
                    ...DEFAULT_DSL_OPTIONS_LIST_STATE.sort,
                    ...sort,
                    direction: value as Direction,
                  });
                }}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPopoverTitle>
        <EuiSelectable
          options={sortByOptions}
          singleSelection="always"
          onChange={onSortByChange}
          id="optionsList_sortingOptions"
          listProps={{ bordered: false, paddingSize: 's' }}
          data-test-subj="optionsListControl__sortingOptions"
          aria-label={OptionsListStrings.popover.getSortPopoverDescription()}
        >
          {(list) => list}
        </EuiSelectable>
      </span>
    </EuiPopover>
  );
};
