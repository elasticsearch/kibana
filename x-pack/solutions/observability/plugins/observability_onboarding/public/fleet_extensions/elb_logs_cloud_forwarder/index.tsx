/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { lazy } from 'react';
import type { CoreStart } from '@kbn/core/public';
import type { PackagePolicyCreateBottomExtensionComponent } from '@kbn/fleet-plugin/public';

/**
 * Returns a lazy-loaded Fleet "package-policy-create-bottom" extension component for the
 * `aws_cloudwatch_input_otel` integration. The component renders an ELB Logs toggle with
 * an S3 bucket field and a "Launch Stack in AWS" button that deploys the EDOT Cloud Forwarder.
 *
 * The component is purely a UI affordance — it never mutates the package policy.
 */
export const getLazyElbLogsCloudForwarderExtension = (
  coreStart: CoreStart
): React.LazyExoticComponent<PackagePolicyCreateBottomExtensionComponent> => {
  return lazy<PackagePolicyCreateBottomExtensionComponent>(async () => {
    const { ElbLogsPanel } = await import('./elb_logs_panel');

    const Component: PackagePolicyCreateBottomExtensionComponent = ({ newPolicy: _ }) => (
      <ElbLogsPanel http={coreStart.http} />
    );
    Component.displayName = 'ElbLogsCloudForwarderExtension';

    return { default: Component };
  });
};
