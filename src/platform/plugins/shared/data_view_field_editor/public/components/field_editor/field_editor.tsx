/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect, useCallback } from 'react';
import { i18n } from '@kbn/i18n';
import { get, isEqual } from 'lodash';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import { KbnInfoCallout, KbnWarningCallout } from '@kbn/ui-callout';

import type { FormHook, RuntimeType, RuntimePrimitiveTypes } from '../../shared_imports';
import {
  Form,
  useForm,
  useFormData,
  useFormIsModified,
  UseField,
  TextField,
} from '../../shared_imports';
import type { Field } from '../../types';
import { useFieldEditorContext } from '../field_editor_context';
import { useFieldPreviewContext } from '../preview';

import { RUNTIME_FIELD_OPTIONS } from './constants';
import { schema } from './form_schema';
import { getNameFieldConfig } from './lib';
import { TypeField } from './form_fields';
import { FieldDetail } from './field_detail';
import { CompositeEditor } from './composite_editor';
import type { TypeSelection } from './types';

export interface FieldEditorFormState {
  isValid: boolean | undefined;
  isSubmitted: boolean;
  isSubmitting: boolean;
  submit: FormHook<Field>['submit'];
}

export interface FieldFormInternal
  extends Omit<Field, 'type' | 'internalType' | 'fields' | 'popularity'> {
  fields?: Record<string, { type: RuntimePrimitiveTypes }>;
  type: TypeSelection;
  popularity?: string;
  __meta__: {
    isCustomLabelVisible: boolean;
    isCustomDescriptionVisible: boolean;
    isValueVisible: boolean;
    isFormatVisible: boolean;
    isPopularityVisible: boolean;
  };
}

export interface Props {
  /** Optional field to edit or preselected field to create */
  field?: Field;
  /** Handler to receive state changes updates */
  onChange?: (state: FieldEditorFormState) => void;
  /** Handler to receive update on the form "isModified" state */
  onFormModifiedChange?: (isModified: boolean) => void;
  /** If disabled, the field editor will not be editable */
  isDisabled?: boolean;
}

const changeWarning = i18n.translate('indexPatternFieldEditor.editor.form.changeWarning', {
  defaultMessage:
    'Changing name or type can break searches and visualizations that rely on this field.',
});

const fieldTypeToComboBoxOption = (type: Field['type']): TypeSelection => {
  if (type) {
    const label = RUNTIME_FIELD_OPTIONS.find(({ value }) => value === type)?.label;
    return [{ label: label ?? type, value: type as RuntimeType }];
  }
  return [RUNTIME_FIELD_OPTIONS[0]];
};

const formDeserializer = (field: Field): FieldFormInternal => {
  const fieldType = fieldTypeToComboBoxOption(field.type);

  const format = field.format === null ? undefined : field.format;

  return {
    ...field,
    popularity: typeof field.popularity === 'number' ? String(field.popularity) : field.popularity,
    type: fieldType,
    format,
    __meta__: {
      isCustomLabelVisible: field.customLabel !== undefined,
      isCustomDescriptionVisible: field.customDescription !== undefined,
      isValueVisible: field.script !== undefined,
      isFormatVisible: field.format !== undefined,
      isPopularityVisible: field.popularity !== undefined,
    },
  };
};

const formSerializer = (field: FieldFormInternal): Field => {
  const { __meta__, type, format, popularity, ...rest } = field;

  return {
    type: type && type[0].value!,
    // By passing "null" we are explicitly telling DataView to remove the
    // format if there is one defined for the field.
    format: format === undefined ? null : format,
    // convert from the input string value into a number
    popularity: typeof popularity === 'string' ? Number(popularity) || 0 : popularity,
    ...rest,
  };
};

