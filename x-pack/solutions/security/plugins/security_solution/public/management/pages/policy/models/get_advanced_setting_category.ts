/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AdvancedSettingCategory } from './advanced_policy_schema';

/**
 * Maps an advanced policy setting key to one of the PM-proposed categories
 * (Performance, Product Features, Logs, Configs, Others) for discoverability.
 * Uses key path patterns; can be replaced later with explicit category per schema entry.
 */
export function getCategory(key: string): AdvancedSettingCategory {
  const advancedIndex = key.indexOf('.advanced.');
  if (advancedIndex === -1) {
    return 'others';
  }
  const afterAdvanced = key.slice(advancedIndex + '.advanced.'.length);
  const segment = afterAdvanced.split('.')[0];

  switch (segment) {
    case 'logging':
      return 'logs';
    case 'artifacts':
    case 'elasticsearch':
    case 'agent':
    case 'event_filter':
    case 'flags':
      return 'configs';
    case 'utilization_limits':
    case 'tty_io':
    case 'file_cache':
      return 'performance';
    case 'events':
      return key.includes('deduplicate') || key.includes('aggregate_')
        ? 'performance'
        : 'product_features';
    case 'malware':
    case 'ransomware':
    case 'memory_protection':
    case 'kernel':
    case 'alerts':
    case 'diagnostic':
    case 'device_control':
    case 'harden':
    case 'fanotify':
    case 'host_isolation':
    case 'mitigations':
    case 'document_enrichment':
    case 'firewall_anti_tamper':
      return 'product_features';
    default:
      return 'others';
  }
}
