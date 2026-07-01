/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useContext, useEffect, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { EuiSpacer } from '@elastic/eui';
import type { LayerDescriptor } from '@kbn/maps-plugin/common';

import { JobCreatorContext } from '../../../job_creator_context';
import type { GeoJobCreator } from '../../../../../common/job_creator';
import { GeoField } from '../geo_field';
import { GeoMapExamples } from './geo_map_examples';
import { useMlKibana } from '../../../../../../../contexts/kibana';

interface Props {
  setIsValid: (na: boolean) => void;
}

export const GeoDetector: FC<Props> = ({ setIsValid }) => {
  const { jobCreator: jc, jobCreatorUpdated, chartLoader } = useContext(JobCreatorContext);
  const jobCreator = jc as GeoJobCreator;

  const [fieldValues, setFieldValues] = useState<string[]>([]);
  const [layerList, setLayerList] = useState<LayerDescriptor[]>([]);

  const {
    services: { notifications: toasts },
  } = useMlKibana();
  const { mapLoader } = useContext(JobCreatorContext);

  useEffect(() => {
    let valid = false;
    if (jobCreator.geoField !== null) {
      valid = true;
    }
    setIsValid(valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCreatorUpdated]);

  // Load example field values when split field changes
  // changes to fieldValues here will trigger the card effect
  useEffect(() => {
    if (jobCreator.splitField !== null) {
      chartLoader
        .loadFieldExampleValues(
          jobCreator.splitField,
          jobCreator.runtimeMappings,
          jobCreator.datafeedConfig.indices_options,
          jobCreator.projectRouting ?? undefined
        )
        .then(setFieldValues)
        .catch((error) => {
          // @ts-ignore
          toasts.addDanger({
            title: i18n.translate('xpack.ml.newJob.geoWizard.fieldValuesFetchErrorTitle', {
              defaultMessage: 'Error fetching field example values: {error}',
              values: { error },
            }),
          });
        });
    } else {
      setFieldValues([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCreator.splitField]);

  // Update the layer list  with updated geo points upon refresh
  useEffect(() => {
    async function getMapLayersForGeoJob() {
      if (jobCreator.geoField) {
        const { query } = jobCreator.savedSearchQuery ?? {};

        const layers = await mapLoader.getMapLayersForGeoJob(
          jobCreator.geoField,
          jobCreator.splitField,
          fieldValues,
          query
        );
        setLayerList(layers);
      }
    }
    getMapLayersForGeoJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCreator.geoField, jobCreator.splitField, fieldValues]);

  return (
    <>
      {jobCreator.geoField !== null && (
        <>
          <GeoMapExamples
            geoField={jobCreator.geoField}
            splitField={jobCreator.splitField}
            fieldValues={fieldValues}
            geoAgg={jobCreator.geoAgg}
            layerList={layerList}
          />
          <EuiSpacer />
        </>
      )}
      <GeoField />
    </>
  );
};
