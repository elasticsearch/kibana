/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

const DEFAULT_AUTO_INSTALL = true;

export type EntityStorePreferences = z.infer<typeof EntityStorePreferences>;
export const EntityStorePreferences = z.object({
  // When false, the Entity Store is not auto-installed on Security Solution navigation.
  // This persists the user's explicit intent to keep the store disabled and must survive
  // uninstall (which removes the engine descriptors and global state), so it lives in its
  // own saved object that uninstall never deletes.
  autoInstall: z.boolean().default(DEFAULT_AUTO_INSTALL),
});
