/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useMemo } from 'react';
import type { FieldsMetadataPublicStart } from '@kbn/fields-metadata-plugin/public';
import type { EuiSelectableOption } from '@elastic/eui';
import {
  FieldIcon,
  getFieldIconProps,
  comboBoxFieldOptionMatcher,
  fieldSupportsBreakdown,
} from '@kbn/field-utils';
import { css } from '@emotion/react';
import { isESQLColumnGroupable } from '@kbn/esql-utils';
import { type DataView, DataViewField } from '@kbn/data-views-plugin/common';
import type { DatatableColumn } from '@kbn/expressions-plugin/common';
import { convertDatatableColumnToDataViewFieldSpec } from '@kbn/data-view-utils';
import { i18n } from '@kbn/i18n';
import {
  EMPTY_OPTION,
  ToolbarSelector,
  type SelectableEntry,
} from '@kbn/shared-ux-toolbar-selector';
import {
  EBT_CLICK_ACTIONS,
  getEbtProps,
  NONE_EBT_DETAIL,
  NON_ECS_FIELD_EBT_DETAIL,
  useEcsFieldNames,
} from '@kbn/ebt-click';
import type { UnifiedHistogramBreakdownContext } from '../../types';
import { EBT_BREAKDOWN_SELECTOR_ELEMENT } from './ebt_constants';

const BREAKDOWN_EBT_BASE = {
  action: EBT_CLICK_ACTIONS.SET_BREAKDOWN,
  element: EBT_BREAKDOWN_SELECTOR_ELEMENT,
} as const;

export interface BreakdownFieldSelectorProps {
  dataView: DataView;
  breakdown: UnifiedHistogramBreakdownContext;
  esqlColumns?: DatatableColumn[];
  onBreakdownFieldChange?: (breakdownField: DataViewField | undefined) => void;
  recommendedFields?: ReadonlyArray<string>;
  fieldsMetadata?: FieldsMetadataPublicStart;
}

const mapToDropdownFields = (dataView: DataView, esqlColumns?: DatatableColumn[]) => {
  if (esqlColumns) {
    return (
      // filter out unsupported field types and counter time series metrics
      esqlColumns
        .filter(isESQLColumnGroupable)
        .map((column) => new DataViewField(convertDatatableColumnToDataViewFieldSpec(column)))
    );
  }

  return dataView.fields.filter(fieldSupportsBreakdown);
};

export const BreakdownFieldSelector = ({
  dataView,
  breakdown,
  esqlColumns,
  onBreakdownFieldChange,
  recommendedFields,
  fieldsMetadata,
}: BreakdownFieldSelectorProps) => {
  const fields = useMemo(() => mapToDropdownFields(dataView, esqlColumns), [dataView, esqlColumns]);
  const fieldNames = useMemo(() => fields.map((f) => f.name), [fields]);
  const ecsFieldNames = useEcsFieldNames(fieldNames, fieldsMetadata);

  const fieldOptions: SelectableEntry[] = useMemo(() => {
    const noBreakdownOption: SelectableEntry = {
      key: EMPTY_OPTION,
      value: EMPTY_OPTION,
      label: i18n.translate('unifiedHistogram.breakdownFieldSelector.noBreakdownButtonLabel', {
        defaultMessage: 'No breakdown',
      }),
      checked: !breakdown?.field ? ('on' as EuiSelectableOption['checked']) : undefined,
      ...getEbtProps({ ...BREAKDOWN_EBT_BASE, detail: NONE_EBT_DETAIL }),
    };

    const toOption = (field: DataViewField): SelectableEntry => ({
      key: field.name,
      label: field.displayName,
      value: field.name,
      checked:
        breakdown?.field?.name === field.name
          ? ('on' as EuiSelectableOption['checked'])
          : undefined,
      prepend: (
        <span
          css={css`
            .euiToken {
              vertical-align: middle;
            }
          `}
        >
          <FieldIcon {...getFieldIconProps(field)} />
        </span>
      ),
      ...getEbtProps({
        ...BREAKDOWN_EBT_BASE,
        detail:
          ecsFieldNames !== null
            ? ecsFieldNames.has(field.name)
              ? field.name
              : NON_ECS_FIELD_EBT_DETAIL
            : undefined,
      }),
    });

    const sortedFields = fields
      .map(toOption)
      .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));

    if (recommendedFields && recommendedFields.length > 0) {
      const recommendedSet = new Set<string>(recommendedFields);
      const optionByName = new Map(sortedFields.map((o) => [o.value, o]));
      const recommended = recommendedFields
        .map((name) => optionByName.get(name))
        .filter((o): o is SelectableEntry => o !== undefined);
      const rest = sortedFields.filter((o) => !recommendedSet.has(o.value));

      if (recommended.length > 0) {
        return [
          noBreakdownOption,
          {
            key: 'recommended-group-label',
            value: '',
            label: i18n.translate('unifiedHistogram.breakdownFieldSelector.recommendedGroupLabel', {
              defaultMessage: 'Recommended fields',
            }),
            isGroupLabel: true,
          },
          ...recommended,
          {
            key: 'all-fields-group-label',
            value: '',
            label: i18n.translate('unifiedHistogram.breakdownFieldSelector.allFieldsGroupLabel', {
              defaultMessage: 'All fields',
            }),
            isGroupLabel: true,
          },
          ...rest,
        ];
      }
    }

    return [noBreakdownOption, ...sortedFields];
  }, [fields, breakdown?.field, recommendedFields, ecsFieldNames]);

  const onChange = useCallback(
    (chosenOption?: SelectableEntry) => {
      const breakdownField = chosenOption?.value
        ? fields.find((currentField) => currentField.name === chosenOption.value)
        : undefined;
      onBreakdownFieldChange?.(breakdownField);
    },
    [fields, onBreakdownFieldChange]
  );

  return (
    <ToolbarSelector
      data-test-subj="unifiedHistogramBreakdownSelector"
      data-selected-value={breakdown?.field?.name}
      searchable
      buttonLabel={
        breakdown?.field?.displayName
          ? i18n.translate('unifiedHistogram.breakdownFieldSelector.breakdownByButtonLabel', {
              defaultMessage: 'Breakdown by {fieldName}',
              values: {
                fieldName: breakdown?.field?.displayName,
              },
            })
          : i18n.translate('unifiedHistogram.breakdownFieldSelector.noBreakdownButtonLabel', {
              defaultMessage: 'No breakdown',
            })
      }
      popoverTitle={i18n.translate(
        'unifiedHistogram.breakdownFieldSelector.breakdownFieldPopoverTitle',
        {
          defaultMessage: 'Select breakdown field',
        }
      )}
      optionMatcher={comboBoxFieldOptionMatcher}
      options={fieldOptions}
      onChange={onChange}
    />
  );
};

// eslint-disable-next-line import/no-default-export
export default BreakdownFieldSelector;
