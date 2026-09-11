/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License.
 */

import { createHash } from 'crypto';
import type { EsClient } from '@kbn/scout';
import type { ToolingLog } from '@kbn/tooling-log';

/**
 * Seeds one detection rule plus a cluster of closed-false-positive alerts for
 * the rule-tuning worker eval. The shapes mirror what the worker's harvest
 * ES/QL query selects on:
 *
 *   kibana.alert.workflow_status == "closed"
 *   kibana.alert.workflow_reason == "false_positive"
 *   NOT MV_CONTAINS(kibana.alert.workflow_tags, "detection-watch:tuning-reviewed")
 *   grouped BY kibana.alert.rule.uuid / rule.name / rule.rule_id
 *
 * Each fixture drives the diagnose step toward one golden change_type by
 * varying the entity concentration of the FP cluster (see comments inline).
 */

export interface SeedFixtureSpec {
  id: string;
  ruleType: string;
  expected: string;
}

interface SeedContext {
  fetch: <T = unknown>(path: string, options?: Record<string, unknown>) => Promise<T>;
  esClient: EsClient;
  log: ToolingLog;
}

const ALERTS_INDEX = '.alerts-security.alerts-default';

/** Entity matrix per fixture: what the diagnose step should "see". */
const ENTITY_PROFILES: Record<
  string,
  Array<{ host: string; user: string; ip: string; process: string }>
