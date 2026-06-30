import type { TypeOf } from '@kbn/config-schema';
export declare const trackingContainmentRuleParamsSchema: import("@kbn/config-schema").ObjectType<{
    index: import("@kbn/config-schema").Type<string>;
    indexId: import("@kbn/config-schema").Type<string>;
    geoField: import("@kbn/config-schema").Type<string>;
    entity: import("@kbn/config-schema").Type<string>;
    dateField: import("@kbn/config-schema").Type<string>;
    boundaryType: import("@kbn/config-schema").Type<string>;
    boundaryIndexTitle: import("@kbn/config-schema").Type<string>;
    boundaryIndexId: import("@kbn/config-schema").Type<string>;
    boundaryGeoField: import("@kbn/config-schema").Type<string>;
    boundaryNameField: import("@kbn/config-schema").Type<string | undefined>;
    indexQuery: import("@kbn/config-schema").Type<any>;
    boundaryIndexQuery: import("@kbn/config-schema").Type<any>;
}>;
export type TrackingContainmentRuleParams = TypeOf<typeof trackingContainmentRuleParamsSchema>;
