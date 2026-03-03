# PitNow MVP - Codex Instructions

## Project Goal

Build a PWA webapp that supports:

reserve → pay → check-in(QR + 4 photos) → in-use(timer) → checkout(photo + settlement)

Focus only on garage reservation loop for MVP.
Helper mode is Phase 2.

---

## Source of Truth (Read First)

- docs/PRD_MVP.md
- docs/UserFlow_MVP.md
- docs/DB_MVP.md
- docs/API_MVP.md
- docs/Policies_MVP.md
- docs/Risks_MVP.md
- docs/Decisions.md (append-only log)

If uncertain, update Decisions.md and propose 2 options with tradeoffs.

---

## Reference Materials (Context Only)

- refs/ directory contains:
- Original proposal documents
- Wireframes
- External design drafts
- Any raw planning materials

Rules:

- refs files are for contextual understanding only.
- Do NOT treat refs as implementation source of truth.
- If there is a conflict between docs/ and refs/, follow docs/.
- If clarification is needed, propose update to docs/ instead of modifying refs.

---

## Tech Stack

- Next.js (App Router)
- TypeScript (strict mode)
- Supabase (Auth / Postgres / Storage)
- Vercel deploy
- Payment: Toss (MVP default)

---

## Device Strategy

- User-facing app is Mobile First.
- UI is designed for mobile viewport only.
- PWA enabled (installable web app).
- Admin console is Desktop only.
- Admin routes must be separated (e.g., /admin).
- No responsive hybrid layout for MVP.

User and Admin UI must be clearly separated in layout structure.

---

## Core Principles

1. DB-level constraint must prevent reservation time overlap.
2. Check-in requires 4 photos before timer starts.
3. Timer must be based on server time (end_time comparison).
4. Checkout must calculate extra fee automatically.
5. All state transitions must be explicit.

---

## Folder Structure

app/
lib/
hooks/
domain/

---

## When Coding

- Reuse domain types
- Avoid implicit state changes
- Never trust frontend timer only
- Log all state transitions
