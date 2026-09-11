/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Mapping coverage guard for index_templates.ts.
 *
 * When you add a new field to the threatReportsTemplate mapping:
 * 1. Add the field to `threatReportsTemplate` in index_templates.ts.
 * 2. Add a migrateExisting* function (if putMapping-able) and wire it into
 *    installIndexTemplates, or add a REQUIRED_*_FIELDS leaf for drop+recreate
 *    changes that cannot be applied in place.
 * 3. Update the assertions here.
 */

import * as fs from 'fs';
import * as path from 'path';
import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import {
  THREAT_INTEL_INDICATORS_INDEX,
  THREAT_INTEL_SOURCES_INDEX,
  THREAT_REPORTS_INDEX,
} from '../../../common/threat_intel';
import { installIndexTemplates } from './index_templates';

const src = fs.readFileSync(path.join(__dirname, 'index_templates.ts'), 'utf8');

interface PutTemplateArg {
  name: string;
  template?: { settings?: Record<string, unknown>; mappings?: Record<string, unknown> };
}

/** Runs the real installer against a mocked cluster and returns what it sent. */
const runInstall = async () => {
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  esClient.indices.exists.mockResolvedValue(false);
  esClient.indices.get.mockResolvedValue({});
  esClient.indices.getSettings.mockResolvedValue({});

  await installIndexTemplates({ esClient, logger: loggingSystemMock.createLogger() });

  const templates = esClient.indices.putIndexTemplate.mock.calls.map(
    ([arg]) => arg as PutTemplateArg
  );
  const byIndex = (index: string) => templates.find((t) => t.name === `${index}-template`);
  return { esClient, templates, byIndex };
};

const REPORT_INDEX = '.kibana-threat-reports';

/** Mapping shape for a reports index that is already on the current version. */
const fullyMigratedReportMappings = () => ({
  properties: {
    revision: {},
    content: {
      properties: {},
    },
    lineage: { properties: { content_scrubbed_at: {} } },
    // v30: evidence is a space-keyed nested array; the guard checks the leaf.
    evidence: { properties: { space_id: {} } },
    extracted: {
      properties: {
        diamond: {},
        gate: {},
        vulnerability: {},
        iocs: {
          properties: {
            tier: {},
            tier_heuristic: {},
            tier_basis: {},
            port: {},
            reference: { ignore_above: 2048 },
            block_index: {},
            // v26 bounds these by value, not just existence.
            value: { ignore_above: 2048 },
            defanged: { ignore_above: 2048 },
          },
        },
      },
    },
  },
});

/** Indicators mapping that is already on the current version. */
const fullyMigratedIndicatorMappings = () => ({
  properties: {
    space_id: {},
    ioc_tier: {},
    // Leaves the sources migration writes, checked by the guard rather than the parent.
    sources: { properties: { report_id: {}, first_seen: {} } },
    sources_truncated: {},
    source_report_url: { ignore_above: 2048 },
    threat: {
      properties: {
        indicator: {
          properties: {
            email: { ignore_above: 2048 },
            // Leaves, since the v23 migration writes these and the guard now checks
            // them rather than their parents.
            network: { properties: { cidr: {} } },
            cryptocurrency: { properties: { address: {} } },
            file: { properties: { hash: { properties: { sha512: {} } } } },
            provider: { ignore_above: 2048 },
            url: { properties: { full: { ignore_above: 2048 } } },
          },
        },
      },
    },
  },
});

/**
 * Runs the real installer against a cluster that already has a reports index,
 * so the migration paths actually execute (the suite above mocks `indices.get`
 * to `{}`, which makes every report migration a no-op).
 */
