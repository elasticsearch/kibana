/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Must match the `kerberos` config set's pinned Kibana host:port (set via configureHTTP2).
export const KIBANA_TLS_ORIGIN = 'https://localhost:5620';

// Kerberos realm name configured in the `kerberos` server config set.
export const KERBEROS_REALM_NAME = 'kerb1';

// Pre-generated SPNEGO token for `tester@TEST.ELASTIC.CO`, validated by ES against the
// `krb5.keytab` fixture (service principal `HTTP/localhost@TEST.ELASTIC.CO`). The same token is
// reused across requests; the `kerberos` config set disables the ES replay cache so reuse is
// allowed. Sourced verbatim from `getSPNEGOToken()` in
// `@kbn/security-api-integration-helpers/kerberos/kerberos_tools` — inlined here to avoid a typed
// dependency from this plugin on that private, devOnly test helper.
//
// SOURCE OF TRUTH: if the `krb5.keytab` fixture is ever regenerated, this token becomes invalid and
// must be updated together with the copy in `getSPNEGOToken()` (the FTR Kerberos tests read it from
// there). Keep the two in lockstep.
export const SPNEGO_TOKEN =
  'YIIChwYGKwYBBQUCoIICezCCAnegDTALBgkqhkiG9xIBAgKiggJkBIICYGCCAlwGCSqGSIb3EgECAgEAboICSzCCAkegAwIBBaEDAgEOogcDBQAAAAAAo4IBW2GCAVcwggFToAMCAQWhERsPVEVTVC5FTEFTVElDLkNPohwwGqADAgEDoRMwERsESFRUUBsJbG9jYWxob3N0o4IBGTCCARWgAwIBEqEDAgECooIBBwSCAQNBN2a1Rso+KEJsDwICYLCt7ACLzdlbhEZF5YNsehO109b/WiZR1VTK6kCQyDdBdQFefyvV8EiC35mz7XnTb239nWz6xBGbdmtjSfF0XzpXKbL/zGzLEKkEXQuqFLPUN6qEJXsh0OoNdj9OWwmTr93FVyugs1hO/E5wjlAe2SDYpBN6uZICXu6dFg9nLQKkb/XgbgKM7ZZvgA/UElWDgHav4nPO1VWppCCLKHqXTRnvpr/AsxeON4qeJLaukxBigfIaJlLFMNQal5H7MyXa0j3Y1sckbURnWoBt6r4XE7c8F8cz0rYoGwoCO+Cs5tNutKY6XcsAFbLh59hjgIkhVBhhyTeypIHSMIHPoAMCARKigccEgcSsXqIRAcHfZivrbHfsnvbFgmzmnrKVPFNtJ9Hl23KunCsNW49nP4VF2dEf9n12prDaIguJDV5LPHpTew9rmCj1GCahKJ9bJbRKIgImLFd+nelm3E2zxRqAhrgM1469oDg0ksE3+5lJBuJlVEECMp0F/gxvEiL7DhasICqw+FOJ/jD9QUYvg+E6BIxWgZyPszaxerzBBszAhIF1rxCHRRL1KLjskNeJlBhH77DkAO6AEmsYGdsgEq7b7uCov9PKPiiPAuFF';