> = {
  // Single noisy host dominates → tightest fix is an exception on host.name.
  'fp-host-exception': [
    { host: 'build-agent-01', user: 'svc_jenkins', ip: '10.0.4.11', process: 'java' },
    { host: 'build-agent-01', user: 'svc_jenkins', ip: '10.0.4.11', process: 'java' },
    { host: 'build-agent-01', user: 'svc_jenkins', ip: '10.0.4.11', process: 'java' },
    { host: 'build-agent-01', user: 'build.eng', ip: '10.0.4.11', process: 'java' },
    { host: 'build-agent-01', user: 'build.eng', ip: '10.0.4.15', process: 'node' },
  ],
  // FPs spread across many entities share one over-broad query term → narrow the query.
  // No entity (host/user/ip/process) repeats across the cluster, so a tight entity
  // exception is not a viable fix; the only signal is the match-all query itself.
  'fp-overbroad-query': [
    { host: 'web-01', user: 'www-data', ip: '10.1.0.5', process: 'nginx' },
    { host: 'api-02', user: 'svc_api', ip: '10.1.1.10', process: 'node' },
    { host: 'db-03', user: 'postgres', ip: '10.1.2.20', process: 'postgres' },
    { host: 'cache-04', user: 'redis', ip: '10.1.3.30', process: 'redis-server' },
    { host: 'worker-05', user: 'batch', ip: '10.1.4.40', process: 'python3' },
  ],
  // Same benign scanner entity repeatedly re-firing → suppression with group-by.
  'fp-volume-suppression': [
    { host: 'scan-host', user: 'svc_scanner', ip: '10.9.9.9', process: 'nmap' },
    { host: 'scan-host', user: 'svc_scanner', ip: '10.9.9.9', process: 'nmap' },
    { host: 'scan-host', user: 'svc_scanner', ip: '10.9.9.9', process: 'nmap' },
    { host: 'scan-host', user: 'svc_scanner', ip: '10.9.9.9', process: 'nmap' },
    { host: 'scan-host', user: 'svc_scanner', ip: '10.9.9.9', process: 'nmap' },
  ],
  // Real detections, uniformly low value → downgrade risk score/severity.
  'fp-low-value-risk': [
    { host: 'fleet-a', user: 'analyst1', ip: '10.2.0.1', process: 'ssh' },
    { host: 'fleet-b', user: 'analyst2', ip: '10.2.0.2', process: 'ssh' },
    { host: 'fleet-c', user: 'analyst3', ip: '10.2.0.3', process: 'ssh' },
    { host: 'fleet-d', user: 'analyst4', ip: '10.2.0.4', process: 'ssh' },
    { host: 'fleet-e', user: 'analyst5', ip: '10.2.0.5', process: 'curl' },
  ],
  // Benign everywhere, no discriminating signal at all → disable. Every entity is
  // distinct across every dimension, so no exception, suppression, or query-narrow
  // target exists; the rule itself is the problem.
  'fp-unfixable-noise': [
    { host: 'any-a', user: 'svc_health', ip: '10.3.0.1', process: 'kube-probe' },
    { host: 'any-b', user: 'svc_backup', ip: '10.3.1.2', process: 'restic' },
    { host: 'any-c', user: 'svc_metrics', ip: '10.3.2.3', process: 'node-exporter' },
    { host: 'any-d', user: 'svc_deploy', ip: '10.3.3.4', process: 'helm' },
    { host: 'any-e', user: 'svc_cron', ip: '10.3.4.5', process: 'cron' },
  ],
  // Deliberately shaped like the suppression case — one entity re-firing — but seeded on a
  // new_terms rule, which cannot carry alert_suppression. The entity evidence points at
  // suppression while the rule type forbids it, so the only safe answer is manual.
  'fp-suppression-incapable-rule-type': [
    { host: 'nt-scan-host', user: 'svc_inventory', ip: '10.7.7.7', process: 'inventory-agent' },
    { host: 'nt-scan-host', user: 'svc_inventory', ip: '10.7.7.7', process: 'inventory-agent' },
    { host: 'nt-scan-host', user: 'svc_inventory', ip: '10.7.7.7', process: 'inventory-agent' },
    { host: 'nt-scan-host', user: 'svc_inventory', ip: '10.7.7.7', process: 'inventory-agent' },
    { host: 'nt-scan-host', user: 'svc_inventory', ip: '10.7.7.7', process: 'inventory-agent' },
  ],
  'fp-host-exception-ci': [
    { host: 'ci-runner-07', user: 'svc_ci', ip: '10.20.1.7', process: 'dotnet' },
    { host: 'ci-runner-07', user: 'svc_ci', ip: '10.20.1.7', process: 'dotnet' },
    { host: 'ci-runner-07', user: 'svc_ci', ip: '10.20.1.7', process: 'dotnet' },
    { host: 'ci-runner-07', user: 'svc_ci', ip: '10.20.1.7', process: 'dotnet' },
    { host: 'ci-runner-07', user: 'svc_ci', ip: '10.20.1.7', process: 'dotnet' },
  ],
  'fp-host-exception-backup': [
    { host: 'backup-nas-02', user: 'svc_backup', ip: '10.20.2.2', process: 'rsync' },
    { host: 'backup-nas-02', user: 'svc_backup', ip: '10.20.2.2', process: 'rsync' },
    { host: 'backup-nas-02', user: 'svc_backup', ip: '10.20.2.2', process: 'rsync' },
    { host: 'backup-nas-02', user: 'svc_backup', ip: '10.20.2.2', process: 'rsync' },
    { host: 'backup-nas-02', user: 'svc_backup', ip: '10.20.2.2', process: 'rsync' },
  ],
  'fp-host-exception-av': [
    { host: 'sec-scan-11', user: 'svc_av', ip: '10.20.3.11', process: 'clamscan' },
    { host: 'sec-scan-11', user: 'svc_av', ip: '10.20.3.11', process: 'clamscan' },
    { host: 'sec-scan-11', user: 'svc_av', ip: '10.20.3.11', process: 'clamscan' },
    { host: 'sec-scan-11', user: 'svc_av', ip: '10.20.3.11', process: 'clamscan' },
    { host: 'sec-scan-11', user: 'svc_av', ip: '10.20.3.11', process: 'clamscan' },
  ],
  'fp-host-exception-print': [
    { host: 'print-srv-01', user: 'svc_spool', ip: '10.20.4.1', process: 'cupsd' },
    { host: 'print-srv-01', user: 'svc_spool', ip: '10.20.4.1', process: 'cupsd' },
    { host: 'print-srv-01', user: 'svc_spool', ip: '10.20.4.1', process: 'cupsd' },
    { host: 'print-srv-01', user: 'svc_spool', ip: '10.20.4.1', process: 'cupsd' },
    { host: 'print-srv-01', user: 'svc_spool', ip: '10.20.4.1', process: 'cupsd' },
  ],
  'fp-host-exception-mdm': [
    { host: 'mdm-agent-09', user: 'svc_mdm', ip: '10.20.5.9', process: 'jamf' },
    { host: 'mdm-agent-09', user: 'svc_mdm', ip: '10.20.5.9', process: 'jamf' },
    { host: 'mdm-agent-09', user: 'svc_mdm', ip: '10.20.5.9', process: 'jamf' },
    { host: 'mdm-agent-09', user: 'svc_mdm', ip: '10.20.5.9', process: 'jamf' },
    { host: 'mdm-agent-09', user: 'svc_mdm', ip: '10.20.5.9', process: 'jamf' },
  ],
  'fp-overbroad-wildcard-cmd': [
    { host: 'app-11', user: 'svc_app', ip: '10.30.0.11', process: 'bash' },
    { host: 'db-12', user: 'postgres', ip: '10.30.1.12', process: 'psql' },
    { host: 'web-13', user: 'www-data', ip: '10.30.2.13', process: 'httpd' },
    { host: 'mq-14', user: 'rabbitmq', ip: '10.30.3.14', process: 'beam.smp' },
    { host: 'job-15', user: 'batch', ip: '10.30.4.15', process: 'ruby' },
  ],
  'fp-overbroad-any-user': [
    { host: 'ws-21', user: 'alice', ip: '10.31.0.21', process: 'chrome' },
    { host: 'ws-22', user: 'bob', ip: '10.31.1.22', process: 'firefox' },
    { host: 'ws-23', user: 'carol', ip: '10.31.2.23', process: 'code' },
    { host: 'ws-24', user: 'dave', ip: '10.31.3.24', process: 'slack' },
    { host: 'ws-25', user: 'erin', ip: '10.31.4.25', process: 'zoom' },
  ],
  'fp-overbroad-port-range': [
    { host: 'edge-31', user: 'svc_lb', ip: '10.32.0.31', process: 'haproxy' },
    { host: 'edge-32', user: 'svc_lb', ip: '10.32.1.32', process: 'envoy' },
    { host: 'edge-33', user: 'svc_cdn', ip: '10.32.2.33', process: 'varnish' },
    { host: 'edge-34', user: 'svc_api', ip: '10.32.3.34', process: 'gunicorn' },
    { host: 'edge-35', user: 'svc_ws', ip: '10.32.4.35', process: 'node' },
  ],
  'fp-overbroad-parent-any': [
    { host: 'k8s-41', user: 'svc_kube', ip: '10.33.0.41', process: 'containerd' },
    { host: 'k8s-42', user: 'svc_kube', ip: '10.33.1.42', process: 'runc' },
    { host: 'k8s-43', user: 'svc_flux', ip: '10.33.2.43', process: 'flux' },
    { host: 'k8s-44', user: 'svc_argo', ip: '10.33.3.44', process: 'argocd' },
    { host: 'k8s-45', user: 'svc_istio', ip: '10.33.4.45', process: 'pilot-agent' },
  ],
  'fp-overbroad-ext-match': [
    { host: 'file-51', user: 'svc_share', ip: '10.34.0.51', process: 'smbd' },
    { host: 'file-52', user: 'svc_share', ip: '10.34.1.52', process: 'nfsd' },
    { host: 'file-53', user: 'svc_sync', ip: '10.34.2.53', process: 'syncthing' },
    { host: 'file-54', user: 'svc_ftp', ip: '10.34.3.54', process: 'vsftpd' },
    { host: 'file-55', user: 'svc_web', ip: '10.34.4.55', process: 'nginx' },
  ],
  'fp-suppression-healthcheck': [
    { host: 'lb-probe-01', user: 'svc_probe', ip: '10.40.0.1', process: 'curl' },
    { host: 'lb-probe-01', user: 'svc_probe', ip: '10.40.0.1', process: 'curl' },
    { host: 'lb-probe-01', user: 'svc_probe', ip: '10.40.0.1', process: 'curl' },
    { host: 'lb-probe-01', user: 'svc_probe', ip: '10.40.0.1', process: 'curl' },
    { host: 'lb-probe-01', user: 'svc_probe', ip: '10.40.0.1', process: 'curl' },
  ],
  'fp-suppression-vulnscan': [
    { host: 'vuln-scan-02', user: 'svc_vuln', ip: '10.40.1.2', process: 'nessus' },
    { host: 'vuln-scan-02', user: 'svc_vuln', ip: '10.40.1.2', process: 'nessus' },
    { host: 'vuln-scan-02', user: 'svc_vuln', ip: '10.40.1.2', process: 'nessus' },
    { host: 'vuln-scan-02', user: 'svc_vuln', ip: '10.40.1.2', process: 'nessus' },
    { host: 'vuln-scan-02', user: 'svc_vuln', ip: '10.40.1.2', process: 'nessus' },
  ],
  'fp-suppression-inventory': [
    { host: 'inv-collect-03', user: 'svc_inv', ip: '10.40.2.3', process: 'osqueryd' },
    { host: 'inv-collect-03', user: 'svc_inv', ip: '10.40.2.3', process: 'osqueryd' },
    { host: 'inv-collect-03', user: 'svc_inv', ip: '10.40.2.3', process: 'osqueryd' },
    { host: 'inv-collect-03', user: 'svc_inv', ip: '10.40.2.3', process: 'osqueryd' },
    { host: 'inv-collect-03', user: 'svc_inv', ip: '10.40.2.3', process: 'osqueryd' },
  ],
  'fp-suppression-patchagent': [
    { host: 'patch-agent-04', user: 'svc_patch', ip: '10.40.3.4', process: 'wuauclt' },
    { host: 'patch-agent-04', user: 'svc_patch', ip: '10.40.3.4', process: 'wuauclt' },
    { host: 'patch-agent-04', user: 'svc_patch', ip: '10.40.3.4', process: 'wuauclt' },
    { host: 'patch-agent-04', user: 'svc_patch', ip: '10.40.3.4', process: 'wuauclt' },
    { host: 'patch-agent-04', user: 'svc_patch', ip: '10.40.3.4', process: 'wuauclt' },
  ],
  'fp-suppression-logship': [
    { host: 'log-ship-05', user: 'svc_logs', ip: '10.40.4.5', process: 'filebeat' },
    { host: 'log-ship-05', user: 'svc_logs', ip: '10.40.4.5', process: 'filebeat' },
    { host: 'log-ship-05', user: 'svc_logs', ip: '10.40.4.5', process: 'filebeat' },
    { host: 'log-ship-05', user: 'svc_logs', ip: '10.40.4.5', process: 'filebeat' },
    { host: 'log-ship-05', user: 'svc_logs', ip: '10.40.4.5', process: 'filebeat' },
  ],
  'fp-low-value-admin-tools': [
    { host: 'adm-61', user: 'sysadmin1', ip: '10.50.0.61', process: 'psexec' },
    { host: 'adm-62', user: 'sysadmin2', ip: '10.50.1.62', process: 'psexec' },
    { host: 'adm-63', user: 'sysadmin3', ip: '10.50.2.63', process: 'winrm' },
    { host: 'adm-64', user: 'sysadmin4', ip: '10.50.3.64', process: 'winrm' },
    { host: 'adm-65', user: 'sysadmin5', ip: '10.50.4.65', process: 'mstsc' },
  ],
  'fp-low-value-devtools': [
    { host: 'dev-71', user: 'dev1', ip: '10.51.0.71', process: 'docker' },
    { host: 'dev-72', user: 'dev2', ip: '10.51.1.72', process: 'docker' },
    { host: 'dev-73', user: 'dev3', ip: '10.51.2.73', process: 'kubectl' },
    { host: 'dev-74', user: 'dev4', ip: '10.51.3.74', process: 'terraform' },
    { host: 'dev-75', user: 'dev5', ip: '10.51.4.75', process: 'ansible' },
  ],
  'fp-low-value-remote-support': [
    { host: 'sup-81', user: 'helpdesk1', ip: '10.52.0.81', process: 'teamviewer' },
    { host: 'sup-82', user: 'helpdesk2', ip: '10.52.1.82', process: 'anydesk' },
    { host: 'sup-83', user: 'helpdesk3', ip: '10.52.2.83', process: 'teamviewer' },
    { host: 'sup-84', user: 'helpdesk4', ip: '10.52.3.84', process: 'anydesk' },
    { host: 'sup-85', user: 'helpdesk5', ip: '10.52.4.85', process: 'vncviewer' },
  ],
  'fp-low-value-archive': [
    { host: 'arc-91', user: 'user1', ip: '10.53.0.91', process: '7z' },
    { host: 'arc-92', user: 'user2', ip: '10.53.1.92', process: 'zip' },
    { host: 'arc-93', user: 'user3', ip: '10.53.2.93', process: 'tar' },
    { host: 'arc-94', user: 'user4', ip: '10.53.3.94', process: '7z' },
    { host: 'arc-95', user: 'user5', ip: '10.53.4.95', process: 'gzip' },
  ],
  'fp-low-value-scripting': [
    { host: 'scr-01', user: 'analyst6', ip: '10.54.0.1', process: 'python3' },
    { host: 'scr-02', user: 'analyst7', ip: '10.54.1.2', process: 'perl' },
    { host: 'scr-03', user: 'analyst8', ip: '10.54.2.3', process: 'python3' },
    { host: 'scr-04', user: 'analyst9', ip: '10.54.3.4', process: 'awk' },
    { host: 'scr-05', user: 'analyst10', ip: '10.54.4.5', process: 'sed' },
  ],
  'fp-unfixable-telemetry': [
    { host: 'tel-a', user: 'svc_otel', ip: '10.60.0.1', process: 'otelcol' },
    { host: 'tel-b', user: 'svc_stats', ip: '10.60.1.2', process: 'statsd' },
    { host: 'tel-c', user: 'svc_trace', ip: '10.60.2.3', process: 'jaeger-agent' },
    { host: 'tel-d', user: 'svc_prom', ip: '10.60.3.4', process: 'prometheus' },
    { host: 'tel-e', user: 'svc_graf', ip: '10.60.4.5', process: 'grafana' },
  ],
  'fp-unfixable-agentmesh': [
    { host: 'msh-a', user: 'svc_consul', ip: '10.61.0.1', process: 'consul' },
    { host: 'msh-b', user: 'svc_vault', ip: '10.61.1.2', process: 'vault' },
    { host: 'msh-c', user: 'svc_nomad', ip: '10.61.2.3', process: 'nomad' },
    { host: 'msh-d', user: 'svc_etcd', ip: '10.61.3.4', process: 'etcd' },
    { host: 'msh-e', user: 'svc_zk', ip: '10.61.4.5', process: 'zookeeper' },
  ],
  'fp-unfixable-buildfarm': [
    { host: 'bld-a', user: 'svc_bazel', ip: '10.62.0.1', process: 'bazel' },
    { host: 'bld-b', user: 'svc_gradle', ip: '10.62.1.2', process: 'gradle' },
    { host: 'bld-c', user: 'svc_maven', ip: '10.62.2.3', process: 'mvn' },
    { host: 'bld-d', user: 'svc_npm', ip: '10.62.3.4', process: 'npm' },
    { host: 'bld-e', user: 'svc_cargo', ip: '10.62.4.5', process: 'cargo' },
  ],
  'fp-unfixable-imaging': [
    { host: 'img-a', user: 'svc_pxe', ip: '10.63.0.1', process: 'dnsmasq' },
    { host: 'img-b', user: 'svc_tftp', ip: '10.63.1.2', process: 'in.tftpd' },
    { host: 'img-c', user: 'svc_wds', ip: '10.63.2.3', process: 'wdsserver' },
    { host: 'img-d', user: 'svc_sccm', ip: '10.63.3.4', process: 'ccmexec' },
    { host: 'img-e', user: 'svc_ghost', ip: '10.63.4.5', process: 'ghostsrv' },
  ],
  'fp-unfixable-mailflow': [
    { host: 'mx-a', user: 'svc_postfix', ip: '10.64.0.1', process: 'postfix' },
    { host: 'mx-b', user: 'svc_dovecot', ip: '10.64.1.2', process: 'dovecot' },
    { host: 'mx-c', user: 'svc_rspamd', ip: '10.64.2.3', process: 'rspamd' },
    { host: 'mx-d', user: 'svc_opendkim', ip: '10.64.3.4', process: 'opendkim' },
    { host: 'mx-e', user: 'svc_milter', ip: '10.64.4.5', process: 'milter' },
  ],
  'fp-manual-newterms-dns': [
    { host: 'nt-dns-01', user: 'svc_dns', ip: '10.70.0.1', process: 'named' },
    { host: 'nt-dns-01', user: 'svc_dns', ip: '10.70.0.1', process: 'named' },
    { host: 'nt-dns-01', user: 'svc_dns', ip: '10.70.0.1', process: 'named' },
    { host: 'nt-dns-01', user: 'svc_dns', ip: '10.70.0.1', process: 'named' },
    { host: 'nt-dns-01', user: 'svc_dns', ip: '10.70.0.1', process: 'named' },
  ],
  'fp-manual-newterms-proxy': [
    { host: 'nt-proxy-02', user: 'svc_proxy', ip: '10.70.1.2', process: 'squid' },
    { host: 'nt-proxy-02', user: 'svc_proxy', ip: '10.70.1.2', process: 'squid' },
    { host: 'nt-proxy-02', user: 'svc_proxy', ip: '10.70.1.2', process: 'squid' },
    { host: 'nt-proxy-02', user: 'svc_proxy', ip: '10.70.1.2', process: 'squid' },
    { host: 'nt-proxy-02', user: 'svc_proxy', ip: '10.70.1.2', process: 'squid' },
  ],
  'fp-manual-newterms-vpn': [
    { host: 'nt-vpn-03', user: 'svc_vpn', ip: '10.70.2.3', process: 'openvpn' },
    { host: 'nt-vpn-03', user: 'svc_vpn', ip: '10.70.2.3', process: 'openvpn' },
    { host: 'nt-vpn-03', user: 'svc_vpn', ip: '10.70.2.3', process: 'openvpn' },
    { host: 'nt-vpn-03', user: 'svc_vpn', ip: '10.70.2.3', process: 'openvpn' },
    { host: 'nt-vpn-03', user: 'svc_vpn', ip: '10.70.2.3', process: 'openvpn' },
  ],
  'fp-manual-newterms-ntp': [
    { host: 'nt-ntp-04', user: 'svc_ntp', ip: '10.70.3.4', process: 'chronyd' },
    { host: 'nt-ntp-04', user: 'svc_ntp', ip: '10.70.3.4', process: 'chronyd' },
    { host: 'nt-ntp-04', user: 'svc_ntp', ip: '10.70.3.4', process: 'chronyd' },
    { host: 'nt-ntp-04', user: 'svc_ntp', ip: '10.70.3.4', process: 'chronyd' },
    { host: 'nt-ntp-04', user: 'svc_ntp', ip: '10.70.3.4', process: 'chronyd' },
  ],
};

