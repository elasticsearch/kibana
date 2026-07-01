/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Example } from '@kbn/evals';

/**
 * Canonical regression dataset for ES|QL generation, 31 examples.
 *
 * Each entry pairs a natural-language question (`input.question`) with the
 * ground-truth ES|QL query (`output.query`). To extend the suite, add a new
 * entry to this array; tests in `dataset.test.ts` pin the example count and
 * basic shape so accidental drops are caught.
 */
export const esqlGenerationDataset: Array<
  Example<
    { question: string },
    {
      query: string;
      /**
       * Optional golden tool-call sequence. When present, the trajectory
       * evaluator scores the agent's actual tool path (order + coverage)
       * against it. Examples without an annotation report N/A so partial
       * datasets don't dilute averages. Authored per-example in follow-up work.
       */
      expectedToolSequence?: string[];
    }
  >
> = [
  {
    input: {
      question: `I want to see an ES|QL query that does the following: extract the query duration from the message field in postgres-logs*, and calculate the avg`,
    },
    output: {
      query: `FROM postgres-logs*\n| DISSECT message "%{} duration: %{query_duration} ms"\n| EVAL query_duration_num = TO_DOUBLE(query_duration)\n| STATS avg_duration = AVG(query_duration_num)`,
    },
  },
  {
    input: {
      question: `I want to see an ES|QL query for metrics-apm-*, filtering on metricset.name:transaction and metricset.interval:1m, showing the average duration (via transaction.duration.us), in 50 buckets.`,
    },
    output: {
      query: `FROM metrics-apm-*\n| WHERE metricset.name == "transaction" AND metricset.interval == "1m"\n| EVAL bucket = BUCKET(@timestamp, 50, "2024-04-02T00:00:00.000Z", "2024-04-03T00:00:00.000Z")\n| STATS avg_duration = AVG(transaction.duration.us) BY bucket`,
    },
  },
  {
    input: {
      question: `I want to show a list of services with APM data. My data is in \`traces-apm-*\`. I want to show the average transaction duration, the success rate (by dividing event.outcome:failure by event.outcome:failure+success), and total amount of requests. As a time range, select the last 24 hours. Just show me the ES|QL query.`,
    },
    output: {
      query: `FROM traces-apm-*\n| WHERE @timestamp >= NOW() - 24 hours\n| EVAL successful = CASE(event.outcome == "success", 1, 0),\n  failed = CASE(event.outcome == "failure", 1, 0)\n| STATS success_rate = AVG(successful), \n  avg_duration = AVG(transaction.duration), \n  total_requests = COUNT(transaction.id) BY service.name`,
    },
  },
  {
    input: {
      question: `From \`nyc_taxis-*\`, give me the top 10 results where the drop off time was between 6am and 10am. Just give me the ES|QL query.`,
    },
    output: {
      query: `FROM nyc_taxis-*\n| WHERE DATE_EXTRACT("hour_of_day", drop_off_time) >= 6 AND DATE_EXTRACT("hour_of_day", drop_off_time) < 10\n| LIMIT 10`,
    },
  },
  {
    input: {
      question: `From employees-*, I want to see the 5 earliest employees (hire_date), I want to display only the month and the year that they were hired in and their employee number (emp_no). Format the date as e.g. "September 2019". Only show the ES|QL query.`,
    },
    output: {
      query: `FROM employees-*\n| EVAL hire_date_formatted = DATE_FORMAT("MMMM yyyy", hire_date)\n| SORT hire_date\n| KEEP emp_no, hire_date_formatted\n| LIMIT 5`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will look for all process events for the process "curl.exe". Calculate the sum of outbound bytes for this process by the destination address. Output the results in KB, also sorted by KB in descending order. Limit to the top 10 results.`,
    },
    output: {
      query: `from logs-*\n| where process.name == "curl.exe"\n| stats bytes = sum(source.bytes) by destination.address\n| eval kb =  bytes/1024\n| sort kb desc\n| limit 10\n| keep kb,destination.address`,
    },
  },
  {
    input: {
      question: `from \`metricbeat*\`, I want to see the percentage of CPU time normalized by the number of CPU cores, broken down by hostname. the fields are system.cpu.user.pct, system.cpu.system.pct, and system.cpu.cores. Just show me the ES|QL query`,
    },
    output: {
      query: `FROM metricbeat*\n| EVAL cpu_pct_normalized = (system.cpu.user.pct + system.cpu.system.pct) / system.cpu.cores\n| STATS AVG(cpu_pct_normalized) BY host.name`,
    },
  },
  {
    input: {
      question: `From employees, I want to sort the documents by salary, and then return 10 results per page, and then see the second page. Show me an ES|QL query.`,
    },
    output: {
      query: `Pagination is not supported`,
    },
  },
  {
    input: {
      question: `My logs data (ECS) is in \`logs-*\`. Show me an ES|QL query that gets the average CPU per host, limit it to the top 10 results, in 1m buckets, and only include the last 15m.`,
    },
    output: {
      query: `FROM logs-*\n| WHERE @timestamp >= NOW() - 15 minutes\n| EVAL bucket = DATE_TRUNC(1 minute, @timestamp)\n| STATS avg_cpu = AVG(system.cpu.total.norm.pct) BY bucket, host.name\n| LIMIT 10`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will search for the following use case: \nDetecting Connections to Non-Standard SSH Ports`,
    },
    output: {
      query: `FROM logs-*\n| WHERE destination.port NOT IN (22) AND process.name == "ssh"\n| KEEP source.ip, destination.ip, destination.port`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will search for the following use case: \nLocating Suspicious Concatenated Strings in Logs (Possible Script or Malware)`,
    },
    output: {
      query: `FROM logs-*\n| WHERE CONCAT("evil", "payload") IN log.message\n| KEEP log.message`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will filter for file creation events. Count the number of file interactions by the process interacting with the file, and the host name. From the process name field, parse and output two new fields that represent the process and the process extension separately. Calculate the length of the process name and filter for events where the length is greater than 15 characters. Sort the result based on the process length and filecount in descending order. Limit the results to the top 10.`,
    },
    output: {
      query: `from logs-*\n| where event.category == "file" and event.action == "creation"\n| stats filecount = count(file.name) by process.name,host.name\n| dissect process.name "%{process}.%{extension}" \n| eval proclength = length(process.name)\n| where proclength > 10 \n| sort filecount,proclength desc\n| limit 10 \n| keep host.name,process.name,filecount,process,extension,fullproc,proclength`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will:\nIdentify Data Exfiltration by Monitoring Outgoing Data Size`,
    },
    output: {
      query: `FROM logs-*\n| WHERE network.direction == "outbound"\n| STATS data_size = SUM(bytes_transferred) by destination.ip\n| WHERE data_size > 1000000\n| KEEP destination.ip, data_size`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will search for the following use case: \nIdentifying Rare User Agents`,
    },
    output: {
      query: `FROM logs-*\n| STATS user_agent_count = COUNT(user_agent.original) by user_agent.original\n| WHERE user_agent_count < 5\n| KEEP user_agent.original`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will search for the following use case: \nIdentifying Processes Running from Temporary Directories`,
    },
    output: {
      query: `FROM logs-*\n| WHERE process.working_directory RLIKE "/tmp.*"\n| KEEP process.name, process.working_directory`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will search for the following use case: \nIdentifying Potential Phishing Domains`,
    },
    output: {
      query: `FROM logs-*\n| WHERE url.domain RLIKE ".*paypa1.*|.*banking.*"\n| KEEP source.ip, url.domain`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will search for the following use case: \nLocating Suspicious Outbound Connections`,
    },
    output: {
      query: `FROM logs-*\n| WHERE destination.port NOT IN (80, 443) and direction == "outbound"\n| KEEP source.ip, destination.ip, destination.port`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will parse the DNS registered domain from a DNS query, count the number distinct DNS queries being made per DNS registered domain and filter for when the distinct count is greater than 5. The query should sort the results by the distinct count of queries in descending order.`,
    },
    output: {
      query: `from logs-*\n| grok dns.question.name "%{DATA}\\\\.%{GREEDYDATA:dns.question.registered_domain:string}"\n| stats unique_queries = count_distinct(dns.question.name) by dns.question.registered_domain, process.name\n| where unique_queries > 5\n| sort unique_queries desc`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will search for the following use case: \nUncovering Connections to Non-Standard SSH Ports Outside of Local Network`,
    },
    output: {
      query: `FROM logs-*\n| WHERE CIDR_MATCH(ip, "10.0.0.0/8", "192.168.0.0/16")\n| DISSECT user_agent "%{browser_name}/%{browser_version} (%{os_name}; %{os_version})"`,
    },
  },
  {
    input: {
      question: `For standard Elastic ECS compliant packetbeat data view, create an ES|QL query that shows the top 10 unique domains by doc count`,
    },
    output: {
      query: `FROM packetbeat-*\n| STATS doc_count = COUNT(destination.domain) BY destination.domain\n| SORT doc_count DESC\n| LIMIT 10`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will search for the following use case: \nDetecting Large Data Transfers`,
    },
    output: {
      query: `FROM logs-*\n| WHERE network.bytes > 1000000\n| KEEP source.ip, destination.ip, network.bytes`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will :\nCategorize Data Transfer Sizes`,
    },
    output: {
      query: `FROM logs-*\n| EVAL transfer_category = CASE(\n    bytes_transferred < 1000, "Small",\n    bytes_transferred < 100000, "Medium",\n    "Large")\n| STATS transfer_count = COUNT(transfer_category) by transfer_category\n| KEEP transfer_category, transfer_count`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will search for the following use case: \nDetecting Potential Beaconing Activity`,
    },
    output: {
      query: `FROM logs-*\n| STATS domain_requests = COUNT(url.domain) by source.ip, domain\n| WHERE domain_requests > 100\n| KEEP source.ip, url.domain`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will search for the following use case: \nIdentifying Distinct IP counts Accessing Rare Endpoints`,
    },
    output: {
      query: `FROM logs-*\n| WHERE url.path RLIKE "/admin/*"\n| STATS unique_count = COUNT_DISTINCT(source.ip) by source.ip\n| KEEP unique_count, source.ip`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will search for the following use case: \nIdentifying Potential PowerShell Exploits`,
    },
    output: {
      query: `FROM logs-*\n| WHERE process.name == "powershell.exe" and process.command_line RLIKE ".*EncodedCommand.*"\n| KEEP host.name, user.name, command_line, @timestamp`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will filter all logs for those containing windows event codes, count them by host name, and enrich the codes with a description of what the code means (via an enrichment policy called "win_events"). The results should be sorted by the count of each code in descending order`,
    },
    output: {
      query: `from logs-*\n| where event.code is not null\n| stats event_code_count = count(event.code) by event.code,host.name\n| enrich win_events on event.code with EVENT_DESCRIPTION\n| where EVENT_DESCRIPTION is not null and host.name is not null\n| rename EVENT_DESCRIPTION as event.description\n| sort event_code_count desc\n| keep event_code_count,event.code,host.name,event.description`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will search for the following use case: \nIdentifying Uncommon Processes`,
    },
    output: {
      query: `FROM logs-*\n| STATS process_count = COUNT(process.name) by process.name\n| WHERE process_count < 3\n| KEEP process.name`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will:\nCategorizing Failed Logins by Reason`,
    },
    output: {
      query: `FROM logs-*\n| WHERE event.action == "failed_login"\n| EVAL failure_reason = CASE(\n    error_code == "404", "Not Found",\n    error_code == "403", "Forbidden",\n    "Other")\n| STATS failure_count = COUNT(failure_reason) by failure_reason\n| KEEP failure_reason, failure_count`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will count the number of connections made to external IP addresses, broken down by user. If the count is greater than 100 for a specific user, add a new field called "follow_up" that contains a value of "true", otherwise, it should contain "false". The user names should also be enriched with their respective group names.`,
    },
    output: {
      query: `FROM logs-*\n| WHERE NOT CIDR_MATCH(destination.ip, "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")\n| STATS destcount = COUNT(destination.ip) by user.name, host.name\n| ENRICH ldap_lookup_new ON user.name\n| WHERE group.name IS NOT NULL\n| EVAL follow_up = CASE(\n    destcount >= 100, "true",\n     "false")\n| SORT destcount desc\n| KEEP destcount, host.name, user.name, group.name, follow_up`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will search for the following use case: \nDetecting Failed Logins from a Single IP`,
    },
    output: {
      query: `FROM logs-*\n| WHERE event.action == "failed_login" \n| STATS login_counts = COUNT(event.action) by source.ip\n| WHERE login_counts > 5`,
    },
  },
  {
    input: {
      question: `Generate an ES|QL query that will search for the following use case: \nUncovering Connections to Non-Standard SSH Ports Outside of Local Network`,
    },
    output: {
      query: `FROM logs-*\n| WHERE NOT CIDR_MATCH(destination.ip, "10.0.0.0/8", "192.168.0.0/16")\n| KEEP source.ip, destination.ip, network.bytes`,
    },
  },
];
