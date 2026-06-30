/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Detection, Discovery } from '@kbn/significant-events-schema';
import type { DatasetConfig } from '../types';

const toInputDetections = (discoveries: Array<Partial<Discovery>>): Array<Partial<Detection>> =>
  discoveries
    .flatMap((discovery) => discovery.detections ?? [])
    .map((detection) => ({
      ...detection,
      detection_evidence: {
        change_point_type: 'spike',
        p_value: 0.0001,
      },
    }));

/**
 * Canonical cascade discovery — the lean ground truth shared by the investigator (expected output)
 * and the judge (input). Evidences carry the `esql_query` to re-run but are deliberately NOT
 * pre-stamped `confirmed` — the judge must re-verify each query via execute_esql and stamp
 * `confirmed: true` itself before promoting (Critical Rule 5). Every field here is seeded by one of
 * the cascade `detections`, so the canonical input and this expected answer stay self-consistent.
 */
const LEDGER_DB_CASCADE_DISCOVERY: Partial<Discovery> = {
  kind: 'discovery',
  discovery_slug: 'transactionhistory__frontend-transactionhistory-read-timeout',
  title:
    'transactionhistory — DB and cache layer: connection failures cascading to frontend read timeouts',
  summary:
    'transactionhistory, balancereader, and ledgerwriter are failing off the same ledger-db outage: transactionhistory cannot obtain SQL connections to ledger-db (SQLState 08001) and its HikariCP pool fails to initialize, cache errors surface in transactionhistory and balancereader, frontend read requests to transactionhistory are timing out, and ledgerwriter cannot retrieve account balances from balancereader to commit transactions. Users cannot view transaction history or account balances, and payment/deposit submissions fail. Onset ~14:30 UTC with no sign of recovery.',
  root_cause:
    "transactionhistory's HikariCP connection pool cannot reach the ledger-db PostgreSQL backend (SQLState 08001); the shared cache layer then errors, so transactionhistory and balancereader cannot serve reads and the frontend receives read timeouts on transaction-history calls. ledgerwriter additionally fails because it calls balancereader to validate balances before committing, propagating the outage to payment and deposit submissions.",
  criticality: 90,
  confidence: 82,
  detections: [
    {
      kind: 'detection',
      rule_name: 'Transaction history SQL connection failure',
      rule_uuid: '52ad96d3-5d06-5baa-b2de-cd654fbe33f6',
      stream_name: 'logs',
    },
    {
      kind: 'detection',
      rule_name: 'HikariCP connection pool initialization',
      rule_uuid: 'f0816e40-c465-563f-91fc-280e23a4ef4e',
      stream_name: 'logs',
    },
    {
      kind: 'detection',
      rule_name: 'Transaction history cache errors',
      rule_uuid: 'e2b04e1f-44ed-582f-8e4f-9f62e4706141',
      stream_name: 'logs',
    },
    {
      kind: 'detection',
      rule_name: 'Balance reader cache errors',
      rule_uuid: '5961763e-fabc-5bdc-a5fc-aa2c5c4af768',
      stream_name: 'logs',
    },
    {
      kind: 'detection',
      rule_name: 'Frontend → transactionhistory read timeout',
      rule_uuid: '1432a71f-0833-55c7-93f4-ac40261e47df',
      stream_name: 'logs',
    },
    {
      kind: 'detection',
      rule_name: 'Ledger writer failed to retrieve account balance',
      rule_uuid: 'c3a7f1e9-4b2d-5e86-9a1c-7d3f2b8e0a64',
      stream_name: 'logs',
    },
  ],
  cause_kis: [
    { name: 'transactionhistory', stream_name: 'logs' },
    { name: 'balancereader', stream_name: 'logs' },
    { name: 'ledgerwriter', stream_name: 'logs' },
  ],
  dependency_edges: [
    { source: 'transactionhistory', target: 'ledger-db', exposure: 'exposed' },
    { source: 'balancereader', target: 'ledger-db', exposure: 'exposed' },
    { source: 'frontend', target: 'transactionhistory', exposure: 'exposed' },
    { source: 'ledgerwriter', target: 'balancereader', exposure: 'exposed' },
    { source: 'ledgerwriter', target: 'ledger-db', exposure: 'exposed' },
  ],
  // Lean evidence trail — carries the `esql_query` for the judge to re-run; no `confirmed` stamp
  // (the judge must verify each query itself and stamp `confirmed: true` before promoting).
  evidences: [
    {
      rule_name: 'Transaction history SQL connection failure',
      rule_uuid: '52ad96d3-5d06-5baa-b2de-cd654fbe33f6',
      stream_name: 'logs',
      result: 'found',
      row_count: 1,
      description:
        'Testing: whether transactionhistory cannot obtain SQL connections to the ledger-db PostgreSQL backend. Expected if true: SQLState 08001 connection-failure errors on the JDBC path. Found: 1 row at 14:34:19Z — SQL Error 0, SQLState: 08001 (connection refused) from transactionhistory. Verdict: confirms — the database backend is unreachable, breaking transaction-history reads.',
      esql_query:
        'FROM logs | WHERE @timestamp >= "2026-06-25T14:30:00Z" AND @timestamp <= NOW() | WHERE MATCH_PHRASE(body.text, "SQLState: 08001") | KEEP @timestamp, body.text | SORT @timestamp ASC | LIMIT 1',
    },
    {
      rule_name: 'HikariCP connection pool initialization',
      rule_uuid: 'f0816e40-c465-563f-91fc-280e23a4ef4e',
      stream_name: 'logs',
      result: 'found',
      row_count: 1,
      description:
        "Testing: whether transactionhistory's HikariCP connection pool is repeatedly failing to initialize against ledger-db. Expected if true: recurring 'HikariPool-1 - Starting' re-initialization lines on the JDBC path. Found: 1 row at 14:34:19Z — HikariPool-1 restarting as it fails to acquire a database connection. Verdict: confirms — the pool cannot establish connections, the mechanism behind the SQLState 08001 failures.",
      esql_query:
        'FROM logs | WHERE @timestamp >= "2026-06-25T14:30:00Z" AND @timestamp <= NOW() | WHERE MATCH_PHRASE(body.text, "HikariPool-1 - Starting") | KEEP @timestamp, body.text | SORT @timestamp ASC | LIMIT 1',
    },
    {
      rule_name: 'Transaction history cache errors',
      rule_uuid: 'e2b04e1f-44ed-582f-8e4f-9f62e4706141',
      stream_name: 'logs',
      result: 'found',
      row_count: 1,
      description:
        "Testing: whether transactionhistory's cache layer is failing as a downstream effect of the database outage. Expected if true: 'getTransactions | Cache error' entries from transactionhistory. Found: 1 row at 14:34:59Z — transactionhistory emitting 'getTransactions | Cache error'. Verdict: confirms — cache reads are failing, leaving transactionhistory unable to serve transaction lists.",
      esql_query:
        'FROM logs | WHERE @timestamp >= "2026-06-25T14:30:00Z" AND @timestamp <= NOW() | WHERE MATCH_PHRASE(body.text, "getTransactions | Cache error") | KEEP @timestamp, body.text | SORT @timestamp ASC | LIMIT 1',
    },
    {
      rule_name: 'Balance reader cache errors',
      rule_uuid: '5961763e-fabc-5bdc-a5fc-aa2c5c4af768',
      stream_name: 'logs',
      result: 'found',
      row_count: 1,
      description:
        "Testing: whether balancereader is hit by the same cache failure as transactionhistory. Expected if true: 'getBalance | Cache error' entries from balancereader. Found: 1 row at 14:34:59Z — balancereader emitting 'getBalance | Cache error' from the same DB outage. Verdict: confirms — the failure spans both read services, broadening the blast radius to balance lookups.",
      esql_query:
        'FROM logs | WHERE @timestamp >= "2026-06-25T14:30:00Z" AND @timestamp <= NOW() | WHERE MATCH_PHRASE(body.text, "getBalance | Cache error") | KEEP @timestamp, body.text | SORT @timestamp ASC | LIMIT 1',
    },
    {
      rule_name: 'Frontend → transactionhistory read timeout',
      rule_uuid: '1432a71f-0833-55c7-93f4-ac40261e47df',
      stream_name: 'logs',
      result: 'found',
      row_count: 1,
      description:
        'Testing: whether the database cascade surfaces to end users as frontend read failures against transactionhistory. Expected if true: HTTPConnectionPool read timeout / connection refused from frontend to transactionhistory:8080. Found: 1 row at 14:33:36Z — connection refused (Errno 111) to transactionhistory:8080 on the /transactions path. Verdict: confirms — users cannot view transaction history; the backend failure is user-visible.',
      esql_query:
        'FROM logs | WHERE @timestamp >= "2026-06-25T14:30:00Z" AND @timestamp <= NOW() | WHERE MATCH_PHRASE(body.text, "Error getting transaction_list") | KEEP @timestamp, body.text | SORT @timestamp ASC | LIMIT 1',
    },
    {
      rule_name: 'Ledger writer failed to retrieve account balance',
      rule_uuid: 'c3a7f1e9-4b2d-5e86-9a1c-7d3f2b8e0a64',
      stream_name: 'logs',
      result: 'found',
      row_count: 1,
      description:
        "Testing: whether ledgerwriter is blocked from committing transactions because it cannot retrieve account balances from balancereader. Expected if true: ERROR from LedgerWriterController 'Failed to retrieve account balance'. Found: 1 row at 14:34:29Z — ledgerwriter logging 'Failed to retrieve account balance'. Verdict: confirms — ledgerwriter cannot validate balances via balancereader, so payment and deposit submissions fail.",
      esql_query:
        'FROM logs | WHERE @timestamp >= "2026-06-25T14:30:00Z" AND @timestamp <= NOW() | WHERE MATCH_PHRASE(body.text, "Failed to retrieve account balance") | KEEP @timestamp, body.text | SORT @timestamp ASC | LIMIT 1',
    },
  ],
};

