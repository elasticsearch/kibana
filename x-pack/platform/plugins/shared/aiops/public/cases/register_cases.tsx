/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { defineAttachment, type CasesPublicSetup } from '@kbn/cases-plugin/public';
import {
  AIOPS_CHANGE_POINT_CHART_ATTACHMENT_TYPE,
  AIOPS_LOG_RATE_ANALYSIS_ATTACHMENT_TYPE,
  AIOPS_PATTERN_ANALYSIS_ATTACHMENT_TYPE,
} from '@kbn/cases-plugin/common';
import type { CoreStart } from '@kbn/core/public';
import {
  getChangePointDetectionComponent,
  getLogRateAnalysisEmbeddableWrapperComponent,
  getPatternAnalysisComponent,
} from '../shared_components';
import type { AiopsPluginStartDeps } from '../types';
import {
  ChangePointChartAttachmentPayloadSchema,
  LogRateAnalysisAttachmentPayloadSchema,
  PatternAnalysisAttachmentPayloadSchema,
} from '../../common/utils';

export function registerCases(
  cases: CasesPublicSetup,
  coreStart: CoreStart,
  pluginStart: AiopsPluginStartDeps
) {
  const ChangePointDetectionComponent = getChangePointDetectionComponent(coreStart, pluginStart);

  cases.attachmentFramework.registerUnified(
    defineAttachment({
      id: AIOPS_CHANGE_POINT_CHART_ATTACHMENT_TYPE,
      icon: 'machineLearningApp',
      displayName: i18n.translate('xpack.aiops.changePointDetection.cases.displayName', {
        defaultMessage: 'Change point charts',
      }),
      getAttachmentViewObject: () => ({
        event: (
          <FormattedMessage
            id="xpack.aiops.changePointDetection.cases.attachmentEvent"
            defaultMessage="added change point charts"
          />
        ),
        timelineAvatar: 'machineLearningApp',
        children: React.lazy(async () => {
          const { initComponent } = await import('./change_point_charts_attachment');

          return {
            default: initComponent(pluginStart.fieldFormats, ChangePointDetectionComponent),
          };
        }),
      }),
      getAttachmentRemovalObject: () => ({
        event: (
          <FormattedMessage
            id="xpack.aiops.changePointDetection.cases.attachmentRemovalEvent"
            defaultMessage="removed change point chart"
          />
        ),
      }),
      schema: ChangePointChartAttachmentPayloadSchema,
      // `data.state` is the AIOps embeddable input bag produced by the change
      // point detection "Add to case" flow — not authorable in YAML.
      workflowSchema: false,
    })
  );

  const LogPatternAttachmentComponent = getPatternAnalysisComponent(coreStart, pluginStart);

  cases.attachmentFramework.registerUnified(
    defineAttachment({
      id: AIOPS_PATTERN_ANALYSIS_ATTACHMENT_TYPE,
      icon: 'machineLearningApp',
      displayName: i18n.translate('xpack.aiops.cases.logPatternAnalysis.displayName', {
        defaultMessage: 'Log pattern analyses',
      }),
      getAttachmentViewObject: () => ({
        event: (
          <FormattedMessage
            id="xpack.aiops.logPatternAnalysis.cases.attachmentEvent"
            defaultMessage="added log pattern analysis"
          />
        ),
        timelineAvatar: 'machineLearningApp',
        children: React.lazy(async () => {
          const { initComponent } = await import('./log_pattern_attachment');

          return {
            default: initComponent(pluginStart.fieldFormats, LogPatternAttachmentComponent),
          };
        }),
      }),
      getAttachmentRemovalObject: () => ({
        event: (
          <FormattedMessage
            id="xpack.aiops.logPatternAnalysis.cases.attachmentRemovalEvent"
            defaultMessage="removed log pattern analysis"
          />
        ),
      }),
      schema: PatternAnalysisAttachmentPayloadSchema,
      // `data.state` is the AIOps embeddable input bag produced by the log
      // pattern analysis "Add to case" flow — not authorable in YAML.
      workflowSchema: false,
    })
  );

  const LogRateAnalysisEmbeddableWrapperComponent = getLogRateAnalysisEmbeddableWrapperComponent(
    coreStart,
    pluginStart
  );

  cases.attachmentFramework.registerUnified(
    defineAttachment({
      id: AIOPS_LOG_RATE_ANALYSIS_ATTACHMENT_TYPE,
      icon: 'machineLearningApp',
      displayName: i18n.translate('xpack.aiops.cases.logRateAnalysis.displayName', {
        defaultMessage: 'Log rate analyses',
      }),
      getAttachmentViewObject: () => ({
        event: (
          <FormattedMessage
            id="xpack.aiops.logRateAnalysis.cases.attachmentEvent"
            defaultMessage="added log rate analysis"
          />
        ),
        timelineAvatar: 'machineLearningApp',
        children: React.lazy(async () => {
          const { initComponent } = await import('./log_rate_analysis_attachment');

          return {
            default: initComponent(
              pluginStart.fieldFormats,
              LogRateAnalysisEmbeddableWrapperComponent
            ),
          };
        }),
      }),
      getAttachmentRemovalObject: () => ({
        event: (
          <FormattedMessage
            id="xpack.aiops.logRateAnalysis.cases.attachmentRemovalEvent"
            defaultMessage="removed log rate analysis"
          />
        ),
      }),
      schema: LogRateAnalysisAttachmentPayloadSchema,
      // `data.state` is the AIOps embeddable input bag produced by the log
      // rate analysis "Add to case" flow — not authorable in YAML.
      workflowSchema: false,
    })
  );
}
