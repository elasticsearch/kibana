/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createPlaywrightConfig } from '@kbn/scout-security';

// Sequential (single-threaded) config: these tests run in the default space, which
// is required because the Entity Store auto-install hook only runs there. Parallel
// Scout runs each test in an isolated non-default space, where the hook short-circuits.
export default createPlaywrightConfig({
  testDir: './tests',
});
