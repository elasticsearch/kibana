import type { TypeOf } from '@kbn/config-schema';
export declare const configSchema: import("@kbn/config-schema").ObjectType<{
    enabled: import("@kbn/config-schema").Type<boolean>;
}>;
export type MaintenanceWindowsConfig = TypeOf<typeof configSchema>;
