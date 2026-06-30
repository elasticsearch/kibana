/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TIPage, TIPageProperties } from '../types';
import {
  CORRELATION_REPORT,
  CORRELATION_REPORT_DESCRIPTION,
  DESCRIPTION,
  INDICATORS,
  INTELLIGENCE,
  INTELLIGENCE_HUB,
  INTELLIGENCE_HUB_DESCRIPTION,
} from './translations';

/**
 * Base path for all the pages within the Threat Intelligence area of the
 * Security Solution.
 */
export const THREAT_INTELLIGENCE_BASE_PATH = '/threat_intelligence';

/**
 * Path for the Indicators table. Kept under `THREAT_INTELLIGENCE_BASE_PATH`
 * so the existing capability binding (`securitySolution.threat-intelligence`)
 * keeps gating the entire area.
 */
export const THREAT_INTELLIGENCE_INDICATORS_PATH = `${THREAT_INTELLIGENCE_BASE_PATH}/indicators`;

/**
 * Path for the Intelligence Hub dashboard. Added when the standalone
 * threat-intelligence plugin was folded into `securitySolution` — the
 * dashboard used to live at the standalone `threatIntelligence` Kibana app
 * root and is now a sibling deep link of the Indicators table.
 */
export const THREAT_INTELLIGENCE_HUB_PATH = `${THREAT_INTELLIGENCE_BASE_PATH}/hub`;

/**
 * Path for the Correlation Report page. Accepts a report_id via the input
 * form and renders structured correlation findings from the correlate_threat
 * pipeline.
 */
export const THREAT_INTELLIGENCE_CORRELATION_REPORT_PATH = `${THREAT_INTELLIGENCE_BASE_PATH}/correlation`;

/**
 * All the links and navigation properties to be used in the Security Solution plugin.
 */
export const threatIntelligencePages: Record<TIPage, TIPageProperties> = {
  indicators: {
    oldNavigationName: INDICATORS,
    newNavigationName: INTELLIGENCE,
    path: THREAT_INTELLIGENCE_INDICATORS_PATH,
    id: 'threat_intelligence',
    description: DESCRIPTION,
    globalSearchKeywords: [INTELLIGENCE],
    keywords: [INTELLIGENCE],
    disabled: false,
  },
  intelligenceHub: {
    oldNavigationName: INTELLIGENCE_HUB,
    newNavigationName: INTELLIGENCE_HUB,
    path: THREAT_INTELLIGENCE_HUB_PATH,
    id: 'threat_intelligence-hub',
    description: INTELLIGENCE_HUB_DESCRIPTION,
    globalSearchKeywords: [INTELLIGENCE_HUB, INTELLIGENCE],
    keywords: [INTELLIGENCE_HUB, INTELLIGENCE],
    disabled: false,
  },
  correlationReport: {
    oldNavigationName: CORRELATION_REPORT,
    newNavigationName: CORRELATION_REPORT,
    path: THREAT_INTELLIGENCE_CORRELATION_REPORT_PATH,
    id: 'threat_intelligence-correlation',
    description: CORRELATION_REPORT_DESCRIPTION,
    globalSearchKeywords: [CORRELATION_REPORT, INTELLIGENCE],
    keywords: [CORRELATION_REPORT, INTELLIGENCE],
    disabled: false,
  },
};
