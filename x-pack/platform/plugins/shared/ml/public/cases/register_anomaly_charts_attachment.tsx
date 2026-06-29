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
import { ML_ANOMALY_CHARTS_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import type { CoreStart } from '@kbn/core/public';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/public';
import { AnomalyChartsAttachmentPayloadSchema } from '../../common/util/cases_utils';
import type { MlStartDependencies } from '../plugin';
import { PLUGIN_ICON } from '../../common/constants/app';
import { getAnomalyChartsServiceDependencies } from '../embeddables/anomaly_charts/get_anomaly_charts_services_dependencies';

export function registerAnomalyChartsCasesAttachment(
  cases: CasesPublicSetup,
  coreStart: CoreStart,
  pluginStart: MlStartDependencies,
  usageCollection?: UsageCollectionSetup
) {
  cases.attachmentFramework.registerUnified(
    defineAttachment({
      id: ML_ANOMALY_CHARTS_ATTACHMENT_TYPE,
      icon: PLUGIN_ICON,
      displayName: i18n.translate('xpack.ml.cases.anomalyCharts.displayName', {
        defaultMessage: 'Anomaly charts',
      }),
      getAttachmentViewObject: () => ({
        event: (
          <FormattedMessage
            id="xpack.ml.cases.anomalyCharts.embeddableAddedEvent"
            defaultMessage="added anomaly charts"
          />
        ),
        timelineAvatar: PLUGIN_ICON,
        children: React.lazy(async () => {
          const { initializeAnomalyChartsAttachment } = await import(
            './anomaly_charts_attachments'
          );
          const services = await getAnomalyChartsServiceDependencies(
            coreStart,
            pluginStart,
            usageCollection
          );

          return {
            default: initializeAnomalyChartsAttachment(pluginStart.fieldFormats, services),
          };
        }),
      }),
      schema: AnomalyChartsAttachmentPayloadSchema,
      // `data.state` is the ML embeddable input bag produced by the anomaly
      // charts "Add to case" flow — not authorable in YAML.
      workflowSchema: false,
    })
  );
}
