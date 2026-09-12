/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getCategory } from './get_advanced_setting_category';

describe('getCategory', () => {
  describe('logs', () => {
    it('returns logs for keys containing .logging.', () => {
      expect(getCategory('linux.advanced.logging.file')).toBe('logs');
      expect(getCategory('mac.advanced.logging.syslog')).toBe('logs');
      expect(getCategory('windows.advanced.logging.debugview')).toBe('logs');
    });
  });

  describe('configs', () => {
    it('returns configs for artifacts, elasticsearch, agent, event_filter, flags', () => {
      expect(getCategory('linux.advanced.artifacts.global.base_url')).toBe('configs');
      expect(getCategory('windows.advanced.elasticsearch.delay')).toBe('configs');
      expect(getCategory('mac.advanced.agent.connection_delay')).toBe('configs');
      expect(getCategory('linux.advanced.event_filter.default')).toBe('configs');
      expect(getCategory('windows.advanced.flags')).toBe('configs');
    });
  });

  describe('performance', () => {
    it('returns performance for utilization_limits, tty_io, file_cache, deduplicate, aggregate_', () => {
      expect(getCategory('linux.advanced.utilization_limits.cpu')).toBe('performance');
      expect(getCategory('linux.advanced.tty_io.max_kilobytes_per_process')).toBe('performance');
      expect(getCategory('windows.advanced.file_cache.file_object_cache_size')).toBe('performance');
      expect(getCategory('mac.advanced.events.deduplicate_network_events')).toBe('performance');
      expect(getCategory('windows.advanced.events.aggregate_process')).toBe('performance');
    });
  });

  describe('product_features', () => {
    it('returns product_features for malware, ransomware, memory_protection, kernel, etc.', () => {
      expect(getCategory('windows.advanced.malware.quarantine')).toBe('product_features');
      expect(getCategory('windows.advanced.ransomware.mbr')).toBe('product_features');
      expect(getCategory('linux.advanced.memory_protection.memory_scan')).toBe('product_features');
      expect(getCategory('windows.advanced.kernel.process')).toBe('product_features');
      expect(getCategory('mac.advanced.alerts.cloud_lookup')).toBe('product_features');
      expect(getCategory('windows.advanced.diagnostic.enabled')).toBe('product_features');
      expect(getCategory('mac.advanced.device_control.filter_images')).toBe('product_features');
      expect(getCategory('mac.advanced.harden.self_protect')).toBe('product_features');
      expect(getCategory('linux.advanced.fanotify.ignored_filesystems')).toBe('product_features');
      expect(getCategory('linux.advanced.host_isolation.allowed')).toBe('product_features');
      expect(getCategory('windows.advanced.mitigations.policies.redirection_guard')).toBe(
        'product_features'
      );
    });
  });

  describe('others', () => {
    it('returns others for keys that do not match other categories', () => {
      expect(getCategory('linux.advanced.capture_command_line')).toBe('others');
      expect(getCategory('linux.advanced.network_events_exclude_local')).toBe('others');
      expect(getCategory('windows.advanced.set_extended_host_information')).toBe('others');
      expect(getCategory('linux.advanced.capture_env_vars')).toBe('others');
    });
  });
});