const runMigrations = async ({
  reportMappings = fullyMigratedReportMappings(),
  indicatorMappings = fullyMigratedIndicatorMappings(),
  /**
   * Indicator nested-objects limit. Defaults to the fully-migrated value; pass `null`
   * for a pre-migration index. Not `undefined`, which would re-trigger this default.
   */
  indicatorNestedLimit = '10000' as string | null,
}: {
  reportMappings?: Record<string, unknown>;
  indicatorMappings?: Record<string, unknown>;
  indicatorNestedLimit?: string | null;
} = {}) => {
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  esClient.indices.exists.mockResolvedValue(true);
  esClient.indices.get.mockResolvedValue({ [REPORT_INDEX]: {} });
  esClient.indices.getSettings.mockResolvedValue({
    [REPORT_INDEX]: { settings: { index: { hidden: 'true' } } },
    [THREAT_INTEL_SOURCES_INDEX]: { settings: { index: { hidden: 'true' } } },
    [THREAT_INTEL_INDICATORS_INDEX]: {
      settings: {
        index: {
          hidden: 'true',
          ...(indicatorNestedLimit
            ? { mapping: { nested_objects: { limit: indicatorNestedLimit } } }
            : {}),
        },
      },
    } as never,
  });
  esClient.indices.getMapping.mockImplementation((async (args: { index: string }) => ({
    [args.index]: {
      mappings: args.index === THREAT_INTEL_INDICATORS_INDEX ? indicatorMappings : reportMappings,
    },
  })) as never);
  esClient.updateByQuery.mockResolvedValue({ updated: 0 } as never);

  // The mock returns the same deficient mapping on every read, so the
  // post-migration schema check sees the field as still missing even though the
  // migration patched it. These cases are about whether the patch was issued;
  // the check has its own tests below.
  let verificationError: Error | undefined;
  try {
    await installIndexTemplates({ esClient, logger: loggingSystemMock.createLogger() });
  } catch (err) {
    verificationError = err as Error;
  }

  const putMappingArgs = esClient.indices.putMapping.mock.calls.map(([arg]) => arg);
  /** Every property path touched by a putMapping call, as dotted strings. */
  const patchedPaths = putMappingArgs.flatMap((arg) => {
    const paths: string[] = [];
    const walk = (node: Record<string, unknown>, prefix: string) => {
      for (const [key, value] of Object.entries(node)) {
        const propertyPath = prefix ? `${prefix}.${key}` : key;
        const nested = (value as { properties?: Record<string, unknown> })?.properties;
        if (nested) {
          walk(nested, propertyPath);
        } else {
          paths.push(propertyPath);
        }
      }
    };
    walk((arg.properties ?? {}) as Record<string, unknown>, '');
    return paths;
  });

  return { esClient, putMappingArgs, patchedPaths, verificationError };
};

