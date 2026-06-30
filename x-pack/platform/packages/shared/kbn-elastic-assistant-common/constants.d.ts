export declare const ELASTIC_AI_ASSISTANT_URL = "/api/security_ai_assistant";
export declare const ELASTIC_AI_ASSISTANT_INTERNAL_URL = "/internal/elastic_assistant";
export declare const UPDATE_ANONYMIZATION_FIELDS_URL: "/internal/elastic_assistant/update_anonymization_fields";
export declare const POST_ACTIONS_CONNECTOR_EXECUTE: "/internal/elastic_assistant/actions/connector/{connectorId}/_execute";
export declare const ELASTIC_AI_ASSISTANT_CONVERSATIONS_URL: "/api/security_ai_assistant/current_user/conversations";
export declare const ELASTIC_AI_ASSISTANT_CONVERSATIONS_URL_BY_ID: "/api/security_ai_assistant/current_user/conversations/{id}";
export declare const ELASTIC_AI_ASSISTANT_INTERNAL_CONVERSATIONS_URL: "/internal/elastic_assistant/current_user/conversations";
export declare const ELASTIC_AI_ASSISTANT_CONVERSATIONS_URL_BY_ID_MESSAGES: "/internal/elastic_assistant/current_user/conversations/{id}/messages";
export declare const ELASTIC_AI_ASSISTANT_CHAT_COMPLETE_URL: "/api/security_ai_assistant/chat/complete";
export declare const ELASTIC_AI_ASSISTANT_CONVERSATIONS_URL_BULK_ACTION: "/internal/elastic_assistant/current_user/conversations/_bulk_action";
export declare const ELASTIC_AI_ASSISTANT_CONVERSATIONS_URL_FIND: "/api/security_ai_assistant/current_user/conversations/_find";
export declare const ELASTIC_AI_ASSISTANT_PROMPTS_URL: "/api/security_ai_assistant/prompts";
export declare const ELASTIC_AI_ASSISTANT_PROMPTS_URL_BULK_ACTION: "/api/security_ai_assistant/prompts/_bulk_action";
export declare const ELASTIC_AI_ASSISTANT_PROMPTS_URL_FIND: "/api/security_ai_assistant/prompts/_find";
export declare const ELASTIC_AI_ASSISTANT_ANONYMIZATION_FIELDS_URL: "/api/security_ai_assistant/anonymization_fields";
export declare const ELASTIC_AI_ASSISTANT_ANONYMIZATION_FIELDS_URL_BULK_ACTION: "/api/security_ai_assistant/anonymization_fields/_bulk_action";
export declare const ELASTIC_AI_ASSISTANT_ANONYMIZATION_FIELDS_URL_FIND: "/api/security_ai_assistant/anonymization_fields/_find";
export declare const ELASTIC_AI_ASSISTANT_KNOWLEDGE_BASE_URL: "/api/security_ai_assistant/knowledge_base/{resource?}";
export declare const ELASTIC_AI_ASSISTANT_KNOWLEDGE_BASE_ENTRIES_URL: "/api/security_ai_assistant/knowledge_base/entries";
export declare const ELASTIC_AI_ASSISTANT_KNOWLEDGE_BASE_ENTRIES_URL_BY_ID: "/api/security_ai_assistant/knowledge_base/entries/{id}";
export declare const ELASTIC_AI_ASSISTANT_KNOWLEDGE_BASE_ENTRIES_URL_FIND: "/api/security_ai_assistant/knowledge_base/entries/_find";
export declare const ELASTIC_AI_ASSISTANT_KNOWLEDGE_BASE_ENTRIES_URL_BULK_ACTION: "/api/security_ai_assistant/knowledge_base/entries/_bulk_action";
export declare const ELASTIC_AI_ASSISTANT_EVALUATE_URL: "/internal/elastic_assistant/evaluate";
export declare const ELASTIC_AI_ASSISTANT_ALERT_SUMMARY_URL: "/internal/elastic_assistant/alert_summary";
export declare const ELASTIC_AI_ASSISTANT_ALERT_SUMMARY_URL_BULK_ACTION: "/internal/elastic_assistant/alert_summary/_bulk_action";
export declare const ELASTIC_AI_ASSISTANT_ALERT_SUMMARY_URL_FIND: "/internal/elastic_assistant/alert_summary/_find";
export declare const ELASTIC_AI_ASSISTANT_SECURITY_AI_PROMPTS_URL: "/api/security_ai_assistant/security_ai_prompts";
export declare const ELASTIC_AI_ASSISTANT_SECURITY_AI_PROMPTS_URL_FIND: "/api/security_ai_assistant/security_ai_prompts/_find";
export declare const ELASTIC_USERS_SUGGEST_URL: "/internal/elastic_assistant/users/_suggest";
export declare const DEFEND_INSIGHTS_ID = "defend-insights";
export declare const DEFEND_INSIGHTS = "/internal/elastic_assistant/defend_insights";
export declare const DEFEND_INSIGHTS_BY_ID = "/internal/elastic_assistant/defend_insights/{id}";
export declare const ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID: "attack-discovery";
export declare const ATTACK_DISCOVERY_SCHEDULES_CONSUMER_ID: "siem";
export declare const ATTACK_DISCOVERY = "/api/attack_discovery";
export declare const ATTACK_DISCOVERY_BULK: "/api/attack_discovery/_bulk";
export declare const ATTACK_DISCOVERY_FIND: "/api/attack_discovery/_find";
export declare const ATTACK_DISCOVERY_GENERATE: "/api/attack_discovery/_generate";
export declare const ATTACK_DISCOVERY_GENERATIONS: "/api/attack_discovery/generations";
export declare const ATTACK_DISCOVERY_GENERATIONS_BY_ID: "/api/attack_discovery/generations/{execution_uuid}";
export declare const ATTACK_DISCOVERY_GENERATIONS_BY_ID_DISMISS: "/api/attack_discovery/generations/{execution_uuid}/_dismiss";
export declare const ATTACK_DISCOVERY_SCHEDULES: "/api/attack_discovery/schedules";
export declare const ATTACK_DISCOVERY_SCHEDULES_BY_ID: "/api/attack_discovery/schedules/{id}";
export declare const ATTACK_DISCOVERY_SCHEDULES_BY_ID_ENABLE: "/api/attack_discovery/schedules/{id}/_enable";
export declare const ATTACK_DISCOVERY_SCHEDULES_BY_ID_DISABLE: "/api/attack_discovery/schedules/{id}/_disable";
export declare const ATTACK_DISCOVERY_SCHEDULES_BULK_ENABLE: "/api/attack_discovery/schedules/_bulk_enable";
export declare const ATTACK_DISCOVERY_SCHEDULES_BULK_DISABLE: "/api/attack_discovery/schedules/_bulk_disable";
export declare const ATTACK_DISCOVERY_SCHEDULES_BULK_DELETE: "/api/attack_discovery/schedules/_bulk_delete";
export declare const ATTACK_DISCOVERY_SCHEDULES_FIND: "/api/attack_discovery/schedules/_find";
export declare const ATTACK_DISCOVERY_INTERNAL: "/internal/elastic_assistant/attack_discovery";
export declare const ATTACK_DISCOVERY_INTERNAL_MISSING_PRIVILEGES: "/internal/elastic_assistant/attack_discovery/_missing_privileges";
/** A fake `kibana.alert.rule.uuid` for ad hock rules */
export declare const ATTACK_DISCOVERY_AD_HOC_RULE_ID: "attack_discovery_ad_hoc_rule_id";
/** A fake `kibana.alert.rule.rule_type_id` for ad hock rules */
export declare const ATTACK_DISCOVERY_AD_HOC_RULE_TYPE_ID: "attack_discovery_ad_hoc_rule_type_id";
/**
 * The common prefix for all (ad hoc and scheduled) Attack discovery alerts indices
 */
export declare const ATTACK_DISCOVERY_ALERTS_COMMON_INDEX_PREFIX: ".alerts-security.attack.discovery.alerts";
/**
 * The common prefix for ad hoc Attack discovery alerts indices
 */
export declare const ATTACK_DISCOVERY_ADHOC_ALERTS_COMMON_INDEX_PREFIX: ".adhoc.alerts-security.attack.discovery.alerts";
/**
 * This feature flag disables the InferenceChatModel feature.
 *
 * It may be overridden via the following setting in `kibana.yml` or `kibana.dev.yml`:
 * ```
 * feature_flags.overrides:
 *   securitySolution.inferenceChatModelDisabled: true
 * ```
 */
export declare const INFERENCE_CHAT_MODEL_DISABLED_FEATURE_FLAG: "securitySolution.inferenceChatModelDisabled";
export declare const ELASTIC_AI_ASSISTANT_CHECKPOINT_SAVER_ENABLED_FEATURE_FLAG: "elasticAssistant.checkpointSaverEnabled";
export declare const ASSISTANT_INTERRUPTS_ENABLED_FEATURE_FLAG: "securitySolution.assistantInterruptsEnabled";
