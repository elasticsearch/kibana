import type { IlmPolicy } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
/**
 * Default ILM policy for `.kibana_change_history`.
 *
 * Indefinite retention: a single `hot` phase with no actions (no rollover, no
 * delete). The policy exists as an edit point so cluster admins can introduce
 * rollover / retention through the Kibana ILM UI or the Elasticsearch ILM API
 * without Kibana having to redeploy.
 */
export declare const ILM_POLICY: IlmPolicy;
/**
 * Install the change history ILM policy iff it does not already exist.
 *
 * Calling `putLifecycle` unconditionally would silently overwrite any admin
 * customization on every Kibana startup, which contradicts the "admins can
 * edit the policy in place" guarantee documented in the package README.
 */
export declare function ensureIlmPolicy(elasticsearchClient: ElasticsearchClient, logger: Logger): Promise<void>;