describe('index_templates — migrations', () => {
  it('resolves the report index list once for all report migrations', async () => {
    const { esClient } = await runMigrations();
    // Previously each of the report-targeting migrations issued its own
    // identical indices.get against the wildcard pattern.
    expect(esClient.indices.get).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when every mapping is already current', async () => {
    const { putMappingArgs } = await runMigrations();
    expect(putMappingArgs).toEqual([]);
  });

  it.each([
    ['extracted.diamond', 'diamond'],
    ['extracted.gate', 'gate'],
    ['extracted.vulnerability', 'vulnerability'],
  ])('adds %s when absent', async (expectedPath, field) => {
    const mappings = fullyMigratedReportMappings();
    delete (mappings.properties.extracted.properties as Record<string, unknown>)[field];

    const { patchedPaths } = await runMigrations({ reportMappings: mappings });

    expect(patchedPaths.some((p) => p.startsWith(expectedPath))).toBe(true);
  });

  it.each([
    ['tier', 'extracted.iocs.tier'],
    ['port', 'extracted.iocs.port'],
    ['reference', 'extracted.iocs.reference'],
  ])('adds extracted.iocs.%s when absent', async (field, expectedPath) => {
    const mappings = fullyMigratedReportMappings();
    delete (mappings.properties.extracted.properties.iocs.properties as Record<string, unknown>)[
      field
    ];

    const { patchedPaths } = await runMigrations({ reportMappings: mappings });

    expect(patchedPaths).toContain(expectedPath);
  });

  it('adds lineage.content_scrubbed_at when absent', async () => {
    const mappings = fullyMigratedReportMappings();
    delete (mappings.properties.lineage.properties as Record<string, unknown>).content_scrubbed_at;

    const { patchedPaths } = await runMigrations({ reportMappings: mappings });

    expect(patchedPaths).toContain('lineage.content_scrubbed_at');
  });

  it('adds revision when absent and backfills missing values', async () => {
    const mappings = fullyMigratedReportMappings();
    delete (mappings.properties as Record<string, unknown>).revision;

    const { patchedPaths, esClient } = await runMigrations({ reportMappings: mappings });

    expect(patchedPaths).toContain('revision');
    expect(esClient.updateByQuery).toHaveBeenCalled();
  });

  it('adds space_id to the indicators index when absent', async () => {
    const indicatorMappings = fullyMigratedIndicatorMappings();
    delete (indicatorMappings.properties as Record<string, unknown>).space_id;

    const { patchedPaths } = await runMigrations({ indicatorMappings });

    expect(patchedPaths).toContain('space_id');
  });

  // A URL IOC can be as long as the report body, and a keyword term over 32,766
  // bytes rejects the whole report document rather than just the field. The report
  // then stays pending and every enrichment run retries it.
  describe('report keyword bounds (v26)', () => {
    const preV26 = () => {
      const mappings = fullyMigratedReportMappings();
      delete (mappings.properties.extracted.properties.iocs.properties as Record<string, unknown>)
        .value;
      return mappings;
    };

    it('bounds every IOC keyword that can contain feed-supplied text', async () => {
      const { patchedPaths } = await runMigrations({ reportMappings: preV26() });

      for (const boundedField of ['extracted.iocs.value', 'extracted.iocs.defanged']) {
        expect(patchedPaths).toContain(boundedField);
      }
    });

    it('repairs a missing reference bound even when value is already bounded', async () => {
      const mappings = fullyMigratedReportMappings();
      (
        mappings.properties.extracted.properties.iocs.properties as Record<string, unknown>
      ).reference = {};

      const { patchedPaths } = await runMigrations({ reportMappings: mappings });

      expect(patchedPaths).toContain('extracted.iocs.reference');
    });

    it('is a no-op once the IOC value is already bounded', async () => {
      const { patchedPaths } = await runMigrations();
      expect(patchedPaths).not.toContain('extracted.iocs.value');
    });
  });

  // A keyword term over 32,766 bytes is a hard error, and on the indicators index
  // an item-level error recurs on every promote run, so an unbounded url.full was
  // a permanent rejection waiting on a long URL.
  describe('indicator keyword bounds (v25)', () => {
    const preV25 = () => {
      const indicatorMappings = fullyMigratedIndicatorMappings();
      delete (indicatorMappings.properties as Record<string, unknown>).sources_truncated;
      return indicatorMappings;
    };

    it('bounds the feed-controlled keyword fields when absent', async () => {
      const { patchedPaths } = await runMigrations({ indicatorMappings: preV25() });

      for (const boundedField of [
        'threat.indicator.url.full',
        'threat.indicator.url.domain',
        'threat.indicator.provider',
        'threat.indicator.reference',
        'sources.reference',
        'sources.trail',
        'source_report_url',
      ]) {
        expect(patchedPaths).toContain(boundedField);
      }
    });

    it('adds sources_truncated so the provenance cap is not silent', async () => {
      const { patchedPaths } = await runMigrations({ indicatorMappings: preV25() });
      expect(patchedPaths).toContain('sources_truncated');
    });

    it('raises the nested-objects ceiling on the existing index', async () => {
      const { esClient } = await runMigrations({
        indicatorMappings: preV25(),
        indicatorNestedLimit: null,
      });
      expect(esClient.indices.putSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: { 'index.mapping.nested_objects.limit': 10000 },
        })
      );
    });

    it('does not touch settings once already migrated', async () => {
      const { esClient } = await runMigrations();
      expect(esClient.indices.putSettings).not.toHaveBeenCalled();
    });
  });
});

describe('ensureCompanionIndex', () => {
  const runCreateWith = async (createError: unknown) => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.indices.exists.mockResolvedValue(false);
    esClient.indices.get.mockResolvedValue({});
    esClient.indices.getSettings.mockResolvedValue({});
    esClient.indices.create.mockRejectedValue(createError);

    return installIndexTemplates({ esClient, logger: loggingSystemMock.createLogger() });
  };

  it('swallows the concurrent-creation race', async () => {
    await expect(
      runCreateWith({
        statusCode: 400,
        body: { error: { type: 'resource_already_exists_exception' } },
      })
    ).resolves.toBeUndefined();
  });

  it('rethrows other 400s such as a shard-limit failure', async () => {
    // Matching on the 400 status alone hid this: boot succeeded, the index did
    // not exist, and every later write to it failed with no obvious cause.
    await expect(
      runCreateWith({
        statusCode: 400,
        body: { error: { type: 'validation_exception', reason: 'cluster shard limit exceeded' } },
      })
    ).rejects.toBeDefined();
  });
});

