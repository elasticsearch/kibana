/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { Annotations } from '@kbn/ml-common-types/annotations';
import type { JobId } from '@kbn/ml-common-types/anomaly_detection_jobs/job';
import { ANNOTATION_TYPE } from '../../../common/constants/annotations';

export const indexAnnotationSchema = schema.object({
  timestamp: schema.number(),
  end_timestamp: schema.number(),
  annotation: schema.string({ maxLength: 10000 }),
  job_id: schema.string({ maxLength: 10000 }),
  type: schema.oneOf([
    schema.literal(ANNOTATION_TYPE.ANNOTATION),
    schema.literal(ANNOTATION_TYPE.COMMENT),
  ]),
  create_time: schema.maybe(schema.number()),
  create_username: schema.maybe(schema.string({ maxLength: 10000 })),
  modified_time: schema.maybe(schema.number()),
  modified_username: schema.maybe(schema.string({ maxLength: 10000 })),
  event: schema.maybe(
    schema.oneOf([
      schema.literal('user'),
      schema.literal('delayed_data'),
      schema.literal('model_snapshot_stored'),
      schema.literal('model_change'),
      schema.literal('categorization_status_change'),
    ])
  ),
  detector_index: schema.maybe(schema.number()),
  partition_field_name: schema.maybe(schema.string({ maxLength: 10000 })),
  partition_field_value: schema.maybe(schema.string({ maxLength: 10000 })),
  over_field_name: schema.maybe(schema.string({ maxLength: 10000 })),
  over_field_value: schema.maybe(schema.string({ maxLength: 10000 })),
  by_field_name: schema.maybe(schema.string({ maxLength: 10000 })),
  by_field_value: schema.maybe(schema.string({ maxLength: 10000 })),
  /** Document id */
  _id: schema.maybe(schema.string({ maxLength: 10000 })),
  key: schema.maybe(schema.string({ maxLength: 10000 })),
});

export const getAnnotationsSchema = schema.object({
  jobIds: schema.arrayOf(schema.string({ maxLength: 10000 }), { maxSize: 10000 }),
  earliestMs: schema.nullable(schema.number()),
  latestMs: schema.nullable(schema.number()),
  maxAnnotations: schema.number(),
  /** Fields to find unique values for (e.g. events or created_by) */
  fields: schema.maybe(
    schema.arrayOf(
      schema.object({
        field: schema.string({ maxLength: 10000 }),
        missing: schema.maybe(schema.string({ maxLength: 10000 })),
      }),
      { maxSize: 10000 }
    )
  ),
  detectorIndex: schema.maybe(schema.number()),
  entities: schema.maybe(
    schema.arrayOf(
      schema.object({
        fieldType: schema.maybe(schema.string({ maxLength: 10000 })),
        fieldName: schema.maybe(schema.string({ maxLength: 10000 })),
        fieldValue: schema.maybe(schema.string({ maxLength: 10000 })),
      }),
      { maxSize: 10000 }
    )
  ),
});

export const annotationsResponseSchema = () => {
  return schema.object({
    success: schema.boolean(),
    annotations: schema.recordOf<JobId, Annotations>(
      schema.string({ maxLength: 10000 }),
      schema.arrayOf(indexAnnotationSchema, { maxSize: 10000 })
    ),
    totalCount: schema.number(),
  });
};

export const deleteAnnotationSchema = schema.object({
  annotationId: schema.string({ maxLength: 10000 }),
});
