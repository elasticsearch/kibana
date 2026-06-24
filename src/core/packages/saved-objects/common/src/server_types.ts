/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Note: this file contains types that are intended for use by server-side code
 * only. Once the Saved Objects client is removed from browser code we will
 * remove these types as well.
 *
 * See https://github.com/elastic/kibana/issues/149098.
 */

import type { SavedObjectsMigrationVersion, SavedObjectError } from './saved_objects';

/**
 * Don't use this type, it's simply a helper type for {@link SavedObjectAttribute}
 *
 * @public
 */
export type SavedObjectAttributeSingle =
  | string
  | number
  | boolean
  | null
  | undefined
  | SavedObjectAttributes;

/**
 * Type definition for a Saved Object attribute value
 *
 * @public
 */
export type SavedObjectAttribute = SavedObjectAttributeSingle | SavedObjectAttributeSingle[];

/**
 * Definition of the Saved Object access control interface
 *
 * @public
 */

export interface SavedObjectAccessControl {
  /** The ID of the user who owns this object. */
  owner: string;
  /**
   * The access mode of the object. `write_restricted` is editable only by the owner and admin users.
   * Access mode `default` is editable by all users with write access to the object.
   */
  accessMode: 'write_restricted' | 'default';
}

/**
 * The data for a Saved Object is stored as an object in the `attributes`
 * property.
 *
 * @public
 * @deprecated This type reduces the type safety of your code. Create an interface for your specific saved object type or use `unknown` instead.
 */
export interface SavedObjectAttributes {
  [key: string]: SavedObjectAttribute;
}

/**
 * A reference to another saved object.
 *
 * @public
 */
export interface SavedObjectReference {
  name: string;
  type: string;
  id: string;
}

/**
 * Definition of the Saved Object interface
 *
 * @public
 */
export interface SavedObject<T = unknown> {
  /** The ID of this Saved Object, guaranteed to be unique for all objects of the same `type` */
  id: string;
  /**  The type of Saved Object. Each plugin can define its own custom Saved Object types. */
  type: string;
  /** An opaque version number which changes on each successful write operation. Can be used for implementing optimistic concurrency control. */
  version?: string;
  /** Timestamp of the time this document had been created.  */
  created_at?: string;
  /** The ID of the user who created this object. */
  created_by?: string;
  /** Timestamp of the last time this document had been updated.  */
  updated_at?: string;
  /** The ID of the user who last updated this object. */
  updated_by?: string;
  /** Error associated with this object, populated if an operation failed for this object.  */
  error?: SavedObjectError;
  /** The data for a Saved Object is stored as an object in the `attributes` property. **/
  attributes: T;
  /** {@inheritdoc SavedObjectReference} */
  references: SavedObjectReference[];
  /**
   * {@inheritdoc SavedObjectsMigrationVersion}
   * @deprecated Use `typeMigrationVersion` instead.
   */
  migrationVersion?: SavedObjectsMigrationVersion;
  /** A semver value that is used when upgrading objects between Kibana versions. */
  coreMigrationVersion?: string;
  /** A semver value that is used when migrating documents between Kibana versions. */
  typeMigrationVersion?: string;
  /**
   * Space(s) that this saved object exists in. This attribute is not used for "global" saved object types which are registered with
   * `namespaceType: 'agnostic'`.
   */
  namespaces?: string[];
  /**
   * The ID of the saved object this originated from. This is set if this object's `id` was regenerated; that can happen during migration
   * from a legacy single-namespace type, or during import. It is only set during migration or create operations. This is used during import
   * to ensure that ID regeneration is deterministic, so saved objects will be overwritten if they are imported multiple times into a given
   * space.
   */
  originId?: string;
  /**
   * Flag indicating if a saved object is managed by Kibana (default=false)
   *
   * This can be leveraged by applications to e.g. prevent edits to a managed
   * saved object. Instead, users can be guided to create a copy first and
   * make their edits to the copy.
   */
  managed?: boolean;

  /**
   * Access control information of the saved object.
   * This can be be used to customize access to the object in addition to RBAC, e.g.
   * to set an object to read-only mode, where it is only editable by the owner of
   * the object (or an admin), even if other users are granted write access via a role.
   */
  accessControl?: SavedObjectAccessControl;
}

/**
 * An error entry returned for a single object by the bulk Saved Objects APIs.
 * Unlike a successful {@link SavedObject}, it carries no `attributes`.
 *
 * @public
 */
export interface SavedObjectErrorResult {
  id: string;
  type: string;
  error: SavedObjectError;
}

/**
 * A single entry in a bulk Saved Objects response: either a successful
 * {@link SavedObject} or a {@link SavedObjectErrorResult}. Narrow with
 * {@link isSavedObjectErrorResult} before accessing `attributes`.
 *
 * @public
 */
export type SavedObjectBulkResult<T = unknown> = SavedObject<T> | SavedObjectErrorResult;

/**
 * Type guard that narrows a bulk Saved Objects result to a
 * {@link SavedObjectErrorResult}.
 *
 * @public
 */
export const isSavedObjectErrorResult = (result: {
  error?: SavedObjectError;
}): result is SavedObjectErrorResult => result.error !== undefined;

/**
 * Saved object document as stored in `_source` of doc in ES index
 * Similar to SavedObjectDoc and excludes `version`, includes `references`, has `attributes` in [typeMapping]
 *
 * @public
 */
export interface SavedObjectsRawDocSource {
  type: string;
  namespace?: string;
  namespaces?: string[];
  migrationVersion?: SavedObjectsMigrationVersion;
  typeMigrationVersion?: string;
  updated_at?: string;
  created_at?: string;
  created_by?: string;
  references?: SavedObjectReference[];
  originId?: string;
  managed?: boolean;
  accessControl?: SavedObjectAccessControl;
  [typeMapping: string]: any;
}
