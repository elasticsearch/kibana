/**
 * Parses a JavaScript property access path into its constituent parts.
 *
 * This function breaks down property access strings like "a.b.c", "a[0].b",
 * or "a['key'].b[1]" into an array of individual property names or indices.
 *
 * @param path - The property access path string to parse (e.g., "user.profile['name']")
 * @returns An array of strings representing each property access part
 *
 * @example
 * ```typescript
 * parseJsPropertyAccess("user.profile.name") // Returns: ["user", "profile", "name"]
 * parseJsPropertyAccess("data[0].items['key']") // Returns: ["data", "0", "items", "key"]
 * parseJsPropertyAccess("a.b[1].c") // Returns: ["a", "b", "1", "c"]
 * ```
 */
export declare function parseJsPropertyAccess(path: string): string[];
