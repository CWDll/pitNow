# PitNow Release QA Checklist

This checklist is for the final Preview/Production readiness pass after local
automated tests are green.

## 1. Automated Checks

Run from the project root before a release candidate is accepted.

```bash
node scripts/check-supabase-schema.mjs
npm run lint
npx tsc --noEmit
npm run build
npm run e2e:ui
PORT=3011 PITNOW_PAYMENT_PROVIDER=FAKE npm run start
PITNOW_E2E_BASE_URL=http://localhost:3011 npm run e2e:partner-admin
```

Expected:

- Supabase schema check passes, including package audit/request tables.
- UI E2E passes all mobile/admin smoke tests.
- Partner-admin API E2E passes package request, bay, availability block, notes,
  and audit checks.

## 2. Environment Variables

Verify Vercel Preview and Production separately.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PITNOW_ADMIN_ACCESS_TOKEN`
- `NEXT_PUBLIC_KAKAO_MAP_APP_KEY`
- `NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY`
- `TOSS_PAYMENTS_SECRET_KEY`
- `PITNOW_PAYMENT_PROVIDER`

Preview recommendation:

- `PITNOW_PAYMENT_PROVIDER=TOSS_TEST` for manual Toss sandbox QA.
- Use `FAKE` only for local automated E2E.

## 3. User Manual QA

Use a normal user account, not the partner-admin account.

- Home loads on mobile viewport.
- Kakao map renders on the deployed domain.
- Location denied path shows a clear message when tapping distance filter.
- Location allowed path centers near current position and enables distance sort.
- Partner cards show self hourly price and shop package price.
- Partner detail shows bay availability text consistently.
- Schedule screen does not allow past dates or past time blocks.
- Availability-blocked slots are disabled before payment.
- Full self-service loop:
  - reserve
  - Toss sandbox payment
  - reservation appears under upcoming reservations
  - cancel path works when applicable
- Full shop-service loop:
  - package selection
  - schedule
  - Toss sandbox payment
  - reservation title remains stable after package price/name changes.

## 4. Partner-admin Manual QA

Use a user linked in `partner_admins`.

- `/partner-admin` login succeeds.
- Partner dropdown only shows allowed partners.
- Reservation list opens detail modal and remains readable on desktop.
- Bay inactive state changes from partner-admin.
- Bay with active/upcoming reservation cannot be deactivated.
- Availability block creation disables matching user schedule slots.
- Availability block deactivation re-enables matching user schedule slots.
- Field notes can be created for `NOTE`, `ISSUE`, `DELAY`, `NO_SHOW`.
- Notes can be resolved and reopened.
- Package/price section is read-only except for change requests.
- Package price change request appears in `/admin/packages`.

## 5. Admin Manual QA

Use `/admin-login` with the admin token.

- `/admin` overview renders.
- `/admin/reservations` filters by status, partner, date, and issue state.
- Reservation detail shows payments, evidence, partner notes, and audit logs.
- `/admin/payments` filters and cleanup actions render.
- `/admin/settlement` completed settlement rows render.
- `/admin/partner-audit` filters by partner/action/range/search.
- `/admin/packages` can:
  - update partner package price
  - activate/deactivate partner package exposure
  - edit service package catalog fields
  - approve partner package change request
  - reject partner package change request
  - show audit logs after approval/update.

## 6. Release Gate

Do not promote to production until all are true.

- Automated checks passed on the release candidate.
- Supabase SQL migrations are applied to the target project.
- Kakao domain is registered for the target deployment URL.
- Toss sandbox card and easy-pay paths have been manually checked.
- Admin and partner-admin smoke paths are manually checked on the deployed URL.
- No unexpected rows from E2E cleanup remain in reservations, notes, package
  requests, or audit logs.
