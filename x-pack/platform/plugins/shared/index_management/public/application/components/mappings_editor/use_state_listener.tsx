/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useMemo } from 'react';

import type { EuiSelectableOption } from '@elastic/eui';
import { cloneDeep } from 'lodash';
import type {
  DocumentFieldsStatus,
  Field,
  Mappings,
  MappingsConfiguration,
  MappingsTemplates,
  OnUpdateHandler,
  RuntimeFields,
} from './types';
import {
  normalize,
  deNormalize,
  stripUndefinedValues,
  normalizeRuntimeFields,
  deNormalizeRuntimeFields,
  getAllFieldTypesFromState,
  getFieldsFromState,
  getTypeLabelFromField,
  getStateWithCopyToFields,
  hasSemanticTextField,
} from './lib';
import { useMappingsState, useDispatch } from './mappings_state_context';

interface Args {
  onChange?: OnUpdateHandler;
  value?: {
    templates: MappingsTemplates;
    configuration: MappingsConfiguration;
    fields: { [key: string]: Field };
    runtime: RuntimeFields;
  };
  status?: DocumentFieldsStatus;
}

export const useMappingsStateListener = ({ onChange, value, status }: Args) => {
  const state = useMappingsState();
  const dispatch = useDispatch();

  const { fields: mappedFields, runtime: runtimeFields } = value ?? {};

  const parsedFieldsDefaultValue = useMemo(() => normalize(mappedFields), [mappedFields]);
  const parsedRuntimeFieldsDefaultValue = useMemo(
    () => normalizeRuntimeFields(runtimeFields),
    [runtimeFields]
  );
  const fieldTypesOptions: EuiSelectableOption[] = useMemo(() => {
    const allFieldsTypes = getAllFieldTypesFromState(deNormalize(normalize(mappedFields)));
    return allFieldsTypes.map((dataType) => ({
      checked: undefined,
      label: getTypeLabelFromField({ type: dataType }),
      'data-test-subj': `indexDetailsMappingsSelectFilter-${dataType}`,
    }));
  }, [mappedFields]);

  const calculateStatus = (fieldStatus: string | undefined, rootLevelFields: string | any[]) => {
    if (fieldStatus) return fieldStatus;

    return rootLevelFields.length === 0 ? 'creatingField' : 'idle';
  };

  useEffect(() => {
    // If we are creating a new field, but haven't entered any name
    // it is valid and we can byPass its form validation (that requires a "name" to be defined)
    const isFieldFormVisible = state.fieldForm !== undefined;
    const emptyNameValue =
      isFieldFormVisible &&
      (state.fieldForm!.data.internal.name === undefined ||
        state.fieldForm!.data.internal.name.trim() === '');

    const bypassFieldFormValidation =
      state.documentFields.status === 'creatingField' && emptyNameValue;

    if (onChange) {
      onChange({
        // Output a mappings object from the user's input.
        getData: () => {
          // Pull the mappings properties from the current editor.
          // For semantic_text fields the UI stores a `reference_field` param that
          // ES doesn't accept. Strip it (and wire copy_to on the
          // referenced text field when one was chosen) before serializing.
          const resolvedFields =
            state.documentFields.editor !== 'json' && hasSemanticTextField(state.fields)
              ? getStateWithCopyToFields(state).fields
              : state.fields;
          const fields =
            state.documentFields.editor === 'json'
              ? state.fieldsJsonEditor.format()
              : deNormalize(resolvedFields);

          // Get the runtime fields
          const runtime = deNormalizeRuntimeFields(state.runtimeFields);

          const configurationData = state.configuration.data.format();
          const templatesData = state.templates.data.format();

          const output = {
            ...stripUndefinedValues({
              ...configurationData,
              ...templatesData,
            }),
          };

          // Mapped fields
          if (fields && Object.keys(fields).length > 0) {
            output.properties = fields;
          }

          // Runtime fields
          if (runtime && Object.keys(runtime).length > 0) {
            output.runtime = runtime;
          }

          return Object.keys(output).length > 0 ? (output as Mappings) : undefined;
        },
        validate: async () => {
          const configurationFormValidator =
            state.configuration.submitForm !== undefined
              ? new Promise(async (resolve, reject) => {
                  try {
                    const { isValid } = await state.configuration.submitForm!();
                    resolve(isValid);
                  } catch (error) {
                    reject(error);
                  }
                })
              : Promise.resolve(true);

          const templatesFormValidator =
            state.templates.submitForm !== undefined
              ? new Promise(async (resolve, reject) => {
                  try {
                    const { isValid } = await state.templates.submitForm!();
                    resolve(isValid);
                  } catch (error) {
                    reject(error);
                  }
                })
              : Promise.resolve(true);

          const promisesToValidate = [configurationFormValidator, templatesFormValidator];

          if (state.fieldForm !== undefined && !bypassFieldFormValidation) {
            promisesToValidate.push(state.fieldForm.validate());
          }

          return Promise.all(promisesToValidate).then((validationArray) => {
            const isValid = validationArray.every(Boolean) && state.fieldsJsonEditor.isValid;
            dispatch({ type: 'validity:update', value: isValid });
            return isValid;
          });
        },
        isValid: state.isValid,
      });
    }
  }, [state, onChange, dispatch]);

  useEffect(() => {
    /**
     * If the value has changed that probably means that we have loaded
     * new data from JSON. We need to update our state with the new mappings.
     */
    if (value === undefined) {
      return;
    }

    dispatch({
      type: 'editor.replaceMappings',
      value: {
        configuration: value.configuration,
        templates: value.templates,
        fields: parsedFieldsDefaultValue,
        documentFields: {
          status: calculateStatus(status, parsedFieldsDefaultValue.rootLevelFields),
          editor: 'default',
        },
        runtimeFields: parsedRuntimeFieldsDefaultValue,
        filter: {
          selectedOptions: fieldTypesOptions,
          filteredFields: getFieldsFromState(parsedFieldsDefaultValue),
          selectedDataTypes: [],
        },
      },
    });
    dispatch({
      type: 'editor.replaceViewMappings',
      value: {
        fields: cloneDeep(parsedFieldsDefaultValue),
      },
    });
  }, [
    value,
    parsedFieldsDefaultValue,
    dispatch,
    status,
    parsedRuntimeFieldsDefaultValue,
    fieldTypesOptions,
  ]);
};