describe('installIndexTemplates', () => {
  it('marks all three threat intel indices hidden', async () => {
    const { byIndex } = await runInstall();

    for (const index of [
      THREAT_REPORTS_INDEX,
      THREAT_INTEL_SOURCES_INDEX,
      THREAT_INTEL_INDICATORS_INDEX,
    ]) {
      expect(byIndex(index)?.template?.settings).toEqual(
        expect.objectContaining({ 'index.hidden': true })
      );
    }
  });

  it('keeps bounded body_text but never maps raw body_html', async () => {
    const { byIndex } = await runInstall();

    const content = (
      byIndex(THREAT_REPORTS_INDEX)?.template?.mappings as {
        properties: { content: { properties: Record<string, unknown> } };
      }
    ).properties.content.properties;

    expect(content).toEqual(expect.objectContaining({ body_text: expect.anything() }));
    expect(content).not.toHaveProperty('body_html');
  });

  it('maps a field for every IOC type the promote task can emit', async () => {
    const { byIndex } = await runInstall();

    const indicator = (
      byIndex(THREAT_INTEL_INDICATORS_INDEX)?.template?.mappings as {
        properties: {
          threat: { properties: { indicator: { properties: Record<string, unknown> } } };
        };
      }
    ).properties.threat.properties.indicator.properties;

    // `dynamic: 'strict'` rejects the whole document for any unmapped path, and
    // the promote task only warns, so a gap here silently drops indicators.
    expect(indicator).toEqual(
      expect.objectContaining({
        ip: expect.anything(),
        url: expect.anything(),
        file: expect.anything(),
        email: expect.anything(),
        network: expect.anything(),
        cryptocurrency: expect.anything(),
      })
    );
  });

  it('marks pre-existing indices hidden, since templates only apply at creation', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.indices.exists.mockResolvedValue(false);
    esClient.indices.get.mockResolvedValue({ '.kibana-threat-reports': {} });
    esClient.indices.getSettings.mockResolvedValue({});
    // Current mappings, so the post-migration schema check does not fail the
    // install before this assertion is reached.
    esClient.indices.getMapping.mockImplementation((async (args: { index: string }) => ({
      [args.index]: { mappings: fullyMigratedReportMappings() },
    })) as never);

    await installIndexTemplates({ esClient, logger: loggingSystemMock.createLogger() });

    const hidden = esClient.indices.putSettings.mock.calls.map(([arg]) => arg.index);
    expect(hidden).toEqual(
      expect.arrayContaining([
        '.kibana-threat-reports',
        THREAT_INTEL_SOURCES_INDEX,
        THREAT_INTEL_INDICATORS_INDEX,
      ])
    );
  });

  it('leaves an already-hidden index alone', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.indices.exists.mockResolvedValue(false);
    esClient.indices.get.mockResolvedValue({});
    esClient.indices.getSettings.mockResolvedValue({
      [THREAT_INTEL_SOURCES_INDEX]: { settings: { index: { hidden: 'true' } } },
    });

    await installIndexTemplates({ esClient, logger: loggingSystemMock.createLogger() });

    const hidden = esClient.indices.putSettings.mock.calls.map(([arg]) => arg.index);
    expect(hidden).not.toContain(THREAT_INTEL_SOURCES_INDEX);
  });
});

