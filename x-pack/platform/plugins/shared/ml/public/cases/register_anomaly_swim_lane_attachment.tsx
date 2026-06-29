/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineAttachment, type CasesPublicSetup } from '@kbn/cases-plugin/public';
import { ML_ANOMALY_SWIMLANE_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import React from 'react';
import { AnomalySwimLaneAttachmentPayloadSchema } from '../../common/util/cases_utils';
import { PLUGIN_ICON } from '../../common/constants/app';
import type { MlStartDependencies } from '../plugin';

export function registerAnomalySwimLaneCasesAttachment(
  cases: CasesPublicSetup,
  pluginStart: MlStartDependencies
) {
  cases.attachmentFramework.registerUnified(
    defineAttachment({
      id: ML_ANOMALY_SWIMLANE_ATTACHMENT_TYPE,
      icon: PLUGIN_ICON,
      displayName: i18n.translate('xpack.ml.cases.anomalySwimLane.displayName', {
        defaultMessage: 'Anomaly swim lanes',
      }),
      getAttachmentViewObject: () => ({
        event: (
          <FormattedMessage
            id="xpack.ml.cases.anomalySwimLane.embeddableAddedEvent"
            defaultMessage="added an anomaly swim lane"
          />
        ),
        timelineAvatar: PLUGIN_ICON,
        children: React.lazy(async () => {
          const { initComponent } = await import('./anomaly_swim_lane_attachment');
          return {
            default: initComponent(pluginStart.fieldFormats),
          };
        }),
      }),
      schema: AnomalySwimLaneAttachmentPayloadSchema,
      // `data.state` is the ML embeddable input bag produced by the anomaly
      // explorer's "Add to case" flow — not authorable in YAML.
      workflowSchema: false,
    })
  );
}
