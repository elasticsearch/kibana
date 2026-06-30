import type { SavedObjectsBulkUpdateObject } from '@kbn/core/server';
import type { RawRule } from '../../types';
import type { UiamApiKeyByRuleId } from '../types';
/**
 * Builds the bulk update payload for writing UIAM API keys onto rule saved objects.
 *
 * `alert` is a `multiple-isolated` saved object type, but the SOR write client used
 * by the provisioning task is scoped to the default namespace. Without a per-object
 * `namespace`, the SOR's preflight check rejects rules that live in any other space
 * with a `Saved object [alert/<id>] not found` error even though the document exists
 * in the index. Setting `namespace` per object makes the SOR target the rule's
 * actual space.
 */
export declare const buildRuleUpdatesForUiam: (rulesWithUiamApiKeys: Array<UiamApiKeyByRuleId>) => Array<SavedObjectsBulkUpdateObject<RawRule>>;
