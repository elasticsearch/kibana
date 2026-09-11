/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under the
 * Elastic License 2.0. Licensed under the Elastic License 2.0"; you may not use
 * this file except in compliance with, at your election, the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", or the "Server Side
 * Public License v 1".
 */

import type { Client as EsClient } from '@elastic/elasticsearch';
import type { KbnClient } from '@kbn/kbn-client';
import type { ToolingLog } from '@kbn/tooling-log';

/**
 * Environment-truth seeds for the persona matrix.
 *
 * Every category prompt must be satisfiable by data/tools that actually exist
 * in the eval stack. Before this module, four categories measured "model gives
 * up gracefully on a missing backend" instead of the capability under test:
 *
 * - Threat Hunting hunts `log.dll` across process/file telemetry → we seed
 *   `logs-endpoint.events.process-default` with the side-load evidence.
 * - Multi-Step checks the Chrysalis hash against Elastic Security Labs → we
 *   seed the Labs knowledge index with a T1574.002 entry for that hash.
 * - Triggering Workflows checks the hash against VirusTotal → VirusTotal is
 *   NOT shipped with the stack; we seed a mock threat-intel verdict index and
 *   (in persona_matrix_tools_seed) point the `virustotal_lookup` tool at it.
 * - Entity Analytics profiles srv-win-defend-01 → we seed a watchlist and an
 *   entity-store record so watchlist/entity lookups return data.
 *
 * All seeds are idempotent (skip when the marker doc already exists) and
 * cleaned up by `cleanupEnvSeeds`.
 */

export const ENV_SEED_MARKER_INDEX = 'persona-matrix-env-seeds';
const ENDPOINT_INDEX = 'logs-endpoint.events.process-default';
const LABS_INDEX = 'logs-security_labs.research-default';
const TI_INDEX = 'ti-mock-default';
const WATCHLIST_SO_TYPE = 'security-tanker-watchlist';
const ONCALL_INDEX = 'on-call-schedule';

const CHRYSALIS_HASH = '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f';
const HOST = 'srv-win-defend-01';

// Entity docs in `entities-latest-default` are keyed by sha256(euid) — the
// same digest as @kbn/entity-store's hashEuid — so re-seeding overwrites
// instead of duplicating. The four euids below are fixed dataset constants,
// so their digests are precomputed at author time rather than hashing at
// runtime (which would need the Node crypto builtin, disallowed here):
//   sha256('host-default-srv-win-defend-01')        = 8956913254bdbf2d6070b7cfc851c691f653b150050013b4bea74c9f9b93457f
//   sha256('host-default-srv-linux-web-02')         = 1d3a97ba8f44d13e1c6e249923b7994d14c7f36e5223d29832113403c0d24a6c
//   sha256('host-default-srv-mac-dev-03')           = c7d2277442521af9efbf039522b13067d5444d1dbdb890a1e759ff5527553ed9
//   sha256('user-default-SYSTEM-srv-win-defend-01') = 4e1e3960d8231ed8b67f2f3788f4a5602b93a44a9ab96cd25e8f0a2c6e2bb9d2
const SEED_DOC_IDS: Record<string, string> = {
  'host-default-srv-win-defend-01':
    '8956913254bdbf2d6070b7cfc851c691f653b150050013b4bea74c9f9b93457f',
  'host-default-srv-linux-web-02':
    '1d3a97ba8f44d13e1c6e249923b7994d14c7f36e5223d29832113403c0d24a6c',
  'host-default-srv-mac-dev-03': 'c7d2277442521af9efbf039522b13067d5444d1dbdb890a1e759ff5527553ed9',
  'user-default-SYSTEM-srv-win-defend-01':
    '4e1e3960d8231ed8b67f2f3788f4a5602b93a44a9ab96cd25e8f0a2c6e2bb9d2',
};

interface SeedOptions {
  esClient: EsClient;
  kbnClient: KbnClient;
  log: ToolingLog;
}

