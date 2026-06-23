/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const OBSERVABLE_TYPE_IPV4 = {
  label: 'IPv4',
  key: 'observable-type-ipv4',
} as const;

export const OBSERVABLE_TYPE_IPV6 = {
  label: 'IPv6',
  key: 'observable-type-ipv6',
} as const;

export const OBSERVABLE_TYPE_URL = {
  label: 'URL',
  key: 'observable-type-url',
} as const;

export const OBSERVABLE_TYPE_HOSTNAME = {
  label: 'Host name',
  key: 'observable-type-hostname',
} as const;

export const OBSERVABLE_TYPE_FILE_HASH = {
  label: 'File hash',
  key: 'observable-type-file-hash',
} as const;

export const OBSERVABLE_TYPE_FILE_PATH = {
  label: 'File path',
  key: 'observable-type-file-path',
} as const;

export const OBSERVABLE_TYPE_EMAIL = {
  label: 'Email',
  key: 'observable-type-email',
} as const;

export const OBSERVABLE_TYPE_DOMAIN = {
  label: 'Domain',
  key: 'observable-type-domain',
} as const;

export const OBSERVABLE_TYPE_AGENT_ID = {
  label: 'Agent id',
  key: 'observable-type-agent-id',
} as const;

/**
 * Exporting an array of built-in observable types for use in the application
 */
export const OBSERVABLE_TYPES_BUILTIN: { label: string; key: string }[] = [
  OBSERVABLE_TYPE_AGENT_ID,
  OBSERVABLE_TYPE_IPV4,
  OBSERVABLE_TYPE_IPV6,
  OBSERVABLE_TYPE_URL,
  OBSERVABLE_TYPE_HOSTNAME,
  OBSERVABLE_TYPE_FILE_HASH,
  OBSERVABLE_TYPE_FILE_PATH,
  OBSERVABLE_TYPE_EMAIL,
  OBSERVABLE_TYPE_DOMAIN,
];

export const OBSERVABLE_TYPES_BUILTIN_KEYS = OBSERVABLE_TYPES_BUILTIN.map(({ key }) => key);

/**
 * Locale-independent marker stored as the description of observables that were
 * automatically extracted from alert/event ECS fields during attachment creation.
 * Used by the telemetry aggregation to distinguish auto-extracted from manually
 * added observables.
 *
 * NOTE: Because this string is stored in the observable's user-visible `description`
 * field and matched at telemetry time, this categorisation is still locale-fragile on
 * non-English deployments. A dedicated, locale-independent `source` field on the
 * observable type would be the robust solution; that is tracked as a follow-up.
 */
export const AUTO_EXTRACT_OBSERVABLE_DESCRIPTION = 'Auto extracted observable';
