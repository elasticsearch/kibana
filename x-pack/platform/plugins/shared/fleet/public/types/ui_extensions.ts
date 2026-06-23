/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiStepProps } from '@elastic/eui';
import type { ComponentType, LazyExoticComponent, PropsWithChildren } from 'react';

import type { FleetServerAgentComponentUnit } from '../../common/types/models/agent';

import type { PackagePolicyValidationResults } from '../services';

import type {
  Agent,
  AgentPolicy,
  NewPackagePolicy,
  PackageInfo,
  PackagePolicy,
  SetupTechnology,
} from '.';

/** Register a Fleet UI extension */
export type UIExtensionRegistrationCallback = (extensionPoint: UIExtensionPoint) => void;

/** Internal storage for registered UI Extension Points */
export interface UIExtensionsStorage {
  [key: string]: Partial<Record<UIExtensionPoint['view'], UIExtensionPoint>>;
}

/**
 * UI Component Extension is used to replace the Define Step on
 * the pages displaying the ability to edit/create an Integration Policy
 */
export type PackagePolicyReplaceDefineStepExtensionComponent =
  ComponentType<PackagePolicyReplaceDefineStepExtensionComponentProps>;

export type PackagePolicyReplaceDefineStepExtensionComponentProps = (
  | (PackagePolicyEditExtensionComponentProps & { isEditPage: true })
  | (PackagePolicyCreateExtensionComponentProps & { isEditPage: false })
) & {
  validationResults?: PackagePolicyValidationResults;
  agentPolicies?: AgentPolicy[];
  packageInfo: PackageInfo;
  isAgentlessEnabled?: boolean;
  handleSetupTechnologyChange?: (setupTechnology: SetupTechnology) => void;
  defaultSetupTechnology?: SetupTechnology;
  integrationToEnable?: string;
  setIntegrationToEnable?: (integration: string) => void;
};

/**
 * UI Component Extension is used on the pages displaying the ability to edit an
 * Integration Policy
 */
export type PackagePolicyEditExtensionComponent =
  ComponentType<PackagePolicyEditExtensionComponentProps>;

export interface PackagePolicyEditExtensionComponentProps {
  /** The current integration policy being edited */
  policy: PackagePolicy;
  /** The new (updated) integration policy that will be saved */
  newPolicy: NewPackagePolicy;
  /**
   * A callback that should be executed anytime a change to the Integration Policy needs to
   * be reported back to the Fleet Policy Edit page.
   *
   * **NOTE:**
   * this callback will be recreated everytime the policy data changes, thus logic around its
   * invocation should take that into consideration in order to avoid an endless loop.
   */
  onChange: (opts: {
    /** is current form state is valid */
    isValid?: boolean;
    /** The updated Integration Policy to be merged back and included in the API call */
    updatedPolicy: Partial<NewPackagePolicy>;
    isExtensionLoaded?: boolean;
  }) => void;
}

/**
 * UI Component Extension is used on the pages displaying the ability to see
 * Policy response view
 */
export type PackagePolicyResponseExtensionComponent =
  ComponentType<PackagePolicyResponseExtensionComponentProps>;

export interface PackagePolicyResponseExtensionComponentProps {
  /** The current agent to retrieve response from */
  agent: Agent;
  /** A callback function to set the `needs attention` state */
  onShowNeedsAttentionBadge?: (val: boolean) => void;
}

/**
 * UI Component Extension is used on the pages displaying the ability to see
 * a generic endpoint errors list
 */
export type PackageGenericErrorsListComponent = ComponentType<PackageGenericErrorsListProps>;

export interface PackageGenericErrorsListProps {
  /** A list of errors from a package */
  packageErrors: FleetServerAgentComponentUnit[];
}

export interface PackagePolicyReplaceDefineStepExtension {
  package: string;
  view: 'package-policy-replace-define-step';
  Component: LazyExoticComponent<PackagePolicyReplaceDefineStepExtensionComponent>;
}

/** Extension point registration contract for Integration Policy Edit views */
export interface PackagePolicyEditExtension {
  package: string;
  view: 'package-policy-edit';
  useLatestPackageVersion?: boolean;
  Component: LazyExoticComponent<PackagePolicyEditExtensionComponent>;
}

export interface PackagePolicyResponseExtension {
  package: string;
  view: 'package-policy-response';
  Component: LazyExoticComponent<PackagePolicyResponseExtensionComponent>;
}

