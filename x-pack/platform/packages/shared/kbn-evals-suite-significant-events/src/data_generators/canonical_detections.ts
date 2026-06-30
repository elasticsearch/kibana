/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Detection } from '@kbn/significant-events-schema';

const CANONICAL_TIMESTAMP = '2024-01-01T00:00:00.000Z';

export const canonicalDetectionsFromGroundTruth = ({
  streamName,
  rules,
}: {
  streamName: string;
  rules: Array<Partial<Detection>>;
}): Detection[] =>
  rules.map((rule, index) => ({
    '@timestamp': rule['@timestamp'] ?? CANONICAL_TIMESTAMP,
    kind: rule.kind ?? 'detection',
    processed: rule.processed ?? false,
    detection_id: rule.detection_id ?? `${rule.rule_uuid ?? `rule-${index}`}-canonical-${index}`,
    rule_uuid: rule.rule_uuid ?? `rule-${index}`,
    rule_name: rule.rule_name ?? '',
    stream_name: rule.stream_name ?? streamName,
    alert_count: rule.alert_count ?? 0,
    detection_evidence: rule.detection_evidence ?? { change_point_type: 'spike' },
    ...(rule.rules_activity ? { rules_activity: rule.rules_activity } : {}),
  }));
