/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useContext, useEffect, useState } from 'react';
import { i18n } from '@kbn/i18n';
import type { LayerDescriptor } from '@kbn/maps-plugin/common';
import type { GeoJobCreator } from '../../../../../common/job_creator';
import { JobCreatorContext } from '../../../job_creator_context';
import { useMlKibana } from '../../../../../../../contexts/kibana';
import { GeoMapExamples } from './geo_map_examples';

export const GeoDetectorsSummary: FC = () => {
  const [layerList, setLayerList] = useState<LayerDescriptor[]>([]);
  const [fieldValues, setFieldValues] = useState<string[]>([]);

  const { jobCreator: jc, chartLoader, mapLoader } = useContext(JobCreatorContext);
  const jobCreator = jc as GeoJobCreator;
  const geoField = jobCreator.geoField;
  const splitField = jobCreator.splitField;

  const {
    services: { notifications },
  } = useMlKibana();

  // Load example field values for summary view
  // changes to fieldValues here will trigger the card effect
  useEffect(() => {
    if (splitField !== null) {
      chartLoader
        .loadFieldExampleValues(
          splitField,
          jobCreator.runtimeMappings,
          jobCreator.datafeedConfig.indices_options,
          jobCreator.projectRouting ?? undefined
        )
        .then(setFieldValues)
        .catch((error) => {
          notifications.toasts.addDanger({
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
  }, []);

  // Update the layer list once the example fields have been
  useEffect(() => {
    async function getMapLayersForGeoJob() {
      if (geoField) {
        const { query } = jobCreator.savedSearchQuery ?? {};

        const layers = await mapLoader.getMapLayersForGeoJob(
          geoField,
          splitField,
          fieldValues,
          query
        );
        setLayerList(layers);
      }
    }
    getMapLayersForGeoJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldValues]);

  if (jobCreator.geoField === null) return null;

  return (
    <GeoMapExamples
      geoField={jobCreator.geoField}
      splitField={jobCreator.splitField}
      fieldValues={fieldValues}
      geoAgg={jobCreator.geoAgg}
      layerList={layerList}
    />
  );
};
