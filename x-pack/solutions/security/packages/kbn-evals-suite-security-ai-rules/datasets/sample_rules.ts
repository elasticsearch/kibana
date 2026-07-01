/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface RuleThreat {
  technique: string;
  tactic: string;
  subtechnique?: string;
}

export interface ReferenceRule {
  id: string;
  name: string;
  prompt: string;
  description: string;
  query: string;
  threat: RuleThreat[];
  severity: string;
  tags: string[];
  riskScore: number;
  from: string;
  category: string;
  /** Always 'esql' for AI-generated rules */
  type?: string;
  /** Always 'esql' for AI-generated rules */
  language?: string;
  /** Polling interval, e.g. '5m' */
  interval?: string;
  /** Native ES|QL translation of the original query (for non-ES|QL rules) */
  esqlQuery?: string;
  /**
   * Golden tool-call sequence for the trajectory evaluator.
   *
   * If omitted, the evaluator infers the default from `category`:
   *   - `'negative'` → `[]`               (model should refuse, no tools called)
   *   - everything else → `['security.create_detection_rule']`
   *     (the detection-rule-edit SKILL.md instructs the agent to invoke
   *      `security.create_detection_rule` exactly once for new-rule creation;
   *      `attachment_update` is for edits, which this suite does not test)
   *
   * Set this field explicitly when an example expects a non-default sequence
   * (e.g., a future multi-step edit scenario).
   */
  tool_sequence?: string[];
}

/**
 * Sample detection rules from elastic/detection-rules repository
 * These serve as reference examples for evaluating AI-generated rules
 */
