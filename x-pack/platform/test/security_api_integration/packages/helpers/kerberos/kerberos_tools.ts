/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// NOTE: this token is validated by ES against the `krb5.keytab` fixture. A verbatim copy also lives
// in the Scout Kerberos suite (`x-pack/platform/plugins/shared/security/test/scout_kerberos/ui/fixtures/constants.ts`,
// inlined there to avoid a typed dependency on this devOnly package). If the keytab is ever
// regenerated, update both copies in lockstep.
export function getSPNEGOToken() {
  return 'YIIChwYGKwYBBQUCoIICezCCAnegDTALBgkqhkiG9xIBAgKiggJkBIICYGCCAlwGCSqGSIb3EgECAgEAboICSzCCAkegAwIBBaEDAgEOogcDBQAAAAAAo4IBW2GCAVcwggFToAMCAQWhERsPVEVTVC5FTEFTVElDLkNPohwwGqADAgEDoRMwERsESFRUUBsJbG9jYWxob3N0o4IBGTCCARWgAwIBEqEDAgECooIBBwSCAQNBN2a1Rso+KEJsDwICYLCt7ACLzdlbhEZF5YNsehO109b/WiZR1VTK6kCQyDdBdQFefyvV8EiC35mz7XnTb239nWz6xBGbdmtjSfF0XzpXKbL/zGzLEKkEXQuqFLPUN6qEJXsh0OoNdj9OWwmTr93FVyugs1hO/E5wjlAe2SDYpBN6uZICXu6dFg9nLQKkb/XgbgKM7ZZvgA/UElWDgHav4nPO1VWppCCLKHqXTRnvpr/AsxeON4qeJLaukxBigfIaJlLFMNQal5H7MyXa0j3Y1sckbURnWoBt6r4XE7c8F8cz0rYoGwoCO+Cs5tNutKY6XcsAFbLh59hjgIkhVBhhyTeypIHSMIHPoAMCARKigccEgcSsXqIRAcHfZivrbHfsnvbFgmzmnrKVPFNtJ9Hl23KunCsNW49nP4VF2dEf9n12prDaIguJDV5LPHpTew9rmCj1GCahKJ9bJbRKIgImLFd+nelm3E2zxRqAhrgM1469oDg0ksE3+5lJBuJlVEECMp0F/gxvEiL7DhasICqw+FOJ/jD9QUYvg+E6BIxWgZyPszaxerzBBszAhIF1rxCHRRL1KLjskNeJlBhH77DkAO6AEmsYGdsgEq7b7uCov9PKPiiPAuFF';
}

export function getMutualAuthenticationResponseToken() {
  return 'oRQwEqADCgEAoQsGCSqGSIb3EgECAg==';
}
