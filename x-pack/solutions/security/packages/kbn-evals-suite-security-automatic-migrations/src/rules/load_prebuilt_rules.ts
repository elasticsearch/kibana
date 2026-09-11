/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { prebuiltRules } from './data_set';

/**
 * The index the rule-migration agent's `searchPrebuiltRules` tool queries via
 * `RuleMigrationsDataPrebuiltRulesClient#search` (see `getAdapterIndexName('prebuiltrules')` in
 * `rule_migrations_data_service.ts`, `baseIndexName = '.kibana-siem-rule-migrations'`). It is not
 * space-scoped, so this single constant covers every space.
 *
 * On a Scout-managed eval stack the `security_detection_engine` Fleet package is not installed
 * (see the "Known environment gap" note in `../../reports/rule-migration-v1-baseline.md`), so this
 * index normally has 0 documents and no `prebuilt_match` example can ever find a real candidate.
 * `RuleMigrationsDataPrebuiltRulesClient#populate` only ever *adds* documents sourced from
 * installed `security-rule` assets, so it is a no-op with the package missing — it will not
 * overwrite or clear anything loaded here directly.
 */
const PREBUILT_RULES_INDEX = '.kibana-siem-rule-migrations-prebuiltrules';

/**
 * Loads the handful of real prebuilt rules in `./data_set` (split by vendor) referenced by the
 * `prebuilt_match` dataset fixtures directly into the semantic-search index, so `searchPrebuiltRules`
 * can find genuine candidates even when the eval stack doesn't have the `security_detection_engine`
 * Fleet package installed.
 *
 * Idempotent (uses `rule_id` as the document `_id` with `doc_as_upsert`) and safe to call once per
 * worker — see the `prebuiltRulesLoaded` fixture in `../../evaluate.ts`.
 */
export async function loadPrebuiltRules(esClient: Client, log: ToolingLog): Promise<void> {
  const createdAt = new Date().toISOString();

  const response = await esClient.bulk(
    {
      refresh: 'wait_for',
      operations: prebuiltRules.flatMap((rule) => [
        { update: { _index: PREBUILT_RULES_INDEX, _id: rule.ruleId } },
        {
          doc: {
            rule_id: rule.ruleId,
            name: rule.name,
            description: rule.description,
            elser_embedding: `${rule.name} - ${rule.description}`,
            ...(rule.mitreAttackIds?.length ? { mitre_attack_ids: rule.mitreAttackIds } : {}),
            '@timestamp': createdAt,
          },
          doc_as_upsert: true,
        },
      ]),
    },
    // ELSER inference for `elser_embedding` (a `semantic_text` field) runs synchronously as part
    // of the bulk write, so this needs more headroom than the client's default request timeout —
    // mirrors the product code's own `populate()` timeout in
    // `rule_migrations_data_prebuilt_rules_client.ts`.
    { requestTimeout: 2 * 60 * 1000 }
  );

  if (response.errors) {
    const reason = response.items.find((item) => item.update?.error)?.update?.error?.reason;
    throw new Error(`Failed to load prebuilt-rule fixtures: ${reason ?? 'unknown error'}`);
  }

  log.info(
    `[loadPrebuiltRules] Loaded ${prebuiltRules.length} real prebuilt rules into ${PREBUILT_RULES_INDEX} for eval fixtures to match against.`
  );
}
