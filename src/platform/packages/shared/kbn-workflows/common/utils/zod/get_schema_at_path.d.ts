import { z } from '@kbn/zod/v4';
export declare function parsePath(path: string): string[] | null;
interface GetSchemaAtPathResult {
    schema: z.ZodType | null;
    scopedToPath: string | null;
}
/**
 * Get zod schema at a given path.
 * @param schema - The zod schema to get the path from.
 * @param path - The path to get the schema from. e.g. `choices[0].message['content']`
 * @param options - The options for the function.
 * @param options.partial - If true, return the schema for the last valid path segment.
 * @returns The schema at the given path or null if the path is invalid.
 */
export declare function getSchemaAtPath(schema: z.ZodType, path: string, { partial }?: {
    partial?: boolean;
}): GetSchemaAtPathResult;
export {};
