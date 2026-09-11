/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';

export const MonitorManagementEnablementResultCodec = z.looseObject({
  isEnabled: z.boolean(),
  canEnable: z.boolean(),
  canManageApiKeys: z.boolean(),
  areApiKeysEnabled: z.boolean(),
  isValidApiKey: z.boolean(),
  isServiceAllowed: z.boolean(),
});
