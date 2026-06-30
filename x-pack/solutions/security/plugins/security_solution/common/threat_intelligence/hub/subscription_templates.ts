/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SeverityLevel } from './constants';

/**
 * Pre-staged subscription templates. Operators / agents can pass `template_id`
 * to `create_subscription` to bootstrap a subscription with sensible defaults
 * instead of hand-rolling tags + RRULE every time.
 *
 * The default `Daily Threat Debrief` template mirrors the morning-brief
 * workflow that comparable products surface as a flagship preset. Adding
 * additional templates is purely additive — the `template_id` field is a
 * keyword on `.kibana-threat-intel-subscriptions` (see index_templates.ts).
 */
export interface SubscriptionTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  severity_threshold: SeverityLevel;
  schedule_rrule: string;
  delivery_type_default: 'email' | 'slack';
  /**
   * Optional default Kibana actions connector id. Templates are static, so
   * the field is intentionally a hint, not a guarantee — operators usually
   * have to fill it in at subscription-creation time. Left undefined for
   * the built-in templates because connector ids are environment-specific.
   */
  delivery_connector_id_default?: string;
}

export const SUBSCRIPTION_TEMPLATES: Readonly<Record<string, SubscriptionTemplate>> = {
  'daily-threat-debrief': {
    id: 'daily-threat-debrief',
    name: 'Daily Threat Debrief',
    description:
      'Morning brief of new high-severity threats with coverage-impact analysis. ' +
      'Pulls reports from the last 24 hours tagged `threat-intel` or `high-severity`.',
    tags: ['threat-intel', 'high-severity'],
    severity_threshold: 'medium',
    schedule_rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0',
    delivery_type_default: 'email',
  },
  'weekly-ciso-digest': {
    id: 'weekly-ciso-digest',
    name: 'Weekly CISO Digest',
    description:
      'Weekly executive summary of the highest-severity threats and coverage gaps observed ' +
      'over the prior 7 days.',
    tags: ['ciso', 'executive', 'weekly-digest'],
    severity_threshold: 'high',
    schedule_rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9',
    delivery_type_default: 'email',
  },
  'ransomware-watch': {
    id: 'ransomware-watch',
    name: 'Ransomware Watch',
    description:
      'Twice-daily watch list focused on ransomware activity, payloads, and affiliate ' +
      'tradecraft. Useful for IR teams tracking active campaigns.',
    tags: ['ransomware', 'extortion', 'data-exfiltration'],
    severity_threshold: 'medium',
    schedule_rrule: 'FREQ=DAILY;BYHOUR=8,16;BYMINUTE=0',
    delivery_type_default: 'slack',
  },
} as const;

export const SUBSCRIPTION_TEMPLATE_IDS = Object.keys(SUBSCRIPTION_TEMPLATES) as Array<
  keyof typeof SUBSCRIPTION_TEMPLATES
>;

export type SubscriptionTemplateId = (typeof SUBSCRIPTION_TEMPLATE_IDS)[number];

export const getSubscriptionTemplate = (id: string): SubscriptionTemplate | undefined =>
  SUBSCRIPTION_TEMPLATES[id];
