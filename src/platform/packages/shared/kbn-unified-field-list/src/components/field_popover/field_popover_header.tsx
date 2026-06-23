/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo } from 'react';
import type { EuiButtonIconProps, EuiPopoverProps } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiToolTip,
  EuiTitle,
  EuiSpacer,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import {
  EBT_CLICK_ACTIONS,
  getEbtProps,
  NON_ECS_FIELD_EBT_DETAIL,
  useEcsFieldNames,
} from '@kbn/ebt-click';
import { FieldDescription, FieldIcon, getFieldIconProps } from '@kbn/field-utils';
import type { DataViewField } from '@kbn/data-views-plugin/common';
import type { FieldsMetadataPublicStart } from '@kbn/fields-metadata-plugin/public';
import type { AddFieldFilterHandler, GetCustomFieldType } from '../../types';
import { EBT_FIELD_POPOVER_BREAKDOWN_ELEMENT } from './ebt_constants';

export interface FieldPopoverHeaderProps {
  field: DataViewField;
  closePopover: EuiPopoverProps['closePopover'];
  buttonAddFieldToWorkspaceProps?: Partial<EuiButtonIconProps>;
  buttonAddFilterProps?: Partial<EuiButtonIconProps>;
  buttonEditFieldProps?: Partial<EuiButtonIconProps>;
  buttonDeleteFieldProps?: Partial<EuiButtonIconProps>;
  getCustomFieldType?: GetCustomFieldType<DataViewField>;
  onAddBreakdownField?: (field: DataViewField | undefined) => void;
  onAddFieldToWorkspace?: (field: DataViewField) => unknown;
  onAddFilter?: AddFieldFilterHandler;
  onEditField?: (fieldName: string) => unknown;
  onDeleteField?: (fieldName: string) => unknown;
  services?: {
    fieldsMetadata?: FieldsMetadataPublicStart;
  };
  streamNames?: string[];
}