describe('index_templates — mapping coverage guard', () => {
  it('threat reports template does not declare a data stream', () => {
    const reportsTemplateStart = src.indexOf('const threatReportsTemplate');
    const reportsTemplateEnd = src.indexOf('const COMPANION_INDEX_TEMPLATES');
    const reportsTemplate = src.slice(reportsTemplateStart, reportsTemplateEnd);
    expect(reportsTemplate).not.toContain('data_stream:');
  });

  it('extracted.iocs includes reference and block_index fields (v19 maltrail adapter fields)', () => {
    // `reference` also carries an `ignore_above`, so match the declaration prefix.
    expect(src).toContain("reference: { type: 'keyword' as const");
    expect(src).toContain("block_index: { type: 'integer' as const }");
  });

  it('bounds the feed-controlled keyword fields that can carry an arbitrary-length value', () => {
    // A keyword term over 32,766 bytes is a hard Elasticsearch error that rejects
    // the whole document, so every field a feed or the IOC extractor can fill needs
    // a bound.
    expect(src).toContain(
      "value: { type: 'keyword' as const, ignore_above: FEED_TEXT_IGNORE_ABOVE }"
    );
    expect(src).toContain(
      "defanged: { type: 'keyword' as const, ignore_above: FEED_TEXT_IGNORE_ABOVE }"
    );
  });

  it('extracted.vulnerability block is declared with all expected keyword/date properties (v20)', () => {
    expect(src).toContain('vulnerability: {');
    expect(src).toContain("cve_id: { type: 'keyword' as const }");
    expect(src).toContain("vendor: { type: 'keyword' as const }");
    expect(src).toContain("product: { type: 'keyword' as const }");
    expect(src).toContain("date_added: { type: 'date' as const }");
    expect(src).toContain("due_date: { type: 'date' as const }");
    expect(src).toContain("ransomware_use: { type: 'keyword' as const }");
  });

  it('migrateExistingVulnerabilityMappings is wired into installIndexTemplates', () => {
    expect(src).toContain('const migrateExistingVulnerabilityMappings');

    const installIdx = src.indexOf('export const installIndexTemplates');
    expect(installIdx).toBeGreaterThan(-1);

    const callIdx = src.indexOf('await migrateExistingVulnerabilityMappings', installIdx);
    expect(callIdx).toBeGreaterThan(installIdx);
  });

  it('migrateExistingRevisionMapping is wired into installIndexTemplates', () => {
    expect(src).toContain('const migrateExistingRevisionMapping');

    const installIdx = src.indexOf('export const installIndexTemplates');
    expect(installIdx).toBeGreaterThan(-1);

    const callIdx = src.indexOf('await migrateExistingRevisionMapping', installIdx);
    expect(callIdx).toBeGreaterThan(installIdx);
  });

  it('reports template declares a top-level revision integer (v28)', async () => {
    const { byIndex } = await runInstall();

    const properties = (
      byIndex(THREAT_REPORTS_INDEX)?.template?.mappings as {
        properties: Record<string, unknown>;
      }
    ).properties;

    expect(properties).toEqual(expect.objectContaining({ revision: { type: 'integer' } }));
  });

  it('reports template declares evidence as a space-keyed nested array (v30)', async () => {
    const { byIndex } = await runInstall();

    const properties = (
      byIndex(THREAT_REPORTS_INDEX)?.template?.mappings as {
        properties: Record<string, unknown>;
      }
    ).properties;

    expect(properties.evidence).toEqual(
      expect.objectContaining({
        type: 'nested',
        properties: expect.objectContaining({ space_id: { type: 'keyword' } }),
      })
    );
  });

  // Merged from the former separate `attribution` (Attribute Alerts) and
  // `feedback` (Hunt Watch) fields: neither's keys overlapped, and both are
  // per-space evidence about the same report, so one element covers both.
  it('evidence carries both alert-attribution and hunt-feedback fields', async () => {
    const { byIndex } = await runInstall();

    const properties = (
      byIndex(THREAT_REPORTS_INDEX)?.template?.mappings as {
        properties: Record<string, unknown>;
      }
    ).properties;

    expect((properties.evidence as { properties: Record<string, unknown> }).properties).toEqual(
      expect.objectContaining({
        alert_hits_total: { type: 'integer' },
        last_hunt_status: { type: 'keyword' },
        last_hunted_revision: { type: 'integer' },
        corroborated_rank_score: { type: 'float' },
      })
    );
  });

  it('evidence.space_id is a required report field so a stale index fails bootstrap loudly', () => {
    // v30 flipped attribution/feedback into evidence, object -> nested,
    // which cannot be applied to an existing index. This entry is the only
    // detection for a stale index: without it the write is rejected by
    // dynamic: strict and swallowed by on-failure: continue.
    expect(src).toContain("{ path: 'evidence.space_id' }");
  });

  it('templates stamp managed_by threat_intel in _meta (no version counter)', () => {
    expect(src).toContain("const TEMPLATE_META = { managed_by: 'threat_intel' }");
    expect(src).not.toContain('TEMPLATE_VERSION');
  });

  it('indicators template declares a top-level space_id keyword (v24 space isolation)', async () => {
    const { byIndex } = await runInstall();

    const properties = (
      byIndex(THREAT_INTEL_INDICATORS_INDEX)?.template?.mappings as {
        properties: Record<string, unknown>;
      }
    ).properties;

    expect(properties).toEqual(expect.objectContaining({ space_id: { type: 'keyword' } }));
  });

  it('migrateExistingIndicatorSpaceIdMapping is wired into installIndexTemplates', () => {
    expect(src).toContain('const migrateExistingIndicatorSpaceIdMapping');

    const installIdx = src.indexOf('export const installIndexTemplates');
    expect(installIdx).toBeGreaterThan(-1);

    const callIdx = src.indexOf('await migrateExistingIndicatorSpaceIdMapping', installIdx);
    expect(callIdx).toBeGreaterThan(installIdx);
  });
});

