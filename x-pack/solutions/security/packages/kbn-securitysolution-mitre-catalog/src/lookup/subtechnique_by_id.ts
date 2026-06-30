/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { subtechniques } from '../catalog';
import type { MitreSubTechnique } from '../types';

/** Map from sub-technique ID (e.g. `T1059.001`) to the sub-technique record. */
export const subtechniqueById: ReadonlyMap<string, MitreSubTechnique> = new Map(
  subtechniques.map((s) => [s.id, s])
);
