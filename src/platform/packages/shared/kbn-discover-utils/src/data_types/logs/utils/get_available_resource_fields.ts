/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ResourceFields } from '../../..';
import { getFieldValueWithFallback } from '../../../utils/get_field_value_with_fallback';

// Use first available field from each group
const AVAILABLE_RESOURCE_FIELDS: Array<Array<keyof ResourceFields>> = [
  ['service.name'],
  ['kubernetes.container.name', 'k8s.container.name', 'container.name'],
  ['kubernetes.node.name', 'k8s.node.name', 'host.name'],
  ['orchestrator.cluster.name', 'k8s.cluster.name'],
  ['kubernetes.namespace', 'k8s.namespace.name'],
  ['kubernetes.pod.name', 'k8s.pod.name'],
  // Only one of these will be present in a single doc
  [
    'kubernetes.deployment.name',
    'k8s.deployment.name',
    'kubernetes.replicaset.name',
    'k8s.replicaset.name',
    'kubernetes.statefulset.name',
    'k8s.statefulset.name',
    'kubernetes.daemonset.name',
    'k8s.daemonset.name',
    'kubernetes.job.name',
    'k8s.job.name',
    'kubernetes.cronjob.name',
    'k8s.cronjob.name',
  ],
];

const isEmptyScalar = (value: unknown): boolean =>
  value === undefined || value === null || value === '';

// In Classic mode the `fields` API returns values wrapped in arrays, so a blank
// field arrives as `['']`. Treat empty arrays and arrays containing only
// empty/null values as empty, consistent with how scalar null/'' are handled.
const isEmptyResourceValue = (value: unknown): boolean =>
  Array.isArray(value) ? value.every(isEmptyScalar) : isEmptyScalar(value);

export const getAvailableResourceFields = (resourceDoc: Record<string, unknown>): string[] =>
  AVAILABLE_RESOURCE_FIELDS.reduce<string[]>((acc, fields) => {
    for (const fieldName of fields) {
      const result = getFieldValueWithFallback(resourceDoc, fieldName);
      if (result.field && !isEmptyResourceValue(result.value)) {
        acc.push(result.field);
        break;
      }
    }
    return acc;
  }, []);