/** Query text per fixture: only the over-broad fixture is meant to be narrowed. */
const FIXTURE_QUERIES: Record<string, string> = {
  'fp-host-exception': 'process.name:java and host.os.type:linux',
  'fp-overbroad-query': 'process.name:*',
  'fp-volume-suppression': 'process.name:nmap',
  'fp-low-value-risk': 'process.name:(ssh or curl)',
  'fp-unfixable-noise': 'process.name:kube-probe',
  'fp-suppression-incapable-rule-type': 'process.name:inventory-agent',
  'fp-host-exception-ci': 'process.name:dotnet and host.os.type:linux',
  'fp-host-exception-backup': 'process.name:rsync',
  'fp-host-exception-av': 'process.name:clamscan',
  'fp-host-exception-print': 'process.name:cupsd',
  'fp-host-exception-mdm': 'process.name:jamf',
  'fp-overbroad-wildcard-cmd': 'process.command_line:*',
  'fp-overbroad-any-user': 'user.name:*',
  'fp-overbroad-port-range': 'destination.port>=1',
  'fp-overbroad-parent-any': 'process.parent.name:*',
  'fp-overbroad-ext-match': 'file.extension:*',
  'fp-suppression-healthcheck': 'process.name:curl',
  'fp-suppression-vulnscan': 'process.name:nessus',
  'fp-suppression-inventory': 'process.name:osqueryd',
  'fp-suppression-patchagent': 'process.name:wuauclt',
  'fp-suppression-logship': 'process.name:filebeat',
  'fp-low-value-admin-tools': 'process.name:(psexec or winrm or mstsc)',
  'fp-low-value-devtools': 'process.name:(docker or kubectl or terraform or ansible)',
  'fp-low-value-remote-support': 'process.name:(teamviewer or anydesk or vncviewer)',
  'fp-low-value-archive': 'process.name:(7z or zip or tar or gzip)',
  'fp-low-value-scripting': 'process.name:(python3 or perl or awk or sed)',
  'fp-unfixable-telemetry': 'process.name:otelcol',
  'fp-unfixable-agentmesh': 'process.name:consul',
  'fp-unfixable-buildfarm': 'process.name:bazel',
  'fp-unfixable-imaging': 'process.name:dnsmasq',
  'fp-unfixable-mailflow': 'process.name:postfix',
  'fp-manual-newterms-dns': 'process.name:named',
  'fp-manual-newterms-proxy': 'process.name:squid',
  'fp-manual-newterms-vpn': 'process.name:openvpn',
  'fp-manual-newterms-ntp': 'process.name:chronyd',
};