async function ensureIndexWithDocs(
  esClient: EsClient,
  index: string,
  docs: Array<Record<string, unknown>>,
  log: ToolingLog,
  markerId: string
): Promise<void> {
  const marker = await esClient.exists({ index, id: markerId }).catch(() => ({ body: false }));
  // exists() throws on missing index; treat that as "not seeded"
  if (marker && (marker as { body?: boolean }).body === true) {
    log.info(`[env-seed] ${index} already seeded, skipping`);
    return;
  }
  await esClient.indices.create({ index }).catch((err) => {
    // 400 resource_already_exists is fine (concurrent boot)
    const status =
      (err as { statusCode?: number })?.statusCode ??
      (err as { meta?: { statusCode?: number } })?.meta?.statusCode;
    if (status !== 400) throw err;
  });
  // The bulk can transiently fail right after boot (ES still initializing,
  // index going yellow, master flap). A single-shot failure here kills the
  // whole eval attempt (~60min of model work on slow models), so retry the
  // seed with backoff instead of letting a 5-second blip fail the run.
  const bulkOperations = [
    ...docs.flatMap((doc) => [{ create: {} }, doc] as const),
    // marker doc so idempotent reruns skip
    { create: { _id: markerId } },
    { seeded: true, seeded_at: new Date().toISOString() },
  ];
  const MAX_SEED_ATTEMPTS = 5;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_SEED_ATTEMPTS; attempt++) {
    try {
      await esClient.bulk({
        index,
        refresh: 'wait_for',
        operations: bulkOperations,
      });
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err;
      const isLast = attempt === MAX_SEED_ATTEMPTS;
      log.warning(
        `[env-seed] bulk into ${index} failed (attempt ${attempt}/${MAX_SEED_ATTEMPTS}): ${String(
          err
        )}`
      );
      if (isLast) throw err;
      await new Promise((r) => setTimeout(r, attempt * 10_000));
    }
  }
  if (lastError !== undefined) throw lastError;
  log.info(`[env-seed] seeded ${docs.length} docs into ${index}`);
}

