/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Mustache from 'mustache';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import type { APMIndices } from '@kbn/apm-sources-access-plugin/public';
import type { FormBasedPrivateState, TextBasedPrivateState } from '@kbn/lens-common';
import type { DashboardFileName } from './dashboards/dashboard_catalog';
import { loadDashboardFile } from './dashboards/dashboard_catalog';
import { getDashboardFileName } from './dashboards/get_dashboard_file_name';

interface DashboardFileProps {
  agentName?: string;
  runtimeName?: string;
  runtimeVersion?: string;
  serverlessType?: string;
  telemetrySdkName?: string;
  telemetrySdkLanguage?: string;
}

export interface MetricsDashboardProps extends DashboardFileProps {
  dataView: DataView;
  apmIndices?: APMIndices;
}

interface FormBasedDatasourceState extends Partial<Pick<FormBasedPrivateState, 'layers'>> {
  [key: string]: unknown;
}

interface TextBasedDatasourceState
  extends Partial<Pick<TextBasedPrivateState, 'layers' | 'indexPatternRefs'>> {
  [key: string]: unknown;
}

interface DatasourceStates {
  formBased?: FormBasedDatasourceState;
  textBased?: TextBasedDatasourceState;
  [key: string]: unknown;
}

export function getDashboardFileNameFromProps({
  agentName,
  telemetrySdkName,
  telemetrySdkLanguage,
  runtimeVersion,
}: DashboardFileProps): DashboardFileName | undefined {
  if (!agentName) {
    return undefined;
  }

  return getDashboardFileName({
    agentName,
    telemetrySdkName,
    telemetrySdkLanguage,
    runtimeVersion,
  });
}

export function hasDashboard(props: DashboardFileProps) {
  return !!getDashboardFileNameFromProps(props);
}

const getAdhocDataView = (dataView: DataView) => {
  return {
    [dataView.id!]: {
      ...dataView,
    },
  };
};

const syncDatasourceStatesWithDataView = (
  datasourceStates: DatasourceStates,
  dataView: DataView
): DatasourceStates => {
  const dataViewId = dataView.id!;
  const textBased = datasourceStates.textBased;
  const formBased = datasourceStates.formBased;

  return {
    ...datasourceStates,
    ...(textBased && {
      textBased: {
        ...textBased,
        layers: Object.fromEntries(
          Object.entries(textBased.layers ?? {}).map(([layerId, layer]) => [
            layerId,
            { ...layer, index: dataViewId },
          ])
        ),
        indexPatternRefs: textBased.indexPatternRefs?.map((reference) => ({
          ...reference,
          id: dataViewId,
          title: dataView.getIndexPattern(),
          timeField: reference.timeField ?? dataView.timeFieldName ?? '@timestamp',
        })),
      },
    }),
    ...(formBased && {
      formBased: {
        ...formBased,
        layers: Object.fromEntries(
          Object.entries(formBased.layers ?? {}).map(([layerId, layer]) => [
            layerId,
            {
              ...layer,
              ...(layer.indexPatternId && { indexPatternId: dataViewId }),
            },
          ])
        ),
      },
    }),
  };
};

export function getMetricIndexPattern(
  dashboardFilename: DashboardFileName,
  apmIndices: APMIndices | undefined,
  dataView: DataView
): string {
  const fullPattern = apmIndices?.metric ?? dataView.getIndexPattern();
  const patterns = fullPattern.split(',').map((p) => p.trim());

  if (dashboardFilename.startsWith('otel_native-')) {
    const otelPatterns = patterns.filter((p) => p.includes('.otel-'));
    if (otelPatterns.length > 0) {
      return otelPatterns.join(',');
    }
  }

  if (dashboardFilename.startsWith('classic_apm-')) {
    const classicPatterns = patterns.filter((p) => !p.includes('.otel-'));
    if (classicPatterns.length > 0) {
      return classicPatterns.join(',');
    }
  }

  return fullPattern;
}

export async function convertSavedDashboardToPanels(
  props: MetricsDashboardProps
): Promise<DashboardState['panels'] | undefined> {
  const { dataView, apmIndices } = props;
  const dashboardFilename = getDashboardFileNameFromProps(props);
  const unreplacedDashboardJSON = dashboardFilename
    ? await loadDashboardFile(dashboardFilename)
    : false;

  if (!dashboardFilename || !unreplacedDashboardJSON) {
    return undefined;
  }

  // Convert the Dashboard into a string
  const dashboardString = JSON.stringify(unreplacedDashboardJSON);
  // Replace indexPattern placeholder
  const dashboardStringWithReplacements = Mustache.render(dashboardString, {
    indexPattern: getMetricIndexPattern(dashboardFilename, apmIndices, dataView),
  });
  // Convert to JSON object
  const dashboardJSON = JSON.parse(dashboardStringWithReplacements);

  const panelsRawObjects = JSON.parse(dashboardJSON.attributes.panelsJSON) as any[];

  const panels = panelsRawObjects.reduce((acc, panel) => {
    const { gridData, embeddableConfig, panelIndex, title } = panel;
    const { attributes } = embeddableConfig;
    const datasourceStates = attributes?.state?.datasourceStates ?? {};
    const layers = datasourceStates.formBased?.layers ?? datasourceStates.textBased?.layers ?? [];

    acc.push({
      type: panel.type,
      grid: gridData,
      uid: panelIndex,
      config: {
        id: panelIndex,
        ...embeddableConfig,
        title,
        attributes: {
          ...attributes,
          references: [],
          state: {
            ...(attributes?.state ?? {}),
            datasourceStates: syncDatasourceStatesWithDataView(datasourceStates, dataView),
            adHocDataViews: getAdhocDataView(dataView),
            internalReferences: Object.keys(layers).map((layerId) => ({
              id: dataView.id,
              name: `indexpattern-datasource-layer-${layerId}`,
              type: 'index-pattern',
            })),
          },
        },
      },
    });

    return acc;
  }, []);

  return panels;
}
