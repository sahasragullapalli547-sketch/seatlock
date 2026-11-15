# ADR 005: Demo authentication boundary

Production routes accept signed Bearer access tokens. The `x-user-id` header is
available only when `ALLOW_DEMO_AUTH=true` for local demonstration and tests;
it is not enabled by default.
