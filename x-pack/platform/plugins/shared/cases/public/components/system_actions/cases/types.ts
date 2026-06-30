/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface CasesSubActionParamsUI {
  timeWindow: string;
  reopenClosedCases: boolean;
  groupingBy: string[];
  templateId?: string | null;
  templateVersion?: string | null;
  autoPushCase?: boolean;
  maximumCasesToOpen?: number;
}
export interface CasesActionParams {
  subAction: string;
  subActionParams: CasesSubActionParamsUI;
}
