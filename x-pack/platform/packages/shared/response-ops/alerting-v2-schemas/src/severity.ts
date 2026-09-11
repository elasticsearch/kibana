/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

/**
 * Canonical alert event severity levels, shared across the alerting_v2 plugin,
 * the schemas package, and the rule builder. Listed from least to most severe.
 */
export const alertEventSeveritySchema = z.enum(['info', 'low', 'medium', 'high', 'critical']);

export const alertEventSeverity = alertEventSeveritySchema.enum;

export type AlertEventSeverity = z.infer<typeof alertEventSeveritySchema>;

/** Severity levels ordered from least to most severe. */
export const SEVERITY_LEVELS = alertEventSeveritySchema.options;
