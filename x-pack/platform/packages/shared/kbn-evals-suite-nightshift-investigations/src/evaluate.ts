/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { evaluate } from '@kbn/evals';

/**
 * Every spec and helper in this suite imports `evaluate` from here rather than from `@kbn/evals`,
 * so suite-wide fixtures can be added in one place without touching call sites.
 */
export { evaluate };