/**
 * Type-specific required fields per rule type, per `rule_schemas.schema.yaml`. A create
 * payload missing these is rejected by the detection engine API, so the seeded fixture
 * would never exist and the eval would score a seeding bug as a model failure.
 */
const typeSpecificCreateFields = (ruleType: string): Record<string, unknown> => {
  switch (ruleType) {
    case 'new_terms':
      // NewTermsRuleRequiredFields: type, query, new_terms_fields, history_window_start.
      return {
        new_terms_fields: ['user.name'],
        history_window_start: 'now-7d',
      };
    default:
      return {};
  }
};

const baseAlert = (ruleUuid: string, ruleName: string, ruleId: string, seq: number) => ({
  '@timestamp': new Date().toISOString(),
  'kibana.alert.rule.uuid': ruleUuid,
  'kibana.alert.rule.name': ruleName,
  'kibana.alert.rule.rule_id': ruleId,
  'kibana.alert.workflow_status': 'closed',
  'kibana.alert.workflow_reason': 'false_positive',
  'kibana.alert.workflow_tags': [],
  'kibana.alert.severity': 'medium',
  'kibana.alert.risk_score': 40,
  // NOTE: `signal.*` fields are read-only field aliases in the alerts index mapping;
  // writing them fails every bulk item with document_parsing_exception. Write the
  // concrete backing fields instead.
  'kibana.alert.reason': `eval-seed fp cluster ${seq}`,
});

