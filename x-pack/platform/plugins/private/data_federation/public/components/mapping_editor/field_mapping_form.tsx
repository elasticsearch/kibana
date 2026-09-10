/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ReactNode } from 'react';
import {
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiLink,
  EuiSelect,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';

export interface FieldMappingFormValue<TType extends string = string> {
  type: '' | TType;
  name: string;
  path: string;
  format: string;
}

export interface FieldMappingFormErrors {
  name?: string;
  type?: string;
  format?: string;
}

export interface FieldMappingFormProps<TType extends string = string> {
  value: FieldMappingFormValue<TType>;
  onChange: (patch: Partial<FieldMappingFormValue<TType>>) => void;
  typeOptions: Array<{ value: '' | TType; text: string }>;
  typeHelpText?: ReactNode;
  pathHelpText?: ReactNode;
  errors?: FieldMappingFormErrors;
  dateTypeValue: TType;
  actions: ReactNode;
  fieldTypeTestSubj: string;
  fieldNameTestSubj: string;
  fieldPathTestSubj: string;
  fieldFormatTestSubj: string;
}

export const getFieldTypeDocsHelpText = <TType extends string>(
  type: '' | TType,
  infoByValue: Record<TType, { label: string; docs: string }>
): React.ReactNode => {
  if (!type) return;

  const info = infoByValue[type];

  return (
    <EuiLink href={info.docs} target="_blank" external>
      {i18n.translate('xpack.dataFederation.mappingEditor.fieldTypeDocsLink', {
        defaultMessage: 'View documentation for {type} field type',
        values: { type: info.label },
      })}
    </EuiLink>
  );
};

export function FieldMappingForm<TType extends string>({
  value,
  onChange,
  typeOptions,
  typeHelpText,
  pathHelpText,
  errors,
  dateTypeValue,
  actions,
  fieldTypeTestSubj,
  fieldNameTestSubj,
  fieldPathTestSubj,
  fieldFormatTestSubj,
}: FieldMappingFormProps<TType>) {
  const isDateType = value.type === dateTypeValue;

  return (
    <EuiFlexGroup gutterSize="m" alignItems="flexStart">
      <EuiFlexItem>
        <EuiFormRow
          label={i18n.translate('xpack.dataFederation.mappingEditor.typeLabel', {
            defaultMessage: 'Field type',
          })}
          helpText={typeHelpText}
          isInvalid={Boolean(errors?.type)}
          error={errors?.type}
          fullWidth
        >
          <EuiSelect
            isInvalid={Boolean(errors?.type)}
            fullWidth
            options={typeOptions as unknown as Array<{ value: string; text: string }>}
            value={value.type}
            onChange={(e) => {
              const nextType = e.target.value as '' | TType;
              onChange({
                type: nextType,
                ...(nextType === dateTypeValue ? {} : { format: '' }),
              });
            }}
            data-test-subj={fieldTypeTestSubj}
          />
        </EuiFormRow>
      </EuiFlexItem>

      <EuiFlexItem>
        <EuiFormRow
          label={i18n.translate('xpack.dataFederation.mappingEditor.logicalName', {
            defaultMessage: 'Field name',
          })}
          isInvalid={Boolean(errors?.name)}
          error={errors?.name}
          fullWidth
        >
          <EuiFieldText
            isInvalid={Boolean(errors?.name)}
            fullWidth
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
            data-test-subj={fieldNameTestSubj}
          />
        </EuiFormRow>
      </EuiFlexItem>

      <EuiFlexItem>
        <EuiFormRow
          label={i18n.translate('xpack.dataFederation.mappingEditor.physicalPath', {
            defaultMessage: 'Rename field to',
          })}
          helpText={pathHelpText}
          fullWidth
        >
          <EuiFieldText
            fullWidth
            value={value.path}
            onChange={(e) => onChange({ path: e.target.value })}
            data-test-subj={fieldPathTestSubj}
          />
        </EuiFormRow>
      </EuiFlexItem>

      <EuiFlexItem>
        {isDateType ? (
          <EuiFormRow
            label={i18n.translate('xpack.dataFederation.mappingEditor.formatLabel', {
              defaultMessage: 'format (optional)',
            })}
            isInvalid={Boolean(errors?.format)}
            error={errors?.format}
            fullWidth
          >
            <EuiFieldText
              isInvalid={Boolean(errors?.format)}
              fullWidth
              value={value.format}
              onChange={(e) => onChange({ format: e.target.value })}
              data-test-subj={fieldFormatTestSubj}
            />
          </EuiFormRow>
        ) : (
          <div aria-hidden="true" style={{ visibility: 'hidden' }}>
            <EuiFormRow
              label={i18n.translate('xpack.dataFederation.mappingEditor.formatLabel', {
                defaultMessage: 'format (optional)',
              })}
              fullWidth
            >
              <EuiFieldText fullWidth value="" onChange={() => {}} />
            </EuiFormRow>
          </div>
        )}
      </EuiFlexItem>

      <EuiFlexItem grow={false}>{actions}</EuiFlexItem>
    </EuiFlexGroup>
  );
}
