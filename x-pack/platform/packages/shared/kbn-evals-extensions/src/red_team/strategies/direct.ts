/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SingleTurnStrategy } from '../types';

export const createDirectStrategy = (): SingleTurnStrategy => ({
  name: 'direct',
  description: 'Pass-through strategy with no transformation',
  kind: 'single-turn',
  transform: (prompt) => prompt,
});
