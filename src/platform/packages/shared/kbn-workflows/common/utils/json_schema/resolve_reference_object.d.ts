/**
 * Resolve a reference object to a parameter object
 * @param param - The reference object to resolve, e.g. { "$ref": "#/components/parameters/search-index" }
 * @param openApiDocument - The OpenAPI document
 * @returns The parameter object
 */
export declare function resolveReferenceObject(reference: string, jsonSchema: unknown): unknown | null;
