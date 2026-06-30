import type { estypes } from '@elastic/elasticsearch';
import { ES_FIELD_TYPES } from '@kbn/field-types';
import type { ML_JOB_AGGREGATION, KIBANA_AGGREGATION, ES_AGGREGATION } from './aggregation_types';
/**
 * EVENT_RATE_FIELD_ID
 */
export declare const EVENT_RATE_FIELD_ID = "__ml_event_rate_count__";
/**
 * METRIC_AGG_TYPE
 */
export declare const METRIC_AGG_TYPE = "metrics";
/**
 * Field id
 */
export type FieldId = string;
/**
 * AggId is an alias of ML_JOB_AGGREGATION
 */
export type AggId = ML_JOB_AGGREGATION;
/**
 * Split field can be Field or null.
 */
export type SplitField = Field | null;
/**
 * Field definition
 */
export interface Field {
    /**
     * The field id
     */
    id: FieldId;
    /**
     * The field name
     */
    name: string;
    /**
     * The field type is based on ES field types.
     */
    type: ES_FIELD_TYPES;
    /**
     * Flag whether the field is aggregatable.
     */
    aggregatable: boolean;
    /**
     * Flag for counter.
     */
    counter: boolean;
    /**
     * Optional array of AggId.
     */
    aggIds?: AggId[];
    /**
     * Optional array fo aggregations.
     */
    aggs?: Aggregation[];
    /**
     * Optional runtime field.
     */
    runtimeField?: estypes.MappingRuntimeField;
}
/**
 * Aggregation definition.
 */
export interface Aggregation {
    /**
     * The aggregation id.
     */
    id: AggId;
    /**
     * The aggregation title.
     */
    title: string;
    /**
     * The Kibana name for the aggregation.
     */
    kibanaName: KIBANA_AGGREGATION | null;
    /**
     * The ES DSL name for the aggregation.
     */
    dslName: ES_AGGREGATION | null;
    /**
     * The metric agg type.
     */
    type: typeof METRIC_AGG_TYPE;
    /**
     * The model plot agg definition.
     */
    mlModelPlotAgg: {
        min: string;
        max: string;
    };
    /**
     * Optional array of field ids.
     */
    fieldIds?: FieldId[];
    /**
     * Optional array or fields.
     */
    fields?: Field[];
}
/**
 * Job caps for a new job.
 */
export interface NewJobCaps {
    /**
     * Array of fields.
     */
    fields: Field[];
    /**
     * Array of aggregations.
     */
    aggs: Aggregation[];
}
/**
 * Job caps response for a new job.
 */
export interface NewJobCapsResponse {
    /**
     * Index pattern
     */
    [indexPattern: string]: NewJobCaps;
}
/**
 * Definition for a pair of aggregation and field.
 */
export interface AggFieldPair {
    /**
     * The aggregation.
     */
    agg: Aggregation;
    /**
     * The field.
     */
    field: Field;
    /**
     * Optional by-field configuration.
     */
    by?: {
        field: SplitField;
        value: string | null;
    };
    /**
     * Optional over-field configuration
     */
    over?: {
        field: SplitField;
        value: string | null;
    };
    /**
     * Optional partition field configuration
     */
    partition?: {
        field: SplitField;
        value: string | null;
    };
    /**
     * Optional exclude frequent.
     */
    excludeFrequent?: string;
}
/**
 * Definition for a pair of aggregation and field name.
 */
export interface AggFieldNamePair {
    /**
     * The aggregation definition.
     */
    agg: string;
    /**
     * The field name
     */
    field: string;
    /**
     * Optional by-field configuration
     */
    by?: {
        field: string | null;
        value: string | null;
    };
    /**
     * Optional over-field configuration
     */
    over?: {
        field: string | null;
        value: string | null;
    };
    /**
     * Optional partition-field configuration
     */
    partition?: {
        field: string | null;
        value: string | null;
    };
    /**
     * Optional exclude frequent.
     */
    excludeFrequent?: string;
}
/**
 * Definition for an ml category.
 */
export declare const mlCategory: Field;
/**
 * Rollup fields are a nested record of field ids and ES aggregations.
 */
export type RollupFields = Record<FieldId, [Record<'agg', ES_AGGREGATION>]>;