const FieldEditorComponent = ({ field, onChange, onFormModifiedChange, isDisabled }: Props) => {
  const { fieldTypeToProcess, fieldName$, subfields$, dataView } = useFieldEditorContext();
  const {
    params: { update: updatePreviewParams },
    fieldPreview$,
  } = useFieldPreviewContext();
  const { form } = useForm<Field, FieldFormInternal>({
    defaultValue: field,
    schema,
    deserializer: formDeserializer,
    serializer: formSerializer,
  });

  const { submit, isValid: isFormValid, isSubmitted, getFields, isSubmitting } = form;

  const nameFieldConfig = getNameFieldConfig(dataView, field);

  const [formData] = useFormData<FieldFormInternal>({ form });
  const isFormModified = useFormIsModified({
    form,
    discard: [
      '__meta__.isCustomLabelVisible',
      '__meta__.isCustomDescriptionVisible',
      '__meta__.isValueVisible',
      '__meta__.isFormatVisible',
      '__meta__.isPopularityVisible',
    ],
  });

  // use observable to sidestep react state
  useEffect(() => {
    const sub = form.subscribe(({ data }) => {
      if (data.internal.name !== fieldName$.getValue()) {
        fieldName$.next(data.internal.name);
      }
    });

    return () => {
      sub.unsubscribe();
    };
  }, [form, fieldName$]);

  const {
    name: updatedName,
    type: updatedType,
    script: updatedScript,
    format: updatedFormat,
  } = formData;
  const { name: nameField, type: typeField } = getFields();
  const nameHasChanged = (Boolean(field?.name) && nameField?.isModified) ?? false;
  const typeHasChanged = (Boolean(field?.type) && typeField?.isModified) ?? false;

  const isValueVisible = get(formData, '__meta__.isValueVisible');

  const resetTypes = useCallback(() => {
    const lastVal = fieldPreview$.getValue();
    // resets the preview history to an empty set
    fieldPreview$.next([]);
    // apply the last preview to get all the types
    fieldPreview$.next(lastVal);
  }, [fieldPreview$]);

  useEffect(() => {
    const existingCompositeField = !!Object.keys(subfields$.getValue() || {}).length;

    // Project the subfields list directly from the latest preview so a single emission always
    // reconciles the full field set, while preserving any user-selected type for surviving subfields.
    const subChanges = fieldPreview$.subscribe((previewFields) => {
      if (previewFields === undefined) {
        return;
      }

      const currentSubfields = subfields$.getValue() ?? {};
      const parentPrefix = `${updatedName}.`;

      const nextSubfields = previewFields.reduce<Record<string, { type: RuntimePrimitiveTypes }>>(
        (acc, item) => {
          const name = item.key.substring(parentPrefix.length);
          acc[name] = {
            type: currentSubfields[name]?.type ?? (item.type as RuntimePrimitiveTypes),
          };
          return acc;
        },
        {}
      );

      if (!isEqual(nextSubfields, currentSubfields)) {
        subfields$.next(nextSubfields);
        // necessary to maintain script code when changing types
        form.updateFieldValues({ ...form.getFormData() });
      }
    });

    // first preview value is skipped for saved fields, need to populate for new fields and rerenders
    if (!existingCompositeField) {
      fieldPreview$.next([]);
    } else if (fieldPreview$.getValue()) {
      fieldPreview$.next(fieldPreview$.getValue());
    }

    return () => {
      subChanges.unsubscribe();
    };
  }, [form, fieldPreview$, subfields$, updatedName]);

  useEffect(() => {
    if (onChange) {
      onChange({ isValid: isFormValid, isSubmitted, isSubmitting, submit });
    }
  }, [onChange, isFormValid, isSubmitted, isSubmitting, submit]);

  useEffect(() => {
    updatePreviewParams({
      name: Boolean(updatedName?.trim()) ? updatedName : null,
      type: updatedType?.[0].value,
      script:
        isValueVisible === false || Boolean(updatedScript?.source.trim()) === false
          ? null
          : { source: updatedScript!.source },
      format: updatedFormat?.id !== undefined ? updatedFormat : null,
      parentName: field?.parentName,
    });
  }, [
    updatedName,
    updatedType,
    updatedScript,
    isValueVisible,
    updatedFormat,
    updatePreviewParams,
    field,
  ]);

  useEffect(() => {
    if (onFormModifiedChange) {
      onFormModifiedChange(isFormModified);
    }
  }, [isFormModified, onFormModifiedChange, form]);

  return (
    <Form
      form={form}
      className="indexPatternFieldEditor__form"
      data-test-subj="indexPatternFieldEditorForm"
      isInvalid={isSubmitted && isFormValid === false}
      error={form.getErrors()}
    >
      <EuiFlexGroup>
        {/* Name */}
        <EuiFlexItem>
          <UseField<string, Field>
            path="name"
            config={nameFieldConfig}
            component={TextField}
            data-test-subj="nameField"
            componentProps={{
              euiFieldProps: {
                disabled: fieldTypeToProcess === 'concrete' || isDisabled,
                'aria-label': i18n.translate('indexPatternFieldEditor.editor.form.nameAriaLabel', {
                  defaultMessage: 'Name field',
                }),
              },
            }}
          />
        </EuiFlexItem>

        {/* Type */}
        <EuiFlexItem>
          <TypeField
            isDisabled={fieldTypeToProcess === 'concrete' || isDisabled}
            includeComposite={true}
            path="type"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      {(nameHasChanged || typeHasChanged) && (
        <>
          <EuiSpacer size="xs" />
          <KbnWarningCallout
            announceOnMount
            title={changeWarning}
            size="s"
            data-test-subj="changeWarning"
          />
        </>
      )}
      <EuiSpacer size="xl" />
      {field?.parentName && (
        <>
          <KbnInfoCallout
            announceOnMount={false}
            title={i18n.translate('indexPatternFieldEditor.editor.form.subFieldParentInfo', {
              defaultMessage: "Field value is defined by ''{parentName}''",
              values: { parentName: field?.parentName },
            })}
          />
          <EuiSpacer size="xl" />
        </>
      )}
      {updatedType && updatedType[0].value !== 'composite' ? (
        <FieldDetail isDisabled={isDisabled} />
      ) : (
        <CompositeEditor onReset={resetTypes} isDisabled={isDisabled} />
      )}
    </Form>
  );
};

export const FieldEditor = FieldEditorComponent as typeof FieldEditorComponent;
