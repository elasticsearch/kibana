/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export type ThreatIntelligenceSkillHost = 'kibana' | 'external';

const SKILL_DIR = join(__dirname);

const readSkillPart = (filename: string): string =>
  readFileSync(join(SKILL_DIR, filename), 'utf8').trimEnd();

/**
 * Loads `skill_common.md` plus the host addendum (`skill_kibana.md` or `skill_external.md`).
 */
export const loadThreatIntelligenceSkillMarkdown = (host: ThreatIntelligenceSkillHost): string => {
  const common = readSkillPart('skill_common.md');
  const hostPart = readSkillPart(host === 'kibana' ? 'skill_kibana.md' : 'skill_external.md');
  return `${common}\n\n${hostPart}`;
};
