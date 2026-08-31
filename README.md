# smeetz-distribution-core (discovery spike — CHAT-190)

One canonical distribution core behind per-OTA adapter surfaces. This is the
Gate 4 experiment in miniature: **if an adapter forces a change in `src/core/`,
that is a finding** — write it down on CHAT-190.

**Not production code.** In-memory state, seed data, no real inventory.

## Layout

```
src/core/               the canonical model — no channel names allowed in here
src/adapters/tiqets/    Tiqets supplier surface  (/v2/*, API-Key auth)
src/adapters/gyg/       GetYourGuide surface     (/1/*,  HTTP Basic auth)
```

Each OTA dictates its own paths, payloads and error strings; we host them.
Target hosting model: one subdomain per channel (gyg.connect / tiqets.connect).

## Run

```
npm install
npm run start:dev        # listens on :8000
```

## Verify against Tiqets' official certification tester

```
pip install supplier-api-tester
supplier_tester -u 'http://localhost:8000' -k 'secret' -p 'MUSEUM-ENTRY' -v 2
supplier_tester -u 'http://localhost:8000' -k 'secret' -p 'CABLE-CAR' -t -v 2
```

All tests must pass — Tiqets certification has no optional endpoints.

## GYG surface status

Built from their published YAML (supplier-api-supplier-endpoints.yaml),
shape-level only. Unverified until we get Integrator Portal access and run
their self-test tool against it (gated on the Connectivity Partner
conversation — Charles).

## Seed products

| id            | timeslots | refundable | pricing | notes                                   |
|---------------|-----------|------------|---------|-----------------------------------------|
| MUSEUM-ENTRY  | no        | yes        | yes     | has a "Resident" category with NO clean GYG enum mapping |
| CABLE-CAR     | hourly    | yes (24h cutoff) | no | timeslot behaviour                      |
| THEATRE-SHOW  | 20:00     | **no**     | yes     | exercises 3004 cancellation-not-possible |

## Findings log

Kept on CHAT-190 and in the "ExperienceBank Exit: Flows + Diagrams" Notion page.
