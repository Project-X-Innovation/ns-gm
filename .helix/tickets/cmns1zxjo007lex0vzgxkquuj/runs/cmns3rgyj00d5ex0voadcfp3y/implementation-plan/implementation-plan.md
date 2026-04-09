# Implementation Plan — Proxy Module Research Report

## Overview

This is a **research/report** ticket. The deliverable is a polished markdown report at `report/report.md` within the ns-gm run root. No code changes, git commits, PRs, or deployments are produced.

The report synthesizes all prior research artifacts (scout, diagnosis, product, tech-research) into a single authoritative document answering the user's refined question: **"Can we keep the real NetSuite module running — not our own version — and intercept at the write boundary to see what NetSuite actually gets?"**

The report covers the ES6 Proxy wrapping approach (Option B-prime), the two-level Proxy pattern, three interception levels, field capture strategy, new RESTlet actions, Express endpoints, runtime verification requirements, cross-repo sync, risks, and implementation roadmap.

## Implementation Principles

1. **Synthesis, not duplication**: The report synthesizes findings from 8+ prior artifacts into a coherent narrative. Do not copy-paste entire sections; distill key findings with proper attribution.
2. **User-focused language**: The primary audience is the user who asked the original question. Write in clear, concrete terms with diagrams (ASCII/text) where helpful.
3. **Evidence-backed claims**: Every technical assertion must cite the source artifact or direct code observation (file path + line numbers).
4. **Actionable roadmap**: The report should leave the reader with a clear understanding of what to build, in what order, and what to test first.
5. **Honest about unknowns**: Clearly flag the blocking unknown (ES6 Proxy on GraalJS Java-backed host objects) and the fallback strategy.

## Implementation Steps Summary

| Step | Goal | Deliverable |
|------|------|-------------|
| 1 | Gather and re-verify source data from all prior artifacts | Confirmed data inventory for report sections |
| 2 | Read key source files for code-level accuracy | Verified code references (line numbers, patterns) |
| 3 | Assemble the Executive Summary and Problem Evolution sections | Report sections 1-2 |
| 4 | Assemble the Architecture Decision and Three Interception Levels sections | Report sections 3-4 |
| 5 | Assemble the Two-Level Proxy Pattern Design section | Report section 5 |
| 6 | Assemble the Field Capture Strategy and Change Summary Format sections | Report sections 6-7 |
| 7 | Assemble the New RESTlet Actions and Express Endpoints sections | Report sections 8-9 |
| 8 | Assemble the Cross-Repo Sync, Risks, and Implementation Roadmap sections | Report sections 10-12 |
| 9 | Final assembly and internal consistency check | Complete `report/report.md` |

## Detailed Implementation Steps

### Step 1: Gather and Re-Verify Source Data

**Goal**: Confirm all input artifacts are readable and extract the key data points needed for each report section.

**What to Build**: Read and validate availability of all input artifacts:
- `ticket.md` (ns-gm) — user's original question
- User continuation context — refined ask ("keep the real module, hijack at the end")
- `scout/scout-summary.md` (ns-gm) — three interception levels, architectural boundaries
- `scout/reference-map.json` (ns-gm) — file inventory, facts, unknowns
- `diagnosis/diagnosis-statement.md` (ns-gm) — ES6 Proxy confirmation, Level 2 analysis
- `diagnosis/apl.json` (ns-gm) — structured Q&A with evidence
- `product/product.md` (ns-gm) — MVP scope, use cases, success criteria
- `tech-research/tech-research.md` (ns-gm) — full architecture decision, Proxy handler design
- `tech-research/apl.json` (ns-gm) — structured tech decisions
- `product/product.md` (helix-global-server) — server-side scope
- `tech-research/tech-research.md` (helix-global-server) — server role, credential chain

**Verification (AI Agent Runs)**: Confirm each artifact is readable via Read tool. Log any missing artifacts as warnings.

**Success Criteria**: All artifacts enumerated above are accessible and their key data points are noted.

### Step 2: Read Key Source Files for Code-Level Accuracy

**Goal**: Verify code references cited in the report are accurate (line numbers, patterns, function names).

**What to Build**: Read and verify:
- `ns-gm/ns_gm_restlet.js` — confirm lines 7-16 (AMD define), 71-96 (moduleMap), 115-125 (moduleParamValues build), 163-169 (safeExecute), 23-37 (post dispatcher)
- `ns-gm/server/app.js` — confirm POST /run pattern (lines 35-86), server structure
- `ns-gm/server/auth.js` — confirm OAuth 2.0 M2M pattern

