/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { EuiFilePicker, EuiFlexGroup, EuiFlexItem, EuiFormRow, EuiText } from '@elastic/eui';
import type {
  EuiFilePickerClass,
  EuiFilePickerProps,
} from '@elastic/eui/src/components/form/file_picker/file_picker';
import { UploadFileButton } from '../../../../../../../common/components';
import { FILE_UPLOAD_ERROR } from '../../../../../../../common/translations/file_upload_error';
import type { CreateMigration } from '../../../../../../service/hooks/use_create_migration';
import * as i18n from './translations';
import { RULES_DATA_INPUT_CHECK_RESOURCES_QRADAR_DESCRIPTION } from '../check_resources/translations';
import { useParseFileInput } from '../../../../../../../common/hooks/use_parse_file_input';
import { MigrationSource } from '../../../../../../../common/types';

export interface RulesXMLFileUploadProps {
  createMigration: CreateMigration;
  isLoading: boolean;
  isCreated: boolean;
  onRulesFileChanged: (files: FileList | null) => void;
  migrationName: string | undefined;
  apiError: string | undefined;
}

export const RulesXMLFileUpload = React.memo<RulesXMLFileUploadProps>(
  ({ createMigration, migrationName, apiError, isLoading, isCreated, onRulesFileChanged }) => {
    const [rulesToUpload, setRulesToUpload] = useState<string>();
    const filePickerRef = useRef<EuiFilePickerClass>(null);

    const createRules = useCallback(() => {
      if (migrationName && rulesToUpload) {
        filePickerRef.current?.removeFiles();
        createMigration({
          migrationName,
          rules: { xml: rulesToUpload },
          vendor: MigrationSource.QRADAR,
        });
      }
    }, [createMigration, migrationName, rulesToUpload]);

    const onXMLFileParsed = useCallback((content: string) => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length > 0) {
        throw new Error(FILE_UPLOAD_ERROR.INVALID_XML);
      }
      setRulesToUpload(content);
    }, []);

    const { parseFile, isParsing, error: fileError } = useParseFileInput(onXMLFileParsed);

    const onFileChange = useCallback(
      (files: FileList | null) => {
        setRulesToUpload(undefined);
        onRulesFileChanged(files);
        parseFile(files);
      },
      [parseFile, onRulesFileChanged]
    );

    const validationError = useMemo(() => {
      if (apiError) {
        return apiError;
      }
      return fileError;
    }, [apiError, fileError]);

    const showLoader = isParsing || isLoading;
    const isDisabled = !migrationName || showLoader || isCreated;
    const isButtonDisabled = isDisabled || rulesToUpload == null;

    return (
      <EuiFlexGroup direction="column" gutterSize="s">
        <EuiFlexItem>
          <EuiText size="s">{RULES_DATA_INPUT_CHECK_RESOURCES_QRADAR_DESCRIPTION}</EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFormRow isInvalid={validationError != null} fullWidth error={validationError}>
            <EuiFilePicker
              isInvalid={validationError != null}
              id="rulesFilePicker"
              ref={filePickerRef as React.Ref<Omit<EuiFilePickerProps, 'stylesMemoizer'>>}
              fullWidth
              initialPromptText={
                <EuiText size="s" textAlign="center">
                  {i18n.RULES_DATA_INPUT_FILE_UPLOAD_PROMPT_QRADAR}
                </EuiText>
              }
              accept={'.xml'}
              onChange={onFileChange}
              display="large"
              aria-label="Upload rules file"
              isLoading={showLoader}
              disabled={isDisabled}
              data-test-subj="rulesFilePicker"
              data-loading={isParsing}
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup justifyContent="flexEnd" gutterSize="none">
            <EuiFlexItem grow={false}>
              <UploadFileButton
                onClick={createRules}
                isLoading={showLoader}
                disabled={isButtonDisabled}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }
);
RulesXMLFileUpload.displayName = 'RulesXMLFileUpload';
