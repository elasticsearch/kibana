/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';
import { castArray } from 'lodash';
import type { ObservablePost } from '../types/api';
import {
  AUTO_EXTRACT_OBSERVABLE_DESCRIPTION,
  OBSERVABLE_TYPE_DOMAIN,
  OBSERVABLE_TYPE_FILE_HASH,
  OBSERVABLE_TYPE_FILE_PATH,
  OBSERVABLE_TYPE_IPV4,
  OBSERVABLE_TYPE_IPV6,
  OBSERVABLE_TYPE_HOSTNAME,
  OBSERVABLE_TYPE_AGENT_ID,
} from '../constants/observables';

export const getIPType = (ip: string): 'IPV4' | 'IPV6' => {
  if (ip.includes(':')) {
    return 'IPV6';
  }
  return 'IPV4';
};

// https://www.elastic.co/docs/reference/ecs/ecs-hash
const HASH_FIELDS = [
  'cdhash',
  'md5',
  'sha1',
  'sha256',
  'sha384',
  'sha512',
  'ssdeep',
  'tlsh',
] as const;

// https://www.elastic.co/docs/reference/ecs/ecs-hash
const HASH_PARENTS = ['dll', 'file', 'process'] as const;

export type Maybe<T> = T | null;
export interface FlattedEcsData {
  field: string;
  value?: Maybe<string[]>;
}
export const getHashFields = (): string[] =>
  HASH_PARENTS.map((parent) => HASH_FIELDS.map((field) => `${parent}.hash.${field}`)).flat();

export const processObservable = (
  observablesMap: Map<string, ObservablePost>,
  value: string,
  typeKey: string,
  description: string
) => {
  const key = `${typeKey}-${value}`;
  if (observablesMap.has(key)) {
    return;
  }
  observablesMap.set(key, {
    typeKey,
    value,
    description,
  });
};

// helper function to get observables from array of flattened ECS data
export const getObservablesFromEcs = (ecsDataArray: FlattedEcsData[][]): ObservablePost[] => {
  const observablesMap = new Map<string, ObservablePost>();

  const description = i18n.translate('xpack.cases.caseView.observables.autoExtract.description', {
    defaultMessage: AUTO_EXTRACT_OBSERVABLE_DESCRIPTION,
  });
  const hashFields = getHashFields();
  for (const ecsData of ecsDataArray) {
    for (const datum of ecsData) {
      if (datum.value) {
        // Source IP
        if (datum.field === 'source.ip') {
          const ips = castArray(datum.value);
          ips.forEach((ip) => {
            const ipType = getIPType(ip);
            processObservable(
              observablesMap,
              ip,
              ipType === 'IPV4' ? OBSERVABLE_TYPE_IPV4.key : OBSERVABLE_TYPE_IPV6.key,
              description
            );
          });
        }

        // Destination IP
        if (datum.field === 'destination.ip') {
          const ips = castArray(datum.value);
          ips.forEach((ip) => {
            const ipType = getIPType(ip);
            processObservable(
              observablesMap,
              ip,
              ipType === 'IPV4' ? OBSERVABLE_TYPE_IPV4.key : OBSERVABLE_TYPE_IPV6.key,
              description
            );
          });
        }
        // Host name
        if (datum.field === 'host.name') {
          const hostnames = castArray(datum.value);
          hostnames.forEach((name) => {
            if (name) {
              processObservable(observablesMap, name, OBSERVABLE_TYPE_HOSTNAME.key, description);
            }
          });
        }

        // File hash
        if (hashFields.includes(datum.field)) {
          const hashValues = castArray(datum.value);
          hashValues.forEach((hash) => {
            processObservable(observablesMap, hash, OBSERVABLE_TYPE_FILE_HASH.key, description);
          });
        }
        // File path
        if (datum.field === 'file.path') {
          const paths = castArray(datum.value);
          paths.forEach((path) => {
            processObservable(observablesMap, path, OBSERVABLE_TYPE_FILE_PATH.key, description);
          });
        }
        // Domain
        if (datum.field === 'dns.question.name') {
          const names = castArray(datum.value);
          names.forEach((name) => {
            processObservable(observablesMap, name, OBSERVABLE_TYPE_DOMAIN.key, description);
          });
        }
        // Agent ID
        if (datum.field === 'agent.id') {
          const agentIds = castArray(datum.value);
          agentIds.forEach((agentId) => {
            processObservable(observablesMap, agentId, OBSERVABLE_TYPE_AGENT_ID.key, description);
          });
        }
      }
    }
  }

  // remove duplicates of key type and value pairs
  return Array.from(observablesMap.values());
};
