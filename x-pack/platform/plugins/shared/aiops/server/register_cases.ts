/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { CasesServerSetup } from '@kbn/cases-plugin/server';
import {
  AIOPS_CHANGE_POINT_CHART_ATTACHMENT_TYPE,
  AIOPS_LOG_RATE_ANALYSIS_ATTACHMENT_TYPE,
  AIOPS_PATTERN_ANALYSIS_ATTACHMENT_TYPE,
} from '@kbn/cases-plugin/common';
import {
  ChangePointChartAttachmentPayloadSchema,
  LogRateAnalysisAttachmentPayloadSchema,
  PatternAnalysisAttachmentPayloadSchema,
} from '../common/utils';

export function registerCaseAttachments(cases: CasesServerSetup | undefined, logger: Logger) {
  if (cases) {
    try {
      cases.attachmentFramework.registerUnified({
        id: AIOPS_CHANGE_POINT_CHART_ATTACHMENT_TYPE,
        schema: ChangePointChartAttachmentPayloadSchema,
        // `data.state` is the AIOps embeddable input bag produced by the
        // change point detection "Add to case" flow — not authorable in YAML.
        workflowSchema: false,
      });
      cases.attachmentFramework.registerUnified({
        id: AIOPS_PATTERN_ANALYSIS_ATTACHMENT_TYPE,
        schema: PatternAnalysisAttachmentPayloadSchema,
        // `data.state` is the AIOps embeddable input bag produced by the
        // log pattern analysis "Add to case" flow — not authorable in YAML.
        workflowSchema: false,
      });
      cases.attachmentFramework.registerUnified({
        id: AIOPS_LOG_RATE_ANALYSIS_ATTACHMENT_TYPE,
        schema: LogRateAnalysisAttachmentPayloadSchema,
        // `data.state` is the AIOps embeddable input bag produced by the
        // log rate analysis "Add to case" flow — not authorable in YAML.
        workflowSchema: false,
      });
    } catch (error) {
      logger.warn(`AIOPs failed to register cases persistable state`);
    }
  }
}
