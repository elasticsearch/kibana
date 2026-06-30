/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentPolicy } from '../../types';

/**
 * A connector referenced by an agentless policy, rendered as a deep-link card.
 * Intentionally decoupled from both `PackagePolicy` inputs and the `AgentlessPolicy`
 * DTO: the caller maps its own source into these primitives.
 */
export interface AgentlessEnrollmentConnector {
  /** Connector ID. When present, the card links straight to the connector. */
  id?: string;
  /** Connector display name, used as the card title. */
  name?: string;
}

/** Identifies the enabled input whose title should label the integration. */
export interface AgentlessEnrollmentSelectedInput {
  policyTemplate: string;
  type: string;
}

/**
 * Minimal contract for the agentless enrollment flyout, intentionally decoupled
 * from both `PackagePolicy` and the `AgentlessPolicy` API DTO. The caller maps its
 * own data source (today `PackagePolicy`, eventually the agentless policies API)
 * into these primitives, so the flyout never has to change when the source flips.
 */
export interface AgentlessEnrollmentFlyoutProps {
  onClose: () => void;
  /**
   * Agent-policy ID the agentless agent is enrolled into. Used as the key to look
   * up the agent (`fleet-agents.agent.policy_id`). The caller is responsible for
   * supplying the agent-policy id from its own source (today `PackagePolicy.policy_ids[0]`,
   * later `AgentlessPolicy.id`, which equals the agent-policy id by server design).
   */
  policyId: string;
  /** Display name used for the flyout header. */
  policyName: string;
  /** Package name and version, used to fetch package info and poll incoming data. */
  packageInfo: { name: string; version: string };
  /**
   * The single enabled input, used to resolve a more specific integration title
   * (e.g. "AWS S3") from the package's policy templates. When omitted, the flyout
   * falls back to the package title. The caller maps this from its own source
   * (today the `PackagePolicy` enabled input).
   */
  selectedInput?: AgentlessEnrollmentSelectedInput;
  /** Used only to render integration details in the enrollment error state. */
  agentPolicy?: AgentPolicy;
  /**
   * Connectors referenced by the policy, rendered as deep-link cards once data is
   * confirmed. The caller maps these from its own source (`PackagePolicy` inputs
   * today, the `AgentlessPolicy` API inputs later), so the flyout stays decoupled.
   */
  connectors?: AgentlessEnrollmentConnector[];
}
