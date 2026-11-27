# NodeBB Email Code Registration

Pre-registration email-code verification for NodeBB. This repository now contains the initial plugin implementation.

## Status

**Early development — not yet locally tested or release-ready.** Do not install on production.

## Current implementation

- Adds an email field, 6-digit code field, and “send code” button to the registration form using `filter:register.build`.
- Sends the code using NodeBB's configured email transport (`emailer.sendToEmail`).
- Server-side validation runs through `filter:register.check` before account creation.
- Code is generated with a cryptographically secure random generator and stored as a SHA-256 hash.
- Code validity: 10 minutes; resend cooldown: 60 seconds; maximum 5 attempts.
- Sets the submitted email on registration data after successful verification.
- After account creation, calls NodeBB's native `user.email.confirmByUid(uid)` so the address is marked verified in NodeBB's own email/group records.
- Existing login flow is unchanged.

## Local test plan

1. Install on a **local** NodeBB 4.15.x instance.
2. Confirm the plugin loads and the registration form displays the email/code fields.
3. Confirm SMTP works in ACP > Settings > Email and that the code email renders.
4. Test correct, incorrect, expired, and reused codes.
5. Test cooldown and attempt limits.
6. Submit registration directly without a code and confirm the server rejects it.
7. Confirm the email becomes the account email and NodeBB's native email confirmation behavior is understood/configured.

## Important development checks still required

- Verify the plugin's route registration and CSRF handling against the exact installed NodeBB build.
- Verify plugin email-template discovery for `templates/emails/email-code.tpl`.
- Review atomicity/rate limiting under concurrent requests and proxy IP configuration.
- Add automated tests and a packaged ZIP after local validation.

Target: NodeBB 4.15.x.