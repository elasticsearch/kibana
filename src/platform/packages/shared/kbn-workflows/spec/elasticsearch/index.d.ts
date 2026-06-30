import type { InternalConnectorContract } from '../../types/latest';
/**
 * Elasticsearch Connector Generation
 *
 * This system provides ConnectorContract[] for all Elasticsearch APIs
 * by using pre-generated definitions from Console's API specifications.
 *
 * Benefits:
 * 1. **Schema Validation**: Zod schemas for all ES API parameters
 * 2. **Autocomplete**: Monaco YAML editor gets full autocomplete via JSON Schema
 * 3. **Comprehensive Coverage**: 568 Elasticsearch APIs supported
 * 4. **Browser Compatible**: No file system access required
 * 5. **Lazy Loading**: Large generated files are only loaded when needed, reducing main bundle size
 *
 * The generated connectors include:
 * - All Console API definitions converted to Zod schemas
 * - Path parameters extracted from patterns (e.g., {index}, {id})
 * - URL parameters with proper types (flags, enums, strings, numbers)
 * - Proper ConnectorContract format for workflow execution
 *
 * To regenerate: run 'node scripts/generate_workflow_es_contracts.js' from kibana root
 */
export declare function getElasticsearchConnectors(): InternalConnectorContract[];
