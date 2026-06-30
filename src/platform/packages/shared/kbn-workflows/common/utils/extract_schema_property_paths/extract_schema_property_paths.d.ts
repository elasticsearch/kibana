import { type ZodTypeKind } from '../zod/get_zod_schema_type';
export interface ExtractedSchemaPropertyPath {
    path: string;
    type: ZodTypeKind;
    description?: string;
    displayType?: string;
}
export interface ExtractSchemaPropertyPathsOptions {
    /**
     * When true, each entry includes `description` (from Zod `.describe()`) and `displayType`
     */
    includeMetadata?: boolean;
}
export declare function extractSchemaPropertyPaths(zodSchema: unknown, options?: ExtractSchemaPropertyPathsOptions): ExtractedSchemaPropertyPath[];
