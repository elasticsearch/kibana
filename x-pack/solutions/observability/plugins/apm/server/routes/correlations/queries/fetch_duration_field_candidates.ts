/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import { ES_FIELD_TYPES } from '@kbn/field-types';
import type { ProcessorEvent } from '@kbn/observability-plugin/common';
import { rangeQuery } from '@kbn/observability-plugin/server';
import type { CommonCorrelationsQueryParams } from '../../../../common/correlations/types';
import {
  FIELD_PREFIX_TO_EXCLUDE_AS_CANDIDATE,
  FIELDS_TO_EXCLUDE_AS_CANDIDATE,
} from '../../../../common/correlations/constants';
import type { APMEventClient } from '../../../lib/helpers/create_es_client/create_apm_event_client';
import type { FieldCandidatesResponse } from './types';

export type { FieldCandidatesResponse as DurationFieldCandidatesResponse } from './types';

const SUPPORTED_ES_FIELD_TYPES = [
  ES_FIELD_TYPES.KEYWORD,
  ES_FIELD_TYPES.IP,
  ES_FIELD_TYPES.BOOLEAN,
];

export async function fetchDurationFieldCandidates({
  apmEventClient,
  eventType,
  start,
  end,
}: CommonCorrelationsQueryParams & {
  query: estypes.QueryDslQueryContainer;
  apmEventClient: APMEventClient;
  eventType: ProcessorEvent;
}): Promise<FieldCandidatesResponse> {
  // Get all supported fields
  const respMapping = await apmEventClient.fieldCaps('get_field_caps', {
    apm: {
      events: [eventType],
    },
    fields: '*',
    // We exclude metadata and parent fields as they are not useful for correlations.
    // There's an issue in ES (https://github.com/elastic/elasticsearch/issues/109797)
    // that describes why we need to add -parent in addition to the types option.
    filters: '-metadata,-parent',
    include_empty_fields: false,
    index_filter: rangeQuery(start, end)[0],
    types: SUPPORTED_ES_FIELD_TYPES,
  });

  return {
    fieldCandidates: Object.keys(respMapping.fields).filter((fieldName: string) => {
      return (
        !FIELDS_TO_EXCLUDE_AS_CANDIDATE.has(fieldName) &&
        !FIELD_PREFIX_TO_EXCLUDE_AS_CANDIDATE.some((prefix) => fieldName.startsWith(prefix))
      );
    }),
  };
}
