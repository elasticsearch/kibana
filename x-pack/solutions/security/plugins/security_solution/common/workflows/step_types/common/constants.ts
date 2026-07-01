/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Maximum length for alert IDs.
 * Alert IDs are typically Elasticsearch-generated UUIDs (~36 characters).
 * We use 256 here to safely accommodate them while preventing unbounded string input (DoS).
 */
export const MAX_ALERT_ID_LENGTH = 256;

/**
 * Maximum length for workflow message strings.
 * Workflow messages are typically short text strings (~1000 characters).
 * We use 1000 here to safely accommodate them while preventing unbounded string input (DoS).
 */
export const MAX_WORKFLOW_MESSAGE_LENGTH = 1000;

/**
 * Maximum length for Kibana user profile IDs.
 * Kibana user profile IDs are typically Elasticsearch-generated base64 strings (~22 characters).
 * We use 256 here to safely accommodate them while preventing unbounded string input (DoS).
 */
export const MAX_USER_ID_LENGTH = 256;

// Matches MAX_ALERT_ID_LENGTH because both alert and attack IDs are Elasticsearch IDs
export const MAX_ATTACK_ID_LENGTH = 256;