**Verification (AI Agent Runs)**: Each file read confirms referenced line ranges and patterns match prior artifact claims.

**Success Criteria**: All code references in the report are verified against current source files. Any drift from prior artifacts is noted and corrected in the report.

### Step 3: Executive Summary and Problem Evolution

**Goal**: Write the opening sections that frame the research question and its evolution.

**What to Build**: Report sections:
1. **Executive Summary** — One-paragraph answer to the user's question: Yes, ES6 Proxy wrapping keeps the real module while intercepting at the write boundary. Captures Level 2 (pre-save in-memory state including sourced/dependent fields), not just Level 1 (user input).
2. **Problem Evolution** — How the question evolved: original proxy module concept → module replacement (prior Approach B) → user's refined ask ("keep the real module") → ES6 Proxy wrapping (Option B-prime).

**Verification (AI Agent Runs)**: Re-read the sections and confirm the narrative accurately reflects the user continuation context and the progression through prior research tickets.

**Success Criteria**: Sections are concise (<500 words combined), accurately represent the user's ask, and cite the evolution from prior research.

### Step 4: Architecture Decision and Interception Levels

**Goal**: Present the core technical finding — why ES6 Proxy wrapping was chosen and the three interception levels it addresses.

**What to Build**: Report sections:
3. **Architecture Decision** — Options considered (A: beforeSubmit UES, B: module replacement, B-prime: ES6 Proxy wrapping, C: monkey-patching). Verdict for each. Clear rationale for B-prime.
4. **Three Interception Levels** — Table defining Level 1 (user input), Level 2 (pre-save in-memory state), Level 3 (post-commit state). What each captures. What the Proxy approach achieves (Level 2) and what it cannot (Level 3 without side effects). Key insight: Level 2 is substantially richer than Level 1 because real module ran sourcing/validation.

**Verification (AI Agent Runs)**: Cross-check the options table against `tech-research/tech-research.md` (ns-gm) and `diagnosis/diagnosis-statement.md` (ns-gm).

**Success Criteria**: Architecture decision is evidence-backed with clear rejected-alternative rationale. Interception levels table is accurate and includes the "key insight" about Level 2 richness.

### Step 5: Two-Level Proxy Pattern Design

**Goal**: Document the core technical design — how the module Proxy and record instance Proxy work together.

**What to Build**: Report section:
5. **Two-Level Proxy Pattern** — Level 1 Module Proxy (wraps N/record; `get` trap for create/load/copy/submitFields/delete; passthrough for all else). Level 2 Record Instance Proxy (wraps each Record; `get` trap for save(); passthrough for all else). Injection point at `moduleParamValues[]` (lines 115-125). Include:
   - Module-level handler table (trapped methods + behaviors)
   - Record-instance handler table (trapped methods + behaviors)
   - ASCII diagram showing the proxy chain: `User Code → Module Proxy → Real N/record → Record Instance Proxy → Real Record`
   - `capturedChanges` accumulation pattern (closure-scoped array)

**Verification (AI Agent Runs)**: Verify the handler tables match `tech-research/tech-research.md` (ns-gm) "Proxy Handler Design" section. Verify injection point line references against `ns_gm_restlet.js`.

**Success Criteria**: Proxy pattern is complete, accurate, and understandable without reading prior artifacts.

### Step 6: Field Capture Strategy and Change Summary Format

**Goal**: Document what data is captured when a write operation is intercepted.

**What to Build**: Report sections:
6. **Field State Capture Strategy** — Body fields via `getFields()` + `getValue()`/`getText()`. Sublist fields via `getLineCount()` + `getSublistValue()` with agent-provided `targetSublistIds` plus common sublist enumeration. Limitations: `getFields()` returns body fields only; sublist completeness depends on hints.
7. **Change Summary Output Format** — JSON schema for captured change objects: `{ operation, recordType, recordId, before, after, sublists }`. Include example for a Sales Order create with sourced fields visible.

**Verification (AI Agent Runs)**: Cross-check field capture strategy against `tech-research/tech-research.md` "Field State Capture Strategy" section.

**Success Criteria**: Capture strategy is complete and includes a concrete example showing the difference between Level 1 and Level 2 capture.

### Step 7: New RESTlet Actions and Express Endpoints

**Goal**: Document the new action branches and Express routes.

**What to Build**: Report sections:
8. **New RESTlet Actions** — `dry-run` action (input, flow, output) and `execute-approved` action (input, flow, output). Both are additive `else if` branches in `post()` — zero risk to existing `run`/`getscriptexecutionlogs`. Governance safety threshold (<200 remaining units → abort with partial result).
9. **New Express Endpoints** — `POST /dry-run` and `POST /execute` following the existing `POST /run` pattern. Both use `requireActiveProfile()` + `nsapi.REST.post()`. Include request/response schemas.

