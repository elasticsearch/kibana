export declare const VARIABLE_REGEX: RegExp;
export declare const VARIABLE_REGEX_GLOBAL: RegExp;
export declare const UNFINISHED_VARIABLE_REGEX_GLOBAL: RegExp;
export declare const ALLOWED_KEY_REGEX: RegExp;
export declare const PROPERTY_PATH_REGEX: RegExp;
export declare const LIQUID_FILTER_REGEX: RegExp;
/**
 * LIQUID_BLOCK_FILTER_REGEX matches a variable followed by a filter within a Liquid block, but outside mustache syntax.
 *
 * Regex breakdown:
 * (?:^|[^{])      - Non-capturing group: start of line or any character except '{' (to avoid mustache blocks)
 * \s*             - Optional whitespace
 * [^{}\s]+        - One or more characters that are not '{', '}', or whitespace (the variable name)
 * \s*             - Optional whitespace
 * \|              - Pipe character separating variable and filter
 * \s*             - Optional whitespace
 * (\w*)           - Capturing group: the filter name (alphanumeric/underscore)
 * \s*$            - Optional whitespace to end of line
 *
 * Example match: "foo | filter"
 */
export declare const LIQUID_BLOCK_FILTER_REGEX: RegExp;
export declare const LIQUID_BLOCK_KEYWORD_REGEX: RegExp;
export declare const LIQUID_BLOCK_START_REGEX: RegExp;
export declare const LIQUID_BLOCK_END_REGEX: RegExp;
export declare const LIQUID_EXPRESSION_REGEX_GLOBAL: RegExp;
export declare const LIQUID_OUTPUT_REGEX_GLOBAL: RegExp;
export declare const LIQUID_TAG_REGEX_GLOBAL: RegExp;
export declare const DYNAMIC_VALUE_REGEX: RegExp;
/**
 * Checks if a value matches the dynamic/templated value pattern ($<something>)
 * Examples: ${{env.USER}}, ${{ref:myVar}}, ${{someVariable}}
 * Pattern: starts with ${{ and ends with }}, and any non-empty string in between
 */
export declare function isDynamicValue(value: unknown): boolean;
export declare const VARIABLE_VALUE_REGEX: RegExp;
/**
 * Checks if a value matches the variable pattern ({{ variable }})
 * Examples: {{ variable }}, {{ variable | filter }}
 * Pattern: starts with {{ and ends with }}, and any non-empty string in between
 */
export declare function isVariableValue(value: unknown): boolean;
export declare const LIQUID_TAG_VALUE_REGEX: RegExp;
/**
 * Checks if a value contains Liquid tag patterns ({% ... %} or {%- ... -%})
 * Examples: {% if condition %}, {%- if condition -%}, multi-line blocks with Liquid tags
 * Pattern: matches {% or {%- followed by content and %} or -%}
 * The 's' flag allows . to match newlines for multi-line support
 */
export declare function isLiquidTagValue(value: unknown): boolean;
