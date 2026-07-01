/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';

import type { EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiCheckableCard,
  EuiTitle,
  EuiSpacer,
  EuiSwitch,
  EuiHorizontalRule,
  EuiComboBox,
  EuiFormRow,
  EuiCallOut,
} from '@elastic/eui';

import type { DataViewField, DataView } from '@kbn/data-views-plugin/common';
import type { TimeRange } from '@kbn/es-query';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { redirectToADJobWizards } from '../../../../application/jobs/new_job/job_from_pattern_analysis/utils';
import { createFieldOptions } from '../../../../application/jobs/new_job/common/job_creator/util/general';
import { NewJobCapsService } from '../../../../application/services/new_job_capabilities/new_job_capabilities_service';
import {
  type CategorizationType,
  CATEGORIZATION_TYPE,
  QuickCategorizationJobCreator,
} from '../../../../application/jobs/new_job/job_from_pattern_analysis';
import { useMlFromLensKibanaContext } from '../../common/context';
import { JobDetails, type CreateADJobParams } from '../../common/job_details';

interface Props {
  dataView: DataView;
  field: DataViewField;
  query: QueryDslQueryContainer;
  timeRange: TimeRange;
}

export const CreateJob: FC<Props> = ({ dataView, field, query, timeRange }) => {
  const {
    services: {
      data,
      share,
      uiSettings,
      mlServices: { mlApi },
      cps,
    },
  } = useMlFromLensKibanaContext();
  const [categorizationType, setCategorizationType] = useState<CategorizationType>(
    CATEGORIZATION_TYPE.COUNT
  );
  const [enablePerPartitionCategorization, setEnablePerPartitionCategorization] = useState(false);
  const [stopOnWarn, setStopOnWarn] = useState(false);
  const [categoryFieldOptions, setCategoryFieldsOptions] = useState<EuiComboBoxOptionOption[]>([]);
  const [selectedPartitionFieldOptions, setSelectedPartitionFieldOptions] = useState<
    EuiComboBoxOptionOption[]
  >([]);
  const [formComplete, setFormComplete] = useState<boolean | undefined>(undefined);

  const toggleEnablePerPartitionCategorization = useCallback(
    () => setEnablePerPartitionCategorization(!enablePerPartitionCategorization),
    [enablePerPartitionCategorization]
  );

  const toggleStopOnWarn = useCallback(() => setStopOnWarn(!stopOnWarn), [stopOnWarn]);

  useMemo(() => {
    const newJobCapsService = new NewJobCapsService(mlApi);
    newJobCapsService.initializeFromDataVIew(dataView).then(() => {
      const options: EuiComboBoxOptionOption[] = [
        ...createFieldOptions(newJobCapsService.categoryFields, []),
      ].map((o) => ({
        ...o,
      }));
      setCategoryFieldsOptions(options);
    });
  }, [dataView, mlApi]);

  const quickJobCreator = useMemo(
    () =>
      new QuickCategorizationJobCreator(
        data.dataViews,
        uiSettings,
        data.query.timefilter.timefilter,
        share,
        data,
        mlApi,
        cps
      ),
    [share, data, mlApi, uiSettings, cps]
  );

  function createADJobInWizard() {
    const partitionField = selectedPartitionFieldOptions.length
      ? dataView.getFieldByName(selectedPartitionFieldOptions[0].label) ?? null
      : null;
    redirectToADJobWizards(
      categorizationType,
      dataView,
      field,
      partitionField,
      stopOnWarn,
      query,
      timeRange,
      share
    );
  }

  useEffect(() => {
    setSelectedPartitionFieldOptions([]);
    setStopOnWarn(false);
  }, [enablePerPartitionCategorization]);

  useEffect(() => {
    setFormComplete(
      enablePerPartitionCategorization === false || selectedPartitionFieldOptions.length > 0
    );
  }, [enablePerPartitionCategorization, selectedPartitionFieldOptions]);

  async function createADJob({ jobId, bucketSpan, startJob, runInRealTime }: CreateADJobParams) {
    const partitionField = selectedPartitionFieldOptions.length
      ? dataView.getFieldByName(selectedPartitionFieldOptions[0].label) ?? null
      : null;
    const result = await quickJobCreator.createAndSaveJob(
      categorizationType,
      jobId,
      bucketSpan,
      dataView,
      field,
      partitionField,
      stopOnWarn,
      query,
      timeRange,
      startJob,
      runInRealTime
    );
    return result;
  }
  return (
    <JobDetails
      createADJob={createADJob}
      createADJobInWizard={createADJobInWizard}
      timeRange={timeRange}
      layer={undefined}
      layerIndex={0}
      outerFormComplete={formComplete}
    >
      <>
        <EuiCheckableCard
          id={'count'}
          label={
            <>
              <EuiTitle size="xs">
                <h5>
                  <FormattedMessage
                    defaultMessage="Count"
                    id="xpack.ml.newJobFromPatternAnalysisFlyout.count.title"
                  />
                </h5>
              </EuiTitle>
              <EuiSpacer size="s" />
              <FormattedMessage
                defaultMessage="Look for anomalies in the event rate of a category."
                id="xpack.ml.newJobFromPatternAnalysisFlyout.count.description"
              />

              <EuiSpacer size="xs" />

              <FormattedMessage
                id="xpack.ml.newJobFromPatternAnalysisFlyout.count.description2"
                defaultMessage="Recommended for categorizing all messages."
              />
            </>
          }
          checked={categorizationType === CATEGORIZATION_TYPE.COUNT}
          onChange={() => setCategorizationType(CATEGORIZATION_TYPE.COUNT)}
        />

        <EuiSpacer size="m" />

        <EuiCheckableCard
          id={'highCount'}
          label={
            <>
              <EuiTitle size="xs">
                <h5>
                  <FormattedMessage
                    defaultMessage="High count"
                    id="xpack.ml.newJobFromPatternAnalysisFlyout.highCount.title"
                  />
                </h5>
              </EuiTitle>
              <EuiSpacer size="s" />
              <FormattedMessage
                defaultMessage="Look for unusually high counts of a category in the event rate."
                id="xpack.ml.newJobFromPatternAnalysisFlyout.highCount.description"
              />

              <EuiSpacer size="xs" />

              <FormattedMessage
                id="xpack.ml.newJobFromPatternAnalysisFlyout.highCount.description2"
                defaultMessage="Recommended for categorizing error messages."
              />
            </>
          }
          checked={categorizationType === CATEGORIZATION_TYPE.HIGH_COUNT}
          onChange={() => setCategorizationType(CATEGORIZATION_TYPE.HIGH_COUNT)}
        />

        <EuiSpacer size="m" />

        <EuiCheckableCard
          id={'rare'}
          label={
            <>
              <EuiTitle size="xs">
                <h5>
                  <FormattedMessage
                    defaultMessage="Rare"
                    id="xpack.ml.newJobFromPatternAnalysisFlyout.rare.title"
                  />
                </h5>
              </EuiTitle>
              <EuiSpacer size="s" />
              <FormattedMessage
                defaultMessage="Look for categories that occur rarely in time."
                id="xpack.ml.newJobFromPatternAnalysisFlyout.rare.description"
              />
            </>
          }
          checked={categorizationType === CATEGORIZATION_TYPE.RARE}
          onChange={() => setCategorizationType(CATEGORIZATION_TYPE.RARE)}
        />
        <EuiSpacer size="m" />
        <EuiSwitch
          name="categorizationPerPartitionSwitch"
          disabled={false}
          checked={enablePerPartitionCategorization}
          onChange={toggleEnablePerPartitionCategorization}
          data-test-subj="mlNewJobFromPatternAnalysisFlyoutSwitchCategorizationPerPartition"
          label={
            <FormattedMessage
              id="xpack.ml.newJobFromPatternAnalysisFlyout.perPartitionCategorizationSwitchLabel"
              defaultMessage="Enable per-partition categorization"
            />
          }
        />

        {enablePerPartitionCategorization ? (
          <>
            <EuiSpacer size="m" />

            <EuiCallOut
              announceOnMount
              size="s"
              title={
                <FormattedMessage
                  id="xpack.ml.newJobFromPatternAnalysisFlyout.categorizationPerPartitionField.infoCallout"
                  defaultMessage="Determine categories independently for each value of the partition field."
                />
              }
            />

            <EuiSpacer size="m" />

            <EuiFormRow
              label={
                <FormattedMessage
                  id="xpack.ml.newJobFromPatternAnalysisFlyout.categorizationPerPartitionFieldLabel"
                  defaultMessage="Partition field"
                />
              }
            >
              <EuiComboBox
                singleSelection={{ asPlainText: true }}
                options={categoryFieldOptions}
                selectedOptions={selectedPartitionFieldOptions}
                onChange={setSelectedPartitionFieldOptions}
                isClearable={true}
              />
            </EuiFormRow>

            <EuiSpacer size="m" />

            <EuiSwitch
              name="categorizationPerPartitionSwitch"
              disabled={false}
              checked={stopOnWarn}
              onChange={toggleStopOnWarn}
              label={
                <FormattedMessage
                  id="xpack.ml.newJobFromPatternAnalysisFlyout.stopOnWarnSwitchLabel"
                  defaultMessage="Stop on warn"
                />
              }
            />
          </>
        ) : null}

        <EuiSpacer size="m" />

        <EuiHorizontalRule margin="m" />
      </>
    </JobDetails>
  );
};
