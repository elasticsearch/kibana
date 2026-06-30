/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const aws_securityhubEvaluations = {
  integration: "aws_securityhub",
  evaluations: [
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  service.id = CASE(
    service.id IS NOT NULL, service.id,
    data_stream.dataset == "aws_securityhub.finding", aws_securityhub.finding.metadata.product.uid,
    null
  ),
  service.name = CASE(
    service.name IS NOT NULL, service.name,
    data_stream.dataset == "aws_securityhub.finding", aws_securityhub.finding.metadata.product.name,
    null
  ),
  service.type = CASE(
    service.type IS NOT NULL, service.type,
    data_stream.dataset == "aws_securityhub.finding", "service",
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  host.target.id = CASE(
    host.target.id IS NOT NULL, host.target.id,
    data_stream.dataset == "aws_securityhub.finding" AND resource.type == "AWS::EC2::Instance", host.id,
    null
  ),
  host.target.name = CASE(
    host.target.name IS NOT NULL, host.target.name,
    data_stream.dataset == "aws_securityhub.finding" AND resource.type == "AWS::EC2::Instance", host.name,
    null
  ),
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    data_stream.dataset == "aws_securityhub.finding" AND resource.type == "AWS::EC2::Instance", host.ip,
    null
  ),
  service.target.id = CASE(
    service.target.id IS NOT NULL, service.target.id,
    data_stream.dataset == "aws_securityhub.finding" AND resource.type == "AWS::Lambda::Function", resource.id,
    null
  ),
  user.target.id = CASE(
    user.target.id IS NOT NULL, user.target.id,
    data_stream.dataset == "aws_securityhub.finding" AND resource.type == "AWS::IAM::User", user.id,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "aws_securityhub.finding"
      AND resource.type != "AWS::EC2::Instance"
      AND resource.type != "AWS::Lambda::Function"
      AND resource.type != "AWS::IAM::User", resource.id,
    null
  ),
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset == "aws_securityhub.finding", resource.type,
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "aws_securityhub.finding", "cloud_resource",
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
