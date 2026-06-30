/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataStreamDefinition } from '@kbn/data-streams';
import type { Detection } from '@kbn/significant-events-schema';
import type { GetFieldsOf, MappingsDefinition } from '@kbn/es-mappings';
import { mappings } from '@kbn/es-mappings';
export const DETECTIONS_DATA_STREAM = '.significant_events-detections';
export const detectionsMappings = {
  dynamic: false,
  properties: {
    '@timestamp': mappings.date({ format: 'strict_date_optional_time' }),
    kind: mappings.keyword(),
    detection_id: mappings.keyword(),
    rule_uuid: mappings.keyword(),
    rule_name: mappings.keyword(),
    peak_alert_count: mappings.long(),
    detection_evidence: mappings.object({
      properties: {
        change_point_type: mappings.keyword(),
        p_value: { type: 'double' as const },
      },
    }),
  },
} satisfies MappingsDefinition;

export type StoredDetection = GetFieldsOf<typeof detectionsMappings>;
export type { Detection };

export const detectionsDataStream: DataStreamDefinition<
  typeof detectionsMappings,
  StoredDetection
> = {
  name: DETECTIONS_DATA_STREAM,
  version: 5,
  hidden: true,
  template: {
    priority: 500,
    lifecycle: { data_retention: '90d' },
    mappings: detectionsMappings,
  },
};
