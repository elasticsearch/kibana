import type { ChangeHistoryFieldsToHash } from './types';
export declare const sha256: (text: string) => string;
/**
 * Hashes certain key fields in a snapshot of an object (Sensitive data etc)
 * @param snapshot - The snapshot to process (a new updated object is returned when hashing applies).
 * @param fieldsToHash - Nested map of field paths to hash.
 * @returns The list of flattened paths that were hashed and the snapshot with those string values replaced.
 * @example
 *   const snapshot = { user: { name: 'bob', email: 'bob@example.com' } };
 *   const pathsToHash = { user: { email: true } };
 *   const result = hashFields(snapshot, pathsToHash);
 *   // {
 *   //  fields: ['user.email'],
 *   //  snapshot: { user: { name: 'bob', email: '5ff860bf1190596c7188ab851db691f0f3169c453936e9e1eba2f9a47f7a0018' } }
 *   // }
 */
export declare function hashFields(snapshot: Record<string, any>, fieldsToHash?: ChangeHistoryFieldsToHash): {
    fields: Array<string>;
    snapshot: Record<string, any>;
};
