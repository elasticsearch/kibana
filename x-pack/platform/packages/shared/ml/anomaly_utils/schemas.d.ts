import { ML_ENTITY_FIELD_TYPE } from './anomaly_utils';
export declare const influencerSchema: import("@kbn/config-schema").ObjectType<{
    fieldName: import("@kbn/config-schema").Type<string>;
    fieldValue: import("@kbn/config-schema").AnyType;
}>;
export declare const criteriaFieldSchema: import("@kbn/config-schema").ObjectType<{
    fieldName: import("@kbn/config-schema").Type<string>;
    fieldValue: import("@kbn/config-schema").AnyType;
    fieldType: import("@kbn/config-schema").Type<ML_ENTITY_FIELD_TYPE | undefined>;
}>;
export declare const mlEntityFieldValueSchema: import("@kbn/config-schema").Type<string | number>;
export declare const mlEntityFieldSchema: import("@kbn/config-schema").ObjectType<{
    fieldName: import("@kbn/config-schema").Type<string>;
    fieldValue: import("@kbn/config-schema").Type<string | number | undefined>;
    fieldType: import("@kbn/config-schema").Type<ML_ENTITY_FIELD_TYPE | undefined>;
    operation: import("@kbn/config-schema").Type<"-" | "+" | undefined>;
    cardinality: import("@kbn/config-schema").Type<number | undefined>;
}>;
