import type { TypeOf } from '@kbn/config-schema';
export declare const searchConfigurationSchema: import("@kbn/config-schema").ObjectType<{
    query: import("@kbn/config-schema").ObjectType<{
        query: import("@kbn/config-schema").Type<string | Record<string, any>>;
        language: import("@kbn/config-schema").Type<string>;
    }>;
}>;
export type SearchConfigurationType = TypeOf<typeof searchConfigurationSchema>;
