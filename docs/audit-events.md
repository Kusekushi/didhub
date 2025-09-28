# Audit Events Reference

Purpose: Central catalog of audit actions emitted by the Rust server. Each event
includes actor scope, target entity, triggering endpoint(s), and notes. Use this
to validate parity with the legacy TS implementation and to guide alerting /
compliance reviews.

Conventions

- action: dot-delimited verb domain pattern (`group.create`, `settings.update`).
- entity_type: coarse resource classification (group, user, subsystem,
  shortlink, setting, system_request, digest, audit_job).
- entity_id: string form of primary id or key; may be omitted for global events.
- metadata: JSON object with supplemental, non-PII context (never include
  secrets or raw credentials).

## Event Matrix

| Action                   | Entity Type    | Actor (user_id)          | Endpoints / Sources                                          | Metadata Fields | Description / Notes                                                 |
| ------------------------ | -------------- | ------------------------ | ------------------------------------------------------------ | --------------- | ------------------------------------------------------------------- |
| group.create             | group          | creator (system or user) | POST /api/groups                                             | —               | Group created.                                                      |
| group.update             | group          | updater                  | PUT /api/groups/:id                                          | —               | Group fields modified.                                              |
| group.delete             | group          | deleter                  | DELETE /api/groups/:id                                       | —               | Group removed (id no longer resolvable).                            |
| group.leaders.toggle     | group          | updater                  | POST /api/groups/:id/leaders/toggle                          | —               | Leader list changed (add/remove).                                   |
| user.update              | user           | admin                    | PUT /api/users/:uid                                          | —               | Admin updated user profile/flags.                                   |
| user.delete              | user           | admin                    | DELETE /api/users/:uid                                       | —               | Admin deleted user.                                                 |
| settings.update          | setting        | admin                    | PUT /api/admin/settings                                      | key             | One application setting changed. Metadata: {"key":"<setting_key>"}. |
| subsystem.create         | subsystem      | actor (system)           | POST /api/subsystems                                         | —               | Subsystem created.                                                  |
| subsystem.update         | subsystem      | actor (system)           | PUT /api/subsystems/:sid                                     | —               | Subsystem updated.                                                  |
| subsystem.delete         | subsystem      | actor (system)           | DELETE /api/subsystems/:sid                                  | —               | Subsystem removed.                                                  |
| subsystem.leaders.toggle | subsystem      | actor (system)           | POST /api/subsystems/:sid/leaders/toggle                     | —               | Leadership list changed.                                            |
| subsystem.member.add     | subsystem      | actor (system)           | POST /api/subsystems/:sid/members/roles (add=true)           | alter_id        | Added alter to subsystem. Metadata: {"alter_id":<id>}               |
| subsystem.member.remove  | subsystem      | actor (system)           | POST /api/subsystems/:sid/members/roles (add=false)          | alter_id        | Removed alter from subsystem.                                       |
| shortlink.create         | shortlink      | creator                  | POST /api/shortlink                                          | token           | Shortlink created; metadata includes generated token.               |
| system_request.create    | system_request | requesting user          | POST /api/me/request-system                                  | status          | New system account request.                                         |
| system_request.approve   | system_request | admin                    | POST /api/admin/system-requests/:id/status (status=approved) | status, note?   | Admin approved request.                                             |
| system_request.deny      | system_request | admin                    | POST /api/admin/system-requests/:id/status (status=denied)   | status, note?   | Admin denied request.                                               |
| digest.birthdays         | digest         | None (system)            | Background job (BirthdaysDigestJob)                          | count, entries  | Weekly birthdays digest posted (names truncated).                   |

## (Planned / To Verify)

| Action                 | Rationale                                  | Status        |
| ---------------------- | ------------------------------------------ | ------------- |
| alter.create           | Parity expected for alter creation         | VERIFY (grep) |
| alter.update           | Parity expected for alter update           | VERIFY        |
| alter.delete           | Parity expected for alter deletion         | VERIFY        |
| shortlink.resolve      | Optional (log high-value link access)      | CONSIDER      |
| audit.purge            | Possibly log purge events for compliance   | CONSIDER      |
| audit.clear            | Possibly log full audit clear (high risk)  | CONSIDER      |
| password.reset.request | Track issuance attempts (rate-limit abuse) | CONSIDER      |
| password.reset.consume | Track successful resets                    | CONSIDER      |
| oidc.provider.toggle   | Track OIDC enable/disable                  | FUTURE        |

## Gaps & Follow-Ups

1. Verify alter CRUD audit events exist (not surfaced in initial grep snippet).
   If missing, implement symmetrical `alter.*` actions.
2. Decide whether to emit events for audit maintenance operations
   (`audit.purge`, `audit.clear`) to create tamper-evident trail.
3. Evaluate logging of password reset flows (ensure token secrecy; store only
   token hash if tracked).
4. Consider adding IP capture (currently ip column unused) – ensure privacy
   review before enabling.
5. Standardize metadata field naming (e.g., always `id` vs entity-specific keys)
   for easier downstream analytics.
6. Add schema versioning for audit events if future migrations alter semantics.

## Implementation Notes

- Helper functions in `server-rs/src/audit.rs` centralize insertion; prefer
  extending helpers versus ad-hoc SQL.
- All insert operations ignore errors intentionally (fire-and-forget). For
  critical events (security-sensitive) consider making them fallible and
  bubbling up failures or queueing retries.
- Metadata should remain compact; avoid large arrays except for small counts
  (birthdays digest currently includes entries – ensure size limits).

## Testing Recommendations

- Add integration tests asserting an audit row appears after each mutating
  endpoint (scope: create/update/delete + membership changes).
- For jobs, inject a test registry and assert emitted events by querying the
  audit table after execution.
- Use a helper to fetch the latest audit rows filtered by action to reduce
  flakiness.

## Revision History

- v0.1 Initial draft (extracted via automated grep of Rust sources).
