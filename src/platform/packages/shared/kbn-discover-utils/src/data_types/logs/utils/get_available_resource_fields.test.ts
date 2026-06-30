/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getAvailableResourceFields } from './get_available_resource_fields';

describe('getAvailableResourceFields', () => {
  it('should return available fields', () => {
    const fields = getAvailableResourceFields({
      'service.name': 'yes',
      'container.name': 'yes',
      'host.name': 'yes',
      'k8s.cluster.name': 'yes',
      'k8s.namespace.name': 'yes',
      'k8s.pod.name': 'yes',
      'k8s.cronjob.name': 'yes',
    });
    expect(fields).toEqual([
      'service.name',
      'container.name',
      'host.name',
      'k8s.cluster.name',
      'k8s.namespace.name',
      'k8s.pod.name',
      'k8s.cronjob.name',
    ]);
  });

  it('should ignore empty fields', () => {
    const fields = getAvailableResourceFields({
      'service.name': '',
    });
    // Empty string values should be filtered out
    expect(fields).toEqual([]);
  });

  it('should ignore unknown fields', () => {
    const fields = getAvailableResourceFields({
      unknown: 'no',
    });
    expect(fields).toEqual([]);
  });

  it('should return first available field from each group', () => {
    const fields = getAvailableResourceFields({
      'service.name': 'yes',
      'container.name': 'no',
      'kubernetes.container.name': 'yes', // higher priority than `container.name`
      'host.name': 'no',
      'kubernetes.node.name': 'yes', // higher priority than `host.name`
      'k8s.cluster.name': 'no',
      'orchestrator.cluster.name': 'yes', // higher priority than `k8s.cluster.name`
      'k8s.namespace.name': 'no',
      'kubernetes.namespace': 'yes', // higher priority than `k8s.namespace.name`
      'k8s.pod.name': 'no',
      'kubernetes.pod.name': 'yes', // higher priority than `k8s.pod.name`
      'k8s.cronjob.name': 'no',
      'kubernetes.deployment.name': 'yes', // higher priority than `k8s.cronjob.name`
    });
    expect(fields).toEqual([
      'service.name',
      'kubernetes.container.name',
      'kubernetes.node.name',
      'orchestrator.cluster.name',
      'kubernetes.namespace',
      'kubernetes.pod.name',
      'kubernetes.deployment.name',
    ]);
  });

  it('should return available field names', () => {
    const doc = {
      'service.name': 'my-service',
      'container.name': 'my-container',
      'host.name': 'my-host',
    };

    const fields = getAvailableResourceFields(doc);
    expect(fields).toEqual(['service.name', 'container.name', 'host.name']);
  });

  it('should check OTel fallbacks when ECS fields are not available', () => {
    const doc = {
      'other.field': 'value',
    };

    const fields = getAvailableResourceFields(doc);
    expect(fields).toEqual([]);
  });

  it('should handle mixed ECS fields', () => {
    const doc = {
      'service.name': 'ecs-service',
      'container.name': 'ecs-container',
    };

    const fields = getAvailableResourceFields(doc);
    expect(fields).toEqual(['service.name', 'container.name']);
  });

  it('should filter out empty field values', () => {
    const doc = {
      'service.name': '',
      'host.name': 'my-host',
    };

    const fields = getAvailableResourceFields(doc);
    // Empty string values are filtered out
    expect(fields).toEqual(['host.name']);
  });

  it('should return empty array when no resource fields are available', () => {
    const doc = {
      'other.field': 'value',
      message: 'log message',
    };

    const fields = getAvailableResourceFields(doc);
    expect(fields).toEqual([]);
  });

  it('should handle array values without extracting first element', () => {
    const doc = {
      'service.name': ['service1', 'service2'],
    };

    const fields = getAvailableResourceFields(doc);
    // Arrays are not extracted, returned as field names
    expect(fields).toEqual(['service.name']);
  });

  it('should ignore an array containing only an empty string', () => {
    const fields = getAvailableResourceFields({
      'service.name': [''],
    });
    expect(fields).toEqual([]);
  });

  it('should ignore an array containing only empty strings', () => {
    const fields = getAvailableResourceFields({
      'service.name': ['', ''],
    });
    expect(fields).toEqual([]);
  });

  it('should ignore an array containing only null values', () => {
    const fields = getAvailableResourceFields({
      'service.name': [null],
    });
    expect(fields).toEqual([]);
  });

  it('should ignore an empty array', () => {
    const fields = getAvailableResourceFields({
      'service.name': [],
    });
    expect(fields).toEqual([]);
  });

  it('should fall through to a populated field when an earlier field in the group is an empty array', () => {
    const fields = getAvailableResourceFields({
      'kubernetes.container.name': [''],
      'container.name': 'my-container',
    });
    expect(fields).toEqual(['container.name']);
  });

  it('should keep an array that contains at least one non-empty value', () => {
    const fields = getAvailableResourceFields({
      'service.name': ['', 'my-service'],
    });
    expect(fields).toEqual(['service.name']);
  });
});
