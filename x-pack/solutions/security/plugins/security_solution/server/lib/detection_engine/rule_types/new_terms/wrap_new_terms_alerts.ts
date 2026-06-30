/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import objectHash from 'object-hash';
import type {
  DetectionAlertLatest,
  NewTermsAlertLatest,
  WrappedAlert,
} from '../../../../../common/api/detection_engine/model/alerts';
import { ALERT_NEW_TERMS } from '../../../../../common/field_maps/field_names';
import { buildReasonMessageForNewTermsAlert } from '../utils/reason_formatters';
import type { SecuritySharedParams, SignalSource } from '../types';
import { transformHitToAlert } from '../factories/utils/transform_hit_to_alert';

export interface EventsAndTerms {
  event: estypes.SearchHit<SignalSource>;
  newTerms: Array<string | number | boolean | null>;
}

export const wrapNewTermsAlerts = ({
  sharedParams,
  eventsAndTerms,
}: {
  sharedParams: SecuritySharedParams;
  eventsAndTerms: EventsAndTerms[];
}): Array<WrappedAlert<NewTermsAlertLatest>> => {
  return eventsAndTerms.map((eventAndTerms) => {
    const id = objectHash([
      eventAndTerms.event._index,
      eventAndTerms.event._id,
      String(eventAndTerms.event._version),
      `${sharedParams.spaceId}:${sharedParams.completeRule.alertId}`,
      eventAndTerms.newTerms,
    ]);
    const baseAlert: DetectionAlertLatest = transformHitToAlert({
      sharedParams,
      doc: eventAndTerms.event,
      applyOverrides: true,
      buildReasonMessage: buildReasonMessageForNewTermsAlert,
      alertUuid: id,
    });

    return {
      _id: id,
      _index: '',
      _source: {
        ...baseAlert,
        [ALERT_NEW_TERMS]: eventAndTerms.newTerms,
      },
    };
  });
};
