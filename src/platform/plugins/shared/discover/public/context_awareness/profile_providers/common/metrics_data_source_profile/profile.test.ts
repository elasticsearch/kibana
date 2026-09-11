/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { DiscoverTabType } from '@kbn/discover-session-constants';
import { DataSourceType } from '../../../../../common/data_sources';
import type { MetricsExperienceDataSourceProfileProvider } from './profile';
import { METRICS_DATA_SOURCE_PROFILE_ID, createMetricsDataSourceProfileProvider } from './profile';
import type { ContextWithProfileId } from '../../../profile_service';
import type { DataSourceProfileProviderParams, RootContext } from '../../../profiles';
import { DataSourceCategory, SolutionType } from '../../../profiles';
import { METRICS_STATE_DEF } from '../../../../../common/context_awareness';

const RESOLUTION_MATCH = {
  isMatch: true,
  context: {
    category: DataSourceCategory.Metrics,
    tabType: DiscoverTabType.Metrics,
    profileState: METRICS_STATE_DEF,
  },
};

const RESOLUTION_MISMATCH = {
  isMatch: false,
};

describe('metricsDataSourceProfileProvider', () => {
  const ROOT_CONTEXT: ContextWithProfileId<RootContext> = {
    profileId: METRICS_DATA_SOURCE_PROFILE_ID,
    solutionType: SolutionType.Observability,
  };

  const createParams = (
    overrides: Partial<DataSourceProfileProviderParams>
  ): DataSourceProfileProviderParams => ({
    rootContext: ROOT_CONTEXT,
    dataSource: { type: DataSourceType.Esql },
    query: { esql: '' },
    ...overrides,
  });

  let provider: MetricsExperienceDataSourceProfileProvider;

  const createProvider = () => createMetricsDataSourceProfileProvider();

  describe('matches', () => {
    beforeEach(() => {
      provider = createProvider();
    });

    it.each([
      'TS metrics-*',
      'TS metrics-* | LIMIT 10',
      'TS metrics-* | SORT @timestamp DESC',
      'TS metrics-* | WHERE host.name == "foo"',
      'TS metrics-* | LIMIT 5 | SORT @timestamp',
    ])('when query contains only supported commands: %s', async (query) => {
      const result = await provider.resolve(
        createParams({
          query: { esql: query },
          rootContext: { profileId: 'foo', solutionType: SolutionType.Observability },
        })
      );

      expect(result).toEqual(RESOLUTION_MATCH);
    });

    it.each([
      SolutionType.Observability,
      SolutionType.Security,
      SolutionType.Default,
      SolutionType.Search,
    ])('when SolutionType is %s', async (solutionType) => {
      const result = await provider.resolve(
        createParams({
          query: { esql: 'TS metrics-*' },
          rootContext: { profileId: 'foo', solutionType },
        })
      );

      expect(result).toEqual(RESOLUTION_MATCH);
    });
  });

  describe('does not match', () => {
    beforeEach(() => {
      provider = createProvider();
    });

    it('when query uses FROM command with metrics index', async () => {
      const result = await provider.resolve(createParams({ query: { esql: 'FROM metrics-*' } }));
      expect(result).toEqual(RESOLUTION_MISMATCH);
    });

    it('when query uses FROM command with mixed index patterns', async () => {
      const result = await provider.resolve(
        createParams({ query: { esql: 'FROM logs-*,metrics-*' } })
      );
      expect(result).toEqual(RESOLUTION_MISMATCH);
    });

    it.each([
      'FROM metrics-* | STATS count() BY @timestamp',
      'TS metrics-* | STATS count() BY @timestamp',
    ])('when query contains commands that are not supported: %s', async (query) => {
      const result = await provider.resolve(
        createParams({
          query: { esql: query },
        })
      );

      expect(result).toEqual(RESOLUTION_MISMATCH);
    });

    it('when query contains ESQL that is not valid', async () => {
      const query = `FROM logs-azure.auditlogs-*
| WHERE @timestamp >= now() - 30d
  AND event.action IN ("Update", "Create")
| EVAL props_raw = COALESCE(azure.properties, properties)
| EVAL props     = json_parse(props_raw)
| EVAL settings  = COALESCE(json_get(props, "settings"), props)
| MV_EXPAND setting = settings
| WHERE LOWER(json_get(setting, "name")) == "enablenetworkprotection"
| EVAL np_new_value = COALESCE(json_get(setting, "value"), json_get(setting, "Value"))
| EVAL change_time  = @timestamp
| KEEP change_time, event.action, user.name, target.resource.id, np_new_value
| RENAME target.resource.id AS device_id

/* JOIN endpoint flips observed within 6 hours of the change */
| JOIN (
    FROM logs-azure.auditlogs-* AS re
    | WHERE @timestamp >= now() - 30d
      AND event.action IN ("RegistryValueSet", "RegistryValueCreated")
      AND (
        registry.path LIKE "%SOFTWARE\\Policies\\Microsoft\\Windows Defender\\PolicyManager%"
        OR registry.path LIKE "%SOFTWARE\\Microsoft\\Windows Defender\\Windows Defender Exploit Guard\\Network Protection%"
      )
      AND registry.value.name == "EnableNetworkProtection"
    | EVAL raw_value = COALESCE(registry.data.strings[0], registry.value.data, TO_STRING(registry.value))
    | EVAL np_mode   = CASE(
        raw_value == "0", "Off",
        raw_value == "1", "Audit",
        raw_value == "2", "Block",
        "Unknown"
      )
    | EVAL flip_time = @timestamp
    | KEEP host.name, host.id, np_mode, flip_time
    | RENAME host.id AS device_id
  )
  ON ia.device_id == re.device_id
| WHERE flip_time BETWEEN change_time AND change_time + INTERVAL 6 HOURS
| SORT change_time DESC, flip_time DESC`;
      const result = await provider.resolve(
        createParams({
          query: { esql: query },
        })
      );

      expect(result).toEqual(RESOLUTION_MISMATCH);
    });
  });
});
