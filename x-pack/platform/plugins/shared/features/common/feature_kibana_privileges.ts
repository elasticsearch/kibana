/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AlertingKibanaPrivilege } from './alerting_kibana_privilege';
import type { FeatureKibanaPrivilegesReference } from './feature_kibana_privileges_reference';

/**
 * Feature privilege definition
 */
export interface FeatureKibanaPrivileges {
  /**
   * Whether or not this specific privilege should be excluded from the base privileges.
   */
  excludeFromBasePrivileges?: boolean;

  /**
   * Whether or not this privilege should only be granted to `All Spaces *`. Should be used for features that do not
   * support Spaces. Defaults to `false`.
   */
  requireAllSpaces?: boolean;

  /**
   * Whether or not this privilege should be hidden in the roles UI and disallowed on the API. Defaults to `false`.
   */
  disabled?: boolean;

  /**
   * If this feature includes management sections, you can specify them here to control visibility of those
   * pages based on user privileges.
   *
   * @example
   * ```ts
   *  // Enables access to the "Advanced Settings" management page within the Kibana section
   *  management: {
   *    kibana: ['settings']
   *  }
   * ```
   */
  management?: {
    [sectionId: string]: readonly string[];
  };

  /**
   * If this feature includes a catalogue entry, you can specify them here to control visibility based on user permissions.
   */
  catalogue?: readonly string[];

  /**
   * If your feature includes server-side APIs, you can tag those routes to secure access based on user permissions.
   *
   * @example
   * ```ts
   *  // Configure your routes with requiredPrivileges
   *  server.route({
   *    path: '/api/my-route',
   *    method: 'GET',
   *    handler: () => { ...},
   *    security: {
   *     authz: {
   *      requiredPrivileges: ['my_feature_admin']
   *     },
   *   },
   *  });
   *
   *  Then, specify requiredPrivileges which should be secured:
   *
   *  {
   *    api: ['my_feature_admin']
   *  }
   * ```
   *
   * NOTE: It is important to name your privileges in a way that will not collide with other platform/plugins/shared/features.
   * A generic tag name like "read" could be used elsewhere, and access to that API endpoint would also
   * extend to any routes you have also tagged with that name.
   */
  api?: readonly string[];

  /**
   * If your feature exposes a client-side application (most of them do!), then you can control access to them here.
   *
   * @example
   * ```ts
   *  {
   *    app: ['my-app', 'kibana']
   *  }
   * ```
   *
   */
  app?: readonly string[];

  /**
   * If your feature requires access to specific Alert Types, then specify your access needs here.
   * Include both Alert Types registered by the feature and external Alert Types such as built-in
   * Alert Types and Alert Types provided by other features to which you wish to grant access.
   */
  alerting?: {
    rule?: {
      /**
       * List of rule types and consumers for which users should have full read/write access to when granted this privilege.
       * @example
       * ```ts
       *  {
       *    all: [{ ruleTypeId: 'my-alert-type-within-my-feature', consumers: ['my-consumer-within-my-feature'] }]
       *  }
       * ```
       */
      all?: AlertingKibanaPrivilege;
      /**
       * List of rule types and consumers for which users should have read-only access to when granted this privilege.
       * @example
       * ```ts
       *  {
       *    read: [{ ruleTypeId: 'my-alert-type-within-my-feature', consumers: ['my-consumer-within-my-feature'] }]
       *  }
       * ```
       */
      read?: AlertingKibanaPrivilege;
      /**
       * List of rule types and consumers for which users should have the ability to enable and disable rules when granted this privilege.
       * @example
       * ```ts
       *  {
       *    enable: [{ ruleTypeId: 'my-alert-type-within-my-feature', consumers: ['my-consumer-within-my-feature'] }]
       *  }
       * ```
       */
      enable?: AlertingKibanaPrivilege;
      /**
       * List of rule types and consumers for which users should have the ability to manually run backfills when granted this privilege.
       * @example
       * ```ts
       *  {
       *    manual_run: [{ ruleTypeId: 'my-alert-type-within-my-feature', consumers: ['my-consumer-within-my-feature'] }]
       *  }
       * ```
       */
      manual_run?: AlertingKibanaPrivilege;
      /**
       * List of rule types and consumers for which users should have the ability to manage rule settings (e.g. gap auto-fill scheduler) when granted this privilege.
       * @example
       * ```ts
       *  {
       *    manage_rule_settings: [{ ruleTypeId: 'my-alert-type-within-my-feature', consumers: ['my-consumer-within-my-feature'] }]
       *  }
       * ```
       */
      manage_rule_settings?: AlertingKibanaPrivilege;
      /**
       * List of rule types and consumers for which users should have the ability to mute and unmute
       * per-alert instances when granted this privilege. Per-alert snooze/unsnooze reuses the
       * muteAlert/unmuteAlert operations internally and is therefore also covered.
       */
      mute_alerts?: AlertingKibanaPrivilege;
      /**
       * List of rule types and consumers for which users should have read-only access to per-alert
       * mute/snooze state (the `findMutedAlerts` operation) when granted this privilege, without the
       * ability to mute or unmute. This allows reading muted alert instances without requiring full
       * rule `read`. The broader `mute_alerts` privilege also grants this operation.
       */
      read_muted_alerts?: AlertingKibanaPrivilege;
    };
    alert?: {
      /**
       * List of rule types and consumers for which users should have full read/write access their alert data to when granted this privilege.
       * @example
       * ```ts
       *  {
       *    all: [{ ruleTypeId: 'my-alert-type-within-my-feature', consumers: ['my-consumer-within-my-feature'] }]
       *  }
       * ```
       */
      all?: AlertingKibanaPrivilege;
      /**
       * List of rule types and consumers for which users should have read-only access to their alert data when granted this privilege.
       * @example
       * ```ts
       *  {
       *    read: [{ ruleTypeId: 'my-alert-type-within-my-feature', consumers: ['my-consumer-within-my-feature'] }]
       *  }
       * ```
       */
      read?: AlertingKibanaPrivilege;
    };
  };

