/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { z } from '@kbn/zod';
import type { notificationSchema, ctaSchema } from './notification_schema';

/**
 * Notification document stored in the `.kibana-notification-center` data
 * stream. Derived from {@link notificationSchema} zod schema, which is the source of truth.
 */
export type Notification = z.infer<typeof notificationSchema>;

/**
 * Severity of a notification. Derived from {@link notificationSchema}.
 */
export type Severity = Notification['severity'];

/**
 * Call-to-action for a notification. Derived from {@link ctaSchema}.
 */
export type Cta = z.infer<typeof ctaSchema>;