export const seedRuleAndFpAlerts = async (
  { fetch, esClient, log }: SeedContext,
  fixture: SeedFixtureSpec,
  uniqueRuleId: string
): Promise<{ seededUuid: string; ruleId: string }> => {
  // The rule name and description are read by the agent: the harvest KEEPs
  // `kibana.alert.rule.name` and the worker interpolates it straight into the diagnose
  // prompt, and the agent can fetch the rule (description included) through its tools.
  // Fixture ids are self-describing (`fp-overbroad-query`, `fp-unfixable-noise`), and
  // `fixture.expected` IS the golden label — putting either in a reachable field hands
  // the model the answer key and makes every score meaningless. Derive an opaque token
  // instead, and keep the fixture id only in the local log line below.
  const opaqueToken = createHash('sha256').update(uniqueRuleId).digest('hex').slice(0, 12);
  const ruleName = `eval rule-tuning ${opaqueToken}`;
  const ruleId = `eval-rt-${opaqueToken}`;

  // 0. Remove a stale rule from a previous aborted run so the create below is idempotent.
  await fetch(`/api/detection_engine/rules?spaceId=default&rule_id=${encodeURIComponent(ruleId)}`, {
    method: 'DELETE',
    headers: { 'kbn-xsrf': 'true' },
  }).catch(() => {});

  // 1. Create the detection rule via the detection engine API.
  const rule = await fetch<{ id?: string }>('/api/detection_engine/rules?spaceId=default', {
    method: 'POST',
    headers: { 'kbn-xsrf': 'true', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rule_id: ruleId,
      name: ruleName,
      type: fixture.ruleType,
      query: FIXTURE_QUERIES[fixture.id],
      language: 'kuery',
      index: ['logs-endpoint.events.process-default'],
      severity: 'medium',
      risk_score: 40,
      interval: '5m',
      from: 'now-10m',
      to: 'now',
      // The worker only diagnoses enabled rules (rule_tuning.yaml gates diagnose_rule on
      // `fetch_rule.output.enabled == true`) — a disabled rule produces no FPs, so tuning it
      // is meaningless. Seeding it disabled skipped diagnosis and yielded empty proposals.
      // Enabling is safe here: `index` has no source documents, so the rule executes and
      // matches nothing; the FP cluster is bulk-indexed directly against its uuid below.
      enabled: true,
      // Neither the fixture id nor its expected label may appear here: the agent can
      // fetch this rule and read the description. Opaque token only.
      description: `kbn-evals rule-tuning seeded rule ${opaqueToken}`,
      tags: ['eval-rule-tuning'],
      ...typeSpecificCreateFields(fixture.ruleType),
    }),
  });
  log.info(
    `created rule ${rule?.id ?? ruleId} (uuid key ${uniqueRuleId}) for fixture ${fixture.id}`
  );
  const seededUuid: string = rule?.id ?? uniqueRuleId;

  // 2. Index the closed-FP alert cluster against the rule's real uuid.
  const entities = ENTITY_PROFILES[fixture.id] ?? [];
  if (entities.length === 0) {
    throw new Error(`No entity profile for fixture ${fixture.id}`);
  }
  const docs = entities.map((e, i) => ({
    ...baseAlert(seededUuid, ruleName, ruleId, i),
    host: { name: e.host },
    user: { name: e.user },
    source: { ip: e.ip },
    process: { name: e.process },
  }));
  const bulkResp = await esClient.bulk({
    index: ALERTS_INDEX,
    refresh: 'wait_for',
    operations: docs.flatMap((d) => [{ index: {} }, d]),
  });
  const failed = bulkResp.items?.filter((i) => i.index?.error) ?? [];
  if (bulkResp.errors || failed.length > 0) {
    throw new Error(
      `bulk indexing failed for rule ${seededUuid}: ${JSON.stringify(
        failed[0]?.index?.error
      )?.slice(0, 500)}`
    );
  }
  log.info(`indexed ${docs.length} closed-FP alerts for rule uuid ${seededUuid}`);
  return { seededUuid, ruleId };
};

export const cleanupSeededArtifacts = async (
  { fetch, esClient }: { fetch: SeedContext['fetch']; esClient: EsClient },
  seededUuid: string,
  ruleId: string
): Promise<void> => {
  // Alerts first (they reference the rule), then the rule itself. `seededUuid` is the
  // seeded rule's real uuid (returned by seedRuleAndFpAlerts); `ruleId` is the opaque
  // token-derived rule_id it was created under. Recomputing the rule_id from the fixture
  // id here would delete nothing now that ids are token-derived, silently leaking a rule
  // per run into later sweeps.
  await esClient
    .deleteByQuery({
      index: ALERTS_INDEX,
      query: { term: { 'kibana.alert.rule.uuid': seededUuid } },
      refresh: true,
      conflicts: 'proceed',
    })
    .catch(() => {});
  await fetch(`/api/detection_engine/rules?spaceId=default&rule_id=${encodeURIComponent(ruleId)}`, {
    method: 'DELETE',
    headers: { 'kbn-xsrf': 'true' },
  }).catch(() => {});
};
