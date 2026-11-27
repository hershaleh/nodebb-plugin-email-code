# NodeBB Email Code Registration

Pre-registration email-code verification for NodeBB. The plugin adds an email code field to the registration form and blocks account creation until the code has been verified.

## Status

Early development. The repository was empty when development began; this is the initial plugin skeleton, not yet a tested release. Do not install on production before local testing.

## Planned behavior

- Send a six-digit code to the email address entered in registration.
- Code expires after 10 minutes.
- Resend cooldown: 60 seconds.
- Maximum 5 verification attempts per code.
- Server-side validation in `filter:register.check` before account creation.
- Existing NodeBB login remains unchanged.
- Uses NodeBB's configured email transport.

## Development

Target: NodeBB 4.15.x. Test on a local forum first.
