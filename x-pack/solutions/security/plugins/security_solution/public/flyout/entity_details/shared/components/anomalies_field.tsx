/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import type { NarrowDateRange } from '../../../../common/components/ml/types';
import type { EntityAnomalies } from '../../../../flyout_v2/entity/shared/components/observed_entity/types';
import { AnomalyScores } from '../../../../common/components/ml/score/anomaly_scores';
import { useGlobalTime } from '../../../../common/containers/use_global_time';
import { scoreIntervalToDateTime } from '../../../../common/components/ml/score/score_interval_to_datetime';
import { InputsModelId } from '../../../../common/store/inputs/constants';
import { setAbsoluteRangeDatePicker } from '../../../../common/store/inputs/actions';

export const AnomaliesField = ({ anomalies }: { anomalies: EntityAnomalies }) => {
  const { to, from } = useGlobalTime();
  const dispatch = useDispatch();

  const narrowDateRange = useCallback<NarrowDateRange>(
    (score, interval) => {
      const fromTo = scoreIntervalToDateTime(score, interval);
      dispatch(
        setAbsoluteRangeDatePicker({
          id: InputsModelId.global,
          from: fromTo.from,
          to: fromTo.to,
        })
      );
    },
    [dispatch]
  );

  return (
    <AnomalyScores
      anomalies={anomalies.anomalies}
      startDate={from}
      endDate={to}
      isLoading={anomalies.isLoading}
      narrowDateRange={narrowDateRange}
      jobNameById={anomalies.jobNameById}
    />
  );
};
