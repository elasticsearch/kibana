/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import type { Type } from '@kbn/config-schema';
import type { UiCounterMetricType } from '@kbn/analytics';
import type { SolutionId } from '@kbn/core-chrome-browser';

/**
 * UI element type to represent the settings.
 * @public
 * */
export type UiSettingsType =
  | 'undefined' // I don't know why malformed UiSettings objects exist
  | 'json'
  | 'markdown'
  | 'number'
  | 'select'
  | 'boolean'
  | 'string'
  | 'array'
  | 'image'
  | 'color';

/**
 * Type for the readonly mode of the readonly settings.
 * 'strict' indicates that the value cannot be changed through API and is not displayed in the UI
 * 'ui' indicates that the value is just not displayed in the UI
 * @public
 * */
export type ReadonlyModeType = 'strict' | 'ui';

/**
 * UiSettings deprecation field options.
 * @public
 * */
export interface DeprecationSettings {
  /** Deprecation message */
  message: string;
  /** Key to documentation links */
  docLinksKey: string;
}

/**
 * Type for the technical preview settings.
 * @public
 * */
export type TechnicalPreviewSettings =
  | boolean
  | {
      /** Technical Preview message */
      message?: string;
      /** Key to documentation links */
      docLinksKey?: string;
    };

export interface GetUiSettingsContext {
  request?: KibanaRequest;
}

export type UiSettingsSolutions = Array<SolutionId | 'classic'>;

/**
 * Base UiSettings parameters shared by all settings.
 * @public
 * */
interface UiSettingsParamsBase<T = unknown> {
  /** title in the UI */
  name?: string;
  /** default value to fall back to if a user doesn't provide any */
  value?: T;
  /** handler to return the default value asynchronously. Supersedes the `value` prop */
  getValue?: (context?: GetUiSettingsContext) => Promise<T>;
  /** description provided to a user in UI */
  description?: string;
  /** used to group the configured setting in the UI */
  category?: string[];
  /** array of permitted values for this setting */
  options?: string[] | number[];
  /** text labels for 'select' type UI element */
  optionLabels?: Record<string, string>;
  /** a flag indicating whether new value applying requires page reloading */
  requiresPageReload?: boolean;
  /** a flag indicating that value cannot be changed */
  readonly?: boolean;
  /** a flag indicating the level of restriction of the readonly settings {@link ReadonlyModeType} */
  readonlyMode?: ReadonlyModeType;
  /**
   * a flag indicating that value might contain user sensitive data.
   * used by telemetry to mask the value of the setting when sent.
   */
  sensitive?: boolean;
  /** defines a type of UI element {@link UiSettingsType} */
  type?: UiSettingsType;
  /** optional deprecation information. Used to generate a deprecation warning. */
  deprecation?: DeprecationSettings;
  /**
   * index of the settings within its category (ascending order, smallest will be displayed first).
   * Used for ordering in the UI.
   *
   * @remark settings without order defined will be displayed last and ordered by name
   */
  order?: number;
  /**
   * Value validation schema.
   * Used to validate value on write and read.
   *
   * This schema is also used for validating the user input in all settings fields {@link FieldRow} across Kibana UI.
   * Use schema options to specify limits on the value. For example:
   * `schema.number({ min: 0, max: 100 })`
   *
   * More information about schema in https://github.com/elastic/kibana/blob/main/src/platform/packages/shared/kbn-config-schema/README.md
   */
  schema: Type<T>;
  /**
   * Metric to track once this property changes
   * @deprecated
   * Temporary measure until https://github.com/elastic/kibana/issues/83084 is in place
   */
  metric?: {
    type: UiCounterMetricType;
    name: string;
  };
  /**
   * Scope of the setting. `Global` denotes a setting globally available across namespaces. `Namespace` denotes a setting
   * scoped to a namespace. The default value is 'namespace'
   */
  scope?: UiSettingsScope;
  /** A list of solutions where this setting is applicable.
   * This field is used to determine whether the setting should be displayed in the stateful Advanced settings app.
   * If undefined or an empty list, the setting must be displayed in all solutions.
   * Note: this does not affect serverless settings, since spaces in serverless don't have solution views.
   * */
  solutionViews?: UiSettingsSolutions;
}

/**
 * UiSettings parameters defined by the plugins.
 * A setting should carry at most one maturity badge — avoid setting both `technicalPreview` and `experimental`.
 * @public
 * */
export interface UiSettingsParams<T = unknown> extends UiSettingsParamsBase<T> {
  /** A flag indicating that this setting is a technical preview. If true, the setting will display a tech preview badge after the title. */
  technicalPreview?: TechnicalPreviewSettings;
  /** A flag indicating that this setting is experimental. Displays an experimental badge after the title. Supports the same options as {@link TechnicalPreviewSettings}. */
  experimental?: TechnicalPreviewSettings;
}

/**
 * Describes the values explicitly set by user.
 * @public
 * */
export interface UserProvidedValues<T = any> {
  userValue?: T;
  isOverridden?: boolean;
}

/**
 * The minimal set of fields needed by the browser-side runtime settings client.
 * This is what gets injected into the page HTML — only the fields required for
 * value resolution, type coercion, and access control.
 * @public
 */
export interface UiSettingsRuntimeEntry {
  value?: unknown;
  type?: UiSettingsType;
  readonlyMode?: ReadonlyModeType;
}

/**
 * Denotes the scope of the setting
 */
export type UiSettingsScope = 'namespace' | 'global';