  /**
   * If your feature requires access to specific owners of cases (aka plugins that have created cases), then specify your access needs here. The values here should
   * be unique identifiers for the owners of cases you want access to.
   */
  cases?: {
    /**
     * List of case owners which users should have full read/write access to when granted this privilege.
     * @example
     * ```ts
     *  {
     *    all: ['securitySolution']
     *  }
     * ```
     */
    all?: readonly string[];
    /**
     * List of case owners which users should have push access to when granted this privilege.
     * @example
     * ```ts
     *  {
     *    push: ['securitySolution']
     *  }
     * ```
     */
    push?: readonly string[];
    /**
     * List of case owners which users should have create access to when granted this privilege.
     * @example
     * ```ts
     *  {
     *    create: ['securitySolution']
     *  }
     * ```
     */
    create?: readonly string[];
    /**
     * List of case owners which users should have read-only access to when granted this privilege.
     * @example
     * ```ts
     *  {
     *    read: ['securitySolution']
     *  }
     * ```
     */
    read?: readonly string[];
    /**
     * List of case owners which users should have update access to when granted this privilege.
     * This privilege does NOT provide access to re-opening a case. Please see `reopenCase` for said functionality.
     * @example
     * ```ts
     *  {
     *    update: ['securitySolution']
     *  }
     * ```
     */
    update?: readonly string[];
    /**
     * List of case owners which users should have delete access to when granted this privilege.
     * @example
     * ```ts
     *  {
     *    delete: ['securitySolution']
     *  }
     * ```
     */
    delete?: readonly string[];
    /**
     * List of case owners which users should have settings access to when granted this privilege.
     * @example
     * ```ts
     *  {
     *    settings: ['securitySolution']
     *  }
     * ```
     */
    settings?: readonly string[];
    /**
     * List of case owners whose users should have createComment access when granted this privilege.
     * @example
     * ```ts
     *  {
     *    createComment: ['securitySolution']
     *  }
     * ```
     */
    createComment?: readonly string[];
    /**
     * List of case owners whose users should have reopenCase access when granted this privilege.
     * @example
     * ```ts
     *  {
     *    reopenCase: ['securitySolution']
     *  }
     * ```
     */
    reopenCase?: readonly string[];
    /**
     * List of case owners whose users should have assignCase access when granted this privilege.
     * @example
     * ```ts
     *  {
     *    assign: ['securitySolution']
     *  }
     * ```
     */
    assign?: readonly string[];
    /**
     * List of case owners whose users should have template management access when granted this privilege.
     * @example
     * ```ts
     *  {
     *    manageTemplates: ['securitySolution']
     *  }
     * ```
     */
    manageTemplates?: readonly string[];
  };

  /**
   * If your feature requires read access to the alerting v2 data streams that persist the rule events and alert actions, then specify it here.
   * Read more about the alerting v2 resources here x-pack/platform/plugins/shared/alerting_v2/server/resources/README.md
   *
   * @example
   * ```ts
   *  {
   *    alerts: { read: true }
   *  }
   * ```
   */
  alerts?: {
    read?: boolean;
  };

  /**
   * If your feature requires access to specific saved objects, then specify your access needs here.
   */
  savedObject: {
    /**
     * List of saved object types which users should have full read/write access to when granted this privilege.
     * @example
     * ```ts
     *  {
     *    all: ['my-saved-object-type']
     *  }
     * ```
     */
    all: readonly string[];

    /**
     * List of saved object types which users should have read-only access to when granted this privilege.
     * @example
     * ```ts
     *  {
     *    read: ['config']
     *  }
     * ```
     */
    read: readonly string[];
  };
  /**
   * A list of UI Capabilities that should be granted to users with this privilege.
   * These capabilities will automatically be namespaces within your feature id.
   *
   * @example
   * ```ts
   *  {
   *    ui: ['show', 'save']
   *  }
   *
   *  This translates in the UI to the following (assuming a feature id of "foo"):
   *  import { uiCapabilities } from 'ui/capabilities';
   *
   *  const canShowApp = uiCapabilities.foo.show;
   *  const canSave = uiCapabilities.foo.save;
   * ```
   * Note: Since these are automatically namespaced, you are free to use generic names like "show" and "save".
   *
   * @see UICapabilities
   */
  ui: readonly string[];

  /**
   * An optional list of other registered feature or sub-feature privileges that this privilege is composed of. When
   * privilege is registered with Elasticsearch, it will be expanded to grant everything that referenced privileges
   * grant. This property can only be set in the feature configuration overrides.
   */
  composedOf?: readonly FeatureKibanaPrivilegesReference[];

  /**
   * An optional list of other registered feature or sub-feature privileges that, when combined, grant equivalent access
   * if the feature this privilege belongs to becomes deprecated. The extended definition allows separate lists of
   * privileges to be defined for the default and minimal (excludes any automatically granted sub-feature privileges)
   * sets. This property can only be set if the feature is marked as deprecated.
   */
  replacedBy?:
    | readonly FeatureKibanaPrivilegesReference[]
    | {
        default: readonly FeatureKibanaPrivilegesReference[];
        minimal: readonly FeatureKibanaPrivilegesReference[];
      };
}
