/**
 * Shared Liquid engine and parse cache for template string parsing.
 * Used by validate_liquid_template, extract_template_local_context, and
 * validate_workflow_yaml so that a single engine instance and a bounded
 * parse cache are reused across the app.
 */
import type { Liquid, Template } from 'liquidjs';
/**
 * Returns the shared workflow Liquid engine instance (lazy-initialized).
 * Registers stub filters so that parse() does not throw on known filter names.
 */
export declare function getLiquidInstance(): Liquid;
/**
 * Parses a Liquid template string and caches the result.
 * Uses a bounded LRU cache: when the cache exceeds MAX_PARSE_CACHE_SIZE,
 * the least-recently-used entry is evicted.
 */
export declare function parseTemplateString(templateString: string): Template[];
