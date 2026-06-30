/**
 * Extracts template variables from a Liquid template string.
 *
 * This function parses a Liquid template and returns an array of variable paths that are referenced
 * in the template. It handles various Liquid constructs including conditionals, loops, filters, and
 * more, while filtering out local variables (like loop iterators) and correctly handling array/object
 * access patterns.
 *
 * **Key behaviors:**
 * - **Local variables are excluded**: Variables created by `for`, `assign`, `capture`, and `tablerow`
 *   tags are not included in the output since they're not external inputs to the template.
 * - **Literal array/object access is preserved**: When accessing arrays or objects with literal indices
 *   (numbers or quoted strings), the full path is returned.
 * - **Variable references in brackets are truncated**: When a variable is used as an index/key
 *   (e.g., `items[i]` where `i` is a variable), the path is truncated at that point since the full
 *   path cannot be statically determined.
 *
 * @param template - A Liquid template string to parse
 * @returns An array of unique variable paths referenced in the template
 *
 * @example
 * ```typescript
 * // Returns: ['user.name', 'order.id']
 * extractTemplateVariables('Hello {{ user.name }}, order {{ order.id }}');
 *
 * // Returns: ['items[0].name', 'items[1].price']
 * extractTemplateVariables('{{ items[0].name }} - {{ items[1].price }}');
 *
 * // Returns: ['items'] (i is a local loop variable)
 * extractTemplateVariables('{% for i in (1..5) %}{{ items[i] }}{% endfor %}');
 *
 * // Returns: ['users.info.addresses'] (name is a variable reference)
 * extractTemplateVariables('{{ users.info.addresses[name].postalCode }}');
 *
 * // Returns: ['data.items["key"].value'] ("key" is a string literal)
 * extractTemplateVariables('{{ data.items["key"].value }}');
 * ```
 */
export declare function extractTemplateVariables(template: string): string[];
