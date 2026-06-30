/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttackDiscoveryDatasetExample } from '../types';

/**
 * A negative example is tagged `metadata.testType === 'negative'`. These bundles
 * of benign/unrelated alerts should not produce an attack discovery, so quality
 * evaluators are gated off them and the No-Fabrication evaluator scores them.
 */
export const isNegativeExample = (metadata: AttackDiscoveryDatasetExample['metadata']): boolean =>
  (metadata as { testType?: unknown } | undefined)?.testType === 'negative';
