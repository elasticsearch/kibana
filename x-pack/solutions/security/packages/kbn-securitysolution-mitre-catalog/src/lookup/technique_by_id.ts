/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { techniques } from '../catalog';
import type { MitreTechnique } from '../types';

/** Map from technique ID (e.g. `T1059`) to the technique record. */
export const techniqueById: ReadonlyMap<string, MitreTechnique> = new Map(
  techniques.map((t) => [t.id, t])
);