export const sampleRules: ReferenceRule[] = [
  {
    id: 'winrar-7z-encryption',
    name: 'Encrypting Files with WinRar or 7z',
    prompt:
      'Alert when an archiving tool is used to create password-protected archives on Windows.\n\nAvailable data: logs-endpoint.events.*',
    description:
      'Identifies the use of WinRAR or 7-Zip to create encrypted archives. Adversaries often compress and encrypt data in preparation for exfiltration.',
    query: `process where host.os.type == "windows" and event.type == "start" and
(
 (
 (
 process.name : ("rar.exe", "WinRAR.exe") or ?process.code_signature.subject_name == "win.rar GmbH" or
 ?process.pe.original_file_name == "WinRAR.exe"
 ) and
 process.args == "a" and process.args : ("-hp*", "-p*", "/hp*", "/p*")
 ) or
 (
 (process.name : ("7z.exe", "7za.exe") or ?process.pe.original_file_name in ("7z.exe", "7za.exe")) and
 process.args == "a" and process.args : "-p*"
 )
) and
 not process.parent.executable : (
 "C:\\\\Program Files\\\\*.exe",
 "C:\\\\Program Files (x86)\\\\*.exe",
 "?:\\\\ManageEngine\\\\*\\\\jre\\\\bin\\\\java.exe",
 "?:\\\\Nox\\\\bin\\\\Nox.exe"
 )`,
    threat: [
      {
        technique: 'T1560.001',
        tactic: 'TA0009',
        subtechnique: 'Archive via Utility',
      },
      {
        technique: 'T1005',
        tactic: 'TA0009',
      },
    ],
    severity: 'medium',
    tags: [
      'Domain: Endpoint',
      'OS: Windows',
      'Use Case: Threat Detection',
      'Tactic: Collection',
      'Data Source: Elastic Defend',
    ],
    riskScore: 47,
    from: 'now-9m',
    category: 'collection',
    esqlQuery: `FROM logs-endpoint.events.* metadata _id, _version, _index
| WHERE host.os.type == "windows" AND event.type == "start"
    AND (
      (
        (process.name IN ("rar.exe", "WinRAR.exe") OR process.code_signature.subject_name == "win.rar GmbH" OR
         process.pe.original_file_name == "WinRAR.exe")
        AND process.args == "a" AND process.args like ("-hp*", "-p*", "/hp*", "/p*")
      ) OR
      (
        (process.name IN ("7z.exe", "7za.exe") OR process.pe.original_file_name IN ("7z.exe", "7za.exe"))
        AND process.args == "a" AND process.args like "-p*"
      )
    )
    AND NOT process.parent.executable like ("C:\\\\Program Files\\\\*.exe", "C:\\\\Program Files (x86)\\\\*.exe", "*:\\\\ManageEngine\\\\*\\\\jre\\\\bin\\\\java.exe", "*:\\\\Nox\\\\bin\\\\Nox.exe")`,
  },
  {
    id: 'lsass-malseclogon',
    name: 'Suspicious LSASS Access via MalSecLogon',
    prompt:
      'Detect suspicious access to Windows credential storage processes.\n\nAvailable data: logs-windows.sysmon_operational*',
    description:
      'Identifies suspicious access to LSASS handle via the MalSecLogon attack technique. This may indicate an attempt to dump credentials.',
    query: `process where host.os.type == "windows" and event.code == "10" and
  winlog.event_data.TargetImage : "?:\\\\WINDOWS\\\\system32\\\\lsass.exe" and
  winlog.event_data.GrantedAccess == "0x1fffff" and
  winlog.event_data.CallTrace : "*seclogon.dll*"`,
    threat: [
      {
        technique: 'T1003.001',
        tactic: 'TA0006',
        subtechnique: 'LSASS Memory',
      },
    ],
    severity: 'high',
    tags: [
      'Domain: Endpoint',
      'OS: Windows',
      'Use Case: Threat Detection',
      'Tactic: Credential Access',
      'Data Source: Sysmon',
    ],
    riskScore: 73,
    from: 'now-9m',
    category: 'credential_access',
    esqlQuery: `FROM logs-windows.sysmon_operational* metadata _id, _version, _index
| WHERE host.os.type == "windows" AND event.code == "10"
    AND winlog.event_data.TargetImage like "*:\\\\WINDOWS\\\\system32\\\\lsass.exe"
    AND winlog.event_data.GrantedAccess == "0x1fffff"
    AND winlog.event_data.CallTrace like "*seclogon.dll*"`,
  },
  {
    id: 'windows-defender-disabled-powershell',
    name: 'Windows Defender Disabled via PowerShell',
    prompt:
      'Alert when endpoint protection is disabled through a scripting engine.\n\nAvailable data: logs-endpoint.events.*',
    description:
      'Identifies use of PowerShell to disable Windows Defender. Adversaries may attempt to disable endpoint protection to evade detection.',
    query: `process where host.os.type == "windows" and event.type == "start" and
  (process.name : ("powershell.exe", "pwsh.exe", "powershell_ise.exe") or ?process.pe.original_file_name in ("powershell.exe", "pwsh.dll", "powershell_ise.exe")) and
  process.args : "Set-MpPreference" and process.args : "-Disable*"`,
    threat: [
      {
        technique: 'T1562.001',
        tactic: 'TA0005',
        subtechnique: 'Disable or Modify Tools',
      },
    ],
    severity: 'medium',
    tags: [
      'Domain: Endpoint',
      'OS: Windows',
      'Use Case: Threat Detection',
      'Tactic: Defense Evasion',
      'Data Source: Elastic Defend',
    ],
    riskScore: 47,
    from: 'now-9m',
    category: 'defense_evasion',
    esqlQuery: `FROM logs-endpoint.events.* metadata _id, _version, _index
| WHERE host.os.type == "windows" AND event.type == "start"
    AND (process.name IN ("powershell.exe", "pwsh.exe", "powershell_ise.exe") OR process.pe.original_file_name IN ("powershell.exe", "pwsh.dll", "powershell_ise.exe"))
    AND process.args == "Set-MpPreference" AND process.args like "-Disable*"`,
  },
  {
    id: 'remote-file-copy-powershell',
    name: 'Remote File Copy via PowerShell',
    prompt:
      'Detect when PowerShell is used to download files from the internet.\n\nAvailable data: logs-endpoint.events.*',
    description:
      'Identifies the use of PowerShell to download files from remote locations. Adversaries may use PowerShell to download malicious payloads.',
    query: `process where host.os.type == "windows" and event.type == "start" and
  (process.name : ("powershell.exe", "pwsh.exe", "powershell_ise.exe") or ?process.pe.original_file_name in ("powershell.exe", "pwsh.dll", "powershell_ise.exe")) and
  (
    process.args : ("*Invoke-WebRequest*", "*iwr*", "*wget*", "*curl*", "*DownloadFile*", "*DownloadString*") and
    process.args : ("http*", "ftp*")
  )`,
    threat: [
      {
        technique: 'T1105',
        tactic: 'TA0011',
      },
    ],
    severity: 'medium',
    tags: [
      'Domain: Endpoint',
      'OS: Windows',
      'Use Case: Threat Detection',
      'Tactic: Command and Control',
      'Data Source: Elastic Defend',
    ],
    riskScore: 47,
    from: 'now-9m',
    category: 'command_and_control',
    esqlQuery: `FROM logs-endpoint.events.* metadata _id, _version, _index
| WHERE host.os.type == "windows" AND event.type == "start"
    AND (process.name IN ("powershell.exe", "pwsh.exe", "powershell_ise.exe") OR process.pe.original_file_name IN ("powershell.exe", "pwsh.dll", "powershell_ise.exe"))
    AND process.args like ("*Invoke-WebRequest*", "*iwr*", "*wget*", "*curl*", "*DownloadFile*", "*DownloadString*")
    AND process.args like ("http*", "ftp*")`,
  },
  {
    id: 'mimikatz-powershell',
    name: 'Mimikatz PowerShell Module Activity',
    prompt:
      'Alert on known credential dumping tools running via PowerShell.\n\nAvailable data: logs-endpoint.events.*',
    description:
      'Identifies use of Mimikatz PowerShell module. Mimikatz is a credential dumping tool used by adversaries to obtain credentials.',
    query: `process where host.os.type == "windows" and event.type == "start" and
  (process.name : ("powershell.exe", "pwsh.exe", "powershell_ise.exe") or ?process.pe.original_file_name in ("powershell.exe", "pwsh.dll", "powershell_ise.exe")) and
  process.args : ("*Invoke-Mimikatz*", "*DumpCreds*", "*sekurlsa*")`,
    threat: [
      {
        technique: 'T1003.001',
        tactic: 'TA0006',
        subtechnique: 'LSASS Memory',
      },
    ],
    severity: 'critical',
    tags: [
      'Domain: Endpoint',
      'OS: Windows',
      'Use Case: Threat Detection',
      'Tactic: Credential Access',
      'Data Source: Elastic Defend',
    ],
    riskScore: 99,
    from: 'now-9m',
    category: 'credential_access',
    esqlQuery: `FROM logs-endpoint.events.* metadata _id, _version, _index
| WHERE host.os.type == "windows" AND event.type == "start"
    AND (process.name IN ("powershell.exe", "pwsh.exe", "powershell_ise.exe") OR process.pe.original_file_name IN ("powershell.exe", "pwsh.dll", "powershell_ise.exe"))
    AND process.args like ("*Invoke-Mimikatz*", "*DumpCreds*", "*sekurlsa*")`,
  },
  {
    id: 'clearing-windows-event-logs',
    name: 'Clearing Windows Event Logs',
    prompt:
      'Detect when Windows audit logs are cleared or modified.\n\nAvailable data: logs-endpoint.events.*',
    description:
      'Identifies attempts to clear Windows event logs. Adversaries may clear event logs to cover their tracks.',
    query: `process where host.os.type == "windows" and event.type == "start" and
  (
    (process.name : "wevtutil.exe" and process.args : "cl") or
    (process.name : ("powershell.exe", "pwsh.exe", "powershell_ise.exe") and 
     process.args : ("*Clear-EventLog*", "*Remove-EventLog*", "*Limit-EventLog*"))
  )`,
    threat: [
      {
        technique: 'T1070.001',
        tactic: 'TA0005',
        subtechnique: 'Clear Windows Event Logs',
      },
    ],
    severity: 'medium',
    tags: [
      'Domain: Endpoint',
      'OS: Windows',
      'Use Case: Threat Detection',
      'Tactic: Defense Evasion',
      'Data Source: Elastic Defend',
    ],
    riskScore: 47,
    from: 'now-9m',
    category: 'defense_evasion',
    esqlQuery: `FROM logs-endpoint.events.* metadata _id, _version, _index
| WHERE host.os.type == "windows" AND event.type == "start"
    AND (
      (process.name == "wevtutil.exe" AND process.args == "cl") OR
      (process.name IN ("powershell.exe", "pwsh.exe", "powershell_ise.exe") AND
       process.args like ("*Clear-EventLog*", "*Remove-EventLog*", "*Limit-EventLog*"))
    )`,
  },
  {
    id: 'suspicious-windows-utility-execution',
    name: 'Suspicious Execution via Windows Utility',
    prompt:
      'Alert when built-in Windows utilities execute scripts or remote content.\n\nAvailable data: logs-endpoint.events.*',
    description:
      'Identifies execution of a suspicious command via a Windows built-in utility. Adversaries may abuse trusted binaries to execute malicious code.',
    query: `process where host.os.type == "windows" and event.type == "start" and
  (
    process.name : "mshta.exe" and process.args : ("http*", "ftp*", "*.hta", "*.vbs", "javascript:*", "vbscript:*")
  ) or
  (
    process.name : "regsvr32.exe" and process.args : ("http*", "ftp*", "/s", "-s", "/i", "-i", "scrobj.dll")
  )`,
    threat: [
      {
        technique: 'T1218',
        tactic: 'TA0005',
      },
    ],
    severity: 'high',
    tags: [
      'Domain: Endpoint',
      'OS: Windows',
      'Use Case: Threat Detection',
      'Tactic: Defense Evasion',
      'Data Source: Elastic Defend',
    ],
    riskScore: 73,
    from: 'now-9m',
    category: 'defense_evasion',
    esqlQuery: `FROM logs-endpoint.events.* metadata _id, _version, _index
| WHERE host.os.type == "windows" AND event.type == "start"
    AND (
      (process.name == "mshta.exe" AND process.args like ("http*", "ftp*", "*.hta", "*.vbs", "javascript:*", "vbscript:*"))
      OR
      (process.name == "regsvr32.exe" AND process.args like ("http*", "ftp*", "/s", "-s", "/i", "-i", "scrobj.dll"))
    )`,
  },
  {
    id: 'network-connection-windows-binary',
    name: 'Suspicious Network Connection from Windows Binary',
    prompt:
      'Detect outbound network connections initiated by Windows system binaries.\n\nAvailable data: logs-endpoint.events.*',
    description:
      'Identifies network connections from Windows system binaries. This may indicate abuse of trusted binaries for command and control.',
    query: `network where host.os.type == "windows" and event.type == "start" and
  process.name : ("certutil.exe", "bitsadmin.exe", "mshta.exe", "regsvr32.exe", "rundll32.exe") and
  destination.port : (80, 443, 8080, 8443) and
  not destination.ip : ("10.*", "172.16.*", "192.168.*", "127.*")`,
    threat: [
      {
        technique: 'T1071',
        tactic: 'TA0011',
      },
    ],
    severity: 'medium',
    tags: [
      'Domain: Endpoint',
      'OS: Windows',
      'Use Case: Threat Detection',
      'Tactic: Command and Control',
      'Data Source: Elastic Defend',
    ],
    riskScore: 47,
    from: 'now-9m',
    category: 'command_and_control',
    esqlQuery: `FROM logs-endpoint.events.* metadata _id, _version, _index
| WHERE host.os.type == "windows" AND event.type == "start"
    AND process.name IN ("certutil.exe", "bitsadmin.exe", "mshta.exe", "regsvr32.exe", "rundll32.exe")
    AND destination.port IN (80, 443, 8080, 8443)
    AND NOT CIDR_MATCH(destination.ip, "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8")`,
  },
];
