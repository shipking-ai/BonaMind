# Auth emails

The emails Supabase Auth sends: password reset, sign-up confirmation, sign-in
link, email change, invite and verification code.

`config.toml` points local Supabase at these files. **Production does not
read them.** After changing one, paste it into the dashboard:

1. Supabase Dashboard → project `ndwiaawqkkzdsdqeglez` → **Authentication** →
   **Emails** → **Templates**.
2. For each template below, set **Subject** to the subject in the table and
   replace the **Body** with the whole file. Save.

| Dashboard template | File | Subject |
|---|---|---|
| Reset password | `recovery.html` | Reset your BonaMind password |
| Confirm sign up | `confirmation.html` | Confirm your email for BonaMind |
| Magic link | `magic_link.html` | Your BonaMind sign-in link |
| Change email address | `email_change.html` | Confirm your new email for BonaMind |
| Invite user | `invite.html` | You’re invited to BonaMind |
| Reauthentication | `reauthentication.html` | Your BonaMind verification code |

The sender is set separately, under **Authentication** → **Emails** →
**SMTP Settings**: sender name `BonaMind`, sender email
`noreply@mail.bonamind.app`. The address has to be on a domain verified in
Resend (resend.com → Domains). The app's own emails already use it
(`RESEND_FROM_EMAIL`).

`{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` and `{{ .Token }}`
are filled in by Supabase. Keep them exactly as written.
`src/__tests__/authEmailTemplates.test.ts` checks each file has its link or
code, says BonaMind, and has none of the old AuraMind wording.
