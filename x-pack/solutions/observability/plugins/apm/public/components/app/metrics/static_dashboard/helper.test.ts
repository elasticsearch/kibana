/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { convertSavedDashboardToPanels, hasDashboard, getMetricIndexPattern } from './helper';
import type { DashboardFileName } from './dashboards/dashboard_catalog';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { APMIndices } from '@kbn/apm-sources-access-plugin/public';
import type { FormBasedPrivateState, TextBasedPrivateState } from '@kbn/lens-common';

interface ConvertedDatasourceStates {
  formBased?: Partial<Pick<FormBasedPrivateState, 'layers'>>;
  textBased?: Partial<Pick<TextBasedPrivateState, 'layers' | 'indexPatternRefs'>>;
}

interface ConvertedPanel {
  config?: {
    attributes?: {
      state?: {
        datasourceStates?: ConvertedDatasourceStates;
        adHocDataViews?: Record<string, unknown>;
      };
    };
  };
}

describe('APM metrics static dashboard helpers', () => {
  describe('convertSavedDashboardToPanels', () => {
    const dataView = {
      id: 'id-1',
      title: 'test-data-view:metrics*,metrics*',
      getIndexPattern: () => 'test-data-view:metrics*,metrics*',
    } as unknown as DataView;

    it('returns undefined when dashboard file does not exist', async () => {
      const panels = await convertSavedDashboardToPanels({ dataView });

      expect(panels).toBeUndefined();
    });

    it('replaces placeholders in JSON with index pattern values from data view', async () => {
      const panels = await convertSavedDashboardToPanels({
        agentName: 'opentelemetry/java/opentelemetry-java-instrumentation',
        dataView,
      });

      expect(panels).toBeDefined();

      const esqlQuery = (panels as Array<{ config?: { query?: { esql?: string } } }>)
        .map((p) => p.config?.query?.esql)
        .find(Boolean);

      expect(esqlQuery).toContain('from test-data-view:metrics*,metrics*');
    });

    it('replaces placeholders in JSON with index pattern values from apm indices', async () => {
      const apmIndices = {
        metric: 'test-apm-indices:metrics*,metrics*',
      } as unknown as APMIndices;

      const panels = await convertSavedDashboardToPanels({
        dataView,
        agentName: 'opentelemetry/java/opentelemetry-java-instrumentation',
        apmIndices,
      });

      const esqlQuery = (panels as Array<{ config?: { query?: { esql?: string } } }>)
        .map((p) => p.config?.query?.esql)
        .find(Boolean);

      expect(esqlQuery).toContain('from test-apm-indices:metrics*,metrics*');
    });

    it('scopes OTel dashboard to .otel- patterns when apmIndices is provided', async () => {
      const apmIndices = {
        metric: 'metrics-apm.internal-*,metrics-*.otel-*',
      } as unknown as APMIndices;

      const panels = await convertSavedDashboardToPanels({
        dataView,
        agentName: 'opentelemetry/java/elastic',
        telemetrySdkName: 'opentelemetry',
        telemetrySdkLanguage: 'java',
        apmIndices,
      });

      expect(panels).toBeDefined();

      const esqlQuery = (panels as Array<{ config?: { query?: { esql?: string } } }>)
        .map((p) => p.config?.query?.esql)
        .find(Boolean);

      expect(esqlQuery).toContain('FROM metrics-*.otel-*');
      expect(esqlQuery).not.toContain('metrics-apm.internal-*');
    });

    it('rewires compiled Lens data view references to the active APM data view', async () => {
      const panels = await convertSavedDashboardToPanels({
        dataView,
        agentName: 'opentelemetry/java/elastic',
        telemetrySdkName: 'opentelemetry',
        telemetrySdkLanguage: 'java',
      });

      expect(panels).toBeDefined();

      const convertedPanels = panels as ConvertedPanel[];
      const states = convertedPanels.map((panel) => panel.config?.attributes?.state);
      const textBasedStates = states.flatMap((state) =>
        state?.datasourceStates?.textBased ? [state.datasourceStates.textBased] : []
      );
      const formBasedStates = states.flatMap((state) =>
        state?.datasourceStates?.formBased ? [state.datasourceStates.formBased] : []
      );

      expect(textBasedStates.length).toBeGreaterThan(0);
      textBasedStates.forEach((textBasedState) => {
        Object.values(textBasedState.layers ?? {}).forEach((layer) => {
          expect(layer.index).toBe(dataView.id);
        });
        textBasedState.indexPatternRefs?.forEach((reference) => {
          expect(reference.id).toBe(dataView.id);
        });
      });

      expect(formBasedStates.length).toBeGreaterThan(0);
      formBasedStates.forEach((formBasedState) => {
        Object.values(formBasedState.layers ?? {}).forEach((layer) => {
          expect(layer.indexPatternId).toBe(dataView.id);
        });
      });

      states.forEach((state) => {
        expect(Object.keys(state?.adHocDataViews ?? {})).toEqual([dataView.id]);
      });
      expect(JSON.stringify(convertedPanels)).not.toContain(
        'd3b7e528216ce7ef65e68e07a803b7ab53e440cafdb52d9d7ee1ef4bbf5d8afa'
      );
    });
  });

  describe('getMetricIndexPattern', () => {
    const dataView = {
      id: 'id-1',
      getIndexPattern: () => 'metrics-apm.internal-*,metrics-*.otel-*',
    } as unknown as DataView;

    it('returns full pattern when dashboard is neither otel_native nor classic_apm', () => {
      const result = getMetricIndexPattern(
        'classic_apm-apm-nodejs' as DashboardFileName,
        undefined,
        dataView
      );
      expect(result).toBe('metrics-apm.internal-*');
    });

    it('filters to .otel- patterns for otel_native- dashboards', () => {
      const result = getMetricIndexPattern(
        'otel_native-edot-java' as DashboardFileName,
        undefined,
        dataView
      );
      expect(result).toBe('metrics-*.otel-*');
    });

    it('filters to non-.otel- patterns for classic_apm- dashboards', () => {
      const result = getMetricIndexPattern(
        'classic_apm-apm-java' as DashboardFileName,
        undefined,
        dataView
      );
      expect(result).toBe('metrics-apm.internal-*');
    });

    it('prefers apmIndices.metric over dataView.getIndexPattern()', () => {
      const apmIndices = {
        metric: 'custom-metrics-apm-*,custom-metrics-*.otel-*',
      } as unknown as APMIndices;

      const result = getMetricIndexPattern(
        'otel_native-edot-java' as DashboardFileName,
        apmIndices,
        dataView
      );
      expect(result).toBe('custom-metrics-*.otel-*');
    });

    it('falls back to full pattern when no .otel- patterns exist for otel_native dashboard', () => {
      const classicOnlyDataView = {
        id: 'id-2',
        getIndexPattern: () => 'metrics-apm.internal-*',
      } as unknown as DataView;

      const result = getMetricIndexPattern(
        'otel_native-edot-java' as DashboardFileName,
        undefined,
        classicOnlyDataView
      );
      expect(result).toBe('metrics-apm.internal-*');
    });

    it('falls back to full pattern when no non-.otel- patterns exist for classic dashboard', () => {
      const otelOnlyDataView = {
        id: 'id-3',
        getIndexPattern: () => 'metrics-*.otel-*',
      } as unknown as DataView;

      const result = getMetricIndexPattern(
        'classic_apm-apm-java' as DashboardFileName,
        undefined,
        otelOnlyDataView
      );
      expect(result).toBe('metrics-*.otel-*');
    });

    it('handles comma-separated patterns with whitespace', () => {
      const spacedDataView = {
        id: 'id-4',
        getIndexPattern: () => 'metrics-apm.internal-* , metrics-*.otel-* , metrics-custom-*',
      } as unknown as DataView;

      const result = getMetricIndexPattern(
        'otel_native-edot-java' as DashboardFileName,
        undefined,
        spacedDataView
      );
      expect(result).toBe('metrics-*.otel-*');
    });
  });

  describe('hasDashboard', () => {
    it('returns false when agentName is undefined', () => {
      expect(hasDashboard({})).toBe(false);
    });

    it('returns true for a known default dashboard', () => {
      expect(
        hasDashboard({
          agentName: 'opentelemetry/dotnet/elastic',
          telemetrySdkName: undefined,
          telemetrySdkLanguage: undefined,
        })
      ).toBe(true);
    });

    it('resolves EDOT .NET 8 to a versioned dashboard via <=8 rule', () => {
      expect(
        hasDashboard({
          agentName: 'opentelemetry/dotnet/elastic',
          runtimeVersion: '8.0.11',
        })
      ).toBe(true);
    });

    it('falls back to default for EDOT .NET 9 (above <=8 rule)', () => {
      expect(
        hasDashboard({
          agentName: 'opentelemetry/dotnet/elastic',
          runtimeVersion: '9.0.0',
        })
      ).toBe(true);
    });

    it('falls back to default when runtimeVersion is invalid', () => {
      expect(
        hasDashboard({
          agentName: 'opentelemetry/dotnet/elastic',
          runtimeVersion: 'preview',
        })
      ).toBe(true);
    });

    it('returns false for an unknown agent', () => {
      expect(
        hasDashboard({
          agentName: 'my-custom-agent',
        })
      ).toBe(false);
    });

    it('returns true for OTel-native EDOT .NET 9', () => {
      expect(
        hasDashboard({
          agentName: 'opentelemetry/dotnet/elastic',
          telemetrySdkName: 'opentelemetry',
          telemetrySdkLanguage: 'dotnet',
          runtimeVersion: '9.0.0',
        })
      ).toBe(true);
    });

    it('returns true for OTel-native vanilla .NET', () => {
      expect(
        hasDashboard({
          agentName: 'opentelemetry/dotnet',
          telemetrySdkName: 'opentelemetry',
          telemetrySdkLanguage: 'dotnet',
        })
      ).toBe(true);
    });
  });

  describe('convertSavedDashboardToPanels - .NET OTel-native dashboards', () => {
    interface PanelLike {
      config?: {
        attributes?: {
          state?: {
            datasourceStates?: {
              formBased?: {
                layers?: Record<string, { columns?: Record<string, { sourceField?: string }> }>;
              };
            };
          };
        };
      };
    }

    const dataView = {
      id: 'dotnet-id',
      title: 'metrics-*.otel-*',
      getIndexPattern: () => 'metrics-*.otel-*',
    } as unknown as DataView;

    const collectSourceFields = (panels: PanelLike[]): string[] => {
      const fields: string[] = [];
      for (const panel of panels) {
        const layers = panel.config?.attributes?.state?.datasourceStates?.formBased?.layers ?? {};
        for (const layer of Object.values(layers)) {
          for (const column of Object.values(layer.columns ?? {})) {
            if (column.sourceField) {
              fields.push(column.sourceField);
            }
          }
        }
      }
      return fields;
    };

    it('loads the new dotnet.* dashboard for OTel-native EDOT .NET 9', async () => {
      const panels = await convertSavedDashboardToPanels({
        agentName: 'opentelemetry/dotnet/elastic',
        telemetrySdkName: 'opentelemetry',
        telemetrySdkLanguage: 'dotnet',
        runtimeVersion: '9.0.0',
        dataView,
      });

      expect(panels).toBeDefined();
      const fields = collectSourceFields(panels as PanelLike[]);
      expect(fields).toContain('dotnet.gc.collections');
      expect(fields).toContain('dotnet.thread_pool.thread.count');
    });

    it('loads the same dotnet.* dashboard for OTel-native vanilla .NET', async () => {
      const panels = await convertSavedDashboardToPanels({
        agentName: 'opentelemetry/dotnet',
        telemetrySdkName: 'opentelemetry',
        telemetrySdkLanguage: 'dotnet',
        runtimeVersion: '9.0.0',
        dataView,
      });

      expect(panels).toBeDefined();
      expect(collectSourceFields(panels as PanelLike[])).toContain('dotnet.gc.collections');
    });

    it('loads the legacy-schema dashboard for OTel-native EDOT .NET 8', async () => {
      const panels = await convertSavedDashboardToPanels({
        agentName: 'opentelemetry/dotnet/elastic',
        telemetrySdkName: 'opentelemetry',
        telemetrySdkLanguage: 'dotnet',
        runtimeVersion: '8.0.0',
        dataView,
      });

      expect(panels).toBeDefined();
      expect(collectSourceFields(panels as PanelLike[])).toContain(
        'process.runtime.dotnet.gc.collections.count'
      );
    });
  });
});
