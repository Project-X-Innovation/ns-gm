# Ticket Context

- ticket_id: cmny190ud004hl30uxc76w2eo
- short_id: RSH-220
- run_id: cmny190uy004nl30umpgtn4pu
- run_branch: helix/research/RSH-220-helix-pitch-information-for-slide-deck-and
- repo_key: ns-gm
- repo_url: https://github.com/Project-X-Innovation/ns-gm.git

## Title
Helix Pitch | Information For Slide Deck and Updated Site

## Description
gethelix.ai

I am looking to pitch Helix to investors. Now when I say Helix, I mean primarily Helix for NetSuite or more accurately Helix for ERPs because we are going to expand past NetSuite. Helix Global is very powerful and very good for development but it's a much harder sell. Helix for NetSuite or Helix for ERPs is much more focused and targeted and is an easier pitch. It's obvious who the customers are and it's obviously why they need us. 

I'm giving you all the resources you need. You can look at our current website, which was put up in kind of a jiffy and is not that accurate but it gives you a sense of the direction we're heading. I'm giving you the Helix Manifesto. That is a set of laws; that is the Bible for our internal direction. Then I am going to give you a set of numbers that I gave to a small investor who is a friend. Ideally I would get all of it from one person but I might have to split it up into small numbers. Take a look at those numbers in the pitch for Dovie. There is also some information in the one pager that includes Helix, Finesse, and Haven. Right now I am only working on Helix. You can ignore the information, more or less, from Finesse and Haven. 

So I want you to brainstorm this. Take your time. Relax. Enjoy. Come up with a narrative that is compelling, that makes sense financially, that makes sense looking into the future of where technology, business, and software are going. 

The manifesto is our internal product bible. The website gives you a sense of what the original seed was made by Fabiola. The paper for Dovie gives you a sense of the numbers and our trajectory. You have, of course, the Helix codebase itself to make sense of all the features we are making and planning on making. You have our production environment for reference. You have everything you need to put together a great pitch deck. 

And just to again tell you the idea, we want to be the interface for AI between users and ERPs. I think ERPs are going to go the way of databases. Databases are used everywhere but we don't actually interact with them and I think ERPs are going to be the same. They're going to be a database with baked-in financial and legal information. The interface will be an AI platform like Helix and I think we are protected on both sides. I think the ERPs cannot do this. This is not their business. Their business is not taking responsibility for workflows and what used to be considered the consulting business end-to-end. Their business is bringing in these legal and financial rules and allowing people to customize. They will allow for customization; we own the customization and as far as AIs as well. AIs will generate code; they will give suggestions; they will generate ideas but they will not take accountability end-to-end with all the pieces. Look at all the pieces that are involved in Helix; you can go look in the codebase. And the code base is just the beginning. Of course I have tons and tons and tons of features in mind but you can see, just from the build, fix, research, production environment, monitoring, you can look at some of the features planned, execute, execute. 

So what's the deliverable? The deliverable is information that I'm going to feed in as a prompt to a pitch deck. You don't have to worry about getting it in prompt form. You just need to put together everything that might be helpful to think about:
- what the target market is
- what the TAM is
- what the money we can make is
- be realistic, be reasonable
- where the idea lands
- why it is good
- what threatens it
- what the future might be
In terms of what information to take the most seriously, here are the pros and cons of all of them.

Obviously the manifesto is the most sincere, is the one that gives the direction, but it doesn't actually describe a product. It describes some principles of what we think the future of AI will be like. Of course it does start to explain our protection and where we went ahead and why we think we're worthwhile and how we're going to stay meaningful and worthwhile. In terms of importance it's the most sincere and meaningful but it doesn't really describe the product; it describes the philosophy.