**Verification (AI Agent Runs)**: Verify the existing `POST /run` pattern in `server/app.js` (lines 35-86) and the RESTlet `post()` dispatcher (lines 23-37) to confirm additive-only changes.

**Success Criteria**: Action specs include input/output schemas, governance handling, and backward compatibility notes.

### Step 8: Cross-Repo Sync, Risks, and Implementation Roadmap

**Goal**: Document cross-repo coordination, risks, and a prioritized implementation roadmap.

**What to Build**: Report sections:
10. **Cross-Repo Coordination** — helix-global-server duplicate RESTlet at `netsuite-setup/FileCabinet/SuiteScripts/ns_gm_restlet.js` must be updated in lockstep. Deployment sequence: update RESTlet → SDF deploy → enable server-side calls. Credential chain reusable (10 NsGmCredential records, 5 orgs, confirmed via runtime inspection).
11. **Risks and Open Questions** — Numbered table with severity, mitigation. Key risk #1: ES6 Proxy on GraalJS Java-backed host objects (blocking unknown, requires runtime test). Include all 8 risks from tech-research.
12. **Implementation Roadmap** — Prioritized steps: (1) Runtime Proxy viability test via ns-gm CLI, (2) RESTlet `handleDryRunAction` with Proxy handler, (3) Express `/dry-run` endpoint, (4) RESTlet `execute-approved` action + Express `/execute` endpoint, (5) helix-global-server RESTlet sync, (6) End-to-end dry-run test. Include deferred items (Round 2).

**Verification (AI Agent Runs)**: Cross-check risks table against `tech-research/tech-research.md` "Open Risks" section. Verify credential count from runtime inspection data.

**Success Criteria**: All 8 risks enumerated, roadmap has clear sequencing with the runtime viability test as Step 1 (gating).

### Step 9: Final Assembly and Consistency Check

**Goal**: Produce the complete `report/report.md` and verify internal consistency.

**What to Build**: Assemble all sections into `report/report.md` at the ns-gm run root. Add:
- Table of Contents
- Artifact Inputs Used table (all source artifacts with "Why Used" and "Key Takeaway")
- Ensure all cross-references between sections are consistent
- Ensure all code line references match what was verified in Step 2

**Verification (AI Agent Runs)**: 
- Read the final `report/report.md` and confirm it has all 12+ sections
- Verify word count is reasonable (3,000-6,000 words)
- Confirm all line-number citations are accurate
- Confirm the "Artifact Inputs Used" table is complete

**Success Criteria**: `report/report.md` exists, is internally consistent, covers all planned sections, and provides an actionable answer to the user's question.

## Verification Plan

### Pre-conditions

| Dependency | Status | Source/Evidence | Affects checks |
|-----------|--------|----------------|----------------|
| All prior artifacts (scout, diagnosis, product, tech-research) for ns-gm are readable | available | Read during implementation-plan step; all confirmed accessible | CHK-01, CHK-02, CHK-03 |
| helix-global-server prior artifacts (product, tech-research) are readable | available | Read during implementation-plan step; confirmed accessible | CHK-01, CHK-03 |
| `ns_gm_restlet.js` source file in ns-gm repo | available | Read and verified during implementation-plan step (452 lines) | CHK-02 |
| `server/app.js` source file in ns-gm repo | available | Read and verified during implementation-plan step (154 lines) | CHK-02 |
| Runtime inspection manifest for helix-global-server (database, logs) | available | `/tmp/helix-inspect/manifest.json` confirmed with DATABASE and LOGS types | CHK-04 |

### Required Checks

[CHK-01] Verify report file exists and has complete structure.
- Action: Read `report/report.md` from the ns-gm run root. Check that the file exists and contains all required sections: Executive Summary, Problem Evolution, Architecture Decision, Three Interception Levels, Two-Level Proxy Pattern, Field Capture Strategy, Change Summary Format, New RESTlet Actions, New Express Endpoints, Cross-Repo Coordination, Risks and Open Questions, Implementation Roadmap, and Artifact Inputs Used.
- Expected Outcome: The file exists at the correct path and contains 12+ clearly headed sections covering all planned topics.
- Required Evidence: File read output showing all section headings present.

