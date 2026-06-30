import { z } from '@kbn/zod/v4';
export declare function clearDescriptionCache(): void;
export interface TypeDescriptionOptions {
    /** Maximum depth for nested objects */
    maxDepth: number;
    /** Include optional field markers */
    showOptional: boolean;
    /** Include descriptions from schema */
    includeDescriptions: boolean;
    /** Single line description */
    singleLine: boolean;
    /** Indent spaces number */
    indentSpacesNumber: number;
}
interface GenerateDetailedDescriptionOptions extends TypeDescriptionOptions {
    detailed: boolean;
}
/**
 * Generate a detailed human-readable type description from a Zod schema
 */
export declare function getDetailedTypeDescription(schema: z.ZodType, options?: Partial<GenerateDetailedDescriptionOptions>): string;
/**
 * Convert Zod schema to JSON Schema for maximum detail
 */
export declare function getJsonSchemaDescription(schema: z.ZodType): object;
/**
 * Get a TypeScript-like type string from Zod schema
 */
export declare function getTypeScriptLikeDescription(schema: z.ZodType): string;
/**
 * Get a compact type description suitable for tooltips
 */
export declare function getCompactTypeDescription(schema: z.ZodType): string;
export {};
