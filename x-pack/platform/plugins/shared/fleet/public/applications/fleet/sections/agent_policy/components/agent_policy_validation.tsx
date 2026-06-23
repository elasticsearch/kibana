/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';

import { isValidDuration, isValidNamespace } from '../../../services';
import type { NewAgentPolicy, AgentPolicy } from '../../../types';

export interface ValidationResults {
  [key: string]: Array<JSX.Element | string>;
}

export const agentPolicyFormValidation = (
  agentPolicy: Partial<NewAgentPolicy | AgentPolicy>,
  options?: { allowedNamespacePrefixes?: string[] }
): ValidationResults => {
  const errors: ValidationResults = {};
  const namespaceValidation = isValidNamespace(
    agentPolicy.namespace || '',
    false,
    options?.allowedNamespacePrefixes
  );

  if (!agentPolicy.name?.trim()) {
    errors.name = [
      <FormattedMessage
        id="xpack.fleet.agentPolicyForm.nameRequiredErrorMessage"
        defaultMessage="Agent policy name is required"
      />,
    ];
  }

  if (!namespaceValidation.valid && namespaceValidation.error) {
    errors.namespace = [namespaceValidation.error];
  }

  if (agentPolicy.unenroll_timeout && agentPolicy.unenroll_timeout < 0) {
    errors.unenroll_timeout = [
      <FormattedMessage
        id="xpack.fleet.agentPolicyForm.unenrollTimeoutMinValueErrorMessage"
        defaultMessage="Unenroll timeout must be greater than zero."
      />,
    ];
  }

  if (agentPolicy.inactivity_timeout && agentPolicy.inactivity_timeout < 0) {
    errors.inactivity_timeout = [
      <FormattedMessage
        id="xpack.fleet.agentPolicyForm.inactivityTimeoutMinValueErrorMessage"
        defaultMessage="Inactivity timeout must be greater than zero."
      />,
    ];
  }

  if (agentPolicy.monitoring_http?.enabled) {
    if (!agentPolicy.monitoring_http.host?.trim()) {
      errors['monitoring_http.host'] = [
        <FormattedMessage
          id="xpack.fleet.agentPolicyForm.monitoringHttpHostRequiredErrorMessage"
          defaultMessage="Host is required for HTTP monitoring"
        />,
      ];
    }

    if (
      !agentPolicy.monitoring_http.port ||
      (agentPolicy.monitoring_http.port !== undefined && agentPolicy.monitoring_http.port <= 0)
    ) {
      errors['monitoring_http.port'] = [
        <FormattedMessage
          id="xpack.fleet.agentPolicyForm.monitoringHttpPortRequiredErrorMessage"
          defaultMessage="Port is required for HTTP monitoring"
        />,
      ];
    }
  }

  if (
    agentPolicy.monitoring_diagnostics?.limit?.burst !== undefined &&
    agentPolicy.monitoring_diagnostics?.limit?.burst <= 0
  ) {
    errors['monitoring_diagnostics.limit.burst'] = [
      <FormattedMessage
        id="xpack.fleet.agentPolicyForm.diagnosticsLimitBurstMinValueErrorMessage"
        defaultMessage="Burst must be an integer greater than zero"
      />,
    ];
  }

  if (
    agentPolicy.monitoring_diagnostics?.uploader?.max_retries !== undefined &&
    agentPolicy.monitoring_diagnostics?.uploader?.max_retries <= 0
  ) {
    errors['monitoring_diagnostics.uploader.max_retries'] = [
      <FormattedMessage
        id="xpack.fleet.agentPolicyForm.diagnosticsLimitBurstMinValueErrorMessage"
        defaultMessage="Max retries must be an integer greater than zero"
      />,
    ];
  }

  const durationErrorMessage = (
    <FormattedMessage
      id="xpack.fleet.agentPolicyForm.invalidDurationFormatErrorMessage"
      defaultMessage="Must be a duration with a time unit, for example, 30s, 5m, 2h"
    />
  );

  if (
    agentPolicy.monitoring_diagnostics?.limit?.interval &&
    !isValidDuration(agentPolicy.monitoring_diagnostics.limit.interval)
  ) {
    errors['monitoring_diagnostics.limit.interval'] = [durationErrorMessage];
  }

  if (
    agentPolicy.monitoring_diagnostics?.uploader?.init_dur &&
    !isValidDuration(agentPolicy.monitoring_diagnostics.uploader.init_dur)
  ) {
    errors['monitoring_diagnostics.uploader.init_dur'] = [durationErrorMessage];
  }

  if (
    agentPolicy.monitoring_diagnostics?.uploader?.max_dur &&
    !isValidDuration(agentPolicy.monitoring_diagnostics.uploader.max_dur)
  ) {
    errors['monitoring_diagnostics.uploader.max_dur'] = [durationErrorMessage];
  }

  return errors;
};
