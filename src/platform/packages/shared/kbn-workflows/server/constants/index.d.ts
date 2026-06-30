/**
 * Prefix of the workflows system indices.
 *
 * The Kibana system user has the same permission on those indices than it has on Kibana system indices.
 */
export declare const WORKFLOW_SYSTEM_INDEX_PREFIX = ".workflows-";
/**
 * Helper function to define workflow system indices.
 */
export declare const createWorkflowSystemIndex: (suffix: string) => string;
/**
 * The main workflows index name.
 */
export declare const WORKFLOW_INDEX_NAME: string;
export declare const GLOBAL_WORKFLOW_SPACE_ID = "*";
