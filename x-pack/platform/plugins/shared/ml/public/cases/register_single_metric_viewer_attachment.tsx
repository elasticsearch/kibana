/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineAttachment, type CasesPublicSetup } from '@kbn/cases-plugin/public';
import { ML_SINGLE_METRIC_VIEWER_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import { i18n } from '@kbn/i18n';
import type { CoreStart } from '@kbn/core/public';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/public';
import { FormattedMessage } from '@kbn/i18n-react';
import React from 'react';
import { SingleMetricViewerAttachmentPayloadSchema } from '../../common/util/cases_utils';
import { PLUGIN_ICON } from '../../common/constants/app';
import type { MlStartDependencies } from '../plugin';
import { getSingleMetricViewerComponent } from '../shared_components/single_metric_viewer';
import type { MlDependencies } from '../application/app';
import { getMlServices } from '../embeddables/single_metric_viewer/get_services';

export function registerSingleMetricViewerCasesAttachment(
  cases: CasesPublicSetup,
  coreStart: CoreStart,
  pluginStart: MlStartDependencies,
  usageCollection?: UsageCollectionSetup
) {
  cases.attachmentFramework.registerUnified(
    defineAttachment({
      id: ML_SINGLE_METRIC_VIEWER_ATTACHMENT_TYPE,
      icon: PLUGIN_ICON,
      displayName: i18n.translate('xpack.ml.cases.singleMetricViewer.displayName', {
        defaultMessage: 'Single metric viewers',
      }),
      getAttachmentViewObject: () => ({
        event: (
          <FormattedMessage
            id="xpack.ml.cases.singleMetricViewer.embeddableAddedEvent"
            defaultMessage="added a single metric viewer"
          />
        ),
        timelineAvatar: PLUGIN_ICON,
        children: React.lazy(async () => {
          const [{ initComponent }, mlServices] = await Promise.all([
            import('./single_metric_viewer_attachment'),
            getMlServices(coreStart, pluginStart, usageCollection),
          ]);
          const SingleMetricViewerComponent = getSingleMetricViewerComponent(
            coreStart,
            pluginStart as MlDependencies,
            mlServices
          );
          return {
            default: initComponent(pluginStart.fieldFormats, SingleMetricViewerComponent),
          };
        }),
      }),
      schema: SingleMetricViewerAttachmentPayloadSchema,
      // `data.state` is the ML embeddable input bag produced by the single
      // metric viewer "Add to case" flow — not authorable in YAML.
      workflowSchema: false,
    })
  );
}
