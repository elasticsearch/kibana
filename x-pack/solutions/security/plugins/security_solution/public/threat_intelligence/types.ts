/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BrowserField } from '@kbn/rule-registry-plugin/common';

export type BrowserFields = Readonly<Record<string, Partial<BrowserField>>>;

/**
 * All the names for the threat intelligence pages.
 *
 * `intelligenceHub` was added when the standalone threat-intelligence
 * plugin was folded into `securitySolution` — see the migration plan in
 * AGENTS.md for context.
 */
export type TIPage = 'indicators' | 'intelligenceHub' | 'correlationReport';

/**
 * All the IDs for the threat intelligence pages.
 * This needs to match the threat intelligence page entries in
 * `SecurityPageName` (`@kbn/deeplinks-security/deep_links.ts`).
 *
 * `threat_intelligence-hub` (alias `intelligenceHub`) is the Intelligence
 * Hub dashboard deep link added during the standalone-plugin merge.
 */
export type TIPageId =
  | 'threat_intelligence'
  | 'threat_intelligence-hub'
  | 'threat_intelligence-correlation';

/**
 * A record of all the properties that will be used to build deeplinks, links and navtabs objects.
 */
export interface TIPageProperties {
  id: TIPageId;
  readonly oldNavigationName: string; // delete when the old navigation is removed
  readonly newNavigationName: string; // rename to name when the old navigation is removed
  readonly path: string;
  readonly disabled: boolean;
  readonly description: string;
  readonly globalSearchKeywords: string[];
  readonly keywords: string[];
}
