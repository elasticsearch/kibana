/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const SECURITY_PROFILE_ID = {
  root: 'security-root-profile',
  document: 'security-document-profile',
  enhanced_document: 'enhanced-security-document-profile',
};

export const ALERTS_INDEX_PATTERN = '.alerts-security.alerts-';

export const SIGNAL_RULE_NAME_FIELD_NAME = 'kibana.alert.rule.name';
export const LEGACY_SIGNAL_RULE_NAME_FIELD_NAME = 'signal.rule.name';
export const ALERT_WORKFLOW_STATUS_FIELD_NAME = 'kibana.alert.workflow_status';

export const HOST_NAME_FIELD = 'host.name';
export const HOST_HOSTNAME_FIELD = 'host.hostname';

// Also see: x-pack/solutions/security/plugins/security_solution/public/one_discover/cell_renderers/cell_renderers.tsx
export const ALLOWED_CELL_RENDER_FIELDS = [
  ALERT_WORKFLOW_STATUS_FIELD_NAME,
  SIGNAL_RULE_NAME_FIELD_NAME,
  LEGACY_SIGNAL_RULE_NAME_FIELD_NAME,
  HOST_NAME_FIELD,
  HOST_HOSTNAME_FIELD,
];
