/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import Chance from 'chance';

const chance = new Chance();

// see https://github.com/elastic/security-team/issues/8970 for billable asset definition
export const BILLABLE_ASSETS_CONFIG = {
  cspm: [
    // 'aws-ebs', we can't include EBS volumes until https://github.com/elastic/security-team/issues/9283 is resolved
    // 'aws-ec2', we can't include EC2 instances until https://github.com/elastic/security-team/issues/9254 is resolved
    'aws-s3',
    'aws-rds',
    'azure-disk',
    'azure-document-db-database-account',
    'azure-flexible-mysql-server-db',
    'azure-flexible-postgresql-server-db',
    'azure-mysql-server-db',
    'azure-postgresql-server-db',
    'azure-sql-server',
    'azure-storage-account',
    'azure-vm',
    'gcp-bigquery-dataset',
    'gcp-compute-disk',
    'gcp-compute-instance',
    'gcp-sqladmin-instance',
    'gcp-storage-bucket',
  ],
  kspm: ['Node', 'node'],
};
export const getMockFindings = ({
  postureType,
  isBillableAsset,
  numberOfFindings,
}: {
  postureType: string;
  isBillableAsset?: boolean;
  numberOfFindings: number;
}) => {
  return Array.from({ length: numberOfFindings }, () => mockFiniding(postureType, isBillableAsset));
};

/**
 * Builds the resource.raw payload of a GCP compute instance finding as stored by cloudbeat
 * (GCP Cloud Asset Inventory shape: resource.raw.resource.data.*). The metering duration filter
 * reads status / lastStartTimestamp / lastStopTimestamp from this structure.
 */
const getGcpComputeRawData = ({
  status,
  runningDurationHours,
  stoppedHoursAgo = 0,
}: {
  status: 'RUNNING' | 'TERMINATED';
  runningDurationHours: number;
  /** How long ago the instance stopped (TERMINATED only). Default: just now (within the
   *  metering look-back window). Use > 24 to simulate a stale stop event that must NOT
   *  be re-billed. */
  stoppedHoursAgo?: number;
}) => {
  const durationMs = runningDurationHours * 60 * 60 * 1000;
  const lastStop =
    status === 'TERMINATED'
      ? new Date(Date.now() - Math.max(stoppedHoursAgo * 60 * 60 * 1000, 60 * 1000))
      : undefined;
  const lastStart = new Date((lastStop ? lastStop.getTime() : Date.now()) - durationMs);

  return {
    resource: {
      data: {
        status,
        creationTimestamp: new Date(lastStart.getTime() - 60 * 1000).toISOString(),
        lastStartTimestamp: lastStart.toISOString(),
        ...(lastStop ? { lastStopTimestamp: lastStop.toISOString() } : {}),
      },
    },
  };
};

/**
 * GCP compute instance CSPM findings with an explicit running duration, for exercising the
 * >=24h duration-based metering filter.
 */
export const getMockGcpComputeFindings = ({
  numberOfFindings,
  runningDurationHours,
  status = 'RUNNING',
  stoppedHoursAgo,
}: {
  numberOfFindings: number;
  runningDurationHours: number;
  status?: 'RUNNING' | 'TERMINATED';
  stoppedHoursAgo?: number;
}) => {
  return Array.from({ length: numberOfFindings }, () => ({
    resource: {
      id: chance.guid(),
      sub_type: 'gcp-compute-instance',
      raw: getGcpComputeRawData({ status, runningDurationHours, stoppedHoursAgo }),
    },
    rule: {
      benchmark: {
        posture_type: 'cspm',
      },
    },
  }));
};

const mockFiniding = (postureType: string, isBillableAsset?: boolean) => {
  if (postureType === 'cspm') {
    const randomAsset = isBillableAsset
      ? chance.pickone(BILLABLE_ASSETS_CONFIG.cspm)
      : 'not-billable-asset';
    return {
      resource: {
        id: chance.guid(),
        sub_type: randomAsset,
        // gcp-compute-instance is only billable with >=24h running time; attach a
        // long-running raw payload so a random billable pick stays deterministic.
        ...(randomAsset === 'gcp-compute-instance'
          ? { raw: getGcpComputeRawData({ status: 'RUNNING', runningDurationHours: 48 }) }
          : {}),
      },
      rule: {
        benchmark: {
          posture_type: 'cspm',
        },
      },
    };
  }
  if (postureType === 'kspm') {
    const randomAsset = isBillableAsset
      ? chance.pickone(BILLABLE_ASSETS_CONFIG.kspm)
      : 'not-billable-asset';

    return {
      resource: { id: chance.guid(), sub_type: randomAsset },
      rule: {
        benchmark: {
          posture_type: 'kspm',
        },
      },
      agent: { id: chance.guid() },
    };
  }
  if (postureType === 'cnvm') {
    return {
      cloud: {
        instance: {
          id: chance.guid(),
        },
      },
    };
  }

  throw new Error('Invalid posture type');
};

export const getMockDefendForContainersHeartbeats = ({
  isBlockActionEnables,
  numberOfHearbeats,
}: {
  isBlockActionEnables: boolean;
  numberOfHearbeats: number;
}) => {
  return Array.from({ length: numberOfHearbeats }, () =>
    mockDefendForContainersHeartbeats(isBlockActionEnables)
  );
};
const mockDefendForContainersHeartbeats = (isBlockActionEnabled: boolean) => {
  return {
    agent: {
      id: chance.guid(),
    },
    cloud_defend: {
      block_action_enabled: isBlockActionEnabled,
    },
    event: {
      ingested: new Date().toISOString(),
    },
  };
};