// A migration that fails logs and returns, deliberately, so one index cannot stop
// the others. The consequence was that installIndexTemplates always looked
// successful, withElasticsearchRetry never retried, and the readiness promise
// resolved even though dynamic: strict would reject later writes.
describe('index_templates — post-migration schema check', () => {
  it('passes when every migration-owned field is present', async () => {
    const { verificationError } = await runMigrations();
    expect(verificationError).toBeUndefined();
  });

  it('fails when a report field is still missing after migrating', async () => {
    const mappings = fullyMigratedReportMappings();
    delete (mappings.properties.extracted.properties as Record<string, unknown>).diamond;

    const { verificationError } = await runMigrations({ reportMappings: mappings });

    expect(verificationError?.message).toMatch(/extracted\.diamond/);
    expect(verificationError?.message).toMatch(/Bootstrap is not ready/);
  });

  // The v26 migration changes a parameter on paths that already exist on a pre-v26
  // index, so an existence-only check could not tell a migrated index from an
  // unmigrated one and a failed v26 putMapping passed verification.
  // The nested ceiling is a separate request from the mapping that marks its migration
  // done, so a transient putSettings failure was unrecoverable: the retry saw the
  // marker, returned early, and the old limit stayed until a restart.
  it('fails when the nested-objects ceiling was never raised', async () => {
    const { verificationError } = await runMigrations({ indicatorNestedLimit: null });
    expect(verificationError?.message).toMatch(/nested_objects\.limit/);
  });

  it('repairs the nested ceiling even when the mapping half is already done', async () => {
    // sources_truncated present (mapping done) but the limit missing: the old code
    // returned early here and never retried the settings request.
    const { esClient } = await runMigrations({ indicatorNestedLimit: null });
    expect(esClient.indices.putSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: { 'index.mapping.nested_objects.limit': 10000 },
      })
    );
  });

  it.each([
    ['threat.indicator.network.cidr', 'network'],
    ['threat.indicator.cryptocurrency.address', 'cryptocurrency'],
  ])('fails when the v23 leaf %s is missing', async (leafPath, parent) => {
    const indicatorMappings = fullyMigratedIndicatorMappings();
    (
      indicatorMappings.properties.threat.properties.indicator.properties as Record<string, unknown>
    )[parent] = {};

    const { verificationError } = await runMigrations({ indicatorMappings });

    expect(verificationError?.message).toContain(leafPath);
  });

  it('fails when file.hash.sha512 is missing', async () => {
    const indicatorMappings = fullyMigratedIndicatorMappings();
    delete (
      indicatorMappings.properties.threat.properties.indicator.properties as Record<string, unknown>
    ).file;

    const { verificationError } = await runMigrations({ indicatorMappings });

    expect(verificationError?.message).toContain('threat.indicator.file.hash.sha512');
  });

  it('fails when a bounded field exists but lost its ignore_above', async () => {
    const mappings = fullyMigratedReportMappings();
    (mappings.properties.extracted.properties.iocs.properties as Record<string, unknown>).value =
      {};

    const { verificationError } = await runMigrations({ reportMappings: mappings });

    expect(verificationError?.message).toMatch(/extracted\.iocs\.value/);
    expect(verificationError?.message).toMatch(/ignore_above/);
  });

  // v19 writes `reference` and `block_index` in one putMapping, but a failed v19 then a
  // successful v26 keyword-bounds putMapping re-adds `reference` without `block_index`,
  // so checking `reference` alone passed while strict rejected Maltrail reports.
  it('fails when the v19 leaf extracted.iocs.block_index is missing', async () => {
    const mappings = fullyMigratedReportMappings();
    delete (mappings.properties.extracted.properties.iocs.properties as Record<string, unknown>)
      .block_index;

    const { verificationError } = await runMigrations({ reportMappings: mappings });

    expect(verificationError?.message).toMatch(/extracted\.iocs\.block_index/);
  });

  // The hidden-index migration catches its own failures too, and mappings-only
  // verification let a transient putSettings failure advertise readiness while the
  // indices stayed visible to ordinary wildcard searches.
  it('fails when an index is still not hidden', async () => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.indices.exists.mockResolvedValue(true);
    esClient.indices.get.mockResolvedValue({ [REPORT_INDEX]: {} });
    esClient.indices.getMapping.mockImplementation((async (args: { index: string }) => ({
      [args.index]: {
        mappings:
          args.index === THREAT_INTEL_INDICATORS_INDEX
            ? fullyMigratedIndicatorMappings()
            : fullyMigratedReportMappings(),
      },
    })) as never);
    esClient.indices.getSettings.mockResolvedValue({
      [REPORT_INDEX]: { settings: { index: { hidden: 'false' } } },
    });

    const err = await installIndexTemplates({
      esClient,
      logger: loggingSystemMock.createLogger(),
    }).then(
      () => undefined,
      (e: Error) => e
    );

    expect(err?.message).toMatch(/index\.hidden/);
  });

  it('fails when an indicators field is still missing after migrating', async () => {
    const indicatorMappings = fullyMigratedIndicatorMappings();
    delete (indicatorMappings.properties as Record<string, unknown>).space_id;

    const { verificationError } = await runMigrations({ indicatorMappings });

    expect(verificationError?.message).toMatch(/space_id/);
  });

  // The sources parent survives a keyword-bounds putMapping that recreates it with only
  // provider/trail/reference, so a failed sources migration leaves these leaves unmapped
  // while the parent check passes and strict rejects the scripted upserts that set them.
  it.each(['report_id', 'first_seen'])(
    'fails when the sources leaf %s is missing',
    async (leaf) => {
      const indicatorMappings = fullyMigratedIndicatorMappings();
      delete (indicatorMappings.properties.sources.properties as Record<string, unknown>)[leaf];

      const { verificationError } = await runMigrations({ indicatorMappings });

      expect(verificationError?.message).toContain(`sources.${leaf}`);
    }
  );

  // Catches a migration that ran without error but took a wrong branch, which
  // per-migration error tracking would have reported as success.
  it('names every missing field, not just the first', async () => {
    const mappings = fullyMigratedReportMappings();
    delete (mappings.properties.extracted.properties as Record<string, unknown>).diamond;
    delete (mappings.properties.extracted.properties as Record<string, unknown>).gate;

    const { verificationError } = await runMigrations({ reportMappings: mappings });

    expect(verificationError?.message).toMatch(/extracted\.diamond/);
    expect(verificationError?.message).toMatch(/extracted\.gate/);
  });
});

