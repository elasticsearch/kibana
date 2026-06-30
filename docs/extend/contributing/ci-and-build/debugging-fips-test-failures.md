---
navigation_title: "Debugging FIPS test failures"
description: "Learn how to debug test failures generated from the FIPS nightly pipeline"
---

# Debugging FIPS test failures

## What is FIPS?

The Federal Information Processing Standard (FIPS) is a set of standards that describe document processing,
encryption algorithms, and other information technology standards for use within non-military government agencies 
and by government contractors and vendors who work with the agencies.

### How does that relate to Kibana?

Kibana can be configured to run in a FIPS-compliant mode, which disallows certain configurations,
requires a Platinum or better license, and requires the Security plugin to be enabled.

In order to ensure parity between the FIPS-compliant mode and the standard mode,
Kibana has a nightly pipeline that runs as many tests as possible to ensure that Kibana is FIPS compliant.

### Why do we skip some tests?

As Kibana's FIPS mode requires a Platinum or better license and the Security plugin to be enabled, Kibana's test suite configuration is overridden to meet these requirements.

With these overrides, the assumptions that the tests make about the environment are no longer valid, and some tests fail. For instance, if a test is asserting that a certain feature is not
available with a basic license, that test will fail in the FIPS pipeline as the license is forced to true.

### How do we discern between test failures resulting from FIPS overrides and actually FIPS/OpenSSL errors?

For an override related error the `expect(...)` will usually fail with typical errors, such as "expected 404, got 200", or it may be more subtle, but related to the subject of the test.

See the image below for an example of a test failure due to the license type being overridden:
![image][./fips_test_failure_license_override_example.png]

The FIPS overrides can be found in the [fips_overrides.ts](https://github.com/elastic/kibana/blob/542a56b4829643d05c47bcc47485dd9baaacea32/src/platform/packages/shared/kbn-test/src/functional_tests/lib/fips_overrides.ts) file.

For a FIPS/OpenSSL error, the error will be more cryptic/the test will fail to run, usually something like "digital envelope routines::unsupported". Generally these are related to Node.js's crypto module.

If you are unsure, please reach out to the Kibana Security team for guidance.

### Skipping failing tests due to FIPS overrides

If you have determined that the test in question is failing due to the FIPS overrides, you can skip the test by adding the `this.tags('skipFIPS')` tag to the nearest possible `describe` block in the suite.

It is imperative to skip only the tests that are affected by FIPS overrides. If necessary, create a new `describe` block to isolate the affected tests. Ensure the `describe` block is not using an arrow function.

This will still allow the test to run as part of regular CI, but will skip the test in the FIPS pipeline.

PRs for these test skips on `main` should be backported to the `8.19` branch as well.

### Failed tests due to FIPS/OpenSSL errors

Errors that are related to FIPS/OpenSSL are more serious and should be addressed immediately. These will require code changes to switch to FIPS compliant crypto functionality.

Please reach out to the Security team for guidance at `#kibana-security` in Slack immediately.

### Further debugging

If you are still unsure about the nature of the failure, or, your want to run tests in your own dev environment, you can setup a Node-FIPS environment locally.

For more details about this setup, please refer to the [Node-FIPS documentation](https://github.com/elastic/FIPSGuide/blob/main/node/README.md).