export interface EndpointAgentTamperProtectionExtension {
  package: string;
  view: 'endpoint-agent-tamper-protection';
  Component: LazyExoticComponent<ComponentType<PropsWithChildren<{}>>>;
}

export interface PliAuthBlockExtension {
  package: string;
  view: 'pli-auth-block';
  Component: LazyExoticComponent<ComponentType>;
}

export interface PackageGenericErrorsListExtension {
  package: string;
  view: 'package-generic-errors-list';
  Component: LazyExoticComponent<PackageGenericErrorsListComponent>;
}

/** Extension point registration contract for Integration Policy Edit tabs views */
export interface PackagePolicyEditTabsExtension {
  package: string;
  view: 'package-policy-edit-tabs';
  tabs: Array<{
    title: EuiStepProps['title'];
    Component: LazyExoticComponent<PackagePolicyEditExtensionComponent>;
  }>;
}

/**
 * UI Component Extension is used on the pages displaying the ability to Create an
 * Integration Policy
 */
export type PackagePolicyCreateExtensionComponent =
  ComponentType<PackagePolicyCreateExtensionComponentProps>;

export interface PackagePolicyCreateExtensionComponentProps {
  /** The integration policy being created */
  newPolicy: NewPackagePolicy;
  /**
   * A callback that should be executed anytime a change to the Integration Policy needs to
   * be reported back to the Fleet Policy Edit page
   */
  onChange: (opts: {
    /** is current form state is valid */
    isValid?: boolean;
    /** The updated Integration Policy to be merged back and included in the API call */
    updatedPolicy: NewPackagePolicy;
  }) => void;
}

/** Extension point registration contract for Integration Policy Create views */
export interface PackagePolicyCreateExtension {
  package: string;
  view: 'package-policy-create';
  Component: LazyExoticComponent<PackagePolicyCreateExtensionComponent>;
}

/**
 * UI Component Extension rendered additively below the native data-streams list on the
 * Integration Policy Create page. It is read-only: there is intentionally no `onChange`
 * callback, so changes made here can never reach the policy payload.
 *
 * Use this slot for supplemental UI affordances (e.g. launching an external setup flow)
 * that should appear alongside native data stream configuration without replacing it.
 */
export type PackagePolicyCreateBottomExtensionComponent =
  ComponentType<PackagePolicyCreateBottomExtensionComponentProps>;

export interface PackagePolicyCreateBottomExtensionComponentProps {
  /** The integration policy being created (read-only — do not mutate) */
  newPolicy: NewPackagePolicy;
}

/** Extension point registration contract for additive bottom-of-create-page views */
export interface PackagePolicyCreateBottomExtension {
  package: string;
  view: 'package-policy-create-bottom';
  Component: LazyExoticComponent<PackagePolicyCreateBottomExtensionComponent>;
}

/**
 * UI Component Extension is used to display a Custom tab (and view) under a given Integration
 */
export type PackageCustomExtensionComponent = ComponentType<PackageCustomExtensionComponentProps>;

export interface PackageCustomExtensionComponentProps {
  /** The package key value that should be used used for URLs */
  pkgkey: string;
  packageInfo: PackageInfo;
}

/** Extension point registration contract for Integration details Custom view */
export interface PackageCustomExtension {
  package: string;
  view: 'package-detail-custom';
  Component: LazyExoticComponent<PackageCustomExtensionComponent>;
}

/**
 * UI Component Extension for displaying custom views under the Assets tab for a given Integration
 */
export type PackageAssetsComponent = ComponentType<{}>;

/** Extension point registration contract for Integration details Assets view */
export interface PackageAssetsExtension {
  package: string;
  view: 'package-detail-assets';
  Component: LazyExoticComponent<PackageAssetsComponent>;
}

export interface AgentEnrollmentFlyoutFinalStepExtension {
  package: string;
  view: 'agent-enrollment-flyout';
  title: EuiStepProps['title'];
  Component: ComponentType<{}>;
}

/** Fleet UI Extension Point */
export type UIExtensionPoint =
  | PackagePolicyReplaceDefineStepExtension
  | PackagePolicyEditExtension
  | PackagePolicyResponseExtension
  | PackagePolicyEditTabsExtension
  | PackageCustomExtension
  | PackagePolicyCreateExtension
  | PackagePolicyCreateBottomExtension
  | PackageAssetsExtension
  | PackageGenericErrorsListExtension
  | AgentEnrollmentFlyoutFinalStepExtension
  | EndpointAgentTamperProtectionExtension
  | PliAuthBlockExtension;
