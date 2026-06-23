/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema, type TypeOf } from '@kbn/config-schema';

export const configSchema = schema.object({
  /**
   * Plugin enablement switch. Defaults to `false`.
   * Controlled by `xpack.notificationCenter.enabled: <boolean>` in kibana.yml
   */
  enabled: schema.boolean({ defaultValue: false }),
});

export type NotificationCenterConfig = TypeOf<typeof configSchema>;