/** Benign authentication activity spike — must stay a SEPARATE discovery from the failure cascade. */
const BENIGN_AUTH_DISCOVERY: Partial<Discovery> = {
  kind: 'discovery',
  discovery_slug: 'userservice__successful-user-login',
  title: 'User Service — login and account creation: successful activity volume spike',
  summary:
    'userservice is logging a spike in successful login and account-creation events. No user-blocking failure is occurring — all observed events are successful completions, consistent with load-generator activity ramping up around 14:30 UTC. This is a separate, independent signal from the backend cascade and does not represent a failure condition.',
  root_cause:
    'Normal load-driven volume increase in successful login and account-creation traffic; all operations succeeded — no failure condition.',
  criticality: 10,
  confidence: 68,
  detections: [
    {
      kind: 'detection',
      rule_name: 'Successful user login',
      rule_uuid: 'cbfedad7-d40c-5dde-a84f-d1cba23084b3',
      stream_name: 'logs',
    },
    {
      kind: 'detection',
      rule_name: 'New user account created',
      rule_uuid: 'd60afc3c-dac9-51b5-b55d-bfd6c522b269',
      stream_name: 'logs',
    },
  ],
  cause_kis: [{ name: 'userservice', stream_name: 'logs' }],
  evidences: [
    {
      rule_name: 'Successful user login',
      rule_uuid: 'cbfedad7-d40c-5dde-a84f-d1cba23084b3',
      stream_name: 'logs',
      result: 'found',
      row_count: 1,
      description:
        'Testing: whether the spike in successful logins represents a failure or anomalous activity. Expected if true: error logs or credential-stuffing patterns. Found: 1 row at 14:30:05Z — successful login event with no error signature. Verdict: refutes — the spike is a volume increase in successful logins, consistent with load-generator ramp-up.',
      esql_query:
        'FROM logs | WHERE @timestamp >= "2026-06-25T14:30:00Z" AND @timestamp <= NOW() | WHERE MATCH_PHRASE(body.text, "Login Successful") | KEEP @timestamp, body.text | SORT @timestamp ASC | LIMIT 1',
    },
    {
      rule_name: 'New user account created',
      rule_uuid: 'd60afc3c-dac9-51b5-b55d-bfd6c522b269',
      stream_name: 'logs',
      result: 'found',
      row_count: 1,
      description:
        'Testing: whether the spike in new account creations represents a failure or anomalous activity. Expected if true: error logs or suspicious automated-creation patterns. Found: 1 row at 14:30:12Z — successful account-creation event with no error signature. Verdict: refutes — the spike is a volume increase in successful account creations, consistent with load-generator ramp-up.',
      esql_query:
        'FROM logs | WHERE @timestamp >= "2026-06-25T14:30:00Z" AND @timestamp <= NOW() | WHERE MATCH_PHRASE(body.text, "Successfully created user") | KEEP @timestamp, body.text | SORT @timestamp ASC | LIMIT 1',
    },
  ],
};

