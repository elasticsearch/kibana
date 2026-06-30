export declare const technicalRuleFieldMap: {
    readonly "kibana.alert.severity": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.risk_score": {
        readonly type: "float";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.workflow_status_updated_at": {
        readonly type: "date";
        readonly array: false;
        readonly required: false;
    };
    readonly "ecs.version": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
        readonly ignore_above: 1024;
    };
    readonly "kibana.alert.rule.author": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.created_at": {
        readonly type: "date";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.created_by": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.description": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.enabled": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.from": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.interval": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.license": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.note": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.references": {
        readonly type: "keyword";
        readonly array: true;
        readonly required: false;
    };
    readonly "kibana.alert.rule.rule_id": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.rule_name_override": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.to": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.type": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.updated_at": {
        readonly type: "date";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.updated_by": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.version": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.suppression.docs_count": {
        readonly type: "long";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.suppression.end": {
        readonly type: "date";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.suppression.start": {
        readonly type: "date";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.suppression.terms.field": {
        readonly type: "keyword";
        readonly array: true;
        readonly required: false;
    };
    readonly "kibana.alert.suppression.terms.value": {
        readonly type: "keyword";
        readonly array: true;
        readonly required: false;
    };
    readonly "kibana.alert.system_status": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.workflow_reason": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.workflow_user": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly tags: {
        readonly type: "keyword";
        readonly array: true;
        readonly required: false;
        readonly ignore_above: 1024;
    };
    readonly "@timestamp": {
        readonly type: "date";
        readonly required: true;
        readonly array: false;
    };
    readonly "kibana.alert.action_group": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.case_ids": {
        readonly type: "keyword";
        readonly array: true;
        readonly required: false;
    };
    readonly "kibana.alert.duration.us": {
        readonly type: "long";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.end": {
        readonly type: "date";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.flapping": {
        readonly type: "boolean";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.flapping_history": {
        readonly type: "boolean";
        readonly array: true;
        readonly required: false;
    };
    readonly "kibana.alert.maintenance_window_ids": {
        readonly type: "keyword";
        readonly array: true;
        readonly required: false;
    };
    readonly "kibana.alert.maintenance_window_names": {
        readonly type: "keyword";
        readonly array: true;
        readonly required: false;
    };
    readonly "kibana.alert.consecutive_matches": {
        readonly type: "long";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.pending_recovered_count": {
        readonly type: "long";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.instance.id": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: true;
    };
    readonly "kibana.alert.last_detected": {
        readonly type: "date";
        readonly required: false;
        readonly array: false;
    };
    readonly "kibana.alert.previous_action_group": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.reason": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
        readonly multi_fields: import("@kbn/alerts-as-data-utils").MultiField[];
    };
    readonly "kibana.alert.rule.category": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: true;
    };
    readonly "kibana.alert.rule.consumer": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: true;
    };
    readonly "kibana.alert.rule.execution.timestamp": {
        readonly type: "date";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.execution.type": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.intended_timestamp": {
        readonly type: "date";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.execution.uuid": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.rule.name": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: true;
    };
    readonly "kibana.alert.rule.parameters": {
        readonly array: false;
        readonly type: "flattened";
        readonly ignore_above: 4096;
        readonly required: false;
    };
    readonly "kibana.alert.rule.producer": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: true;
    };
    readonly "kibana.alert.rule.revision": {
        readonly type: "long";
        readonly array: false;
        readonly required: true;
    };
    readonly "kibana.alert.rule.tags": {
        readonly type: "keyword";
        readonly array: true;
        readonly required: false;
    };
    readonly "kibana.alert.rule.rule_type_id": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: true;
    };
    readonly "kibana.alert.rule.uuid": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: true;
    };
    readonly "kibana.alert.severity_improving": {
        readonly type: "boolean";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.start": {
        readonly type: "date";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.status": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: true;
    };
    readonly "kibana.alert.time_range": {
        readonly type: "date_range";
        readonly format: "epoch_millis||strict_date_optional_time";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.updated_at": {
        readonly type: "date";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.updated_by.user.id": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.updated_by.user.name": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.url": {
        readonly type: "keyword";
        readonly array: false;
        readonly index: false;
        readonly required: false;
        readonly ignore_above: 2048;
    };
    readonly "kibana.alert.uuid": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: true;
    };
    readonly "kibana.alert.workflow_status": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.workflow_tags": {
        readonly type: "keyword";
        readonly array: true;
        readonly required: false;
    };
    readonly "kibana.alert.workflow_assignee_ids": {
        readonly type: "keyword";
        readonly array: true;
        readonly required: false;
    };
    readonly "kibana.alert.scheduled_action.date": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.scheduled_action.group": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.scheduled_action.throttling": {
        readonly type: "unmapped";
        readonly required: false;
    };
    readonly "event.action": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
        readonly ignore_above: 1024;
    };
    readonly "event.kind": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
        readonly ignore_above: 1024;
    };
    readonly "event.original": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
        readonly ignore_above: 32766;
    };
    readonly "data_stream.type": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "data_stream.dataset": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "data_stream.namespace": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.space_ids": {
        readonly type: "keyword";
        readonly array: true;
        readonly required: true;
    };
    readonly "kibana.cps_scope.expression": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.cps_scope.linked_projects": {
        readonly type: "flattened";
        readonly array: true;
        readonly required: false;
    };
    readonly "kibana.version": {
        readonly type: "version";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.index_pattern": {
        readonly type: "keyword";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.muted": {
        readonly type: "boolean";
        readonly array: false;
        readonly required: false;
    };
    readonly "kibana.alert.state": {
        readonly type: "unmapped";
        readonly array: false;
        readonly required: false;
    };
};
export type TechnicalRuleFieldMap = typeof technicalRuleFieldMap;
