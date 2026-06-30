import type { SecurityAttackDiscoveryAlert } from '@kbn/alerts-as-data-utils';
import type { ALERT_WORKFLOW_STATUS_UPDATED_AT } from '@kbn/rule-data-utils';
import type { ALERT_ATTACK_DISCOVERY_API_CONFIG, ALERT_ATTACK_DISCOVERY_REPLACEMENTS, ALERT_ATTACK_DISCOVERY_USERS } from './field_names';
/**
 * This is a WORKAROUND until the `createSchemaFromFieldMap` can handle complex mappings.
 * Right now that tool cannot properly handle the combination of optional and required fields within the same nested/object field type.
 * Instead of creating an intersection type it generates a separate fields in required and optional sections as separate flattened fields.
 * As a workaround, we strip out incorrectly generated fields and re-add them in a correct format.
 */
export type AttackDiscoveryAlertDocument = Omit<SecurityAttackDiscoveryAlert, 'kibana.alert.attack_discovery.api_config' | 'kibana.alert.attack_discovery.api_config.action_type_id' | 'kibana.alert.attack_discovery.api_config.connector_id' | 'kibana.alert.attack_discovery.api_config.model' | 'kibana.alert.attack_discovery.api_config.name' | 'kibana.alert.attack_discovery.api_config.provider' | 'kibana.alert.attack_discovery.replacements' | 'kibana.alert.attack_discovery.replacements.value' | 'kibana.alert.attack_discovery.replacements.uuid' | 'kibana.alert.attack_discovery.users' | 'kibana.alert.attack_discovery.users.id' | 'kibana.alert.attack_discovery.users.name'> & {
    [ALERT_ATTACK_DISCOVERY_API_CONFIG]: {
        action_type_id: string;
        connector_id: string;
        model?: string;
        name: string;
        provider?: string;
    };
    [ALERT_ATTACK_DISCOVERY_REPLACEMENTS]?: Array<{
        value: string;
        uuid: string;
    }>;
    [ALERT_ATTACK_DISCOVERY_USERS]?: Array<{
        id?: string;
        name: string;
    }>;
    [ALERT_WORKFLOW_STATUS_UPDATED_AT]?: string;
};
