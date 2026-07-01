/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { alertDeleteCategoryIds } from '../../../constants';
import { MAX_SPACE_IDS, MAX_ID_LENGTH } from '../../../constants';

const MAX_ALERT_DELETE_THRESHOLD_DAYS = 3 * 365; // 3 years
const MIN_ALERT_DELETE_THRESHOLD_DAYS = 1;

const alertDeleteSettingsSchema = {
  active_alert_delete_threshold: schema.maybe(
    schema.number({
      min: MIN_ALERT_DELETE_THRESHOLD_DAYS,
      max: MAX_ALERT_DELETE_THRESHOLD_DAYS,
      meta: {
        description: 'Threshold (in days) for deleting active alerts older than this value',
      },
    })
  ),
  inactive_alert_delete_threshold: schema.maybe(
    schema.number({
      min: MIN_ALERT_DELETE_THRESHOLD_DAYS,
      max: MAX_ALERT_DELETE_THRESHOLD_DAYS,
      meta: {
        description:
          'Threshold (in days) for deleting inactive alerts (recovered/closed/untracked) older than this value',
      },
    })
  ),
  category_ids: schema.oneOf(
    [
      schema.arrayOf(
        schema.oneOf([
          schema.literal(alertDeleteCategoryIds.SECURITY_SOLUTION),
          schema.literal(alertDeleteCategoryIds.OBSERVABILITY),
          schema.literal(alertDeleteCategoryIds.MANAGEMENT),
        ]),
        {
          minSize: 1,
        }
      ),
      schema.literal(alertDeleteCategoryIds.SECURITY_SOLUTION),
      schema.literal(alertDeleteCategoryIds.OBSERVABILITY),
      schema.literal(alertDeleteCategoryIds.MANAGEMENT),
    ],
    {
      meta: {
        description: 'Solutions to delete alerts from',
      },
    }
  ),
};

export const alertDeletePreviewQuerySchema = schema.object(alertDeleteSettingsSchema);

export const alertDeletePreviewResponseSchema = schema.object(
  {
    affected_alert_count: schema.number(),
  },
  { meta: { id: 'alert_delete_preview_response' } }
);

export const alertDeleteScheduleQuerySchema = schema.object(
  {
    ...alertDeleteSettingsSchema,
    space_ids: schema.maybe(
      schema.arrayOf(schema.string({ maxLength: MAX_ID_LENGTH }), {
        minSize: 1,
        maxSize: MAX_SPACE_IDS,
        meta: {
          description: 'Kibana space IDs to delete alerts from',
        },
      })
    ),
  },
  { meta: { id: 'alert_delete_schedule_request' } }
);

export const alertDeleteLastRunResponseSchema = schema.object(
  {
    last_run: schema.maybe(schema.string()),
  },
  { meta: { id: 'alert_delete_last_run_response' } }
);
