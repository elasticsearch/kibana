/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const RED_TEAM_MODULE_IDS = [
  'prompt_injection',
  'info_extraction',
  'jailbreaking',
  'privilege_escalation',
  'indirect_injection',
] as const;

export type RedTeamModuleId = (typeof RED_TEAM_MODULE_IDS)[number];
export interface RedTeamConfig {
  suite: string;
  modules?: RedTeamModuleId[];
  count?: number;
}

export interface RedTeamReport {
  suite: string;
  attackCount: number;
  passCount: number;
  failCount: number;
}