// `ignore: [404]` plus ignore_unavailable and allow_no_indices already turn "no report
// indices yet" into an empty response, so anything that throws is a real request
// failure. Swallowing them skipped every report migration and left the verifier with
// nothing to check, so the install reported success over stale strict mappings.
describe('index_templates — report index resolution failures', () => {
  const installWith = async (getImpl: () => Promise<never>) => {
    const esClient = elasticsearchServiceMock.createElasticsearchClient();
    esClient.indices.exists.mockResolvedValue(true);
    esClient.indices.getSettings.mockResolvedValue({});
    esClient.indices.getMapping.mockImplementation((async (args: { index: string }) => ({
      [args.index]: {
        mappings:
          args.index === THREAT_INTEL_INDICATORS_INDEX
            ? fullyMigratedIndicatorMappings()
            : fullyMigratedReportMappings(),
      },
    })) as never);
    esClient.indices.get.mockImplementation(getImpl as never);

    return installIndexTemplates({
      esClient,
      logger: loggingSystemMock.createLogger(),
    }).then(
      () => undefined,
      (err: Error) => err
    );
  };

  it.each([
    ['a 503', 503],
    ['an authorization error', 403],
    ['a timeout', 408],
  ])('propagates %s rather than treating it as no indices', async (_label, statusCode) => {
    const err = await installWith(() =>
      Promise.reject(Object.assign(new Error('request failed'), { statusCode }))
    );
    expect(err).toBeInstanceOf(Error);
  });

  it('still treats an empty response as no report indices', async () => {
    const err = await installWith((() => Promise.resolve({})) as never);
    expect(err).toBeUndefined();
  });
});
