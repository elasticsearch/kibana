/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { THREAT_CATEGORIES, type ThreatCategory } from './constants';

/**
 * Display labels aligned with `elastic/security-ciso-news-aggregator`
 * (`src/types/index.ts` → `THREAT_CATEGORY_LABELS`).
 */
export const THREAT_CATEGORY_LABELS: Record<ThreatCategory, string> = {
  ransomware: 'Ransomware',
  phishing: 'Phishing',
  malware: 'Malware',
  'data-breach': 'Data Breach',
  vulnerability: 'Vulnerability',
  'nation-state': 'Nation-State',
  'supply-chain': 'Supply Chain',
  'insider-threat': 'Insider Threat',
  financial: 'Financial',
  regulatory: 'Regulatory',
  'cloud-security': 'Cloud Security',
  'iot-ot': 'IoT / OT',
  'zero-day': 'Zero-Day',
  apt: 'APT',
  general: 'General',
  cloud: 'Cloud Security',
  cybercrime: 'Cybercrime',
  iot: 'IoT / OT',
  'ot-ics': 'IoT / OT',
  'government-policy': 'Government Policy',
  'privacy-compliance': 'Privacy & Compliance',
  'research-tools': 'Research & Tools',
};

/** Pill colors from CISO `ThreatBadge.tsx` `CATEGORY_COLORS` (Tailwind → hex). */
export const THREAT_CATEGORY_BADGE_STYLES: Record<
  ThreatCategory,
  { readonly background: string; readonly color: string }
> = {
  ransomware: { background: 'rgba(189, 39, 30, 0.15)', color: '#E7664C' },
  phishing: { background: 'rgba(218, 139, 69, 0.15)', color: '#DA8B45' },
  malware: { background: 'rgba(189, 39, 30, 0.15)', color: '#E7664C' },
  'data-breach': { background: 'rgba(218, 139, 69, 0.15)', color: '#DA8B45' },
  vulnerability: { background: 'rgba(96, 146, 192, 0.15)', color: '#6092C0' },
  'nation-state': { background: 'rgba(239, 68, 68, 0.15)', color: '#F87171' },
  'supply-chain': { background: 'rgba(249, 115, 22, 0.15)', color: '#FB923C' },
  'insider-threat': { background: 'rgba(168, 85, 247, 0.15)', color: '#C084FC' },
  financial: { background: 'rgba(218, 139, 69, 0.15)', color: '#DA8B45' },
  regulatory: { background: 'rgba(14, 165, 233, 0.15)', color: '#38BDF8' },
  'cloud-security': { background: 'rgba(6, 182, 212, 0.15)', color: '#22D3EE' },
  'iot-ot': { background: 'rgba(20, 184, 166, 0.15)', color: '#2DD4BF' },
  'zero-day': { background: 'rgba(189, 39, 30, 0.15)', color: '#E7664C' },
  apt: { background: 'rgba(239, 68, 68, 0.15)', color: '#F87171' },
  general: { background: 'rgba(128, 128, 128, 0.12)', color: '#98A2B3' },
  cloud: { background: 'rgba(6, 182, 212, 0.15)', color: '#22D3EE' },
  cybercrime: { background: 'rgba(128, 128, 128, 0.12)', color: '#98A2B3' },
  iot: { background: 'rgba(20, 184, 166, 0.15)', color: '#2DD4BF' },
  'ot-ics': { background: 'rgba(20, 184, 166, 0.15)', color: '#2DD4BF' },
  'government-policy': { background: 'rgba(14, 165, 233, 0.15)', color: '#38BDF8' },
  'privacy-compliance': { background: 'rgba(14, 165, 233, 0.15)', color: '#38BDF8' },
  'research-tools': { background: 'rgba(128, 128, 128, 0.12)', color: '#98A2B3' },
};

const DEFAULT_BADGE_STYLE = THREAT_CATEGORY_BADGE_STYLES.general;

const isThreatCategory = (value: string): value is ThreatCategory =>
  (THREAT_CATEGORIES as readonly string[]).includes(value);

export const getThreatCategoryLabel = (category: string): string => {
  if (isThreatCategory(category)) {
    return THREAT_CATEGORY_LABELS[category];
  }
  return category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

export const getThreatCategoryBadgeStyle = (
  category: string
): { readonly background: string; readonly color: string } => {
  if (isThreatCategory(category)) {
    return THREAT_CATEGORY_BADGE_STYLES[category] ?? DEFAULT_BADGE_STYLE;
  }
  return DEFAULT_BADGE_STYLE;
};
