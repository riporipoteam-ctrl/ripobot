# v5.7 "Thread Invites" — 2026-09-27 ~21:05 CEST

## Why
Armin's 20:52 screenshot (private thread) showed two failures:
1. RipoBot unpromptedly offered buddy invites in a private thread
   ("You should invite them to the conversation!"), then when he said
   "Yeah go ahead" it produced a BROKEN sentence
   ("...is ready to bring the energy, and is just chillin'...")
   because stripBuddyMentions deleted the <@id> mentions, leaving the
   subjects missing — and the buddies never came ("You didnt invite them").

## Changes
- `utils/banter.js`
  - `stripBuddyMentions` now SUBSTITUTES plain names ("Bolt"/"Pip") instead
    of deleting — no more broken grammar.
  - New explicit-thread-invite protocol: `isExplicitThreadInvite(userText)`
    matches "invite them" / "bring them in|here|over" / "add them" /
    "let them join|in" / "get them in here". On match in a thread,
    `finalizeBuddyMentions` keeps real pings (via new unconditional
    `forceBuddyMentions`) and appends an invisible zero-width-wrapped
    `[[thread-invite]]` marker (same convention as the share directive).
  - `ensureBuddyMentions` refactored onto `forceBuddyMentions`.
  - `SUMMON_INTENT_RE` gained `invite them` (main channel too).
  - Banter talk-back ping + farewell ping carry the marker in threads so the
    whole goodbye ritual works inside a sanctioned thread hangout.
- `companions/chatter.js`
  - `handleSummon` thread gate: ignored UNLESS the invisible marker is
    present (sanctioned explicit invite). Marker stripped from AI context.
  - Loads the marker regex from `utils/banter.js` (falls back to a local copy).
- `events/messageCreate.js`
  - New `THREAD_BLOCK` system-prompt rule (thread only): never mention/offer
    the buddies unprompted in a private thread; ONLY ping them if the user
    explicitly asks to invite/bring them into THIS thread. `inThread`
    hoisted so the prompt sees it.
- Tests: 17/17 focused assertions pass; `npm run check` OK.
