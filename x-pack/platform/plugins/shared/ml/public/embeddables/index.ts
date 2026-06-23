/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EmbeddableSetup } from '@kbn/embeddable-plugin/public';
import type { UsageCollectionSetup } from '@kbn/usage-collection-plugin/public';
import { ANOMALY_EXPLORER_CHARTS_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/anomaly_charts';
import type { Reference } from '@kbn/content-management-utils';
import { ANOMALY_SWIMLANE_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/anomaly_swimlane';
import { ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/single_metric_viewer';
import type { MlCoreSetup } from '../plugin';

export type * from './types';

export function registerEmbeddables(
  embeddable: EmbeddableSetup,
  core: MlCoreSetup,
  usageCollection?: UsageCollectionSetup
) {
  embeddable.registerEmbeddablePublicDefinition(ANOMALY_SWIMLANE_EMBEDDABLE_TYPE, async () => {
    const { getAnomalySwimLaneEmbeddableFactory } = await import('./anomaly_swimlane');
    return getAnomalySwimLaneEmbeddableFactory(core.getStartServices);
  });
  embeddable.registerLegacyURLTransform(ANOMALY_SWIMLANE_EMBEDDABLE_TYPE, async () => {
    const { transformOut } = await import(
      '../../common/embeddables/anomaly_swimlane/transform_out'
    );
    return transformOut as (storedState: object, references?: Reference[]) => object;
  });

  embeddable.registerEmbeddablePublicDefinition(
    ANOMALY_EXPLORER_CHARTS_EMBEDDABLE_TYPE,
    async () => {
      const { getAnomalyChartsReactEmbeddableFactory } = await import(
        './anomaly_charts/anomaly_charts_embeddable_factory'
      );
      return getAnomalyChartsReactEmbeddableFactory(core.getStartServices, usageCollection);
    }
  );

  embeddable.registerEmbeddablePublicDefinition(
    ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE,
    async () => {
      const { getSingleMetricViewerEmbeddableFactory } = await import('./single_metric_viewer');
      return getSingleMetricViewerEmbeddableFactory(core.getStartServices, usageCollection);
    }
  );
  embeddable.registerLegacyURLTransform(ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE, async () => {
    const { transformOut } = await import(
      '../../common/embeddables/single_metric_viewer/transform_out'
    );
    return transformOut as (storedState: object, references?: Reference[]) => object;
  });
}
