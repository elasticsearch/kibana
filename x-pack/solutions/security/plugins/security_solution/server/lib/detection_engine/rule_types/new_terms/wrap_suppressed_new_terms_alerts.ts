/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import objectHash from 'object-hash';
import { TIMESTAMP } from '@kbn/rule-data-utils';
import type { SuppressionFieldsLatest } from '@kbn/rule-registry-plugin/common/schemas';
import type {
  DetectionAlertLatest,
  NewTermsAlertLatest,
  WrappedAlert,
} from '../../../../../common/api/detection_engine/model/alerts';
import { ALERT_NEW_TERMS } from '../../../../../common/field_maps/field_names';
import { buildReasonMessageForNewTermsAlert } from '../utils/reason_formatters';
import { getSuppressionAlertFields, getSuppressionTerms } from '../utils';
import type { SecuritySharedParams, SignalSource } from '../types';
import { transformHitToAlert } from '../factories/utils/transform_hit_to_alert';
import type { NewTermsRuleParams } from '../../rule_schema';

export interface EventsAndTerms {
  event: estypes.SearchHit<SignalSource>;
  newTerms: Array<string | number | boolean | null>;
}

export const wrapSuppressedNewTermsAlerts = ({
  sharedParams,
  eventsAndTerms,
}: {
  sharedParams: SecuritySharedParams<NewTermsRuleParams>;
  eventsAndTerms: EventsAndTerms[];
}): Array<WrappedAlert<NewTermsAlertLatest & SuppressionFieldsLatest>> => {
  return eventsAndTerms.map((eventAndTerms) => {
    const event = eventAndTerms.event;
    const { completeRule, spaceId } = sharedParams;

    const suppressionTerms = getSuppressionTerms({
      alertSuppression: completeRule?.ruleParams?.alertSuppression,
      input: event.fields,
    });

    const instanceId = objectHash([suppressionTerms, completeRule.alertId, spaceId]);

    const id = objectHash([
      eventAndTerms.event._index,
      eventAndTerms.event._id,
      String(eventAndTerms.event._version),
      `${spaceId}:${completeRule.alertId}`,
      eventAndTerms.newTerms,
    ]);

    const baseAlert: DetectionAlertLatest = transformHitToAlert({
      sharedParams,
      doc: event,
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
        ...getSuppressionAlertFields({
          primaryTimestamp: sharedParams.primaryTimestamp,
          secondaryTimestamp: sharedParams.secondaryTimestamp,
          fields: event.fields,
          suppressionTerms,
          fallbackTimestamp: baseAlert[TIMESTAMP],
          instanceId,
        }),
      },
    };
  });
};
