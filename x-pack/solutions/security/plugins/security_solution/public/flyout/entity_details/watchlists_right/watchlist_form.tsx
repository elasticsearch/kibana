/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense } from 'react';
import {
  EuiFieldText,
  EuiLoadingSpinner,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiRange,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { canUpdateWatchlistField } from '../../../../common/api/entity_analytics/watchlists/management';
import type { CreateWatchlistRequestBodyInput } from '../../../../common/api/entity_analytics/watchlists/management/create.gen';
import type { MonitoringEntitySource } from '../../../../common/api/entity_analytics/watchlists/data_source/common.gen';
import {
  WATCHLIST_DESCRIPTION_LABEL,
  WATCHLIST_NAME_LABEL,
  WATCHLIST_RISK_SCORE_WEIGHTING_LABEL,
  WATCHLIST_RISK_SCORE_WEIGHTING_ERROR,
  WATCHLIST_CSV_DATA_SOURCE_TITLE,
  WATCHLIST_CSV_DATA_SOURCE_DESCRIPTION,
} from './translations';
import { RuleBasedSourceInput } from './rule_based_source_input';
import { WatchlistCsvUpload } from './csv_upload';
import { ManagedWatchlistSourceInput } from './managed_watchlist_source_input';
import {
  MAX_WATCHLIST_DESCRIPTION_LENGTH,
  MAX_WATCHLIST_NAME_LENGTH,
} from '../../../../common/entity_analytics/watchlists/constants';

export interface WatchlistFormProps {
  watchlist: CreateWatchlistRequestBodyInput;
  watchlistId?: string;
  indexSourceWithMissingApiKey?: MonitoringEntitySource;
  isEditMode: boolean;
  isNameTooLong: boolean;
  isDescriptionTooLong: boolean;
  isRiskModifierInvalid: boolean;
  onFieldChange: <K extends keyof CreateWatchlistRequestBodyInput>(
    key: K,
    value: CreateWatchlistRequestBodyInput[K]
  ) => void;
  onSourceValidationChange: (valid: boolean) => void;
}

const getTooLongError = (isTooLong: boolean, maxLength: number, fieldId: string) =>
  isTooLong
    ? [
        i18n.translate(fieldId, {
          defaultMessage: 'Must be {maxLength} characters or fewer',
          values: { maxLength },
        }),
      ]
    : undefined;

export const WatchlistForm = ({
  watchlist,
  watchlistId,
  indexSourceWithMissingApiKey,
  isEditMode,
  isNameTooLong,
  isDescriptionTooLong,
  isRiskModifierInvalid,
  onFieldChange,
  onSourceValidationChange,
}: WatchlistFormProps) => {
  const isManaged = watchlist.managed === true;
  const isNameDisabled = isEditMode && !canUpdateWatchlistField('name', isManaged);
  const isDescriptionDisabled = isEditMode && !canUpdateWatchlistField('description', isManaged);

  return (
    <EuiForm component="form" fullWidth onSubmit={(e) => e.preventDefault()}>
      <EuiFormRow
        label={WATCHLIST_NAME_LABEL}
        isInvalid={isNameTooLong}
        error={getTooLongError(
          isNameTooLong,
          MAX_WATCHLIST_NAME_LENGTH,
          'xpack.securitySolution.entityAnalytics.watchlists.flyout.nameInvalid'
        )}
      >
        <EuiFieldText
          isInvalid={isNameTooLong}
          name="WatchlistName"
          value={watchlist.name}
          onChange={(e) => onFieldChange('name', e.target.value)}
          disabled={isNameDisabled}
        />
      </EuiFormRow>
      <EuiFormRow
        label={WATCHLIST_DESCRIPTION_LABEL}
        isInvalid={isDescriptionTooLong}
        error={getTooLongError(
          isDescriptionTooLong,
          MAX_WATCHLIST_DESCRIPTION_LENGTH,
          'xpack.securitySolution.entityAnalytics.watchlists.flyout.descriptionInvalid'
        )}
        labelAppend={
          <EuiText size="xs" color="subdued">
            <FormattedMessage
              id="xpack.securitySolution.entityAnalytics.watchlists.flyout.descriptionOptional"
              defaultMessage="optional"
            />
          </EuiText>
        }
      >
        <EuiFieldText
          isInvalid={isDescriptionTooLong}
          name="WatchlistDescription"
          value={watchlist.description}
          onChange={(e) => onFieldChange('description', e.target.value)}
          disabled={isDescriptionDisabled}
        />
      </EuiFormRow>
      <EuiFormRow
        label={WATCHLIST_RISK_SCORE_WEIGHTING_LABEL}
        isInvalid={isRiskModifierInvalid}
        error={isRiskModifierInvalid ? [WATCHLIST_RISK_SCORE_WEIGHTING_ERROR] : undefined}
      >
        <EuiRange
          min={0}
          max={2}
          step={0.5}
          showTicks
          showInput
          isInvalid={isRiskModifierInvalid}
          value={Number.isFinite(watchlist.riskModifier) ? watchlist.riskModifier : ''}
          onChange={(e) => onFieldChange('riskModifier', Number(e.currentTarget.value))}
        />
      </EuiFormRow>
      {isEditMode && watchlistId && (
        <>
          <EuiSpacer size="l" />
          <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiText size="s">
                <strong>{WATCHLIST_CSV_DATA_SOURCE_TITLE}</strong>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                <p>{WATCHLIST_CSV_DATA_SOURCE_DESCRIPTION}</p>
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="m" />
          <WatchlistCsvUpload watchlistId={watchlistId} />
        </>
      )}
      <EuiSpacer size="m" />
      {watchlist.managed && (
        <Suspense fallback={<EuiLoadingSpinner size="m" />}>
          <ManagedWatchlistSourceInput watchlist={watchlist} />
        </Suspense>
      )}
      <RuleBasedSourceInput
        watchlistName={watchlist.name}
        watchlistId={watchlistId}
        indexSourceWithMissingApiKey={indexSourceWithMissingApiKey}
        isEditMode={isEditMode}
        isManaged={watchlist.managed}
        onFieldChange={onFieldChange}
        initialEntitySources={watchlist.entitySources}
        onSourceValidationChange={onSourceValidationChange}
      />
    </EuiForm>
  );
};
