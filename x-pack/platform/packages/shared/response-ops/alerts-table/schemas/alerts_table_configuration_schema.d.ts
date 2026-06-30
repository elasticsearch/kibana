import { z } from '@kbn/zod/v4';
/**
 * Configuration schema for overrides to the table configuration that can be persisted across sessions.
 * This should include only the serializable properties that are user-configurable, all other props
 * will be removed by parsing to avoid saving unnecessary or non-serializable objects.
 */
export declare const alertsTableConfigurationSchema: z.ZodObject<{
    columns: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        initialWidth: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>>;
    visibleColumns: z.ZodOptional<z.ZodArray<z.ZodString>>;
    sort: z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodObject<{
        order: z.ZodEnum<{
            desc: "desc";
            asc: "asc";
        }>;
    }, z.core.$strip>>>>;
}, z.core.$strip>;
export type AlertsTableConfiguration = z.infer<typeof alertsTableConfigurationSchema>;
