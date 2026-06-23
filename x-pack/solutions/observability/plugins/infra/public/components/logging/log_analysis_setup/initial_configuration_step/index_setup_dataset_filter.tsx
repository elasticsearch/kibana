/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiSelectableOption } from '@elastic/eui';
import {
  EuiFilterButton,
  EuiFilterGroup,
  EuiIconTip,
  EuiPopover,
  EuiPopoverTitle,
  EuiSelectable,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import React, { useCallback, useMemo } from 'react';
import type { DatasetFilter, QualityWarning } from '../../../../../common/log_analysis';
import { useVisibilityState } from '../../../../hooks/use_visibility_state';
import { CategoryQualityWarningReasonDescription } from '../../log_analysis_job_status/quality_warning_notices';

export const IndexSetupDatasetFilter: React.FC<{
  availableDatasets: Array<{
    dataset: string;
    warnings: QualityWarning[];
  }>;
  datasetFilter: DatasetFilter;
  isDisabled?: boolean;
  onChangeDatasetFilter: (datasetFilter: DatasetFilter) => void;
}> = ({ availableDatasets, datasetFilter, isDisabled, onChangeDatasetFilter }) => {
  const { isVisible, hide, show } = useVisibilityState(false);

  const changeDatasetFilter = useCallback(
    (options: EuiSelectableOption[]) => {
      const selectedDatasets = options
        .filter(({ checked }) => checked === 'on')
        .map(({ label }) => label);

      onChangeDatasetFilter(
        selectedDatasets.length === 0
          ? { type: 'includeAll' }
          : { type: 'includeSome', datasets: selectedDatasets }
      );
    },
    [onChangeDatasetFilter]
  );

  const selectableOptions = useMemo<EuiSelectableOption[]>(
    () =>
      availableDatasets.map(({ dataset, warnings }) => ({
        label: dataset,
        append: warnings.length > 0 ? <DatasetWarningMarker warnings={warnings} /> : null,
        checked:
          datasetFilter.type === 'includeSome' && datasetFilter.datasets.includes(dataset)
            ? 'on'
            : undefined,
      })),
    [availableDatasets, datasetFilter]
  );

  const datasetFilterButton = (
    <EuiFilterButton
      disabled={isDisabled}
      isSelected={isVisible}
      onClick={show}
      iconType="chevronSingleDown"
    >
      <FormattedMessage
        id="xpack.infra.analysisSetup.indexDatasetFilterIncludeAllButtonLabel"
        defaultMessage="{includeType, select, includeAll {All datasets} includeSome {{includedDatasetCount, plural, one {# dataset} other {# datasets}}} other {No dataset available}}"
        values={{
          includeType: datasetFilter.type,
          includedDatasetCount:
            datasetFilter.type === 'includeSome' ? datasetFilter.datasets.length : 0,
        }}
      />
    </EuiFilterButton>
  );

  return (
    <EuiFilterGroup>
      <EuiPopover
        button={datasetFilterButton}
        closePopover={hide}
        isOpen={isVisible}
        panelPaddingSize="none"
        aria-label={i18n.translate('xpack.infra.analysisSetup.indexDatasetFilterPopoverAriaLabel', {
          defaultMessage: 'Filter datasets',
        })}
      >
        <EuiSelectable
          onChange={changeDatasetFilter}
          options={selectableOptions}
          searchable
          listProps={{ paddingSize: 's' }}
        >
          {(list, search) => (
            <div>
              <EuiPopoverTitle>{search}</EuiPopoverTitle>
              {list}
            </div>
          )}
        </EuiSelectable>
      </EuiPopover>
    </EuiFilterGroup>
  );
};

const DatasetWarningMarker: React.FC<{ warnings: QualityWarning[] }> = ({ warnings }) => {
  const warningDescriptions = warnings.flatMap((warning) =>
    warning.type === 'categoryQualityWarning'
      ? warning.reasons.map((reason) => (
          <CategoryQualityWarningReasonDescription key={reason.type} reason={reason} />
        ))
      : []
  );

  return <EuiIconTip content={warningDescriptions} type="warning" color="warning" />;
};
