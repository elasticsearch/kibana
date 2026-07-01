/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiAccordion,
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIcon,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { MapApi } from '@kbn/maps-plugin/public';
import {
  type LayerResult,
  QuickGeoJobCreator,
  redirectToGeoJobWizard,
} from '../../../../../application/jobs/new_job/job_from_map';
import { useMlFromLensKibanaContext } from '../../../common/context';
import type { CreateADJobParams } from '../../../common/job_details';
import { JobDetails } from '../../../common/job_details';

interface DropDownLabel {
  label: string;
  field: string;
}

interface Props {
  embeddable: MapApi;
  layer: LayerResult;
  layerIndex: number;
}

export const CompatibleLayer: FC<Props> = ({ embeddable, layer, layerIndex }) => {
  const [selectedSplitField, setSelectedSplitField] = useState<string | null>(null);
  const [createError, setCreateError] = useState<{ text: string; errorText: string } | undefined>();

  const {
    services: {
      data,
      share,
      uiSettings,
      mlServices: { mlApi },
      cps,
    },
  } = useMlFromLensKibanaContext();

  const quickJobCreator = useMemo(
    () =>
      new QuickGeoJobCreator(
        data.dataViews,
        uiSettings,
        data.query.timefilter.timefilter,
        share,
        mlApi,
        cps
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, uiSettings]
  );

  const createGeoJobInWizard = useCallback(() => {
    redirectToGeoJobWizard(
      embeddable,
      layer.dataView!.id!,
      layer.geoField,
      layer.query,
      selectedSplitField,
      share
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer?.dataView?.id, embeddable, selectedSplitField]);

  const createGeoJob = useCallback(
    async ({ jobId, bucketSpan, startJob, runInRealTime }: CreateADJobParams) => {
      try {
        const result = await quickJobCreator.createAndSaveGeoJob({
          jobId,
          bucketSpan,
          embeddable,
          startJob,
          runInRealTime,
          sourceDataView: layer.dataView,
          geoField: layer.geoField,
          layerLevelQuery: layer.query,
          splitField: selectedSplitField,
        });

        return result;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(error);
        setCreateError({
          text: i18n.translate('xpack.ml.embeddables.geoJobFlyout.jobCreationError', {
            defaultMessage: 'Job could not be created.',
          }),
          errorText: error.message ?? error,
        });

        return {
          jobCreated: { success: false },
          datafeedCreated: { success: false },
          jobOpened: { success: false },
          datafeedStarted: { success: false },
        };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quickJobCreator, embeddable, selectedSplitField]
  );

  const splitFieldSelection: EuiComboBoxOptionOption[] = useMemo(() => {
    const selectedOptions: EuiComboBoxOptionOption[] = [];
    if (selectedSplitField) {
      selectedOptions.push({
        label: selectedSplitField,
        field: selectedSplitField,
      } as DropDownLabel);
    }
    return selectedOptions;
  }, [selectedSplitField]);

  const onSplitFieldChange = useCallback((selectedOptions: EuiComboBoxOptionOption[]) => {
    const option = selectedOptions[0] as DropDownLabel;
    if (typeof option !== 'undefined') {
      setSelectedSplitField(option.field);
    } else {
      setSelectedSplitField(null);
    }
  }, []);
  return (
    <>
      <JobDetails
        layerIndex={layerIndex}
        createADJob={createGeoJob}
        createADJobInWizard={createGeoJobInWizard}
        timeRange={embeddable.timeRange$?.value}
        incomingCreateError={createError}
      >
        <>
          <EuiFlexGroup gutterSize="s" data-test-subj="mlMapLayerCompatible">
            <EuiFlexItem grow={false}>
              <EuiText size="s">
                <EuiIcon aria-hidden={true} type="checkCircleFill" color="success" />
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText size="s">
                <FormattedMessage
                  id="xpack.ml.embeddables.geoJobFlyout.createJobCalloutTitle.multiMetric"
                  defaultMessage="The {geoField} field can be used to create a geo job for {sourceDataViewTitle}"
                  values={{
                    geoField: layer.geoField,
                    sourceDataViewTitle: layer.dataView?.getIndexPattern(),
                  }}
                />
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
          {layer.splitFieldOptions?.length ? (
            <>
              <EuiSpacer size="m" />
              <EuiAccordion
                data-test-subj={'mlGeoJobAdditionalSettingsButton'}
                id="additional-section"
                buttonContent={i18n.translate(
                  'xpack.ml.embeddables.geoJobFlyout.createJobCallout.splitField.title',
                  {
                    defaultMessage: 'Optionally select a field to split the data',
                  }
                )}
              >
                <EuiFormRow
                  label={
                    <FormattedMessage
                      id="xpack.ml.embeddables.geoJobFlyout.selectSplitField"
                      defaultMessage="Split field"
                    />
                  }
                >
                  <EuiComboBox
                    singleSelection={{ asPlainText: true }}
                    options={layer.splitFieldOptions}
                    selectedOptions={splitFieldSelection}
                    onChange={onSplitFieldChange}
                    isClearable={true}
                    data-test-subj="mlGeoJobSplitFieldSelect"
                  />
                </EuiFormRow>
              </EuiAccordion>
            </>
          ) : null}
        </>
      </JobDetails>
    </>
  );
};