export const FieldPopoverHeader: React.FC<FieldPopoverHeaderProps> = ({
  field,
  closePopover,
  buttonAddFieldToWorkspaceProps,
  buttonAddFilterProps,
  buttonEditFieldProps,
  buttonDeleteFieldProps,
  getCustomFieldType,
  onAddBreakdownField,
  onAddFieldToWorkspace,
  onAddFilter,
  onEditField,
  onDeleteField,
  services,
  streamNames,
}) => {
  const { fieldsMetadata } = services ?? {};
  const fieldNames = useMemo(() => (field ? [field.name] : []), [field]);
  const ecsFieldNames = useEcsFieldNames(fieldNames, fieldsMetadata);
  const ecsDetail =
    ecsFieldNames !== null && field
      ? ecsFieldNames.has(field.name)
        ? field.name
        : NON_ECS_FIELD_EBT_DETAIL
      : null;

  if (!field) {
    return null;
  }

  const addFieldToWorkspaceTooltip = i18n.translate(
    'unifiedFieldList.fieldPopover.addFieldToWorkspaceLabel',
    {
      defaultMessage: 'Add "{field}" field',
      values: {
        field: field.displayName,
      },
    }
  );

  const addExistsFilterTooltip = i18n.translate(
    'unifiedFieldList.fieldPopover.addExistsFilterLabel',
    {
      defaultMessage: 'Filter for field present',
    }
  );

  const editFieldTooltip = i18n.translate('unifiedFieldList.fieldPopover.editFieldLabel', {
    defaultMessage: 'Edit data view field',
  });

  const deleteFieldTooltip = i18n.translate('unifiedFieldList.fieldPopover.deleteFieldLabel', {
    defaultMessage: 'Delete data view field',
  });

  const addBreakdownFieldTooltip = i18n.translate(
    'unifiedFieldList.fieldPopover.addBreakdownFieldLabel',
    {
      defaultMessage: 'Add breakdown',
    }
  );

  const iconProps = getCustomFieldType
    ? { type: getCustomFieldType(field) }
    : getFieldIconProps(field);

  return (
    <>
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <FieldIcon {...iconProps} data-test-subj={`fieldPopoverHeader_icon-${field.name}`} />
        </EuiFlexItem>
        <EuiFlexItem grow={true}>
          <EuiTitle size="xxs" data-test-subj="fieldPopoverHeader_fieldDisplayName">
            <h5 className="eui-textBreakWord">{field.displayName}</h5>
          </EuiTitle>
        </EuiFlexItem>
        {onAddFieldToWorkspace && (
          <EuiFlexItem grow={false} data-test-subj="fieldPopoverHeader_addField">
            <EuiToolTip
              content={buttonAddFieldToWorkspaceProps?.['aria-label'] ?? addFieldToWorkspaceTooltip}
            >
              <EuiButtonIcon
                data-test-subj={`fieldPopoverHeader_addField-${field.name}`}
                aria-label={addFieldToWorkspaceTooltip}
                {...(buttonAddFieldToWorkspaceProps || {})}
                iconType="plusCircle"
                onClick={() => {
                  closePopover();
                  onAddFieldToWorkspace(field);
                }}
              />
            </EuiToolTip>
          </EuiFlexItem>
        )}
        {onAddBreakdownField && (
          <EuiFlexItem grow={false} data-test-subj="fieldPopoverHeader_addBreakdownField">
            <EuiToolTip content={addBreakdownFieldTooltip} disableScreenReaderOutput>
              <EuiButtonIcon
                data-test-subj={`fieldPopoverHeader_addBreakdownField-${field.name}`}
                aria-label={addBreakdownFieldTooltip}
                iconType="chartBarVerticalStack"
                onClick={() => {
                  closePopover();
                  onAddBreakdownField(field);
                }}
                {...getEbtProps({
                  action: EBT_CLICK_ACTIONS.SET_BREAKDOWN,
                  element: EBT_FIELD_POPOVER_BREAKDOWN_ELEMENT,
                  detail: ecsDetail ?? undefined,
                })}
              />
            </EuiToolTip>
          </EuiFlexItem>
        )}
        {onAddFilter && field.filterable && !field.scripted && (
          <EuiFlexItem grow={false} data-test-subj="fieldPopoverHeader_addExistsFilter">
            <EuiToolTip content={buttonAddFilterProps?.['aria-label'] ?? addExistsFilterTooltip}>
              <EuiButtonIcon
                data-test-subj={`fieldPopoverHeader_addExistsFilter-${field.name}`}
                aria-label={addExistsFilterTooltip}
                {...(buttonAddFilterProps || {})}
                iconType="filter"
                onClick={() => {
                  closePopover();
                  onAddFilter('_exists_', field.name, '+');
                }}
              />
            </EuiToolTip>
          </EuiFlexItem>
        )}
        {onEditField &&
          (field.isRuntimeField || !['unknown', 'unknown_selected'].includes(field.type)) && (
            <EuiFlexItem grow={false} data-test-subj="fieldPopoverHeader_editField">
              <EuiToolTip content={buttonEditFieldProps?.['aria-label'] ?? editFieldTooltip}>
                <EuiButtonIcon
                  data-test-subj={`fieldPopoverHeader_editField-${field.name}`}
                  aria-label={editFieldTooltip}
                  {...(buttonEditFieldProps || {})}
                  iconType="pencil"
                  onClick={() => {
                    closePopover();
                    onEditField(field.name);
                  }}
                />
              </EuiToolTip>
            </EuiFlexItem>
          )}
        {onDeleteField && field.isRuntimeField && (
          <EuiFlexItem grow={false} data-test-subj="fieldPopoverHeader_deleteField">
            <EuiToolTip content={buttonDeleteFieldProps?.['aria-label'] ?? deleteFieldTooltip}>
              <EuiButtonIcon
                data-test-subj={`fieldPopoverHeader_deleteField-${field.name}`}
                aria-label={deleteFieldTooltip}
                {...(buttonDeleteFieldProps || {})}
                color="danger"
                iconType="trash"
                onClick={() => {
                  closePopover();
                  onDeleteField(field.name);
                }}
              />
            </EuiToolTip>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <FieldDescription
        field={field}
        Wrapper={FieldDescriptionWrapper}
        fieldsMetadataService={services?.fieldsMetadata}
        streamNames={streamNames}
      />
    </>
  );
};

const FieldDescriptionWrapper: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  return (
    <>
      <EuiSpacer size="s" />
      {children}
    </>
  );
};
