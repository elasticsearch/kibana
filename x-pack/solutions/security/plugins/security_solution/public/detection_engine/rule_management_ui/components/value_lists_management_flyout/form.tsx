/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { EuiSelectOption } from '@elastic/eui';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFilePicker,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiSelect,
} from '@elastic/eui';
import type {
  EuiFilePickerClass,
  EuiFilePickerProps,
} from '@elastic/eui/src/components/form/file_picker/file_picker';

import {
  VALUE_LIST_ELASTICSEARCH_TYPES_ALPHABETICAL,
  type ListSchema,
  type Type,
} from '@kbn/securitysolution-io-ts-list-types';
import { useImportList } from '@kbn/securitysolution-list-hooks';

import * as i18n from './translations';
import { useKibana } from '../../../../common/lib/kibana';

export const listFormOptions: EuiSelectOption[] = VALUE_LIST_ELASTICSEARCH_TYPES_ALPHABETICAL.map(
  (listType) => ({
    value: listType,
    text: i18n.getListTypeSelectOptionText(listType),
  })
);

const defaultListType: Type = 'keyword';
const validFileTypes = ['text/csv', 'text/plain'];

export interface ValueListsFormProps {
  onError: (error: Error) => void;
  onSuccess: (response: ListSchema) => void;
}

export const ValueListsFormComponent: React.FC<ValueListsFormProps> = ({ onError, onSuccess }) => {
  const ctrl = useRef(new AbortController());
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<Type>(defaultListType);
  const filePickerRef = useRef<EuiFilePickerClass | null>(null);
  const { http } = useKibana().services;
  const { start: importList, ...importState } = useImportList();

  const fileIsValid = !file || validFileTypes.some((fileType) => file.type === fileType);

  const handleRadioChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => setType(event.target.value as Type),
    [setType]
  );

  const handleFileChange = useCallback((files: FileList | null) => {
    setFile(files?.item(0) ?? null);
  }, []);

  const resetForm = useCallback(() => {
    if (filePickerRef.current?.fileInput) {
      filePickerRef.current.fileInput.value = '';
      filePickerRef.current.handleChange();
    }
    setFile(null);
    setType(defaultListType);
  }, []);

  const handleCancel = useCallback(() => {
    ctrl.current.abort();
  }, []);

  const handleSuccess = useCallback(
    (response: ListSchema) => {
      resetForm();
      onSuccess(response);
    },
    [resetForm, onSuccess]
  );
  const handleError = useCallback(
    (error: Error) => {
      onError(error);
    },
    [onError]
  );

  const handleImport = useCallback(() => {
    if (!importState.loading && file) {
      ctrl.current = new AbortController();
      importList({
        file,
        listId: undefined,
        http,
        signal: ctrl.current.signal,
        type,
      });
    }
  }, [importState.loading, file, importList, http, type]);

  useEffect(() => {
    if (!importState.loading && importState.result) {
      handleSuccess(importState.result);
    } else if (!importState.loading && importState.error) {
      handleError(importState.error as Error);
    }
  }, [handleError, handleSuccess, importState.error, importState.loading, importState.result]);

  useEffect(() => {
    return handleCancel;
  }, [handleCancel]);

  return (
    <EuiForm>
      <EuiFormRow
        data-test-subj="value-list-file-picker-row"
        label={i18n.FILE_PICKER_LABEL}
        fullWidth
        isInvalid={!fileIsValid}
        error={[i18n.FILE_PICKER_INVALID_FILE_TYPE(validFileTypes.join(', '))]}
      >
        <EuiFilePicker
          accept={validFileTypes.join()}
          data-test-subj="value-list-file-picker"
          id="value-list-file-picker"
          initialPromptText={i18n.FILE_PICKER_PROMPT}
          ref={filePickerRef as React.Ref<Omit<EuiFilePickerProps, 'stylesMemoizer'>>}
          onChange={handleFileChange}
          fullWidth={true}
          isLoading={importState.loading}
          isInvalid={!fileIsValid}
          aria-label={i18n.FILE_PICKER_PROMPT}
        />
      </EuiFormRow>
      <EuiFormRow fullWidth>
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiFormRow label={i18n.LIST_TYPES_RADIO_LABEL}>
              <EuiSelect
                data-test-subj="value-lists-form-select-type-action"
                options={listFormOptions}
                value={type}
                onChange={handleRadioChange}
                name="valueListType"
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFormRow hasEmptyLabelSpace={true}>
              <EuiFlexGroup alignItems="flexEnd">
                <EuiFlexItem>
                  {importState.loading && (
                    <EuiButtonEmpty onClick={handleCancel}>{i18n.CANCEL_BUTTON}</EuiButtonEmpty>
                  )}
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiButton
                    data-test-subj="value-lists-form-import-action"
                    onClick={handleImport}
                    disabled={file == null || !fileIsValid || importState.loading}
                  >
                    {i18n.UPLOAD_BUTTON}
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFormRow>
    </EuiForm>
  );
};

ValueListsFormComponent.displayName = 'ValueListsFormComponent';

export const ValueListsForm = React.memo(ValueListsFormComponent);

ValueListsForm.displayName = 'ValueListsForm';
