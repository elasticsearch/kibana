/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * A real Elastic prebuilt rule copied from `GET /api/saved_objects/_find?type=security-rule`
 * so evals can load `.kibana-siem-rule-migrations-prebuiltrules` without installing the
 * `security_detection_engine` Fleet package.
 */
export interface PrebuiltRuleFixture {
  ruleId: string;
  name: string;
  description: string;
  mitreAttackIds?: string[];
}
