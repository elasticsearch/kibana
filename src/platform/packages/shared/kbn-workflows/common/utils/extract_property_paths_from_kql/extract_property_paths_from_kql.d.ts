/**
 * Extracts property paths from a KQL (Kibana Query Language) query string.
 *
 * This function parses a KQL query and extracts field names that appear before
 * colons in field:value expressions, ignoring quoted strings and handling
 * logical operators (AND, OR, NOT) and parentheses.
 *
 * It also handles template expressions ({{ ... }}) by:
 * 1. Replacing them with placeholders before KQL parsing
 * 2. Extracting template variables separately
 * 3. Combining both sets of results
 *
 * @param kql - The KQL query string to parse
 * @returns Array of unique property paths found in the query
 *
 * @example
 * ```typescript
 * extractPropertyPathsFromKql('foo.bar:this and steps.analysis:foo')
 * // Returns: ['foo.bar', 'steps.analysis']
 *
 * extractPropertyPathsFromKql('name:"John Doe" and age:30 or status:active')
 * // Returns: ['name', 'age', 'status']
 *
 * extractPropertyPathsFromKql('foreach.item: {{ consts.favorite_person }}')
 * // Returns: ['foreach.item', 'consts.favorite_person']
 * ```
 */
export declare function extractPropertyPathsFromKql(kql: string): string[];