export async function seedPersonaMatrixEnvironment({
  esClient,
  kbnClient,
  log,
}: SeedOptions): Promise<void> {
  const markerId = 'persona-matrix-env-seed-v1';

  // A2: endpoint process telemetry with the log.dll side-load evidence.
  //
  // Fixture density matters here: a bare 3-doc evidence-only index made every
  // model's legitimate first move (a 30d baseline / 24h window ESQL query)
  // return empty, burning 6+ diagnostic tool calls rediscovering what data
  // exists (observed on every model in the matrix, worst on slow ones).
  // Seeded shape:
  //   - ~40 benign baseline process events spread over the last 30 days for
  //     HOST and two neighbors, timestamps computed relative to seed time so
  //     the fixture never rots.
  //   - The malicious chain stamped ~50 minutes ago, i.e. inside any sane
  //     recent-activity window, and anomalous against the baseline by
  //     construction (SYSTEM user, Users\Public path, unsigned DLL).
  const now = Date.now();
  const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();
  const daysAgo = (d: number, jitterMin = 0) =>
    new Date(now - d * 86_400_000 - jitterMin * 60_000).toISOString();

  const benignExecutables = [
    { name: 'svchost.exe', exe: 'C:\\Windows\\System32\\svchost.exe', user: 'SYSTEM' },
    {
      name: 'MsMpEng.exe',
      exe: 'C:\\Program Files\\Windows Defender\\MsMpEng.exe',
      user: 'SYSTEM',
    },
    { name: 'RuntimeBroker.exe', exe: 'C:\\Windows\\System32\\RuntimeBroker.exe', user: 'DANEL' },
    {
      name: 'chrome.exe',
      exe: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      user: 'DANEL',
    },
    {
      name: 'powershell.exe',
      exe: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      user: 'DANEL',
    },
  ];
  const baselineHosts = [HOST, 'srv-linux-web-02', 'srv-mac-dev-03'];
  const baselineDocs: Array<Record<string, unknown>> = [];
  benignExecutables.forEach((bin, i) => {
    baselineHosts.forEach((host, j) => {
      // ~13 events per host over 30 days: enough for COUNT/STATS baselines,
      // small enough to keep the seed bulk cheap.
      for (let k = 0; k < 3; k++) {
        const day = 1 + ((i * 7 + j * 3 + k * 5) % 29); // deterministic spread 1..29 days ago
        baselineDocs.push({
          '@timestamp': daysAgo(day, i * 10 + j * 5 + k),
          'event.category': ['process'],
          'event.type': ['start'],
          'event.dataset': 'endpoint.events.process',
          'host.name': host,
          'user.name': bin.user,
          'process.name': bin.name,
          'process.executable': bin.exe,
          'process.parent.name': host === HOST ? 'services.exe' : 'init',
          'process.command_line': `"${bin.exe}"`,
        });
      }
    });
  });

  await ensureIndexWithDocs(
    esClient,
    ENDPOINT_INDEX,
    [
      ...baselineDocs,
      {
        '@timestamp': minutesAgo(50),
        'event.category': ['process'],
        'event.type': ['start'],
        'event.dataset': 'endpoint.events.process',
        'host.name': HOST,
        'user.name': 'SYSTEM',
        'process.name': 'BluetoothService.exe',
        'process.executable': 'C:\\Windows\\BluetoothService.exe',
        'process.parent.name': 'services.exe',
        'process.command_line': 'C:\\Windows\\BluetoothService.exe -embed',
      },
      {
        '@timestamp': minutesAgo(49),
        'event.category': ['file'],
        'event.type': ['creation'],
        'event.dataset': 'endpoint.events.file',
        'host.name': HOST,
        'user.name': 'SYSTEM',
        'process.name': 'BluetoothService.exe',
        'file.name': 'log.dll',
        'file.path': 'C:\\Users\\Public\\log.dll',
        'file.hash.sha256': CHRYSALIS_HASH,
        'file.code_signature.status': 'unsigned',
      },
      {
        '@timestamp': minutesAgo(48),
        'event.category': ['dll'],
        'event.type': ['start'],
        'event.action': 'dll_loaded',
        'event.dataset': 'endpoint.events.library',
        'host.name': HOST,
        'process.name': 'BluetoothService.exe',
        'dll.name': 'log.dll',
        'dll.path': 'C:\\Users\\Public\\log.dll',
        'process.executable': 'C:\\Windows\\BluetoothService.exe',
      },
    ],
    log,
    markerId
  );

  // A3: Elastic Security Labs research entry so security_labs_search returns content.
  await ensureIndexWithDocs(
    esClient,
    LABS_INDEX,
    [
      {
        '@timestamp': '2026-07-14T00:00:00.000Z',
        title: 'Chrysalis backdoor: DLL side-loading via BluetoothService.exe',
        'security_labs.id': 'SL-2026-0142',
        'security_labs.tags': ['malware', 'chrysalis', 'dll-side-loading'],
        'security_labs.threat_technique_id': 'T1574.002',
        'security_labs.ioc.hash.sha256': [CHRYSALIS_HASH],
        'security_labs.ioc.file.name': ['log.dll'],
        'security_labs.ioc.process.name': ['BluetoothService.exe'],
        content:
          `Elastic Security Labs tracks the Chrysalis backdoor as side-loading log.dll ` +
          `(sha256 ${CHRYSALIS_HASH}) from a world-writable path via the legitimate BluetoothService.exe binary. ` +
          `The hash is a known-bad indicator: flagged by 45/72 vendors on VirusTotal at ` +
          `time of research. Recommended detection: DLL load from C:\\Users\\Public by a ` +
          `service binary (T1574.002).`,
      },
    ],
    log,
    markerId
  );

  // A1: mock VirusTotal verdict so the stubbed virustotal_lookup tool returns a
  // coherent answer. VirusTotal itself is NOT part of the stack — this index is
  // the eval-only stub the tool queries.
  await ensureIndexWithDocs(
    esClient,
    TI_INDEX,
    [
      {
        '@timestamp': '2026-07-20T00:00:00.000Z',
        'threat_intel.provider': 'virustotal-mock',
        'threat_intel.indicator.type': 'hash.sha256',
        'threat_intel.indicator.value': CHRYSALIS_HASH,
        'threat_intel.verdict': 'malicious',
        'threat_intel.detection_ratio': '45/72',
        'threat_intel.classification': 'trojan/chrysalis',
        'threat_intel.first_seen': '2026-07-02T00:00:00.000Z',
      },
    ],
    log,
    markerId
  );

  // A4: Entity Store V2 engines + entities in the latest alias so entity
  // lookups return data. Entity Analytics Agent Builder tools gate on the
  // `entities-latest-<space>` alias existing (entity_analytics_availability),
  // which only the installed V2 engines create — a bare `.entities-v1` index
  // (previous seed) satisfies no gate and leaves every tool unavailable.
  // Pattern ported from kbn-evals-suite-entity-analytics setup_helpers.
  try {
    // Warm-stack fast path: engines already installed and running from a
    // previous run — skip straight to re-seeding docs.
    const initial = (await kbnClient.request({
      method: 'GET',
      path: '/api/security/entity_store/status',
    })) as unknown as { data?: { status?: string } };
    if (initial.data?.status !== 'running') {
      log.info(`[env-seed] installing entity store v2`);
      // Fire-and-poll: on a cold cluster the install endpoint can hold the
      // connection open for the entire transform-init duration (observed
      // >9 min, wedging beforeAll past any await deadline). The status poll
      // below is the real completion signal.
      kbnClient
        .request({
          method: 'POST',
          path: '/api/security/entity_store/install',
          body: { entityTypes: ['user', 'host'] },
        })
        .catch((err) => log.warning(`[env-seed] entity store install call errored: ${err}`));
      // First-install on a cold stack initializes ES transforms and can take
      // several minutes (observed >120s locally); the entity-analytics suite
      // helper defaults to the same poll but is equally tunable.
      const deadline = Date.now() + 600_000;
      for (;;) {
        const statusRes = (await kbnClient.request({
          method: 'GET',
          path: '/api/security/entity_store/status',
        })) as unknown as { data?: { status?: string } };
        const body = statusRes.data;
        // Visible poll progress: a silent loop here previously masked a
        // response-shape bug for entire runs.
        log.info(`[env-seed] entity store status: ${body?.status ?? 'unknown'}`);
        if (body?.status === 'running') break;
        if (body?.status === 'error') {
          throw new Error(`entity store v2 error state: ${JSON.stringify(body)}`);
        }
        if (Date.now() > deadline) {
          throw new Error('entity store v2 did not reach running within 600s');
        }
        await new Promise((r) => setTimeout(r, 2_000));
      }
    }
    log.info(`[env-seed] entity store v2 running`);

    const latestAlias = 'entities-latest-default';
    const seededAt = new Date().toISOString();
    const seedEntities = [
      {
        euid: `host-default-${HOST}`,
        type: 'host',
        name: HOST,
        riskLevel: 'high' as const,
        riskScoreNorm: 73,
        assetCriticality: 'high_impact' as const,
      },
      {
        euid: 'host-default-srv-linux-web-02',
        type: 'host',
        name: 'srv-linux-web-02',
        riskLevel: 'medium' as const,
        riskScoreNorm: 41,
        assetCriticality: 'normal' as const,
      },
      {
        euid: 'host-default-srv-mac-dev-03',
        type: 'host',
        name: 'srv-mac-dev-03',
        riskLevel: 'low' as const,
        riskScoreNorm: 18,
        assetCriticality: 'normal' as const,
      },
      {
        euid: `user-default-SYSTEM-${HOST}`,
        type: 'user',
        name: 'SYSTEM',
        riskLevel: 'critical' as const,
        riskScoreNorm: 88,
        assetCriticality: 'high_impact' as const,
      },
    ];
    const operations = seedEntities.flatMap((e) => {
      const doc: Record<string, unknown> = {
        '@timestamp': seededAt,
        entity: {
          id: e.euid,
          EngineMetadata: { Type: e.type },
          risk: {
            calculated_level: e.riskLevel,
            calculated_score_norm: e.riskScoreNorm,
          },
        },
        [e.type]: { name: e.name },
        asset: { criticality: e.assetCriticality },
      };
      const seedDocId = SEED_DOC_IDS[e.euid];
      if (!seedDocId) {
        throw new Error(
          `No precomputed doc id for ${e.euid} — add its sha256 to SEED_DOC_IDS in env_seeds.ts`
        );
      }
      return [{ index: { _index: latestAlias, _id: seedDocId } }, doc] as const;
    });
    await esClient.bulk({ refresh: true, operations });
    log.info(`[env-seed] seeded ${seedEntities.length} entities into ${latestAlias}`);
  } catch (err) {
    // Non-fatal by design (same contract as the watchlist seed): a missing
    // entity store degrades entity-analytics coverage but the suite still
    // measures the other six categories.
    log.warning(`[env-seed] entity store v2 seed failed (non-fatal): ${err}`);
  }

  // A5: on-call schedule so on_call_lookup (re-pointed at this index) can answer
  // "who is on call". The original run queried a dedicated on-call-schedule
  // index; without it the tool queried the alerts index, which has no responder
  // data, making workflow-execution-b structurally unanswerable.
  await ensureIndexWithDocs(
    esClient,
    ONCALL_INDEX,
    [
      {
        '@timestamp': '2026-07-21T00:00:00.000Z',
        name: 'Dana Whitfield',
        email: 'dana.whitfield@example.com',
        slack_handle: '@dana-w',
        shift_start: '2026-07-20T00:00:00.000Z',
        shift_end: '2026-07-27T00:00:00.000Z',
        is_primary: true,
        escalation_tier: 'primary',
      },
      {
        '@timestamp': '2026-07-21T00:00:00.000Z',
        name: 'Ravi Osei',
        email: 'ravi.osei@example.com',
        slack_handle: '@ravi-o',
        shift_start: '2026-07-20T00:00:00.000Z',
        shift_end: '2026-07-27T00:00:00.000Z',
        is_primary: false,
        escalation_tier: 'secondary',
      },
    ],
    log,
    markerId
  );

  // A4b: watchlist via saved object (kbnClient) — find API on the tankers type.
  try {
    await kbnClient.request({
      method: 'POST',
      path: '/api/security/watchlists',
      body: {
        name: 'Privileged Users',
        description: 'persona-matrix seed: privileged user monitoring watchlist',
        filters: [{ field: 'user.name', value: 'SYSTEM' }],
      },
    });
    log.info(`[env-seed] created watchlist 'Privileged Users'`);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 409) {
      log.info(`[env-seed] watchlist already exists, reusing`);
    } else {
      // Watchlist API shape may differ across versions; a missing watchlist
      // degrades entity-analytics coverage but must not fail the suite.
      log.warning(`[env-seed] watchlist seed failed (non-fatal): ${err}`);
    }
  }
  void WATCHLIST_SO_TYPE;
}

export async function cleanupEnvSeeds({ esClient, log }: SeedOptions): Promise<void> {
  // entities-latest-default is owned by the Entity Store V2 engines and
  // outlives the run on purpose — uninstalling it would take the engine state
  // with it. Plain seed indices are deleted idempotently.
  for (const index of [ENDPOINT_INDEX, LABS_INDEX, TI_INDEX]) {
    await esClient.indices.delete({ index }).catch(() => {
      log.info(`[env-seed] cleanup: ${index} already gone`);
    });
  }
}
