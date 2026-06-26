/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { EuiFilePickerProps } from '@elastic/eui';
import {
  EuiButton,
  EuiCallOut,
  EuiFilePicker,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPanel,
  EuiSpacer,
  EuiStepNumber,
  EuiSuperSelect,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { EuiFilePickerClass } from '@elastic/eui/src/components/form/file_picker/file_picker';
import type { MigrationStepProps } from '../../../../../common/types';
import type { RuleMigrationTaskStats } from '../../../../../../../common/siem_migrations/model/rule_migration.gen';
import type { QRadarMitreMappingsData } from '../../../../../../../common/siem_migrations/model/vendor/rules/qradar.gen';
import { FILE_UPLOAD_ERROR } from '../../../../../common/translations/file_upload_error';
import { useParseFileInput } from '../../../../../common/hooks/use_parse_file_input';
import { getEuiStepStatus } from '../../../../../common/utils/get_eui_step_status';
import { useEnhanceRules } from '../../../../service/hooks/use_enhance_rules';
import * as i18n from './translations';
import { EnhancementType, QRADAR_ENHANCEMENT_OPTS, type AddedEnhancement } from './types';
import { QradarDataInputStep } from '../../types';

export const EnhancementsDataInput = React.memo<MigrationStepProps>(
  ({ dataInputStep, migrationStats }) => {
    const dataInputStatus = useMemo(
      () => getEuiStepStatus(QradarDataInputStep.Enhancements, dataInputStep),
      [dataInputStep]
    );

    return (
      <EuiPanel hasShadow={false} hasBorder>
        <EuiFlexGroup direction="column">
          <EuiFlexItem>
            <EuiFlexGroup direction="row" justifyContent="center" gutterSize="m">
              <EuiFlexItem grow={false}>
                <EuiStepNumber
                  data-test-subj="enhancementsStepNumber"
                  titleSize="xs"
                  number={QradarDataInputStep.Enhancements}
                  status={dataInputStatus}
                />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiTitle size="xs" data-test-subj="enhancementsTitle">
                  <b>{i18n.ENHANCEMENTS_DATA_INPUT_TITLE}</b>
                </EuiTitle>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          {dataInputStatus === 'current' && migrationStats && (
            <EuiFlexItem>
              <EnhancementsDataInputContent migrationStats={migrationStats} />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiPanel>
    );
  }
);
EnhancementsDataInput.displayName = 'EnhancementsDataInput';

interface EnhancementsDataInputContentProps {
  migrationStats: RuleMigrationTaskStats;
}

const EnhancementsDataInputContent = React.memo<EnhancementsDataInputContentProps>(
  ({ migrationStats }) => {
    const [selectedType, setSelectedType] = useState<EnhancementType>(EnhancementType.MITRE);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [parsedData, setParsedData] = useState<QRadarMitreMappingsData | null>(null);
    const [addedEnhancements, setAddedEnhancements] = useState<AddedEnhancement[]>([]);
    const filePickerRef = React.useRef<EuiFilePickerClass>(null);

    const { enhanceRules, isLoading } = useEnhanceRules();

    const onFileParsed = useCallback((content: string) => {
      try {
        const parsed: QRadarMitreMappingsData = JSON.parse(content);
        setParsedData(parsed);
      } catch (err) {
        throw new Error(FILE_UPLOAD_ERROR.INVALID_JSON);
      }
    }, []);

    const { parseFile, isParsing, error: parseError } = useParseFileInput(onFileParsed);

    const onTypeChange = useCallback((value: EnhancementType) => {
      setSelectedType(value);
    }, []);

    const onFileChange = useCallback(
      (files: FileList | null) => {
        setParsedData(null);

        if (!files || files.length === 0) {
          setSelectedFile(null);
          return;
        }

        setSelectedFile(files[0]);
        parseFile(files);
      },
      [parseFile]
    );

    const onAddEnhancement = useCallback(async () => {
      if (!selectedFile || !parsedData || !migrationStats) {
        return;
      }

      const success = await enhanceRules({
        migrationId: migrationStats.id,
        body: {
          vendor: 'qradar',
          type: selectedType,
          data: parsedData,
        },
      });

      if (success) {
        // Add to the list of added enhancements
        setAddedEnhancements((prev) => [
          ...prev,
          { type: selectedType, fileName: selectedFile.name },
        ]);

        // Clear the form
        setSelectedFile(null);
        setParsedData(null);
        filePickerRef.current?.removeFiles();
      }
    }, [selectedFile, parsedData, migrationStats, selectedType, enhanceRules]);

    const isAddDisabled = !selectedFile || !parsedData || isLoading || isParsing || !!parseError;

    const typeOptions = useMemo(
      () =>
        Array.from(QRADAR_ENHANCEMENT_OPTS.keys()).map((enhancementType) => ({
          value: enhancementType,
          inputDisplay: QRADAR_ENHANCEMENT_OPTS.get(enhancementType),
        })),
      []
    );

    return (
      <EuiFlexGroup direction="column" gutterSize="m">
        <EuiFlexItem>
          <EuiText size="s">{i18n.ENHANCEMENTS_INSTRUCTIONS}</EuiText>
          <EuiSpacer size="s" />
          <EuiCallOut
            iconType="info"
            size="s"
            color="primary"
            title={i18n.ENHANCEMENTS_HELPER_TEXT}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup direction="row" gutterSize="m" alignItems="flexEnd">
            <EuiFlexItem grow={2}>
              <EuiFormRow label={i18n.ENHANCEMENT_TYPE_LABEL} fullWidth>
                <EuiSuperSelect
                  options={typeOptions}
                  valueOfSelected={selectedType}
                  onChange={onTypeChange}
                  disabled={isLoading}
                  fullWidth
                  data-test-subj="enhancementTypeSelect"
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem grow={3}>
              <EuiFormRow
                label={i18n.FILE_LABEL}
                isInvalid={!!parseError}
                error={parseError}
                fullWidth
              >
                <EuiFilePicker
                  id="enhancementFilePicker"
                  ref={filePickerRef as React.Ref<Omit<EuiFilePickerProps, 'stylesMemoizer'>>}
                  initialPromptText={i18n.FILE_PICKER_PROMPT}
                  onChange={onFileChange}
                  accept=".json"
                  display="default"
                  isLoading={isParsing || isLoading}
                  disabled={isLoading}
                  isInvalid={!!parseError}
                  data-test-subj="enhancementFilePicker"
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                onClick={onAddEnhancement}
                disabled={isAddDisabled}
                isLoading={isLoading}
                data-test-subj="addEnhancementButton"
              >
                {i18n.ADD_BUTTON}
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiSpacer size="s" />
          <EuiText size="s">
            <strong>{i18n.ADDED_ENHANCEMENTS_LABEL}</strong>
          </EuiText>
          {addedEnhancements.length === 0 ? (
            <EuiText size="s" color="subdued">
              {i18n.NO_ENHANCEMENTS_ADDED}
            </EuiText>
          ) : (
            <EuiFlexGroup direction="column" gutterSize="xs">
              {addedEnhancements.map((enhancement, index) => (
                <EuiFlexItem key={index}>
                  <EuiText size="s">
                    {`${QRADAR_ENHANCEMENT_OPTS.get(enhancement.type)} - ${enhancement.fileName}`}
                  </EuiText>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }
);
EnhancementsDataInputContent.displayName = 'EnhancementsDataInputContent';
