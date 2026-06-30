/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Severity } from '@kbn/securitysolution-io-ts-alerting-types';
import { QradarRulesXmlParser } from '../../../../../../../../../../common/siem_migrations/parsers/qradar/rules_xml';
import type { OriginalRule } from '../../../../../../../../../../common/siem_migrations/model/rule_migration.gen';
import type { MicrosoftSentinelSeverity, SplunkSeverity } from '../../../../../../types';
import {
  DEFAULT_TRANSLATION_SEVERITY,
  ELASTIC_SEVERITY_TO_RISK_SCORE_MAP,
  MICROSOFT_SENTINEL_ELASTIC_SEVERITY_MAP,
  SPLUNK_ELASTIC_ALERT_SEVERITY_MAP,
} from '../../../../../../constants';

export const mapSplunkSeverityToElasticSeverity = (splunkSeverity?: SplunkSeverity): Severity => {
  if (!splunkSeverity) {
    return DEFAULT_TRANSLATION_SEVERITY;
  }
  return SPLUNK_ELASTIC_ALERT_SEVERITY_MAP[splunkSeverity] || DEFAULT_TRANSLATION_SEVERITY;
};

export const mapMicrosoftSentinelSeverityToElasticSeverity = (
  sentinelSeverity?: string
): Severity => {
  if (!sentinelSeverity) {
    return DEFAULT_TRANSLATION_SEVERITY;
  }

  const normalizedSeverity = sentinelSeverity.toLowerCase();

  if (Object.hasOwn(MICROSOFT_SENTINEL_ELASTIC_SEVERITY_MAP, normalizedSeverity)) {
    return MICROSOFT_SENTINEL_ELASTIC_SEVERITY_MAP[normalizedSeverity as MicrosoftSentinelSeverity];
  }

  return DEFAULT_TRANSLATION_SEVERITY;
};

export const mapRangedSeverityToElasticSeverity = (
  severityValue: number,
  { min, max }: { min: number; max: number }
): Severity => {
  // we normal min max to 1-10 scale
  const normalizedSeverity = Math.round(((severityValue - min) / (max - min)) * 9 + 1);
  if (normalizedSeverity <= 3) {
    return 'low';
  } else if (normalizedSeverity <= 6) {
    return 'medium';
  } else if (normalizedSeverity <= 8) {
    return 'high';
  } else {
    return 'critical';
  }
};

export const mapQradarSeverityToElasticSeverity = async (query: string): Promise<Severity> => {
  const qradarXmlParser = new QradarRulesXmlParser(query);
  try {
    const qradarSeverity = await qradarXmlParser.parseSeverityFromRuleData(query);
    if (qradarSeverity) {
      return mapRangedSeverityToElasticSeverity(parseInt(qradarSeverity, 10), {
        min: 1,
        max: 10,
      });
    } else {
      return DEFAULT_TRANSLATION_SEVERITY;
    }
  } catch (e) {
    return DEFAULT_TRANSLATION_SEVERITY;
  }
};

export const getElasticSeverityFromOriginalRule = async (originalRule: OriginalRule) => {
  if (originalRule.query_language === 'spl' || originalRule.vendor === 'splunk') {
    return mapSplunkSeverityToElasticSeverity(originalRule.severity as SplunkSeverity);
  } else if (originalRule.vendor === 'qradar') {
    const qradarXmlParser = new QradarRulesXmlParser(originalRule.query);
    try {
      const qradarSeverity = await qradarXmlParser.parseSeverityFromRuleData(originalRule.query);
      if (qradarSeverity) {
        return mapRangedSeverityToElasticSeverity(parseInt(qradarSeverity, 10), {
          min: 1,
          max: 10,
        });
      } else {
        return DEFAULT_TRANSLATION_SEVERITY;
      }
    } catch (e) {
      return DEFAULT_TRANSLATION_SEVERITY;
    }
  } else if (originalRule.vendor === 'microsoft-sentinel') {
    return mapMicrosoftSentinelSeverityToElasticSeverity(originalRule.severity);
  } else {
    return DEFAULT_TRANSLATION_SEVERITY;
  }
};

export const getElasticRiskScoreFromElasticSeverity = (elasticSeverity: Severity) => {
  return ELASTIC_SEVERITY_TO_RISK_SCORE_MAP[elasticSeverity];
};

export const getElasticRiskScoreFromOriginalRule = async (originalRule: OriginalRule) => {
  const elasticSeverity = await getElasticSeverityFromOriginalRule(originalRule);
  return getElasticRiskScoreFromElasticSeverity(elasticSeverity);
};
