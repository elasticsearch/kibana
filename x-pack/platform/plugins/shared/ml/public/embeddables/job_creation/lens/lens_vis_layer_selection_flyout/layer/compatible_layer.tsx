/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useMemo } from 'react'; // useCallback
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiText } from '@elastic/eui';
import type { LensApi } from '@kbn/lens-plugin/public';
import {
  redirectToADJobWizards,
  QuickLensJobCreator,
} from '../../../../../application/jobs/new_job/job_from_lens';
import type { LayerResult } from '../../../../../application/jobs/new_job/job_from_lens';
import { JOB_TYPE } from '../../../../../../common/constants/new_job';
import { useMlFromLensKibanaContext } from '../../../common/context';
import type { CreateADJobParams } from '../../../common/job_details';
import { JobDetails } from '../../../common/job_details';

interface Props {
  layer: LayerResult;
  layerIndex: number;
  embeddable: LensApi;
}

export const CompatibleLayer: FC<Props> = ({ layer, layerIndex, embeddable }) => {
  const {
    services: {
      data,
      share,
      uiSettings,
      lens,
      mlServices: { mlApi },
      cps,
    },
  } = useMlFromLensKibanaContext();

  const quickJobCreator = useMemo(
    () =>
      new QuickLensJobCreator(
        lens,
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

  function createADJobInWizard() {
    redirectToADJobWizards(embeddable, layerIndex, share, lens);
  }

  async function createADJob({ jobId, bucketSpan, startJob, runInRealTime }: CreateADJobParams) {
    const result = await quickJobCreator.createAndSaveJob(
      jobId,
      bucketSpan,
      embeddable,
      startJob,
      runInRealTime,
      layerIndex
    );
    return result;
  }

  return (
    <>
      <JobDetails
        createADJob={createADJob}
        createADJobInWizard={createADJobInWizard}
        timeRange={embeddable.timeRange$?.value}
        layer={layer}
        layerIndex={layerIndex}
      >
        <EuiFlexGroup gutterSize="s" data-test-subj="mlLensLayerCompatible">
          <EuiFlexItem grow={false}>
            <EuiText size="s">
              <EuiIcon aria-hidden={true} type="checkCircleFill" color="success" />
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size="s">
              {layer.jobType === JOB_TYPE.MULTI_METRIC ? (
                <FormattedMessage
                  id="xpack.ml.embeddables.lensLayerFlyout.createJobCalloutTitle.multiMetric"
                  defaultMessage="This layer can be used to create a multi-metric job"
                />
              ) : (
                <FormattedMessage
                  id="xpack.ml.embeddables.lensLayerFlyout.createJobCalloutTitle.singleMetric"
                  defaultMessage="This layer can be used to create a single metric job"
                />
              )}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </JobDetails>
    </>
  );
};