[CHK-02] Verify code references are accurate.
- Action: Read `ns-gm/ns_gm_restlet.js` and `ns-gm/server/app.js`. Cross-reference the line numbers and code patterns cited in the report against the actual source files.
- Expected Outcome: All line-number citations in the report (e.g., "lines 115-125 for moduleParamValues", "lines 23-37 for post dispatcher", "lines 35-86 for POST /run") match the actual source code.
- Required Evidence: Side-by-side comparison showing at least 3 cited line ranges match actual source content.

[CHK-03] Verify report accurately reflects prior artifact conclusions.
- Action: Read `tech-research/tech-research.md` (ns-gm) and `diagnosis/diagnosis-statement.md` (ns-gm). Compare key claims in the report (ES6 Proxy availability, three interception levels, architecture decision rationale, risk list) against these source artifacts.
- Expected Outcome: Report claims match source artifact conclusions. No contradictions or unsupported additions.
- Required Evidence: Comparison of at least 3 key claims showing consistency between report and source artifacts.

[CHK-04] Verify runtime data inclusion (credential infrastructure).
- Action: Use the runtime-inspection skill to query the helix-global-server database for NsGmCredential record count. Compare with the count cited in the report.
- Expected Outcome: The report cites the correct number of NsGmCredential records and organizations, matching the runtime query result.
- Required Evidence: Runtime query output showing NsGmCredential count alongside the report's citation.

[CHK-05] Verify report is self-contained and actionable.
- Action: Read the report from start to finish. Verify it answers the user's core question ("Can we keep the real NetSuite module and intercept at the write boundary?") in the Executive Summary. Verify the Implementation Roadmap provides numbered, sequenced steps with the runtime viability test as Step 1.
- Expected Outcome: The Executive Summary directly answers "yes" with a concise explanation of the ES6 Proxy approach. The roadmap starts with the runtime viability test and has clear sequencing through end-to-end testing.
- Required Evidence: Excerpts from the Executive Summary and Implementation Roadmap sections showing the answer and sequencing.

## Success Metrics

1. `report/report.md` is complete with 12+ sections totaling 3,000-6,000 words
2. All code references verified against current source files
3. Report claims are consistent with prior artifact conclusions
4. Runtime credential data is accurately cited
5. The user's core question is directly answered in the Executive Summary
6. Implementation roadmap provides a clear, sequenced path from runtime verification through end-to-end testing

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| `ns-gm/ticket.md` | Research scope and user's original question | Proxy module feasibility, input-only capture concern |
| User continuation context | Refined ask that drives the entire research direction | "Keep the real module, hijack at the end when it sends to NetSuite" |
| `ns-gm/scout/scout-summary.md` | Three interception levels, architectural boundaries | N/* modules make JVM calls; Level 2 vs Level 3 distinction; beforeSubmit UES is only Level 3 native mechanism |
| `ns-gm/scout/reference-map.json` | File inventory, facts, unknowns | 24 pre-loaded modules; Proxy availability was key unknown; module injection at lines 115-125 |
| `ns-gm/diagnosis/diagnosis-statement.md` | Core technical analysis confirming ES6 Proxy feasibility | ES6 Proxy confirmed in SuiteScript 2.1 (GraalJS); strict improvement over module replacement |
| `ns-gm/diagnosis/apl.json` | Structured Q&A with evidence chains | Proxy wrapping works; Level 2 capturable without side effects |
| `ns-gm/product/product.md` | MVP scope, use cases, success criteria, out-of-scope items | Two-level Proxy pattern; dry-run + execute-approved flow; runtime validation required |
| `ns-gm/tech-research/tech-research.md` | Full architecture decision, Proxy handler design, performance, risks | Proxy handler tables; field capture strategy; 8 open risks; deferred items |
| `ns-gm/tech-research/apl.json` | Structured tech decisions with evidence | 8 questions answered covering architecture, fallback, field capture, endpoints |
| `helix-global-server/product/product.md` | Server-side MVP scope | RESTlet sync only; credential chain reusable; no server logic changes |
| `helix-global-server/tech-research/tech-research.md` | Server role, credential chain, deployment sequencing | 10 NsGmCredential records; SDF deployment pipeline; manual sync for MVP |
| `ns-gm/ns_gm_restlet.js` (direct read) | Verify module injection pattern, action dispatcher, execution model | Lines 7-16 AMD define; 71-96 moduleMap; 115-125 array build; 163-169 safeExecute |
| `ns-gm/server/app.js` (direct read) | Express endpoint pattern for new endpoints | POST /run pattern (lines 35-86): validate → nsapi.REST.post() → structured response |
| `/tmp/helix-inspect/manifest.json` | Runtime inspection availability | DATABASE and LOGS types available for helix-global-server |