The codebase describes the current product, right, but it only gives you a hint of what's coming so you're going to have to guesstimate and elaborate on the future. The original website was not very accurate; it was just kind of slapped together. Again it also gives you a sense of what the NetSuite side looks like, not the Helix Global. We have spent a lot of time on Helix Global and now we're turning back to Helix NetSuite. It will give you a sense of where we thought the value was in terms of the actual flow but of course you can see that in the code itself. In terms of the one pager, that's just some ideas; again it's just broad ideas so you can get a sense of that. The numbers that are prepared for Adobe are very recent; they're very relevant, or what I actually came up with with our distribution partner, and you can take them pretty seriously now. Check them in against your intuition and make sure you come up with something reasonable but that's our plan. Together with a distribution partner I made those numbers last night; they're very recent and relevant. The ideas in there are very recent and relevant. You can leave out anything to do with Finesse or Haven or PX in general; just focus on Helix. 
Put together some serious research, some broad research, some interesting research story that I can feed into that. I'll take it from there and I'll make the pitch deck and here the updated site. But the idea is to make a report that will be the data backbone, the information backbone, the research backbone to the pitch deck.

## Research Report

# Staging Merge Queue: Fresh-Eyes Analysis & Fix Roadmap

## Table of Contents

- [Executive Summary](#executive-summary)
- [Problem Statement](#problem-statement)
- [Current Architecture](#current-architecture)
- [Fresh-Eyes Design Analysis](#fresh-eyes-design-analysis)
- [Root Cause Analysis](#root-cause-analysis)
- [Recommended Fix Roadmap](#recommended-fix-roadmap)
- [Performance & Risk Assessment](#performance--risk-assessment)
- [Deferred Items](#deferred-items)
- [Artifact Inputs Used](#artifact-inputs-used)

---

## Executive Summary

The staging merge queue has a near-100% failure rate when feature branches have diverged from staging. Users click "Merge into staging queue," wait minutes, see it fail, retry, and repeat. The core problem is surprisingly simple: **the system skips the cheapest fix and jumps straight to the most expensive one.** When any merge conflict is detected, the processor spawns a full agent run (30-60 minutes) even when the "conflict" is just a branch that fell behind staging -- resolvable in under 5 seconds with a single GitHub API call.

The code to do the fast fix already exists in the codebase (`focused-merge-service.ts`, lines 110-120). It uses the GitHub Merge Branch API to merge staging into the feature branch. It handles 201 (updated), 204 (already current), and 409 (real conflict) responses. It is just never called by the queue processor.

**Verdict: patch, don't redesign.** The queue architecture -- state machine, FIFO ordering, PR-based merge, agent conflict resolution -- is sound. The problems are one missing optimization and three specific bugs. Four targeted changes, all in existing server-side TypeScript files, fix every user-visible failure mode. No schema migrations, no new dependencies, no client changes.

**Expected impact:** Diverged branches resolve in <30 seconds instead of 30-60 minutes. The queue no longer stalls behind resolving items. Deterministic run-mismatch failures are eliminated. Failed agent triggers recover immediately instead of after 30 minutes of limbo.

---

## Problem Statement

### What the User Experiences

The user describes a system that fails almost every time:

> "Nine out of ten times it fails. I think I would say ten out of ten times it fails, but I can't be sure."

> "In the rare event when it succeeds, it just stays there, or maybe it never succeeds, and then I hit retry."

The user's mental model for the queue is clear and correct:

> "If I click Merge, everything else has to wait until I finish being merged."

This means serialization during the *merge step* (seconds), not during *conflict resolution* (30-60 minutes). The current system conflates the two.

### What the Production Data Shows

The production database tells a subtler story. As of 2026-04-12, all 18 queue items are in MERGED status. The system *does* eventually work. But the path is fragile:

| Metric | Value | Source |
|--------|-------|--------|
| Total queue items in DB | 18 | Production DB query |
| Items in MERGED status | 18 (100%) | Production DB query |
| Items with retryCount > 0 | 1 (`cmnen30ci`, retryCount=1) | Production DB query |
| Clean merge time (15/18 items) | 5-16 seconds | Production DB timestamps |
| Conflict merge time (3/18 items) | Minutes to hours | Production DB timestamps |
| Longest single item resolution | 93 minutes | Item `cmnen30ci`: created 13:15, updated 14:48 |
| Cancelled items visible | 0 | Hard-deleted from DB on cancel |

The 100% MERGED rate is misleading. Cancelled items are hard-deleted (`staging-queue-service.ts:248`), erasing failure evidence. The user's experience of repeated failure and retry is consistent with items cycling through RESOLVING, being cancelled, re-queued, and eventually merging -- but only the final success survives in the database.

### Gap Analysis

| Scenario | User Expects | What Actually Happens |
|----------|-------------|----------------------|
| Clean merge (no divergence) | Merges in seconds | Works: 5-16 seconds |
| Diverged branch (behind staging) | Catches up automatically, merges in seconds | Spawns 30-60 min agent run; often loops |
| Real file conflict | Agent resolves, merges | Agent triggered but recovery is fragile; deterministic errors after resolution |
| Queue throughput | Other items process while one resolves | Entire org queue blocked 30-60 min behind RESOLVING item |
| Manual retry | Retry succeeds | Retry hits same deterministic error (run mismatch) |

---

## Current Architecture

### End-to-End Flow

```
USER                          SERVER                                 GITHUB
──────────────────────────────────────────────────────────────────────────────
Click "Queue for Staging"
  POST /enqueue ──────────→  Validate changed repos exist
                              (run chain walk + GH compare fallback)
                              Create StagingMergeQueueItem(QUEUED, pos=N)

                        Background processor (5s polling loop)

                        Pick next QUEUED item (FIFO block check)
                        Set → MERGING
                        Find latest terminal run (SUCCEEDED/MERGED/UNVERIFIED)

                        mergeRunToStaging()
                          Aggregate changed repos (chain + fallback)
                          Pre-validate mergeability (multi-repo only)
                            ├── ALL mergeable → Create PR → Merge PR
                            │                   └── 422? → Find existing PR → Merge
                            │                   └── 405? → Direct merge API fallback
                            │                   └── Success → MERGED
                            │
                            └── ANY unmergeable → Return all as failed
                                                   ↓
                        Classify conflict (~60s polling)
                          ├── "conflict" → RESOLVING → Trigger agent
                          │                Agent merges staging→branch in sandbox
                          │                Agent resolves, pushes
                          │                checkAgentItems() → re-queue (same pos)
                          │
                          ├── "no_conflict" → Auto-retry (max 5)
                          └── "unknown" → Auto-retry (max 3)
```

### State Machine

```
QUEUED ──→ MERGING ──→ MERGED (success)
                   ├─→ FAILED (permanent, after max retries)
                   ├─→ QUEUED (auto-retry: status checks / transient)
                   └─→ RESOLVING ──→ QUEUED (agent succeeded, retryCount+1)
                                 └─→ FAILED (agent failed or 30min stale timeout)

Retry caps:
  status_checks .............. 5
  transient/unknown .......... 3
  conflict_agent total cap ... 9
Recovery timers:
  MERGING stuck >4 min ....... reset to QUEUED
  RESOLVING stuck >30 min .... reset to QUEUED (no active run)
```

### Component Inventory

| File | Lines | Responsibilities |
|------|-------|------------------|
| `staging-queue-processor.ts` | 475 | Background loop, state machine, FIFO blocking, conflict classification, retries, agent triggering, stale recovery |
| `github-merge-service.ts` | 1128 | PR create/merge, multi-repo pre-validation, run chain aggregation, merge status endpoint, compare stats |
| `staging-queue-service.ts` | 252 | Enqueue validation, retry, cancel, list queries |
| `focused-merge-service.ts` | 162 | GitHub Merge Branch API (staging into feature), conflict file reporting |
| `git-ops.ts` | 618 | Sandbox git operations, auto-resolve for lock/generated files, conflict marker validation |
| `orchestrator.ts` | ~1840 | Run orchestration, `refreshFromStaging` integration, early exit for clean merges |
| `orchestrator/repositories.ts` | ~590 | Repo preparation, staging merge in sandbox |
| `staging-queue-controller.ts` | 126 | Express HTTP route handlers |
| `shared/run-lookup.ts` | 34 | `findRunOrThrow` helper, `RunLike` type definition |
| `shared/github-branch-fallback.ts` | 95 | GitHub Compare API fallback for changed-repo detection |

**Total: ~3,500 lines across 10+ files.**

### Key Timing Constants

| Timer | Value | Purpose |
|-------|-------|---------|
| Processor poll interval | 5 seconds | `setInterval` in `server.ts` |
| In-memory reentry guard | 120 seconds | Prevents overlapping processing (`processingStartedAt`) |
| Mergeability polling | ~60 seconds | `MERGEABILITY_DELAYS_MS`: [2s, 4s, 8s, 16s, 30s] |
| Pre-validation retry | 2 seconds | Single retry in `validateReposForMerge` |
| Recovery check interval | 60 seconds | Separate `setInterval` for stale item recovery |
| Stale MERGING recovery | 4 minutes | Resets stuck MERGING items to QUEUED |
| Stale RESOLVING recovery | 30 minutes | Resets RESOLVING items with no active run |

---

## Fresh-Eyes Design Analysis

The user asked to "take a step back, go for a walk, and think about all the moving parts." Here is what a whiteboard session produces -- three ways to handle the dominant failure case (branch divergence), designed from scratch.

### Option A: "Detect-Then-Fix" (The Current System)

```
Try PR merge → fail → poll GitHub mergeability for ~60s → classify ���
  "conflict" → agent (30-60 min)
  "no_conflict" → auto-retry
  "unknown" → auto-retry
```

**How it works:** After a merge failure, the system polls the GitHub PR's `mergeable` field for up to 60 seconds (`MERGEABILITY_DELAYS_MS` at `staging-queue-processor.ts:65`). It classifies the failure but never attempts to fix it. When classified as "conflict," it spawns a full agent run regardless of whether the conflict is simple divergence or a real file-level clash.

- **Pro:** Audit trail via PR mergeability classification
- **Con:** Spends 60 seconds diagnosing, then triggers a 30-60 min agent for a problem solvable in 5 seconds
- **Evidence:** `staging-queue-processor.ts:65` -- delays total ~60s; `staging-queue-processor.ts:225-268` -- jumps to agent on any "conflict" classification

### Option B: "Always Catch Up First" (Proactive)

```
Merge staging→feature (<5s) → then try PR merge → done
```

**How it works:** Unconditionally merge staging into the feature branch before every merge attempt. The GitHub Merge API returns 204 (already current, no-op), 201 (caught up), or 409 (real conflict).

- **Pro:** Simplest possible logic; no classification step; zero surprise conflicts
- **Con:** Adds ~1-2 seconds of API overhead to every merge, including the 15/18 clean merges that work perfectly today
- **Evidence:** Product success criterion #2: "Clean merges unaffected" (currently 5-16s)

### Option C: "Catch-Up as Diagnostic and Fix" (Reactive) -- Recommended

```
Try PR merge → fail →
  Try catch-up: merge staging→feature via GitHub API (<5s)
    → 201 (was behind, now caught up) → retry PR merge → done (<30s total)
    → 204 (already up to date) → failure is not divergence → existing classification
    → 409 (real conflict) → spawn agent (30-60 min)
```

**How it works:** The catch-up step runs only when the merge fails. The API response doubles as both fix and diagnosis:
- **201** = the branch was behind staging; it's now caught up. Retry the merge. Total time: <30 seconds.
- **204** = the branch was already current; the failure is something else (status checks, branch protection). Fall through to existing classification.
- **409** = real file-level conflict. Spawn the agent.

**Why this wins:**

| Criterion | Option A | Option B | Option C |
|-----------|----------|----------|----------|
| Clean merge overhead | None | +1-2s API call | None |
| Diverged branch resolution | 30-60 min (agent) | <30s | <30s |
| Classification accuracy | ~60s polling, indirect | N/A (always catches up) | <5s, definitive |
| Code already exists | N/A | Partial | Yes (`focused-merge-service.ts:110-120`) |
| Post-agent re-verification | Re-enters RESOLVING on stale state | Catches up naturally | Catches up naturally |
| Preserves working behavior | Yes | No (adds latency) | Yes |

### Verdict

**Patch with Option C. Don't redesign.**

The queue architecture is sound. The state machine, FIFO ordering, PR-based merge, and agent conflict resolution all work correctly. The problems are:
1. A missing optimization (no catch-up before agent spawning)
2. Three specific bugs (run mismatch, queue blocking scope, agent trigger recovery)

The existing `focused-merge-service.ts` already implements the exact GitHub Merge API call needed. It just needs to be wired into the queue processor's merge path.

---

## Root Cause Analysis

Five root causes, ordered by user-visible impact.

### Root Cause 1 (HIGHEST IMPACT): Missing "Catch-Up" Step

**Location:** `staging-queue-processor.ts:225-268` (conflict handling block)

**Mechanism:** When the processor detects that a merge failed due to conflicts, it immediately sets the item to RESOLVING and spawns a full agent run. It does not first attempt the fast path: using the GitHub Merge Branch API (`POST /repos/{owner}/{repo}/merges`) to merge staging into the feature branch.

**Evidence:**
- `focused-merge-service.ts:110-120` already implements the exact API call with proper 201/204/409 handling -- unused by the processor
- Production data: 3/18 items took minutes-to-hours via the agent path; 15/18 were clean merges (5-16s)
- Prior scout captured a repeated-conflict-loop: agent resolves -> re-queue -> pre-validation finds conflicts AGAIN -> re-enters RESOLVING. The catch-up step would break this loop.

**User impact:** Most "conflicts" are branch divergence. Users experience 30-60 minute RESOLVING cycles for what should be a <30-second catch-up operation. This is the dominant failure the user reports.

### Root Cause 2 (BUG): `findRunOrThrow` Only Accepts `currentRun`

**Location:** `shared/run-lookup.ts:26-34`

**Mechanism:** The processor's `findLatestTerminalRun` selects the latest SUCCEEDED/MERGED/UNVERIFIED run. But `mergeRunToStaging` at `github-merge-service.ts:480` calls `findRunOrThrow`, which requires the run ID to match `ticketDetail.currentRun` -- the latest run by `createdAt` regardless of status.

After failed resolution cycles create new FAILED runs, those become `currentRun` (newest by creation date). But `findLatestTerminalRun` still correctly returns the older successful run. The IDs don't match. `findRunOrThrow` throws a 404. The processor retries 3 times identically, then permanently fails.

**Evidence:**
- `shared/run-lookup.ts:30-32`: `if (ticketDetail.currentRun && ticketDetail.currentRun.id === runId)` -- only matches currentRun
- Production logs: `"Run cmnrwzvge... not found or is not the current run for this ticket"` causing permanent FAILED status after 3 retries (from diagnosis production evidence)

**User impact:** Permanent failure after resolution attempts. Manual retry hits the same deterministic error. The only escape is creating a fresh run.

### Root Cause 3 (DESIGN): RESOLVING Blocks Entire Queue

**Location:** `staging-queue-processor.ts:38-43`

**Mechanism:** The FIFO blocking clause is:
```sql
AND NOT EXISTS (
  SELECT 1 FROM "StagingMergeQueueItem" AS blocker
  WHERE blocker."organizationId" = "StagingMergeQueueItem"."organizationId"
    AND blocker."status" IN ('RESOLVING', 'MERGING')
    AND blocker."position" < "StagingMergeQueueItem"."position"
)
```

When an item enters RESOLVING (30-60 min agent run), ALL subsequent QUEUED items in the same organization are blocked. Clean merges that would take 5-16 seconds wait behind a 30-60 minute resolution.

**Evidence:**
- Prior diagnosis captured positions 5-6 blocked behind position 4 in RESOLVING state
- The user's own description matches: they expect serialization during "being merged" (seconds), not during resolution (minutes)

**User impact:** One slow item stalls the entire org queue for 30-60 minutes.

### Root Cause 4 (BUG): Failed Agent Trigger Leaves Item Stuck

**Location:** `staging-queue-processor.ts:264-267`

**Mechanism:** After setting an item to RESOLVING, the processor tries to trigger an agent run. If `createRerunForTicketInOrganization` throws (e.g., the latest run is still in progress), the catch block only logs the error:

```typescript
catch (rerunErr) {
  const msg = rerunErr instanceof Error ? rerunErr.message : String(rerunErr);
  logQueue(`failed to trigger agent for item=${item.id}: ${msg}`);
}
```

The item stays in RESOLVING with no agent running. Nothing happens until the 30-minute stale recovery mechanism resets it to QUEUED.

**Evidence:** Direct code inspection at `staging-queue-processor.ts:264-267` -- catch block has no state update.

**User impact:** Items stuck in RESOLVING limbo for 30 minutes with no visible progress or explanation.

### Root Cause 5 (MINOR): Cancelled Items Hard-Deleted

**Location:** `staging-queue-service.ts:248`

**Mechanism:** `cancelQueueItem` calls `prisma.stagingMergeQueueItem.delete()`, permanently removing the record. This destroys failure evidence and makes historical analysis impossible.

**Evidence:** Production DB shows only MERGED items -- no trace of failures, cancellations, or retry history for deleted items.

**User impact:** Cannot diagnose patterns or measure true failure rates. Deferred fix (requires schema migration).

---

## Recommended Fix Roadmap

### Summary

| # | Fix | Files Changed | Risk | Impact |
|---|-----|---------------|------|--------|
| 1 | Add catch-up step in `mergeRunToStaging` | `github-merge-service.ts` | Low | **Highest** -- eliminates most 30-60 min RESOLVING cycles |
| 2 | Add `loadRunForMerge` helper | `run-lookup.ts`, `github-merge-service.ts`, `focused-merge-service.ts` | Low | **High** -- fixes deterministic 404 after resolution cycles |
| 3 | Narrow `QUEUE_BLOCKING_CLAUSE` | `staging-queue-processor.ts` | Low-Med | **High** -- unblocks queue during agent resolution |
| 4 | Fix agent trigger catch block | `staging-queue-processor.ts` | Low | **Medium** -- prevents 30-min stuck items |

**Implementation order:** Build bottom-up: helper (#2) -> merge service (#1) -> processor (#3, #4).

### Fix 1: Add Catch-Up Step in `mergeRunToStaging`

**What changes:** Add the GitHub Merge Branch API call (staging -> feature) at two points inside `mergeRunToStaging` (`github-merge-service.ts`):

- **Point A -- Multi-repo pre-validation rescue** (around line 505): When `validateReposForMerge` finds unmergeable repos, before returning all as failed, try the catch-up for each unmergeable repo. If all return 201 or 204, proceed past pre-validation to merge. If any return 409, return all as failed with `hasConflict: true`.

- **Point B -- Post-merge-failure rescue** (after line 569): After PR merge + direct merge fallback, for any repos still failed, try the catch-up. If 201 (branch was behind), retry the PR merge. If 409, mark `hasConflict: true`. If 204, leave as-is for the processor's existing classification.

**Why this approach:** `mergeRunToStaging` already has the changed repos list, authentication token, and all merge orchestration logic. The catch-up naturally handles post-agent re-verification (re-queued items that fail because staging changed during the 30-60 min resolution).

**Rejected alternatives:**
- *Catch-up in the processor*: Processor doesn't have changed repos, branches, or auth token. Would require duplicating aggregation logic.
- *Separate catch-up orchestrator*: Unnecessarily large refactor; `mergeRunToStaging` is the right home.
- *Always-catch-up (Option B)*: Adds latency to clean merges; violates "clean merges unaffected" requirement.

**Test impact:** No existing tests directly test `mergeRunToStaging` end-to-end (it calls GitHub APIs). New integration-level tests recommended.

**Verification:** Queue an item for a ticket whose branch is behind staging. Should merge in <30s without entering RESOLVING.

### Fix 2: Add `loadRunForMerge` Helper

**What changes:** Add a new `loadRunForMerge(runId, ticketId)` function in `shared/run-lookup.ts` (~20 lines). It queries `SandboxRun` by ID, validates ticket ownership, and parses `changedRepos` from `runSummary`. Returns a `RunLike` object.

Replace `findRunOrThrow` with `loadRunForMerge` at:
- `github-merge-service.ts:480` (in `mergeRunToStaging`)
- `focused-merge-service.ts:91` (in `performFocusedMerge`)

Keep `findRunOrThrow` unchanged for all other callers (user-facing endpoints where the `currentRun` guard is correct: `getRunMergeStatus`, `mergeRunToMain`, merge-analysis, walkthrough).

**Why this approach:** Separate helpers for separate use cases. The queue processor is a system-level caller that explicitly selects the correct run. User-facing endpoints should keep the `currentRun` safety guard.

**Rejected alternatives:**
- *Widen `findRunOrThrow` with a `skipCurrentRunCheck` flag*: Boolean parameters obscure intent. A named helper is clearer.
- *Pass run data directly from processor*: Would require changing the `mergeRunToStaging` signature and all callers.

**Test impact:** Unit test for `loadRunForMerge` should cover: valid run, wrong ticket, null runSummary, malformed runSummary.

**Verification:** After a failed resolution cycle creates new runs, the queue item should still merge using the correct terminal run without 404 errors.

### Fix 3: Narrow `QUEUE_BLOCKING_CLAUSE`

**What changes:** In `staging-queue-processor.ts:38-43`, remove RESOLVING from the blocking clause:

```sql
-- Before:
AND blocker."status" IN ('RESOLVING', 'MERGING')

-- After:
AND blocker."status" = 'MERGING'
```

**Why this approach:** MERGING takes seconds (5-16s clean, <30s with catch-up). RESOLVING takes 30-60 minutes and operates in a sandbox on the ticket branch -- it never touches staging. After resolution, the item is re-queued and goes through normal merge flow including the new catch-up step, handling any staging changes that occurred during resolution.

**Rejected alternatives:**
- *Per-repo locking*: Complex to implement. The FIFO + catch-up combination handles the common case. Can revisit if evidence shows repo-level conflicts after the fix.
- *Remove blocking entirely*: MERGING items must block to prevent concurrent staging writes.

**Test impact:** Existing tests at `staging-queue-processor.test.ts` (lines ~240-259) assert the blocking clause includes RESOLVING. These must be updated.

**Verification:** Queue two items. Let the first enter RESOLVING (real conflict). The second (clean) item should process immediately.

### Fix 4: Fix Agent Trigger Catch Block

**What changes:** In `staging-queue-processor.ts:264-267`, reset the item to QUEUED when agent triggering fails:

```typescript
catch (rerunErr) {
  const msg = rerunErr instanceof Error ? rerunErr.message : String(rerunErr);
  logQueue(`failed to trigger agent for item=${item.id}: ${msg}`);
  await prisma.stagingMergeQueueItem.update({
    where: { id: item.id },
    data: { status: "QUEUED", errorMessage: `Agent trigger failed: ${msg}` },
  });
}
```

**Why QUEUED, not FAILED:** The item hasn't permanently failed -- the agent just couldn't start (e.g., latest run still in progress). Re-queuing lets the processor retry. The existing retry cap (9 total) prevents infinite loops.

**Rejected alternatives:**
- *Set to FAILED*: Too aggressive. Agent trigger failures are often transient (run still in progress). The processor should retry.
- *Leave as-is with shorter stale recovery*: Reduces wait time but doesn't fix the root cause.

**Test impact:** New test case: mock `createRerunForTicketInOrganization` to throw, verify item status is QUEUED with error message.

**Verification:** Trigger a scenario where agent creation fails. Item should immediately return to QUEUED with an error message, not stay stuck in RESOLVING for 30 minutes.

---

## Performance & Risk Assessment

### Before/After Performance

| Scenario | Current | After Fix |
|----------|---------|-----------|
| Clean merge (no divergence) | 5-16s | 5-16s (unchanged) |
| Diverged branch (behind staging) | 30-60 min (agent) | <30s (catch-up + retry) |
| Real file conflict | 30-60 min (after 60s classification) | 30-60 min (after <5s catch-up confirms 409) |
| Queue during RESOLVING | Blocked 30-60 min | Unblocked (only MERGING blocks) |
| Failed agent trigger recovery | 30 min (stale recovery) | Immediate re-queue |
| Post-agent re-merge | Often re-enters RESOLVING | Catch-up handles divergence |

### Risk Assessment

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| 1 | GitHub mergeability lag: after catch-up (201), PR merge sees stale `mergeable=false` | Medium | Low | Direct merge API fallback (`github-merge-service.ts:540-569`) bypasses PR mergeability entirely |
| 2 | Post-resolution race: item B merges while item A resolves, making A's resolution stale | Medium | Low | After A re-queues, catch-up merges new staging into A's branch. Self-healing by design. |
| 3 | `loadRunForMerge` parses `runSummary` which could be null/malformed for old runs | Low | Medium | Return empty `changedRepos`; existing GitHub compare fallback at line 488-498 handles this |
| 4 | Catch-up modifies feature branch (merges staging into it) | Low | Low | Same operation as existing "Refresh from staging" button; PR diff updates automatically |
| 5 | Concurrent processor instances could race on catch-up | Low | Low | `FOR UPDATE SKIP LOCKED` ensures one instance per item; MERGING blocks one item per org |
| 6 | DB transaction timeout under connection pool pressure | Medium | Medium | Catch-up API calls are outside the DB transaction; no increase in transaction scope |

---

## Deferred Items

| # | Item | Rationale for Deferral |
|---|------|----------------------|
| 1 | **Soft-delete cancelled items** | Requires `cancelledAt` field and Prisma schema migration. Product spec says "no schema migrations expected." Core fixes reduce cancellation frequency first. |
| 2 | **Optimize `checkRealConflicts` polling** | The 60s mergeability poll rarely executes after the catch-up handles divergence (201). Optimization is low-priority. |
| 3 | **Parallel non-conflicting merges** | Processing items touching different repos concurrently could improve throughput. Adds concurrency complexity; FIFO is adequate for current volume. |
| 4 | **Processor logging to BetterStack** | Production logs show no processor-specific messages reaching the aggregator. `console.log` may not be routed. Needs log pipeline investigation. |
| 5 | **Transaction timeout resilience** | DB "Unable to start a transaction in the given time" observed 2026-04-11. Connection pool pressure mitigation is a separate infrastructure concern. |

---

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| `ticket.md` (server) | User problem statement and "fresh eyes" request | Near-100% failure rate on conflicting merges; wants fundamental rethink |
| `scout/scout-summary.md` (server) | Full architecture map, state machine, component inventory | 3,500 lines across 10+ files; complete end-to-end flow; production processing times |
| `scout/reference-map.json` (server) | Production facts, file map, unknowns | All 18 items MERGED; 15/18 in 5-16s; hard-delete on cancel; triple-fallback pattern |
| `diagnosis/diagnosis-statement.md` (server) | 5 root causes ranked by impact with production evidence | Missing catch-up is highest impact; "patch, don't redesign" verdict |
| `diagnosis/apl.json` (server) | Evidence chains for each root cause | Production log: "Run not found or is not the current run" causing permanent failure |
| `product/product.md` (server) | Success criteria, scope constraints, MVP features | Server-only; no schema migration; 6 success criteria; "escalating resolution tiers" |
| `tech-research/tech-research.md` (server) | 3 design alternatives, 4 code changes, rejected alternatives, risk matrix | Option C chosen; catch-up at 2 points in mergeRunToStaging; loadRunForMerge design |
| `tech-research/apl.json` (server) | Q&A on technical decisions with evidence | Catch-up handles post-agent re-verification naturally; no special tracking needed |
| `repo-guidance.json` | Repo intent classification | Server = target (all root causes); Client = context only |
| `staging-queue-processor.ts` | Core processor source (verified) | QUEUE_BLOCKING_CLAUSE SQL at line 38; agent trigger catch at line 264; 120s reentry guard |
| `github-merge-service.ts` | Merge orchestration source (verified) | mergeRunToStaging at line 474; findRunOrThrow at line 480; pre-validation at line 502 |
| `focused-merge-service.ts` | Existing catch-up code (verified) | GitHub Merge API (staging into feature) with 201/204/409 at lines 110-144 |
| `shared/run-lookup.ts` | findRunOrThrow implementation (verified) | Only accepts currentRun (line 30); 34 lines total; RunLike type defined here |
| `/tmp/helix-inspect/manifest.json` | Runtime inspection availability | DATABASE and LOGS available for production queries |

## Attachments
- Helix_Manifesto.pdf (application/pdf, 72166 bytes)
- Helix_AI_Dovie_Offer.pdf (application/pdf, 16334 bytes)
- Project_X_Innovation_One_Pager.pdf (application/pdf, 313511 bytes)
