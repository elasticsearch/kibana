/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { metrics, ValueType } from '@opentelemetry/api';

const meter = metrics.getMeter('kibana.inference.anonymization');

export const triggerEvaluationsCounter = meter.createCounter(
  'kibana.inference.anonymization.trigger.evaluations',
  {
    description: 'Number of around-completion workflow trigger evaluations',
    unit: '{evaluation}',
    valueType: ValueType.INT,
  }
);

export const piiReplacementsCounter = meter.createCounter(
  'kibana.inference.anonymization.pii.replacements',
  {
    description:
      'Number of new PII token replacements added to the token map per ai.pii step execution',
    unit: '{token}',
    valueType: ValueType.INT,
  }
);

export const managedWorkflowInstallationsCounter = meter.createCounter(
  'kibana.inference.anonymization.managed_workflow.installations',
  {
    description: 'Number of managed anonymization workflow space-level installations',
    unit: '{installation}',
    valueType: ValueType.INT,
  }
);

export const legacyMigrationRunsCounter = meter.createCounter(
  'kibana.inference.anonymization.legacy_migration.runs',
  {
    description: 'Number of legacy anonymization configuration migration runs',
    unit: '{run}',
    valueType: ValueType.INT,
  }
);
