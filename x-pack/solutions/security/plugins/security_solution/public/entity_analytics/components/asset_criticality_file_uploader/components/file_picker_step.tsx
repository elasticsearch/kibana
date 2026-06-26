/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiCode,
  EuiCodeBlock,
  EuiFilePicker,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiFontSize,
  useEuiTheme,
} from '@elastic/eui';

import { css } from '@emotion/css';
import React from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage, useI18n } from '@kbn/i18n-react';

import type { EntityType } from '../../../../../common/entity_analytics/types';
import { useEntityAnalyticsTypes } from '../../../hooks/use_enabled_entity_types';

import {
  CRITICALITY_CSV_MAX_SIZE_BYTES,
  ValidCriticalityLevels,
} from '../../../../../common/entity_analytics/asset_criticality';
import { useFormatBytes } from '../../../../common/components/formatted_bytes';
import { SUPPORTED_FILE_EXTENSIONS, SUPPORTED_FILE_TYPES } from '../constants';

interface AssetCriticalityFilePickerStepProps {
  onFileChange: (fileList: FileList | null) => void;
  isLoading: boolean;
  errorMessage?: string;
}

type SupportedEntityType = EntityType.user | EntityType.host | EntityType.service;

const entityCSVMap: Record<SupportedEntityType, string> = {
  user: `user,user001@company.com,user-001,User One,,,,low_impact\nuser,user002@abc.biz,user-002,,,,,medium_impact`,
  host: `host,,,,host-001,xyz.com,,extreme_impact`,
  service: `service,,,,,,service-001,extreme_impact`,
};

export const AssetCriticalityFilePickerStep: React.FC<AssetCriticalityFilePickerStepProps> =
  React.memo(({ onFileChange, errorMessage, isLoading }) => {
    const { formatListToParts } = useI18n();

    const formatBytes = useFormatBytes();
    const { euiTheme } = useEuiTheme();

    const listStyle = css`
      list-style-type: disc;
      margin-bottom: ${euiTheme.size.l};
      margin-left: ${euiTheme.size.l};
      line-height: ${useEuiFontSize('s').lineHeight};
    `;

    const entityTypes = useEntityAnalyticsTypes();

    const sampleCSVContent = [
      'type,user.email,user.name,user.full_name,host.name,host.domain,service.name,criticality_level',
      ...entityTypes
        .filter((entity): entity is SupportedEntityType => entity in entityCSVMap)
        .map((entity) => entityCSVMap[entity]),
    ].join('\n');

    const i18nOrList = (items: string[]) =>
      formatListToParts(items, {
        type: 'disjunction',
      }).map(({ type, value }) => (type === 'element' ? <b>{value}</b> : value)); // bolded list items

    return (
      <>
        <EuiSpacer size="m" />
        <EuiPanel color={'subdued'} paddingSize="l" grow={false} hasShadow={false}>
          <EuiTitle size="xxs">
            <h3>
              <FormattedMessage
                defaultMessage="Supported file formats and size"
                id="xpack.securitySolution.entityAnalytics.assetCriticalityUploadPage.csvFileFormatRequirements"
              />
            </h3>
          </EuiTitle>
          <EuiSpacer size="s" />

          <ul className={listStyle}>
            <li>
              <FormattedMessage
                defaultMessage="File formats: {formats}"
                id="xpack.securitySolution.entityAnalytics.assetCriticalityUploadPage.acceptedFileFormats"
                values={{
                  formats: SUPPORTED_FILE_EXTENSIONS.join(', '),
                }}
              />
            </li>
            <li>
              <FormattedMessage
                defaultMessage="Maximum file size: {maxFileSize}"
                id="xpack.securitySolution.entityAnalytics.assetCriticalityUploadPage.uploadFileSizeLimit"
                values={{
                  maxFileSize: formatBytes(CRITICALITY_CSV_MAX_SIZE_BYTES),
                }}
              />
            </li>
          </ul>

          <EuiTitle size="xxs">
            <h3>
              <FormattedMessage
                defaultMessage="Required file structure"
                id="xpack.securitySolution.entityAnalytics.assetCriticalityUploadPage.CSVStructureTitle"
              />
            </h3>
          </EuiTitle>
          <EuiSpacer size="s" />

          <ul className={listStyle}>
            <li>
              <FormattedMessage
                defaultMessage={`Header row: The first row of the file must contain a header. This specifies the columns in the file. "type" and "criticality_level" must be columns in the file.`}
                id="xpack.securitySolution.entityAnalytics.assetCriticalityUploadPage.headerDescription"
              />
            </li>
            <li>
              <FormattedMessage
                defaultMessage={`Entity type: Indicate whether the entity is a {entityTypes}. The header for this column must be "type".`}
                id="xpack.securitySolution.entityAnalytics.assetCriticalityUploadPage.assetTypeDescriptionV2"
                values={{
                  entityTypes: i18nOrList(entityTypes),
                }}
              />
            </li>
            <li>
              <FormattedMessage
                defaultMessage={`Identifier fields: Specify fields that identify the entity. Examples include "user.name", "user.email", "user.username", "event.module", "host.name", "host.hostname". Entities that match ALL of the identifiers specified in a row will be updated.`}
                id="xpack.securitySolution.entityAnalytics.assetCriticalityUploadPage.assetIdentifierDescriptionV2"
              />
            </li>
            <li>
              <FormattedMessage
                defaultMessage={`Criticality level: Specify any one of {labels}. The header for this column must be "criticality_level".`}
                id="xpack.securitySolution.entityAnalytics.assetCriticalityUploadPage.assetCriticalityLabelsV2"
                values={{
                  labels: <EuiCode>{ValidCriticalityLevels.join(', ')}</EuiCode>,
                }}
              />
            </li>
          </ul>

          <EuiTitle size="xxs">
            <h3>
              <FormattedMessage
                defaultMessage="Example"
                id="xpack.securitySolution.entityAnalytics.assetCriticalityUploadPage.exampleTitle"
              />
            </h3>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiCodeBlock
            language="csv"
            css={css`
              background-color: ${euiTheme.colors.emptyShade};
            `}
            paddingSize="s"
            lineNumbers
            isCopyable
          >
            {sampleCSVContent}
          </EuiCodeBlock>
        </EuiPanel>

        <EuiSpacer size="l" />
        <EuiFilePicker
          data-test-subj="asset-criticality-file-picker"
          accept={SUPPORTED_FILE_TYPES.join(',')}
          fullWidth
          onChange={onFileChange}
          isInvalid={!!errorMessage}
          isLoading={isLoading}
          aria-label={i18n.translate(
            'xpack.securitySolution.entityAnalytics.assetCriticalityUploadPage.filePickerAriaLabel',
            {
              defaultMessage: 'Asset criticality file picker',
            }
          )}
        />
        <br />
        {errorMessage && (
          <EuiText color={'danger'} size="xs">
            {errorMessage}
          </EuiText>
        )}
      </>
    );
  });

AssetCriticalityFilePickerStep.displayName = 'AssetCriticalityFilePickerStep';