export const discoveryInvestigator: DatasetConfig['discoveryInvestigator'] = [
  {
    input: {
      scenario_id: 'ledger-db-disconnect',
      stream_name: 'logs',
      detections: toInputDetections([LEDGER_DB_CASCADE_DISCOVERY, BENIGN_AUTH_DISCOVERY]),
    },
    // Ground-truth continuation chains (ordered, by readable `rule_name`) the continuation eval
    // replays one rule per cycle. Each chain legitimately continues ONE episode, so the agent
    // should reuse a single slug. `semantic` = same service + symptom, no rule_uuid overlap;
    // `cascade` = upstream → downstreams across services, linked by dependency topology.
    continuationChains: {
      semantic: [
        'Transaction history SQL connection failure',
        'HikariCP connection pool initialization',
      ],
      cascade: [
        'Transaction history SQL connection failure',
        'Frontend → transactionhistory read timeout',
        'Ledger writer failed to retrieve account balance',
      ],
    },
    output: {
      expected_ground_truth:
        'discoveries=[ledger-db-cascade (transactionhistory/balancereader/ledgerwriter->ledger-db SQLState 08001, cache errors, frontend read timeouts), benign-auth (successful login/signup spike, no failures)]',
      expected_discoveries: [LEDGER_DB_CASCADE_DISCOVERY, BENIGN_AUTH_DISCOVERY],
      criteria: [
        {
          id: 'root-cause-sql-connection',
          text: 'Identifies the transactionhistory↔ledger-db SQL connection failure (SQLState 08001 / failed JDBC connections, HikariCP pool init) as the root cause of the failure cascade.',
          score: 3,
        },
        {
          id: 'cascade-grouping',
          text: 'Collapses the SQL connection failure, HikariCP pool init, cache-layer errors (transaction history + balance reader), the frontend→transactionhistory read timeout, and the ledgerwriter balance-retrieval failure into a single cascading discovery rather than separate unrelated incidents.',
          score: 2,
        },
        {
          id: 'separate-benign-auth',
          text: 'Keeps the benign authentication activity (successful logins, new account creation) as its own discovery, separate from the failure cascade — does not lump it into the database incident.',
          score: 2,
        },
        {
          id: 'dependency-chain',
          text: 'Names the dependency from transactionhistory to ledger-db (via HikariCP/JDBC) and the downstream impact on the frontend read path.',
          score: 1,
        },
        {
          id: 'error-signatures',
          text: 'Cites observed error signatures (SQLState 08001, cache error, read timeout) rather than generic phrasing.',
          score: 1,
        },
      ],
    },
    metadata: { difficulty: 'medium', failure_domain: 'ledger-db', failure_mode: 'cascade' },
  },
];
export const discoveryJudge: DatasetConfig['discoveryJudge'] = [
  {
    id: 'ledger-db-disconnect',
    input: {
      scenario_id: 'ledger-db-disconnect',
      discoveries: [LEDGER_DB_CASCADE_DISCOVERY, BENIGN_AUTH_DISCOVERY],
    },
    output: {
      expected_ground_truth:
        'cascade discovery (transactionhistory/balancereader/ledgerwriter → ledger-db SQLState 08001, ' +
        'user-blocking read timeouts)=promoted; ' +
        'benign authentication spike (successful logins/signups only, no failures)=demoted',
      criteria: [
        {
          id: 'promote-active-cascade',
          text: 'Promotes the cascade discovery: active database-connectivity failures cascading to user-facing transactionhistory read timeouts warrant immediate on-call action.',
          score: 3,
        },
        {
          id: 'independent-verification',
          text: "Independently verifies at least one key evidence via execute_esql before deciding — re-runs an esql_query from the cascade discovery's input evidences[] and stamps confirmed: true from its own query results, rather than trusting pre-collected findings at face value.",
          score: 2,
        },
        {
          id: 'demote-benign-auth',
          text: 'Demotes the benign authentication spike: successful login and account-creation volume without failure symptoms, blocked user tasks, or sensitive-data exposure is not an actionable incident.',
          score: 3,
        },
        {
          id: 'do-not-escalate-benign-auth',
          text: 'Does not promote or acknowledge the benign authentication spike as if it were part of the ledger-db outage; it stays separate non-incident noise.',
          score: 2,
        },
      ],
    },
    metadata: { difficulty: 'medium', failure_domain: 'ledger-db', failure_mode: 'cascade' },
  },
];
