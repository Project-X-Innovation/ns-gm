# Ticket Context

- ticket_id: cmnth7lzb0001k80u59have2d
- short_id: BLD-210
- run_id: cmnz7wobd0030hw0u3wk12k4w
- run_branch: helix/build/BLD-210-helix-netsuite-creating-items-that-will-be
- repo_key: ns-gm
- repo_url: https://github.com/Project-X-Innovation/ns-gm.git

## Title
Helix NetSuite: Creating Items that will be deployed to production

## Description
This is a really big feature, so take your time. Make sure everything that needs attention gets attention, and that the full implementation is coherent from beginning to end. Thank you.

## Research Report

# Helix NS: End-to-End SDF Object Creation & Deployment

**Research Report** | RSH-174 | April 10, 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture](#2-current-architecture)
3. [Gap Analysis](#3-gap-analysis)
4. [Production State](#4-production-state)
5. [Cherry-Pick Deployment: Scoped deploy.xml](#5-cherry-pick-deployment-scoped-deployxml)
6. [Agent Integration: Which Agents Do What](#6-agent-integration-which-agents-do-what)
7. [Deploy Pipeline Implementation Specification](#7-deploy-pipeline-implementation-specification)
8. [Agent Infrastructure Implementation Specification](#8-agent-infrastructure-implementation-specification)
9. [SDF Object Reference](#9-sdf-object-reference)
10. [deploy.xml & manifest.xml Management](#10-deployxml--manifestxml-management)
11. [Cross-Line Project Support](#11-cross-line-project-support)
12. [Risk Assessment & Open Questions](#12-risk-assessment--open-questions)
13. [Implementation Roadmap](#13-implementation-roadmap)

---

## 1. Executive Summary

### The Problem

Helix NS today can only modify **existing** SuiteScript files and upload them via `suitecloud file:upload`. It cannot create any new NetSuite objects:

- No new script records or script deployments
- No new custom records or custom fields
- No new saved searches or workflows
- No new files that weren't already in the repository

Even if an agent somehow produced the correct SDF XML files, the deployment pipeline would silently ignore them because it only processes `src/FileCabinet/` and never touches `src/Objects/`.

This means Helix cannot deliver a complete customization. A real-world request like "build a license management system" requires custom records, multiple script types, script deployments, and possibly a SPA -- all working together. Today, a developer must manually create every non-file artifact outside of Helix.

### Two Co-Equal Root Causes

1. **Deploy Pipeline Gap**: The NATIVE_NS deployment path (both sandbox and production) scopes git diffs exclusively to `src/FileCabinet/` and deploys only via `file:upload`. The `src/Objects/` directory -- where all SDF metadata XML lives -- is completely invisible to the pipeline. Zero references to `src/Objects/` exist in either deploy file.

2. **Agent Knowledge Gap**: No skill, prompt rule, or step-config guidance teaches agents how to create SDF XML objects. The ns-gm skill actively discourages creation ("Do not create, update, or delete NetSuite records"). The implementation step-config has zero NS-specific instructions.

### The Solution: Three Dimensions

| Dimension | Summary |
|-----------|---------|
| **Deploy Pipeline** | Replace `file:upload` with **scoped `project:deploy`** using a dynamically generated `deploy.xml` listing only changed paths. Cherry-pick principle preserved. |
| **Agent Integration** | New SDF creation skill + `NS_SDF_AWARENESS_RULES` in shared prompts + implementation step-config guidance + ns-gm guardrail update. |
| **Cross-Line Support** | Multi-repo tickets spanning NATIVE_NS + SPA_NS + normal repos deploy independently in a single run. Already supported at ticket level. |

### The Core Innovation: Scoped deploy.xml

The user's explicit concern: *"What if somebody does a bug fix directly in production, and now we're redeploying the whole sandbox environment into production?"*

Oracle docs confirm the danger: **"Custom objects always replace the custom objects in the NetSuite account when you deploy, regardless of any previous changes."**

The scoped `deploy.xml` approach resolves this by extending the existing git-diff cherry-pick pattern: diff both `src/Objects/` and `src/FileCabinet/` against the comparison branch, generate a deploy.xml listing **only** those specific paths (not wildcards), and run `project:deploy`. Only the ticket's changes enter the deploy package. Production objects not touched by the ticket are never overwritten.

### Scope

- **1 file to create**: `.claude/skills/ns-sdf-objects/SKILL.md` (new SDF creation skill)
- **6 files to modify**: `deploy-phase.ts`, `ns-deployment-service.ts`, `native-phase.ts`, `shared/common.mjs`, `implementation/step-config.mjs`, `.claude/skills/ns-gm/SKILL.md`
- **0 schema changes**: NsDeployment model is deploy-method-agnostic
- **0 new dependencies**: Everything built on existing SuiteCloud CLI, Java, and agent infrastructure
- **Single repo**: All changes in `helix-global-server`

### Answering the Core Questions

> "Which agents do what?"

All 9 agents retain their existing roles. The **Implementation agent** gets the heaviest new responsibility: authoring SDF XML objects in `src/Objects/`. See [Section 6](#6-agent-integration-which-agents-do-what) for the complete per-agent role table.

> "Do I need to alter the prompts?"

Yes. 3 prompt-related files are updated: `shared/common.mjs` (new `NS_SDF_AWARENESS_RULES` for all agents), `implementation/step-config.mjs` (SDF creation workflow), and `.claude/skills/ns-gm/SKILL.md` (guardrail disambiguation).

> "Do I need a skill to teach them?"

Yes. 1 new skill at `.claude/skills/ns-sdf-objects/SKILL.md` provides XML templates for all common object types, naming conventions, manifest.xml feature mapping, and Context7 usage guidance.

---

## 2. Current Architecture

### Deploy Pipeline: Two Paths with a Gap

The deployment system has two distinct code paths, one for each NetSuite repo type:

#### SPA_NS Repos (Working)

| Phase | File | Lines | Mechanism |
|-------|------|-------|-----------|
| Sandbox | `deploy-phase.ts` | L260-282 | SDF credential setup, `suitecloud project:deploy` |
| Production | `ns-deployment-service.ts` | L561-584 | Same `project:deploy` pattern |

SPA repos deploy via `project:deploy`, which handles both `src/Objects/` (SDF metadata XML) and `src/FileCabinet/` (SuiteScript source) in a single operation. This path is production-proven.

#### NATIVE_NS Repos (The Gap)

| Phase | File | Lines | Mechanism | Gap |
|-------|------|-------|-----------|-----|
| Sandbox git diff | `deploy-phase.ts` | L351-362 | `git diff ... -- src/FileCabinet/` | **Only** FileCabinet |
| Sandbox upload | `deploy-phase.ts` | L415-431 | `suitecloud file:upload --paths ...` | **Only** files |
| Production git diff | `ns-deployment-service.ts` | L637-650 | `git diff ... -- src/FileCabinet/` | **Only** FileCabinet |
| Production upload | `ns-deployment-service.ts` | L668-682 | `suitecloud file:upload --paths ...` | **Only** files |

The NATIVE_NS path:
1. Runs `git diff --name-only --diff-filter=ACMRT --relative origin/staging HEAD -- src/FileCabinet/` (deploy-phase.ts L352-362)
2. Strips the `src/FileCabinet/` prefix via `stripFileCabinetPrefix()` (L383)
3. Filters via `filterExcludedPaths()` using `nativeExcludePattern` (L384)
4. Runs `suitecloud file:upload --paths ...` for each changed file (L415-431)

**The `src/Objects/` directory is completely invisible.** Zero references to `src/Objects/` exist in either `deploy-phase.ts` or `ns-deployment-service.ts`.

#### Cherry-Pick Mechanism

The existing cherry-pick works because the git diff selects only changed files:

```
git diff --name-only --diff-filter=ACMRT --relative origin/staging HEAD -- src/FileCabinet/
```

The `--diff-filter=ACMRT` flag limits to Added, Copied, Modified, Renamed, and Type-changed files. Only these are uploaded. This is the principle the user wants preserved: *"You're much less likely to hit a moving target if you cherry-pick files."*

### SDF Infrastructure (Already Exists)

The toolchain for SDF operations is already provisioned in `native-phase.ts`:

| Component | Location | Status |
|-----------|----------|--------|
| SuiteCloud CLI v3.1.2 | native-phase.ts L605-612 | Installed in sandbox |
| Java 17/21 runtime | native-phase.ts L515-544 | Installed in sandbox |
| `ensureSdfProjectReady()` | native-phase.ts L180-289 | Detects or creates ACCOUNTCUSTOMIZATION project |
| `buildSuiteCloudCommand()` | native-phase.ts | Constructs CLI commands |
| `buildSuiteCloudOperationEnv()` | native-phase.ts L123-137 | Builds env with `SUITECLOUD_CI=1` |
| SDF credential management | sdf-credentials.ts | Encrypt/decrypt per org |
| `runSuiteCloudAccountSetup()` | native-phase.ts L295+ | CI-mode M2M auth setup |

All of these are already used by the SPA deploy path. The native path simply stops at `file:upload` instead of using `project:deploy`.

### Agent System: 9-Step Platform-Agnostic Pipeline

```
scout -> diagnosis -> product -> tech-research -> implementation-plan -> implementation -> code-review -> verification -> preview-config
```

The pipeline is **platform-agnostic** -- identical steps for GENERAL and NETSUITE organizations (`helix-workflow-step-catalog.ts`). Each step runs Claude in a Vercel Sandbox with:

- `step-config.mjs` -- defines `systemPrompt`, `buildUserPrompt()`, `tools`, `context7Enabled`
- Shared rules from `shared/common.mjs` -- `CORE_PRINCIPLES`, `GLOBAL_RULES`, `ORM_MIGRATION_RULES`
- Skills from `.claude/skills/` -- auto-bundled via `runtime-assets.ts` (L14-17)

#### Four Current NS Learning Mechanisms

| Mechanism | Location | What It Provides | Limitation |
|-----------|----------|------------------|------------|
| Repo scanning | Agent runtime | Detects `suitecloud.config.js`, `manifest.xml`, `Objects/` dirs | No guidance on creating new objects |
| ns-gm skill | `.claude/skills/ns-gm/SKILL.md` | SuiteScript execution for queries/verification | **Read-only guardrails block creation** (L9: "Do not create, update, or delete") |
| Context7 MCP | `step-config.mjs` `context7Enabled: true` | SuiteCloud SDK docs, NetSuite APIs | Agents must know to query it for SDF schemas |
| Runtime inspection | `hlx inspect` CLI | Production database/log queries | Read-only, not NS-specific |

**Key observation:** There is currently **no skill or prompt guidance for creating SDF XML objects**. The ns-gm skill actively discourages creation. `shared/common.mjs` has zero NS content. `implementation/step-config.mjs` SYSTEM_PROMPT (L211-256) has zero NS-specific instructions.

---

## 3. Gap Analysis

### Root Cause 1: Deploy Pipeline Hardcoded to file:upload (FileCabinet Only)

**Evidence from source code:**

| Location | Code Reference | Finding |
|----------|----------------|---------|
| Sandbox git diff | `deploy-phase.ts` L351-362 | `-- src/FileCabinet/` is the only path in the diff command |
| Sandbox upload | `deploy-phase.ts` L415-431 | `file:upload --paths` -- only handles individual files |
| Production git diff | `ns-deployment-service.ts` L637-650 | Same `-- src/FileCabinet/` scope |
| Production upload | `ns-deployment-service.ts` L668-682 | Same `file:upload` pattern |

**Grep confirmation:** Zero matches for `src/Objects` in either deploy file. The `src/Objects/` directory -- where all SDF metadata lives (script records, custom records, custom fields, script deployments) -- is completely invisible to the pipeline.

**Helper functions reinforce the gap:**
- `stripFileCabinetPrefix()` -- only handles `src/FileCabinet/` paths
- `filterExcludedPaths()` -- uses `nativeExcludePattern` which is FileCabinet-scoped
- `buildSuiteCloudCommand(["file:upload", "--paths", ...])` -- `file:upload` only handles FileCabinet files, not SDF objects

**Consequence:** Even if an agent creates perfect SDF XML files in `src/Objects/`, the pipeline will never detect, diff, or deploy them for NATIVE_NS repos.

**Contrast:** SPA_NS repos use `project:deploy` (deploy-phase.ts L271-282) which handles both Objects and FileCabinet in a single operation. The working pattern already exists.

### Root Cause 2: Agent System Lacks SDF Object Creation Guidance

| File | Evidence | Gap |
|------|----------|-----|
| `shared/common.mjs` | Exports: `CORE_PRINCIPLES`, `GLOBAL_RULES`, `ORM_MIGRATION_RULES`, `DISCUSSION_AWARENESS_RULES`, `OUTPUT_ENVELOPE_REQUIREMENTS` | **Zero NS/SDF content** |
| `implementation/step-config.mjs` L211-256 | SYSTEM_PROMPT includes ORM migration awareness, discussion awareness, output envelope | **Zero NS-specific instructions** |
| `.claude/skills/ns-gm/SKILL.md` L8-10 | "Use ns-gm for read-only investigation only during verification. Do not create, update, or delete NetSuite records unless explicitly required." | **Actively blocks creation** |
| `.claude/skills/` directory | Contains `ns-gm/SKILL.md` only | **No SDF XML creation skill** |

**The gap in concrete terms:** If a ticket asks the implementation agent to "create a user event script for license management," the agent:
1. Has no template or schema reference for `<usereventscript>` XML
2. Has no guidance to put XML in `src/Objects/`
3. Has no awareness that `<scriptdeployments>` must be nested inside the script XML
4. Has no knowledge that `manifest.xml` must declare `SERVERSIDESCRIPTING`
5. Would need to discover all of this through Context7 queries or guesswork

---

## 4. Production State

### NetSuite Organizations

| Organization | Platform | Repo Count |
|-------------|----------|------------|
| Broudy Precision | NETSUITE | 1 |
| DMW | NETSUITE | 1 |
| Dealmed | NETSUITE | 1 |
| EKB | NETSUITE | 2 |
| Outdoor Living Supply | NETSUITE | 2 |

*Source: Production database query (April 10, 2026)*

### Repository Configuration

| Org | Repo Name | Type | Deploy Command |
|-----|-----------|------|----------------|
| Broudy Precision | broudy_precision_file_cabinet | NATIVE_NS | `null` (file:upload) |
| DMW | dmw-native-ns | NATIVE_NS | `null` (file:upload) |
| Dealmed | dmw-native-ns | NATIVE_NS | `null` (file:upload) |
| EKB | helix-ekb-file-cabinet | NATIVE_NS | `null` (file:upload) |
| EKB | ekb-preorder | SPA_NS | `...npm run build && suitecloud project:deploy` |
| Outdoor Living Supply | helix-ns-outdoor-living-supply-file-cabinet | NATIVE_NS | `null` (file:upload) |
| Outdoor Living Supply | ols | SPA_NS | `...npm run bundle && suitecloud project:deploy` |

**Key findings:**
- **5 NATIVE_NS repos** -- all with `deployCommand = null` (meaning they use the built-in `file:upload` path)
- **2 SPA_NS repos** -- both with complex build + `suitecloud project:deploy` commands
- All 5 NATIVE_NS repos have `excludePattern = null` -- the pattern filter isn't even being used

*Source: Production database query -- `OrganizationRepository` table*

### Cross-Line Evidence

Two organizations have **paired** NATIVE_NS + SPA_NS repos, confirming cross-line projects are real:

| Organization | NATIVE_NS Repo | SPA_NS Repo |
|-------------|----------------|-------------|
| **EKB** | helix-ekb-file-cabinet | ekb-preorder |
| **Outdoor Living Supply** | helix-ns-outdoor-living-supply-file-cabinet | ols |

This is exactly the "customization that involves a normal repo, a spa, and native NetSuite stuff all mixed together" the user described.

### Deployment History

| Date | Status | Target | Error |
|------|--------|--------|-------|
| 2026-04-02 19:29 | **SUCCEEDED** | PRODUCTION | -- |
| 2026-04-02 18:38 | **SUCCEEDED** | PRODUCTION | -- |
| 2026-04-02 18:30 | FAILED | PRODUCTION | `git fetch main` -- couldn't find remote ref |
| 2026-04-02 18:20 | FAILED | PRODUCTION | Manually cleared stale RUNNING deployment |
| 2026-04-02 16:18 | FAILED | PRODUCTION | `git fetch main` -- couldn't find remote ref |
| 2026-04-02 14:47 | FAILED | PRODUCTION | `account:setup:ci` deprecation warning |
| 2026-04-02 14:03 | FAILED | PRODUCTION | `account:setup:ci` deprecation warning |
| 2026-04-02 13:51 | FAILED | PRODUCTION | No manifest.xml found in deploy path |
| 2026-04-02 13:46 | FAILED | PRODUCTION | SPA build step failed (exit code 127) |

**Key findings:**
- 2 SUCCEEDED, 8 FAILED deployments (all on same day -- likely initial setup)
- Failures were **infrastructure issues** (git refs, auth, build), **not SDF problems**
- The 2 successes prove `project:deploy` works in production
- No deployment failures related to SDF object handling

*Source: Production database query -- `NsDeployment` table (10 most recent)*

---

## 5. Cherry-Pick Deployment: Scoped deploy.xml

This is the most critical section. It documents the core architectural innovation that preserves the cherry-pick principle while enabling SDF object deployment.

### The Problem

Sandbox and production environments frequently diverge. Someone may fix a bug directly in production that never gets replicated in sandbox. If Helix deploys **everything** from sandbox to production, those production-only fixes get overwritten.

The user states this explicitly: *"What if somebody does a bug fix directly in production, and now we're redeploying the whole sandbox environment into production? That seems like a lot of hassle."*

Oracle docs confirm the danger:

> **"Custom objects always replace the custom objects in the NetSuite account when you deploy, regardless of any previous changes."**
> -- Oracle SDF Documentation

This means if a repo's `src/Objects/` contains 20 objects and only 2 changed in a ticket, deploying all 20 risks overwriting the other 18 -- any of which may have been hotfixed directly in production.

### The Solution: Scoped deploy.xml Algorithm

The deploy.xml file controls what gets included in the deploy package. Oracle docs confirm:

> **"Before deployment, the folder is zipped and only the files and folders listed in the deploy.xml file are included."**

And crucially, deploy.xml supports **specific paths** (not just wildcards). Oracle provides examples listing individual objects like `customrecord_employee.xml` and `customrecord_company.xml`.

**The algorithm (6 steps):**

**Step 1: Extend the git diff to cover both directories**
```bash
git diff --name-only --diff-filter=ACMRT --relative origin/{comparison_branch} HEAD -- src/FileCabinet/ src/Objects/
```
This is a one-line extension of the existing diff command (currently scoped to `src/FileCabinet/` only).

**Step 2: Parse diff output into two categories**
```
src/Objects/customrecord_license.xml      -> objectPaths
src/Objects/customscript_ue_license.xml   -> objectPaths
src/FileCabinet/SuiteScripts/ue_license.js -> filePaths
```

**Step 3: Transform paths to deploy.xml format**
Strip the `src/` prefix and prepend `~/`:
```
src/Objects/customrecord_license.xml -> ~/Objects/customrecord_license.xml
src/FileCabinet/SuiteScripts/ue_license.js -> ~/FileCabinet/SuiteScripts/ue_license.js
```

**Step 4: Generate deploy.xml with only changed items**
```xml
<deploy>
  <configuration>
    <path>~/Objects/customrecord_license.xml</path>
    <path>~/Objects/customscript_ue_license.xml</path>
  </configuration>
  <files>
    <path>~/FileCabinet/SuiteScripts/ue_license.js</path>
  </files>
</deploy>
```

**Step 5: Write deploy.xml to the SDF project directory**
```
{sdfProjectDir}/src/deploy.xml
```

**Step 6: Run `suitecloud project:deploy`**
Using the same pattern as the existing SPA path (deploy-phase.ts L271-282):
```bash
suitecloud project:deploy
```

**Result:** Only the ticket's changes enter the deploy package. Production objects not touched by the ticket are never overwritten.

### Pseudocode: `generateScopedDeployXml()`

```typescript
function generateScopedDeployXml(changedPaths: string[]): string {
  const objectPaths = changedPaths
    .filter(p => p.startsWith("src/Objects/"))
    .map(p => `~/Objects/${p.replace("src/Objects/", "")}`);

  const filePaths = changedPaths
    .filter(p => p.startsWith("src/FileCabinet/"))
    .map(p => `~/FileCabinet/${p.replace("src/FileCabinet/", "")}`);

  let xml = '<deploy>\n';

  if (objectPaths.length > 0) {
    xml += '  <configuration>\n';
    for (const p of objectPaths) {
      xml += `    <path>${p}</path>\n`;
    }
    xml += '  </configuration>\n';
  }

  if (filePaths.length > 0) {
    xml += '  <files>\n';
    for (const p of filePaths) {
      xml += `    <path>${p}</path>\n`;
    }
    xml += '  </files>\n';
  }

  xml += '</deploy>';
  return xml;
}
```

### Alternatives Considered

| Option | Cherry-Pick? | Complexity | Risk | Verdict |
|--------|-------------|------------|------|---------|
| **A. Scoped deploy.xml (chosen)** | **Yes** -- only changed items deployed | Medium -- extend existing git diff + generate XML | Low -- same principle as current file:upload cherry-pick | **Chosen** |
| B. Full project:deploy (~/Objects/* glob) | No -- deploys ALL objects in repo | Low -- simplest code change | **High -- overwrites production-only fixes.** Oracle: "custom objects always replace" | **Rejected** |
| C. Import-first sync (object:import before deploy) | Partial -- syncs production state first | High -- adds import step, merge conflict handling, timeout risk | Medium -- import can fail or diverge | **Deferred to Round 2** |
| D. Hybrid: file:upload for FileCabinet + scoped deploy for Objects | Yes -- separate mechanisms per area | Medium -- two deploy mechanisms | Low -- but more code paths to maintain | **Rejected** (unnecessary complexity) |
| E. Keep file:upload + separate object:update | Yes -- per-file/per-object | High -- no `object:update` command exists for ACCOUNTCUSTOMIZATION | High -- no clean CLI support | **Rejected** |

**Why Option B (full deploy) was explicitly rejected:**

The default `~/Objects/*` glob deploys **every** object in the repository. Oracle confirms: "custom objects always replace the custom objects in the NetSuite account when you deploy, regardless of any previous changes." This directly contradicts the user's requirement: *"If you're always deploying everything, it's going to happen all the time."*

**Why Option C (import-first) is deferred, not rejected:**

`suitecloud object:import` could pull current production state into the repo before deploying, providing even stronger protection. However, it adds significant complexity: merge conflict handling if production and sandbox diverge on the same object, timeout risk for large accounts, and a new failure mode in the deploy pipeline. The scoped deploy.xml is sufficient for MVP. Import-first is a natural Round 2 enhancement.

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| No changes at all | Skip deploy entirely (same as current empty-diff path at deploy-phase.ts L436-438) |
| Only FileCabinet changes | deploy.xml has `<files>` only, no `<configuration>`; `project:deploy` still works |
| Only Objects changes | deploy.xml has `<configuration>` only, no `<files>`; `project:deploy` still works |
| Object dependencies | Agent must include all related objects in implementation; deploy.xml ordering (objects before files) handles deploy-time dependencies |
| Deleted objects | `--diff-filter ACMRT` excludes deletes; object deletion requires separate mechanism (future) |
| manifest.xml changes | manifest.xml is project metadata, always read by `project:deploy` regardless of deploy.xml content |

---

## 6. Agent Integration: Which Agents Do What

This section directly answers the user's core question about agent infrastructure.

### Per-Agent Role Table

| Agent Step | Current NS Role | New NS Role | Changes Required | File(s) |
|------------|-----------------|-------------|-----------------|---------|
| **Scout** | Scans repo structure, detects NS signals | Same + identifies SDF objects in `src/Objects/` | None -- repo scanning already picks up directory structure | N/A |
| **Diagnosis** | Identifies root cause | Same + recognizes when SDF objects (not just code) are required | None -- Context7 already available | N/A |
| **Product** | Defines requirements | Same + specifies which SDF object types are needed | None -- product requirements are descriptive | N/A |
| **Tech-Research** | Researches approaches | Same + uses Context7 for SDF XML schemas | None -- Context7 already available | N/A |
| **Impl-Plan** | Plans file changes | Same + plans SDF XML creation in `src/Objects/` with dependencies | Yes -- `NS_SDF_AWARENESS_RULES` in system prompt | `shared/common.mjs` (import) |
| **Implementation** | Writes code in `src/FileCabinet/` | **Also writes SDF XML in `src/Objects/`, manages manifest.xml, ensures deploy.xml structure** | **Yes -- NS_SDF_AWARENESS_RULES + SDF creation workflow; new SDF skill available** | `shared/common.mjs`, `implementation/step-config.mjs`, new skill |
| **Code-Review** | Reviews code changes | Same + validates SDF XML correctness and cross-references | Optional -- `NS_SDF_AWARENESS_RULES` for review context | `shared/common.mjs` (import) |
| **Verification** | Verifies deployment | Same + uses ns-gm to confirm SDF objects exist in sandbox | None -- ns-gm already available; `SKILL.md` updated with clearer guardrails | `.claude/skills/ns-gm/SKILL.md` |
| **Preview-Config** | Configures preview | Same | None | N/A |

### Key Insight: The Implementation Agent

The **Implementation agent** bears the heaviest new role -- authoring SDF XML objects. It is enabled by five learning mechanisms working together:

### 5 Agent Learning Mechanisms

| # | Mechanism | Location | What It Provides |
|---|-----------|----------|------------------|
| 1 | **New SDF creation skill** | `.claude/skills/ns-sdf-objects/SKILL.md` | XML templates for all common object types, naming conventions, script-to-deployment relationships, manifest.xml feature mapping, saved search limitation warning |
| 2 | **NS_SDF_AWARENESS_RULES** | `shared/common.mjs` | High-level SDF awareness for all agents: project structure, Objects/ vs FileCabinet/, deploy.xml behavior, saved search limitation |
| 3 | **Implementation step-config SDF workflow** | `implementation/step-config.mjs` | Detection (suitecloud.config.js), template reading, Context7 usage, creation workflow, feature-to-object-type mapping |
| 4 | **Updated ns-gm SKILL.md** | `.claude/skills/ns-gm/SKILL.md` | Disambiguates: file-based SDF creation is normal implementation work; runtime ns-gm creation remains guarded |
| 5 | **Context7 MCP** (already enabled) | `step-config.mjs` `context7Enabled: true` | SuiteCloud XML schema docs at runtime via `/oracle-samples/netsuite-suitecloud-samples` (94 code snippets) |

### How It Works End-to-End

When a ticket requests a new customization (e.g., "build a license management system"):

1. **Scout** scans the NATIVE_NS repo, detects `suitecloud.config.js`, `src/manifest.xml`, existing `src/Objects/` files
2. **Diagnosis** identifies that custom records, scripts, and deployments are needed -- recognizes this requires SDF objects (not just code)
3. **Product** specifies the required SDF object types: custom record types, user event scripts, suitelets, etc.
4. **Impl-Plan** plans the file creation: XML in `src/Objects/`, SuiteScript in `src/FileCabinet/SuiteScripts/`, manifest.xml updates -- guided by `NS_SDF_AWARENESS_RULES`
5. **Implementation** creates all artifacts:
   - Reads existing templates in `src/Objects/` and references the ns-sdf-objects skill for patterns
   - Creates SDF XML files in `src/Objects/` using the skill templates
   - Creates SuiteScript source files in `src/FileCabinet/SuiteScripts/`
   - Ensures `<scriptfile>` in script XML references the correct FileCabinet path
   - Updates `manifest.xml` to declare required features (e.g., SERVERSIDESCRIPTING)
   - Uses Context7 for any object types not covered by templates
6. **Code-Review** validates SDF XML correctness, cross-references between scripts and source, manifest features
7. **Deploy Phase** (pipeline, not agent): diffs both `src/Objects/` and `src/FileCabinet/`, generates scoped deploy.xml, runs `project:deploy`
8. **Verification** uses ns-gm to confirm deployed objects exist in sandbox via `record.load()` or `search.create()` queries

### Summary: What Changes

| Change Type | Count | Files |
|-------------|-------|-------|
| New skill file | 1 | `.claude/skills/ns-sdf-objects/SKILL.md` |
| Modified prompt files | 3 | `shared/common.mjs`, `implementation/step-config.mjs`, `.claude/skills/ns-gm/SKILL.md` |
| Modified deploy files | 3 | `deploy-phase.ts`, `ns-deployment-service.ts`, `native-phase.ts` |
| **Total** | **7** | **1 created + 6 modified** |

---

## 7. Deploy Pipeline Implementation Specification

### New Utility: `generateScopedDeployXml(changedPaths: string[]): string`

**Location:** New exported function in `deploy-phase.ts` (or a small utility module if preferred for reuse)

**Signature:**
```typescript
export function generateScopedDeployXml(changedPaths: string[]): string
```

**Input:** Array of git diff paths like `["src/Objects/customrecord_foo.xml", "src/FileCabinet/SuiteScripts/bar.js"]`

**Output:** XML string for deploy.xml with only those specific paths

**Logic:**
1. Split into `objectPaths` (paths starting with `src/Objects/`) and `filePaths` (paths starting with `src/FileCabinet/`)
2. Transform: strip `src/` prefix, prepend `~/`
3. Build XML: `<configuration>` section for objectPaths, `<files>` section for filePaths
4. If no objects changed, omit `<configuration>`
5. If no files changed, omit `<files>`

### File 1: native-phase.ts -- deploy.xml existence validation

**What to change:** Enhance `ensureSdfProjectReady()` (L180-289)

**Current behavior:** Validates `suitecloud.config.js` and `src/manifest.xml` exist. Returns the SDF project directory path.

**New behavior:** After confirming the SDF project exists, also check if `src/deploy.xml` exists. If missing, create a default deploy.xml (matching the structure from `netsuite-setup/deploy.xml`). The scoped deploy.xml generation in the deploy phase always overwrites this with specific paths, so the default is a safety net.

**Insertion point:** After L289 (return statement), add a `src/deploy.xml` existence check before returning.

### File 2: deploy-phase.ts -- Sandbox deploy

**Current code (L287-453):** NATIVE_NS file:upload block

**What to KEEP:**
- SDF credential setup (L288-310) -- already exists, still needed
- `runSuiteCloudAccountSetup()` call (L303-311) -- validates SDF auth
- Git fetch for staging (L314-323) -- still needed for diff comparison
- Diagnostic git state capture (L326-349) -- useful for debugging
- Error handling and deployment failure recording (L440-452)

**What to CHANGE:**
- **Git diff command** (L351-362): Change `-- src/FileCabinet/` to `-- src/FileCabinet/ src/Objects/`
- **Path processing** (L375-384): Replace `stripFileCabinetPrefix()` + `filterExcludedPaths()` with the new `generateScopedDeployXml()` call
- **Deploy command** (L414-431): Replace `file:upload --paths ...` with `project:deploy` (mirroring SPA pattern at L271-282)

**What to REMOVE:**
- `stripFileCabinetPrefix()` usage (L383)
- `filterExcludedPaths()` usage (L384)
- `file:upload` command construction and execution (L415-431)
- ag-test-sl.js diagnostic block (L389-412) -- specific to file:upload debugging

**New flow:**
```
git diff ... -- src/FileCabinet/ src/Objects/
  -> parse changed paths
  -> generateScopedDeployXml(changedPaths)
  -> write deploy.xml to {sdfProjectDir}/src/deploy.xml
  -> suitecloud project:deploy (cwd: sdfProjectDir, env: suiteCloudOperationEnv)
```

**Edge case:** If git diff returns empty (no changes), skip deploy entirely -- same as current L436-438 path.

### File 3: ns-deployment-service.ts -- Production deploy

**Current code (L593-689):** Native file:upload block (mirrors sandbox)

**Same transformation as deploy-phase.ts:**
- **Change git diff** (L637-650): extend to `-- src/FileCabinet/ src/Objects/`
- **Remove**: `stripFileCabinetPrefix` (L662), `filterExcludedPaths` (L663), `file:upload` (L668-682)
- **Add**: `generateScopedDeployXml()`, write deploy.xml, `project:deploy`
- **Keep**: repo clone, SDF credential setup, git fetch prTargetBranch (L626-635), `ensureSdfProjectReady()` (L607)

### Reference Pattern: SPA project:deploy (deploy-phase.ts L271-282)

```typescript
logRun(runId, "running suitecloud project:deploy");
await runCheckedCommand(
  sandbox,
  {
    cmd: "bash",
    args: ["-lc", "suitecloud project:deploy"],
    cwd: spaSdfProjectDir,
    env: input.suiteCloudOperationEnv,
  },
  "suitecloud project:deploy",
);
```

The native path will use exactly this pattern, substituting `input.sdfProjectDir` for `spaSdfProjectDir`.

---

## 8. Agent Infrastructure Implementation Specification

### NEW File: `.claude/skills/ns-sdf-objects/SKILL.md`

**Purpose:** Teach the implementation agent how to author SDF XML objects for all common types.

**Delivery mechanism:** Skills in `.claude/skills/` are auto-collected and bundled into agent sandboxes via `runtime-assets.ts` (L14-17: `PROJECT_SKILLS_SOURCE_DIR = path.resolve(process.cwd(), ".claude/skills")`). No additional wiring needed.

**Content specification:**

1. **Metadata header** (YAML frontmatter):
   - name: `ns-sdf-objects`
   - description: SDF XML object creation for NetSuite customizations
   - trigger: When working with NetSuite SDF projects (repos containing `suitecloud.config.js`)

2. **SDF Project Structure**:
   - `src/Objects/` -- SDF XML metadata (script records, custom records, custom fields, roles)
   - `src/FileCabinet/SuiteScripts/` -- SuiteScript source code (.js or .ts)
   - `src/manifest.xml` -- Project metadata and feature declarations
   - `src/deploy.xml` -- Deployment scope (auto-generated by pipeline)
   - `suitecloud.config.js` -- Project configuration

3. **XML Templates** for each common object type (see [Section 9](#9-sdf-object-reference) for full templates):
   - User Event Script + deployment
   - Client Script + deployment
   - Suitelet + deployment
   - Scheduled Script + deployment
   - Map/Reduce Script + deployment
   - RESTlet + deployment
   - Custom Record Type (with fields and permissions)
   - Custom Fields (entitycustomfield, transactionbodycustomfield, itembodycustomfield)
   - Custom Roles

4. **Naming Conventions**:
   - Scripts: `customscript_hlx_{project}_{name}` (e.g., `customscript_hlx_license_ue_validate`)
   - Deployments: `customdeploy_hlx_{project}_{name}` (e.g., `customdeploy_hlx_license_ue_validate`)
   - Custom records: `customrecord_hlx_{project}_{name}` (e.g., `customrecord_hlx_license`)
   - Custom fields: `custbody_hlx_{project}_{name}` (transaction body), `custitem_hlx_{name}` (item), `custentity_hlx_{name}` (entity)
   - Filename = `{scriptid}.xml` in `src/Objects/`

5. **Script-to-Deployment Relationship**:
   - Script deployments are **nested inside** the script XML, not separate files
   - `<scriptfile>` references the source file in FileCabinet: `[/SuiteScripts/filename.js]`
   - Each script record can have multiple `<scriptdeployment>` entries

6. **manifest.xml Feature Mapping** (see [Section 10](#10-deployxml--manifestxml-management)):
   - Table mapping each object type to required features
   - ACCOUNTCUSTOMIZATION format (no publisherid, no projectversion)

7. **Saved Search Limitation**:
   - **NOT SDF-manageable** per Oracle docs: "Saved searches should be customized with NetSuite rather than SDF."
   - Use ns-gm runtime creation (`N/search.create`) in sandbox
   - Cannot be promoted to production via `project:deploy`
   - Production requires manual recreation or future enhancement

8. **Context7 Guidance**:
   - Use `/oracle-samples/netsuite-suitecloud-samples` for additional SDF XML patterns (94 snippets)
   - Query specific object types when templates don't cover the need

9. **Reference**:
   - `netsuite-setup/Objects/customscript_ns_gm_restlet.xml` -- working restlet + deployment template
   - `netsuite-setup/Objects/customrole_helix_sdf.xml` -- working role template

### Modified File: `shared/common.mjs` -- New `NS_SDF_AWARENESS_RULES` export

**Pattern:** Same as existing `ORM_MIGRATION_RULES` export (L78-100) -- a template string constant.

**Content:**
```javascript
export const NS_SDF_AWARENESS_RULES = `<ns_sdf_awareness>
NetSuite customizations involve two artifact types deployed together via SuiteCloud Development Framework (SDF):
- SDF XML objects in src/Objects/ — script records, custom records, custom fields, roles, deployments
- SuiteScript source files in src/FileCabinet/SuiteScripts/ — .js or .ts files

Key rules:
- Script records (XML) must reference their source file: <scriptfile>[/SuiteScripts/filename.js]</scriptfile>
- Script deployments are nested INSIDE the script record XML, not separate files
- deploy.xml controls what gets deployed — the pipeline generates a scoped deploy.xml from git diff (only changed items)
- New SDF objects are auto-included in deploy when they appear in the git diff
- manifest.xml must declare required features (SERVERSIDESCRIPTING, CLIENTSCRIPTING, CUSTOMRECORDS, etc.)
- Use unique scriptid prefixes per customization to avoid collisions (e.g., customscript_hlx_{project}_{name})
- Saved searches are NOT SDF-manageable — they require ns-gm runtime creation and cannot be deployed to production via project:deploy
- Reference the ns-sdf-objects skill for XML templates and naming patterns
- Use Context7 (/oracle-samples/netsuite-suitecloud-samples) for SDF XML schema details
</ns_sdf_awareness>`;
```

**Injection:** Imported by `implementation/step-config.mjs` and `implementation-plan/step-config.mjs` and included in their SYSTEM_PROMPT template strings, same way `ORM_MIGRATION_RULES` is already included.

### Modified File: `implementation/step-config.mjs` -- SDF Creation Workflow

**Where:** SYSTEM_PROMPT constant (L211-256)

**What to add:**
1. Import `NS_SDF_AWARENESS_RULES` from `../shared/common.mjs` (add to existing imports at L1-10)
2. Include `${NS_SDF_AWARENESS_RULES}` in SYSTEM_PROMPT (after `${ORM_MIGRATION_RULES}` at L252)
3. Add implementation-specific SDF guidance block:

```
<ns_sdf_implementation>
When the target repository contains suitecloud.config.js, it is an SDF project — apply SDF awareness:

1. DETECTION: Check for suitecloud.config.js in the repo root or a subdirectory.
2. TEMPLATE READING: Read existing XML files in src/Objects/ for patterns. Reference the ns-sdf-objects skill.
3. CREATION WORKFLOW:
   - Create SDF XML in src/Objects/ for each new customization object
   - Create SuiteScript source files in src/FileCabinet/SuiteScripts/
   - Cross-reference: script XML <scriptfile> must point to the correct FileCabinet path
   - Ensure src/manifest.xml declares required features
4. CONTEXT7: Use /oracle-samples/netsuite-suitecloud-samples for SDF XML schemas
5. FEATURE MAPPING:
   | Object Type | Required Feature |
   |-------------|-----------------|
   | User Event Script | SERVERSIDESCRIPTING |
   | Client Script | CLIENTSCRIPTING |
   | Suitelet | SERVERSIDESCRIPTING |
   | RESTlet | SERVERSIDESCRIPTING, RESTLETS |
   | Map/Reduce | SERVERSIDESCRIPTING |
   | Scheduled | SERVERSIDESCRIPTING |
   | Custom Record | CUSTOMRECORDS |
</ns_sdf_implementation>
```

### Modified File: `.claude/skills/ns-gm/SKILL.md` -- Guardrail Disambiguation

**Current text (L8-10):**
```
- Use `ns-gm` for read-only investigation only during verification.
- Do not create, update, or delete NetSuite records unless explicitly required.
- If a write is required, stop and ask first.
```

**Updated text:**
```
## Guardrails (MUST)

### File-based SDF creation (PERMITTED)
Writing XML files to `src/Objects/` is standard implementation work using the Write tool.
This is file I/O, not a NetSuite runtime operation. Proceed normally.

### ns-gm runtime operations (GUARDED)
Creating, updating, or deleting records via `ns-gm run --code` (N/record.create, N/record.submitField, N/record.delete) executes against the live NetSuite account.
- Use only when SDF XML is insufficient (e.g., saved searches that are NOT SDF-manageable)
- Always use SANDBOX environment for creation operations
- Ask before performing runtime writes in production

### Verification (READ-ONLY)
During verification steps, use ns-gm for read-only checks only:
- `record.load()` — confirm a record exists
- `search.create()` — query for records
- `query.runSuiteQL()` — run SQL queries
```

**Rationale:** The current blanket "do not create" guardrail could confuse the implementation agent into thinking it shouldn't create SDF XML files (which are local file writes, not NetSuite API calls). The update clarifies the distinction.

---

## 9. SDF Object Reference

### Script Records (6 Types)

All script records share the same structural pattern: a root element (specific to script type), required child elements, and nested `<scriptdeployments>`.

#### User Event Script

```xml
<usereventscript scriptid="customscript_hlx_license_ue_validate">
  <name>License Validation UE</name>
  <scriptfile>[/SuiteScripts/hlx_license_ue_validate.js]</scriptfile>
  <notifyowner>F</notifyowner>
  <status>RELEASED</status>
  <description>Validates license records on create/edit</description>
  <scriptdeployments>
    <scriptdeployment scriptid="customdeploy_hlx_license_ue_validate">
      <status>RELEASED</status>
      <recordtype>customrecord_hlx_license</recordtype>
      <allroles>T</allroles>
      <loglevel>DEBUG</loglevel>
    </scriptdeployment>
  </scriptdeployments>
</usereventscript>
```

**Key differences from other script types:**
- Root element: `<usereventscript>`
- `<recordtype>` in deployment specifies which record type triggers the script
- Entry points: `beforeLoad`, `beforeSubmit`, `afterSubmit`

#### Client Script

```xml
<clientscript scriptid="customscript_hlx_license_cs_ui">
  <name>License Form Client Script</name>
  <scriptfile>[/SuiteScripts/hlx_license_cs_ui.js]</scriptfile>
  <notifyowner>F</notifyowner>
  <status>RELEASED</status>
  <description>Client-side validation and UI behavior for license records</description>
  <scriptdeployments>
    <scriptdeployment scriptid="customdeploy_hlx_license_cs_ui">
      <status>RELEASED</status>
      <recordtype>customrecord_hlx_license</recordtype>
      <allroles>T</allroles>
      <loglevel>DEBUG</loglevel>
    </scriptdeployment>
  </scriptdeployments>
</clientscript>
```

**Key differences:** Root element `<clientscript>`. Entry points: `pageInit`, `fieldChanged`, `saveRecord`, `validateField`.

#### Suitelet

```xml
<suitelet scriptid="customscript_hlx_license_sl_manage">
  <name>License Management Suitelet</name>
  <scriptfile>[/SuiteScripts/hlx_license_sl_manage.js]</scriptfile>
  <notifyowner>F</notifyowner>
  <status>RELEASED</status>
  <description>Suitelet for managing license records</description>
  <scriptdeployments>
    <scriptdeployment scriptid="customdeploy_hlx_license_sl_manage">
      <status>RELEASED</status>
      <allroles>T</allroles>
      <loglevel>DEBUG</loglevel>
    </scriptdeployment>
  </scriptdeployments>
</suitelet>
```

**Key differences:** Root element `<suitelet>`. No `<recordtype>` in deployment. Entry points: `onRequest`. URL-addressable.

#### RESTlet

```xml
<restlet scriptid="customscript_hlx_license_rl_api">
  <name>License API RESTlet</name>
  <scriptfile>[/SuiteScripts/hlx_license_rl_api.js]</scriptfile>
  <notifyowner>F</notifyowner>
  <status>RELEASED</status>
  <description>RESTlet API endpoint for license operations</description>
  <scriptdeployments>
    <scriptdeployment scriptid="customdeploy_hlx_license_rl_api">
      <status>RELEASED</status>
      <allroles>F</allroles>
      <loglevel>DEBUG</loglevel>
    </scriptdeployment>
  </scriptdeployments>
</restlet>
```

**Reference:** This matches the existing working template at `netsuite-setup/Objects/customscript_ns_gm_restlet.xml`. Entry points: `get`, `post`, `put`, `delete`.

#### Scheduled Script

```xml
<scheduledscript scriptid="customscript_hlx_license_ss_expire">
  <name>License Expiry Check</name>
  <scriptfile>[/SuiteScripts/hlx_license_ss_expire.js]</scriptfile>
  <notifyowner>F</notifyowner>
  <status>RELEASED</status>
  <description>Scheduled script to check and process expired licenses</description>
  <scriptdeployments>
    <scriptdeployment scriptid="customdeploy_hlx_license_ss_expire">
      <status>RELEASED</status>
      <allroles>T</allroles>
      <loglevel>DEBUG</loglevel>
    </scriptdeployment>
  </scriptdeployments>
</scheduledscript>
```

**Key differences:** Root element `<scheduledscript>`. Entry point: `execute`. Runs on a schedule or on-demand.

#### Map/Reduce Script

```xml
<mapreducescript scriptid="customscript_hlx_license_mr_process">
  <name>License Batch Processor</name>
  <scriptfile>[/SuiteScripts/hlx_license_mr_process.js]</scriptfile>
  <notifyowner>F</notifyowner>
  <status>RELEASED</status>
  <description>Map/reduce script for batch license processing</description>
  <scriptdeployments>
    <scriptdeployment scriptid="customdeploy_hlx_license_mr_process">
      <status>RELEASED</status>
      <allroles>T</allroles>
      <loglevel>DEBUG</loglevel>
    </scriptdeployment>
  </scriptdeployments>
</mapreducescript>
```

**Key differences:** Root element `<mapreducescript>`. Entry points: `getInputData`, `map`, `reduce`, `summarize`. Best for high-volume data processing.

### Custom Record Type

```xml
<customrecordtype scriptid="customrecord_hlx_license">
  <recordname>HLX License</recordname>
  <description>License management record for tracking software licenses</description>
  <includename>T</includename>
  <showid>T</showid>
  <shownotes>T</shownotes>
  <allowinlineediting>T</allowinlineediting>
  <allowquicksearch>T</allowquicksearch>
  <permissions>
    <permission>
      <permittedrole>ADMINISTRATOR</permittedrole>
      <permlevel>FULL</permlevel>
    </permission>
  </permissions>
  <customrecordcustomfields>
    <customrecordcustomfield scriptid="custrecord_hlx_license_name">
      <label>License Name</label>
      <fieldtype>FREEFORMTEXT</fieldtype>
      <ismandatory>T</ismandatory>
      <displaytype>NORMAL</displaytype>
    </customrecordcustomfield>
    <customrecordcustomfield scriptid="custrecord_hlx_license_expiry">
      <label>Expiry Date</label>
      <fieldtype>DATE</fieldtype>
      <ismandatory>F</ismandatory>
      <displaytype>NORMAL</displaytype>
    </customrecordcustomfield>
    <customrecordcustomfield scriptid="custrecord_hlx_license_status">
      <label>Status</label>
      <fieldtype>SELECT</fieldtype>
      <ismandatory>T</ismandatory>
      <displaytype>NORMAL</displaytype>
    </customrecordcustomfield>
  </customrecordcustomfields>
</customrecordtype>
```

**Source pattern:** Oracle Samples -- Auto-Purchase Setup custom record type demonstrates the `<customrecordtype>` structure with fields and permissions.

### Custom Fields (Standalone)

#### Transaction Body Field

```xml
<transactionbodycustomfield scriptid="custbody_hlx_license_ref">
  <label>License Reference</label>
  <fieldtype>FREEFORMTEXT</fieldtype>
  <ismandatory>F</ismandatory>
  <displaytype>NORMAL</displaytype>
  <appliestosale>T</appliestosale>
  <appliestopurchase>F</appliestopurchase>
</transactionbodycustomfield>
```

#### Entity Custom Field

```xml
<entitycustomfield scriptid="custentity_hlx_license_tier">
  <label>License Tier</label>
  <fieldtype>SELECT</fieldtype>
  <ismandatory>F</ismandatory>
  <displaytype>NORMAL</displaytype>
  <appliestocustomer>T</appliestocustomer>
  <appliestovendor>F</appliestovendor>
</entitycustomfield>
```

#### Item Custom Field

```xml
<itemcustomfield scriptid="custitem_hlx_requires_license">
  <label>Requires License</label>
  <fieldtype>CHECKBOX</fieldtype>
  <ismandatory>F</ismandatory>
  <displaytype>NORMAL</displaytype>
  <appliestoinventory>T</appliestoinventory>
  <appliestoservice>F</appliestoservice>
</itemcustomfield>
```

**Source pattern:** Oracle Samples -- `custitem_ii_autopurchase` demonstrates item custom field with `<appliestoinventory>` and subtab configuration.

### Custom Roles

```xml
<customrole scriptid="customrole_hlx_license_admin">
  <name>HLX License Administrator</name>
  <centertype>BASIC</centertype>
  <issalesrole>F</issalesrole>
  <issupportrole>F</issupportrole>
  <iswebservicesonlyrole>F</iswebservicesonlyrole>
  <permissions>
    <permission>
      <permkey>LIST_CUSTRECORDENTRY</permkey>
      <permlevel>FULL</permlevel>
    </permission>
  </permissions>
</customrole>
```

**Reference:** Based on existing `netsuite-setup/Objects/customrole_helix_sdf.xml` which demonstrates the role + permissions pattern.

### Naming Conventions Summary

| Object Type | scriptid Prefix | Example |
|-------------|----------------|---------|
| User Event Script | `customscript_hlx_{project}_ue_` | `customscript_hlx_license_ue_validate` |
| Client Script | `customscript_hlx_{project}_cs_` | `customscript_hlx_license_cs_ui` |
| Suitelet | `customscript_hlx_{project}_sl_` | `customscript_hlx_license_sl_manage` |
| RESTlet | `customscript_hlx_{project}_rl_` | `customscript_hlx_license_rl_api` |
| Scheduled Script | `customscript_hlx_{project}_ss_` | `customscript_hlx_license_ss_expire` |
| Map/Reduce | `customscript_hlx_{project}_mr_` | `customscript_hlx_license_mr_process` |
| Script Deployment | `customdeploy_hlx_{project}_` | `customdeploy_hlx_license_ue_validate` |
| Custom Record | `customrecord_hlx_{project}_` | `customrecord_hlx_license` |
| Trans Body Field | `custbody_hlx_{project}_` | `custbody_hlx_license_ref` |
| Entity Field | `custentity_hlx_` | `custentity_hlx_license_tier` |
| Item Field | `custitem_hlx_` | `custitem_hlx_requires_license` |
| Custom Role | `customrole_hlx_` | `customrole_hlx_license_admin` |

The `hlx_` prefix ensures Helix-created objects don't collide with existing account customizations. The `{project}` segment groups related objects.

---

## 10. deploy.xml & manifest.xml Management

### deploy.xml: Scoped Generation

**Key innovation:** deploy.xml is generated **per-deploy** from git diff output, not maintained as a static file.

**Structure (from `netsuite-setup/deploy.xml`):**
```xml
<deploy>
  <configuration>
    <path>~/Objects/*</path>
  </configuration>
  <files>
    <path>~/FileCabinet/SuiteScripts/*</path>
  </files>
</deploy>
```

- `<configuration>` -- SDF objects (XML metadata in `src/Objects/`)
- `<files>` -- FileCabinet content (SuiteScript source in `src/FileCabinet/`)
- Ordering: Objects deploy before files (script records must exist before their source files are uploaded)
- `~/` prefix refers to the SDF project root

**Default template** (created by `ensureSdfProjectReady()` if missing): Uses `~/Objects/*` and `~/FileCabinet/SuiteScripts/*` globs as a safety net.

**Scoped deploy.xml** (generated by `generateScopedDeployXml()`): Specific paths only, no globs:
```xml
<deploy>
  <configuration>
    <path>~/Objects/customrecord_hlx_license.xml</path>
    <path>~/Objects/customscript_hlx_license_ue_validate.xml</path>
  </configuration>
  <files>
    <path>~/FileCabinet/SuiteScripts/hlx_license_ue_validate.js</path>
  </files>
</deploy>
```

**Oracle confirmation:** "SDF uses this file to determine the order in which files and objects are deployed." And: "SDF processes each path element sequentially when the project is deployed."

### manifest.xml: Feature Dependencies

**Format difference:**

| Attribute | SUITEAPP (netsuite-setup) | ACCOUNTCUSTOMIZATION (customer repos) |
|-----------|--------------------------|--------------------------------------|
| `projecttype` | `SUITEAPP` | `ACCOUNTCUSTOMIZATION` |
| `publisherid` | Required (e.g., `com.projectxinnovation`) | Not present |
| `projectid` | Required | Not present |
| `projectversion` | Required | Not present |
| `projectname` | Required | Required |
| `features` | Same syntax | Same syntax |

**ACCOUNTCUSTOMIZATION manifest.xml example:**
```xml
<manifest projecttype="ACCOUNTCUSTOMIZATION">
  <frameworkversion>1.0</frameworkversion>
  <projectname>EKB File Cabinet</projectname>
  <dependencies>
    <features>
      <feature required="true">SERVERSIDESCRIPTING</feature>
    </features>
  </dependencies>
</manifest>
```

### Feature-to-Object-Type Mapping

| Object Type | Required Feature(s) |
|-------------|--------------------|
| User Event Script | `SERVERSIDESCRIPTING` |
| Client Script | `CLIENTSCRIPTING` |
| Suitelet | `SERVERSIDESCRIPTING` |
| RESTlet | `SERVERSIDESCRIPTING`, `RESTLETS` |
| Scheduled Script | `SERVERSIDESCRIPTING` |
| Map/Reduce Script | `SERVERSIDESCRIPTING` |
| Custom Record Type | `CUSTOMRECORDS` |
| Workflow | `WORKFLOW` |
| Custom Fields | (usually no additional feature unless using advanced field types) |
| Custom Roles | (no feature required) |

**Agent responsibility:** When creating new SDF objects, the implementation agent must:
1. Check `src/manifest.xml` for existing feature declarations
2. Add any missing features required by the new object types
3. If unsure about an uncommon type, use Context7 to look up the requirement

**Safety net:** If a feature is missing, `project:deploy` fails with a clear error identifying the missing feature. The agent can fix on retry.

**Reference:** `netsuite-setup/manifest.xml` declares `SERVERSIDESCRIPTING`, `OAUTH2`, `RESTLETS`, `DEVELOPER` -- a working example of the feature pattern.

---

## 11. Cross-Line Project Support

### What Are Cross-Line Projects?

The user states: *"There are projects across the line. There may be a customization that involves a normal repo, a spa, and native NetSuite stuff all mixed together. This is very common."*

A cross-line customization might include:
- **NATIVE_NS repo**: SDF objects (custom records, script records, fields) + SuiteScript files
- **SPA_NS repo**: React/Vue/Angular SPA deployed as a SuiteApp
- **Normal repo**: Web application, API server, or other infrastructure

### Production Evidence

Two organizations already operate cross-line projects:

| Organization | NATIVE_NS Repo | SPA_NS Repo | Evidence |
|-------------|----------------|-------------|---------|
| **EKB** | helix-ekb-file-cabinet | ekb-preorder | Both repos registered under org `cmmjegh5s0000dh0s8er6ebqe` |
| **Outdoor Living Supply** | helix-ns-outdoor-living-supply-file-cabinet | ols | Both repos registered under org `cmmmegkho0000dhyk501p0f02` |

*Source: Production database query -- `OrganizationRepository` joined with `Organization`*

### How Cross-Line Works Today

**Ticket level:** Multi-repo tickets are already supported via `repositoryIds[]` in ticket creation. A single ticket can include NATIVE_NS, SPA_NS, and normal repos.

**Agent level:** The 9-step pipeline is platform-agnostic. Each agent receives all repos in the ticket and works across them. The step-config's `buildUserPrompt()` includes topology information for all repos.

**Deploy level:** Both SPA and native repos deploy in the same deploy-phase run:
- SPA first (deploy-phase.ts L206-284): build + `project:deploy`
- Native second (deploy-phase.ts L287-453): currently `file:upload`, will become scoped `project:deploy`
- Independent, sequential execution

### After This Change

A cross-line ticket deploying to production would work as follows:

1. **SPA repo** deploys via its existing `deployCommand` (e.g., `npm run build && suitecloud project:deploy`)
2. **NATIVE_NS repo** deploys via the new scoped `project:deploy`:
   - Git diff both `src/Objects/` and `src/FileCabinet/` against production branch
   - Generate scoped deploy.xml with only changed paths
   - Run `project:deploy`
3. **Normal repo** deploys via its own mechanism (Vercel, DigitalOcean, etc.)
4. **Verification** uses ns-gm to confirm all SDF objects exist in the account, regardless of which repo deployed them

### Object Placement Rules

| Artifact Type | Location | Repo Type |
|--------------|----------|-----------|
| SDF Objects (script records, custom records, fields) | `src/Objects/` | NATIVE_NS |
| SuiteScript source files | `src/FileCabinet/SuiteScripts/` | NATIVE_NS or SPA_NS |
| SPA application code | `client/` or `react-app/` | SPA_NS |
| SPA SDF subdirectory | `sdf/` | SPA_NS |
| Normal application code | Various | Normal repo |

### Example Scenario: License Management System

A ticket: "Build a license management system for our NetSuite account with a management UI."

**NATIVE_NS repo** (`helix-ekb-file-cabinet`):
- `src/Objects/customrecord_hlx_license.xml` -- custom record type
- `src/Objects/customscript_hlx_license_ue_validate.xml` -- user event script + deployment
- `src/Objects/customscript_hlx_license_ss_expire.xml` -- scheduled script + deployment
- `src/FileCabinet/SuiteScripts/hlx_license_ue_validate.js` -- UE source
- `src/FileCabinet/SuiteScripts/hlx_license_ss_expire.js` -- SS source
- `src/manifest.xml` -- updated with SERVERSIDESCRIPTING, CUSTOMRECORDS features

**SPA_NS repo** (`ekb-preorder` or a new SPA repo):
- `client/src/` -- React app for license management UI
- `sdf/` -- SuiteApp packaging for the SPA

**Both repos deploy** independently via `project:deploy` in the same pipeline run. Verification confirms all objects across both repos.

---

## 12. Risk Assessment & Open Questions

### Risk Table

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|------------|------------|
| 1 | Agent generates invalid SDF XML, causing deploy failure | Medium | Medium | SDF creation skill provides templates; Context7 provides schema docs; code-review validates XML; deploy failure caught with clear CLI error; fixable on retry |
| 2 | Missing manifest.xml feature declarations cause deploy failure | Medium | Medium | Feature mapping in agent prompt + skill; deploy error clearly identifies missing feature; fixable on retry |
| 3 | Scoped deploy.xml misses dependent objects not in the diff | Medium | Low | Agent guidance instructs including all related objects in implementation; if deploy fails, error message identifies missing dependencies; retry-able |
| 4 | `scriptid` collision with existing account customization | Low | Low | Helix-prefixed unique IDs (`customscript_hlx_*`); code-review validates uniqueness; collision causes clear deploy error |
| 5 | `project:deploy` slightly slower than `file:upload` for file-only changes | Low | Certain | Acceptable tradeoff -- SPA repos already use it in production; scoped deploy.xml minimizes package size; user said "pick the best option" |
| 6 | Existing NATIVE_NS repos lack `deploy.xml` or `src/Objects/` | Low | Low | Enhanced `ensureSdfProjectReady()` validates and creates default deploy.xml; scoped generation always overwrites it |
| 7 | Saved searches cannot be deployed to production via SDF | Medium | Certain | Documented limitation in skill and prompts; ns-gm used for sandbox creation; production promotion deferred to Round 2 |
| 8 | Object dependencies require deploy ordering (e.g., record before script that references it) | Low | Low | deploy.xml `<configuration>` (Objects) deploys before `<files>` (FileCabinet); within Objects, SDF handles dependency ordering |

### Open Questions Resolution (from Product Specification)

**Q1: Does scoped deploy.xml deploy subsets correctly?**
**Answer: Yes.** Oracle docs confirm: "Before deployment, the folder is zipped and only the files and folders listed in the deploy.xml file are included." Specific paths like `customrecord_employee.xml` are explicitly supported in Oracle examples. The scoped approach deploys exactly what's listed -- nothing more.

**Q2: Can saved searches be fully managed as SDF objects?**
**Answer: No.** Oracle docs state: "Saved searches should be customized with NetSuite rather than SDF." Saved searches must be created via ns-gm runtime execution in sandbox. They CANNOT be promoted to production via `project:deploy`. This is a known NetSuite platform limitation.

**Q3: What is the correct manifest.xml update strategy?**
**Answer:** The SDF creation skill and implementation step-config include a feature-to-object-type mapping table. The agent adds required features when creating new object types. If a feature is missed, `project:deploy` fails with a clear error identifying the missing feature, and the agent can fix on retry.

**Q4: Performance of project:deploy vs file:upload?**
**Answer:** `project:deploy` is slower (30-90s vs 5-30s for file:upload) due to Java VM startup and project packaging. However: (a) the scoped deploy.xml minimizes package size, (b) SPA repos already use `project:deploy` in production without complaints, (c) the user said "pick the best option and imagine there are no existing customers." The tradeoff is acceptable.

**Q5: Do existing NATIVE_NS repos need deploy.xml initialization?**
**Answer:** Possibly. The enhanced `ensureSdfProjectReady()` checks for `src/deploy.xml` and creates a default if missing. The scoped deploy.xml generation always overwrites it, so the default is a safety net. Repos that already have deploy.xml from `project:create` are handled correctly.

**Q6: How reliably can agents learn SDF XML schemas?**
**Answer:** Five reinforcing mechanisms: (1) SDF creation skill with concrete templates, (2) Context7 with 94 oracle-samples snippets, (3) existing templates in `netsuite-setup/Objects/`, (4) NS_SDF_AWARENESS_RULES in shared prompts, (5) implementation step-config guidance. Code-review validates XML correctness. Deploy failures provide clear error messages for iteration.

---

## 13. Implementation Roadmap

### Phase 1: Agent Infrastructure (no deploy pipeline dependencies)

These can be implemented first as they have no dependencies on deploy pipeline changes.

| Order | File | Action | Dependencies |
|-------|------|--------|-------------|
| 1 | `.claude/skills/ns-sdf-objects/SKILL.md` | **CREATE** -- new SDF creation skill with XML templates, naming conventions, manifest.xml guidance | None |
| 2 | `.claude/skills/ns-gm/SKILL.md` | **MODIFY** -- disambiguate guardrails (file-based creation permitted, runtime guarded) | None |
| 3 | `sandbox-runtime-assets/workflow-steps/shared/common.mjs` | **MODIFY** -- add `NS_SDF_AWARENESS_RULES` export | None |
| 4 | `sandbox-runtime-assets/workflow-steps/implementation/step-config.mjs` | **MODIFY** -- import NS_SDF_AWARENESS_RULES, add to SYSTEM_PROMPT, add SDF creation workflow | Depends on #3 |

**Optional:** Update `implementation-plan/step-config.mjs` and `code-review/step-config.mjs` to also import NS_SDF_AWARENESS_RULES.

### Phase 2: Deploy Pipeline

| Order | File | Action | Dependencies |
|-------|------|--------|-------------|
| 5 | `src/helix-workflow/orchestrator/native-phase.ts` | **MODIFY** -- enhance `ensureSdfProjectReady()` to validate `src/deploy.xml` exists | None |
| 6 | `src/helix-workflow/orchestrator/deploy-phase.ts` | **MODIFY** -- add `generateScopedDeployXml()`, replace file:upload with scoped project:deploy | Depends on #5 (conceptually) |
| 7 | `src/services/ns-deployment-service.ts` | **MODIFY** -- same transformation as deploy-phase.ts for production path | Depends on #5, shares utility with #6 |

**Phases 1 and 2 can proceed in parallel** since they touch different files. Phase 1 changes prompt/skill content; Phase 2 changes deploy pipeline logic.

### Phase 3: Quality Gates

| Gate | Command | Expected |
|------|---------|----------|
| TypeScript check | `tsc --noEmit` | 0 errors |
| Lint | `eslint .` | 0 errors |
| Tests | `AUTH_JWT_SECRET=test-only-jwt-secret tsx --test src/**/*.test.ts` | All pass |
| Build | `tsc --pretty && prisma migrate deploy` | Success |

**No Prisma schema changes required.** The NsDeployment model is deploy-method-agnostic (status/targetEnvironment/errorMessage). No migration needed.

### Summary

| Metric | Value |
|--------|-------|
| Files to create | 1 (`.claude/skills/ns-sdf-objects/SKILL.md`) |
| Files to modify | 6 (`deploy-phase.ts`, `ns-deployment-service.ts`, `native-phase.ts`, `shared/common.mjs`, `implementation/step-config.mjs`, `.claude/skills/ns-gm/SKILL.md`) |
| Schema changes | 0 |
| New dependencies | 0 |
| Estimated complexity | Medium |

---

## Quick Reference

| Item | Value |
|------|-------|
| **Repo** | helix-global-server (all changes) |
| **Deploy mechanism** | Scoped `project:deploy` with dynamically generated `deploy.xml` |
| **Cherry-pick approach** | Git diff `src/Objects/` + `src/FileCabinet/` -> generate deploy.xml with only changed paths -> `project:deploy` |
| **New skill** | `.claude/skills/ns-sdf-objects/SKILL.md` |
| **Prompt changes** | `shared/common.mjs` (NS_SDF_AWARENESS_RULES), `implementation/step-config.mjs` (SDF workflow), `.claude/skills/ns-gm/SKILL.md` (guardrails) |
| **Pipeline changes** | `deploy-phase.ts` (sandbox), `ns-deployment-service.ts` (production), `native-phase.ts` (deploy.xml validation) |
| **Saved searches** | NOT SDF-manageable; ns-gm for sandbox; production deferred |
| **Cross-line** | Multi-repo tickets already work; both NATIVE_NS and SPA_NS deploy via `project:deploy` |
| **Schema changes** | None |
| **New dependencies** | None |

---

## Glossary

| Term | Definition |
|------|-----------|
| **SDF** | SuiteCloud Development Framework -- Oracle's framework for managing NetSuite customizations as code (XML metadata + SuiteScript source) |
| **ACCOUNTCUSTOMIZATION** | SDF project type for account-specific customizations (vs SUITEAPP for distributable apps) |
| **deploy.xml** | XML file that controls which objects and files are included in a `project:deploy` package |
| **manifest.xml** | XML file declaring project metadata and required NetSuite features (SERVERSIDESCRIPTING, etc.) |
| **SuiteCloud CLI** | Command-line tool for SDF operations: `project:create`, `project:deploy`, `file:upload`, `account:setup:ci` |
| **NATIVE_NS** | Helix repo type for native NetSuite customizations (SuiteScript + SDF objects in an ACCOUNTCUSTOMIZATION project) |
| **SPA_NS** | Helix repo type for NetSuite SPA applications (React/Vue app deployed as a SuiteApp via SDF) |
| **ns-gm** | NetSuite runtime proxy RESTlet that executes SuiteScript code for queries, verification, and debugging |
| **FileCabinet** | NetSuite's file storage system; `src/FileCabinet/SuiteScripts/` holds SuiteScript source files |
| **Objects/** | SDF directory containing XML metadata files for script records, custom records, custom fields, etc. |
| **scriptid** | Unique identifier for SDF objects (e.g., `customscript_hlx_license_ue_validate`) |
| **Cherry-pick deployment** | Strategy of deploying only changed items (not all items) to minimize risk of overwriting production-only changes |
| **Scoped deploy.xml** | A deploy.xml listing specific object paths from git diff, not wildcards -- the core innovation of this proposal |
| **Cross-line project** | A customization spanning multiple repo types (NATIVE_NS + SPA_NS + normal) in a single ticket |

---

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md (helix-global-server) | Problem statement | End-to-end NS customization creation with sandbox-to-production deployment via SDF |
| User continuation context | Priority framing | Cherry-pick deployment required; agent integration clarity; no backward compat; cross-line projects common |
| diagnosis/diagnosis-statement.md (server) | Root cause identification | Two co-equal root causes: deploy pipeline gap + agent knowledge gap |
| diagnosis/diagnosis-statement.md (client) | Client scope confirmation | No client changes; deployment UI is method-agnostic |
| product/product.md (server) | Feature requirements | F1: scoped deploy.xml; F2: new SDF skill; F3: agent prompts; F4: ns-gm guardrails; F5: cross-line |
| tech-research/tech-research.md (server) | Architecture decisions | TD-1: scoped deploy.xml algorithm; TD-3: SDF skill; TD-4: NS_SDF_AWARENESS_RULES; TD-7: agent map |
| tech-research/apl.json (server) | Technical Q&A | Q1: dynamically generated scoped deploy.xml; Q3: saved searches NOT SDF-manageable |
| scout/scout-summary.md (server) | Architecture mapping | Two deploy paths with gap; 4 agent mechanisms; SDF templates exist; cross-line evidence |
| implementation-plan/apl.json (server) | Plan structure | 13-section report; scoped deploy.xml algorithm; agent integration table |
| deploy-phase.ts L260-453 (direct read) | Sandbox deploy code | SPA: project:deploy at L271-282; Native: git diff FileCabinet L351-362, file:upload L415-431 |
| ns-deployment-service.ts L593-689 (direct read) | Production deploy code | Native: git diff FileCabinet L637-650, file:upload L668-682 |
| native-phase.ts L180-289 (direct read) | SDF infrastructure | ensureSdfProjectReady() with ACCOUNTCUSTOMIZATION creation |
| native-phase.ts L123-137 (direct read) | SuiteCloud env | buildSuiteCloudOperationEnv() with SUITECLOUD_CI=1 |
| shared/common.mjs (direct read) | Agent shared rules | CORE_PRINCIPLES, GLOBAL_RULES, ORM_MIGRATION_RULES -- zero NS content; pattern for NS_SDF_AWARENESS_RULES |
| implementation/step-config.mjs L211-266 (direct read) | Implementation agent prompt | SYSTEM_PROMPT with no NS content; context7Enabled=true; injection point after ORM_MIGRATION_RULES |
| .claude/skills/ns-gm/SKILL.md (direct read) | ns-gm guardrails | L8-10: "Do not create, update, or delete" -- needs disambiguation |
| runtime-assets.ts L1-50 (direct read) | Skill bundling | .claude/skills/ auto-collected into sandbox; confirms new skill delivery path |
| netsuite-setup/deploy.xml (direct read) | Deploy.xml structure | `<configuration>` + `<files>` sections; `~/` path prefix; Objects before FileCabinet |
| netsuite-setup/manifest.xml (direct read) | Manifest features | SERVERSIDESCRIPTING, OAUTH2, RESTLETS, DEVELOPER; SUITEAPP format reference |
| netsuite-setup/Objects/customscript_ns_gm_restlet.xml (direct read) | Script+deployment template | Restlet with embedded scriptdeployment; scriptfile reference |
| netsuite-setup/Objects/customrole_helix_sdf.xml (direct read) | Role template | Custom role with permissions entries |
| Context7 /oracle-samples/netsuite-suitecloud-samples | SDF XML patterns | Custom record types, custom fields, script patterns -- 94 code snippets |
| Production DB: OrganizationRepository (runtime query) | Live repo configuration | 5 NATIVE_NS (all file:upload), 2 SPA_NS (project:deploy); cross-line evidence |
| Production DB: NsDeployment (runtime query) | Deployment history | 2 SUCCEEDED, 8 FAILED (infrastructure issues); project:deploy proven in production |
| Production DB: Organization (runtime query) | NS org count | 5 NETSUITE organizations: Broudy, DMW, Dealmed, EKB, Outdoor Living Supply |
| /tmp/helix-inspect/manifest.json | Runtime inspection availability | DATABASE + LOGS configured for helix-global-server |

## Attachments
- (none)

## Continuation Context
Meeting Title: Sandbox deployment strategy and suitecloud command restrictions
Date: Apr 14
Meeting participants: Darshan Sandhu

Transcript:
 
Me: So for the ticket. Right now we made some decisions. Where. We reduce the scope down so that there is no, we were making sure that there is no. Attempt to have some functionality for deleted files and deleted objects. We are trying to figure out a way where we can. Possibly ignore. The fact that there are some deletions. And we also added a system prompt already. But in the edge case where something is renamed or deleted. We want to. See if there's a way to ignore it rather than having like some hard fail. We want to avoid hard fail. We made the effort. To kind of do some self correction and avoid hard failing. In this case. We had the option to do a pre tool use. Deny. For deleting any files in. The file cabinet or the objects folder. But that may be too strict for this scope because I don't know if there's a scenario where. The helix will create something and then realize that actually it wasn't the best thing and then kind of remove it. There is also when creating a saved search or an object. You know, we have an SGM. Production access. For scout and diagnosis. And it should gather the information that there's going to be some sort of parity that will be deployed if the ticket requires some sort of object or save search to be deployed. Or created. I think we added that already. But we could double.  
Them: Yeah, that might be a possibility, right? It's reasonable if we are introducing the new thing into samples. Right, into production, everything should follow the regular flow of deployments. Right? That includes scripts, objects. Like searches fields and stuff. But coming from production to Sandbox, if needed. Which we are not sure, you know how frequent would it be? If needed? Yeah, equal to like some kind of object update into the account from production. The only scenario that we can think of right now that this would be needed is in the case that there's. Like something important relevant on production, but not on some.  
Me: Decided to make raw sweet cloud via the bash blocked. From all agents and sub agents. They should not be able to use it. We had some idea where they could have some very like the implementation agent can have some very, very strict. List of sweet cloud commands it can do to kind of pull in an object or update an object. But you see here where it's like. One option is to have. One custom MCP tool for safe search sync. Which. Was an idea that, you know, Luis, you had. But then we, you know, maybe the bash, maybe the bash ability. Is, is, is maybe it's a little too difficult to have like a broad sweet cloud block, but also. Just have one agent just only have a small subs, like subset of a small set of sweet cloud. Commands. I don't know. Why we're, you know, why we drifted from that. But, you know, we could discuss the options of having one custom mcv tool that's really, really, really small. That basically just has fixed operations.  
Them: We agree that there's an allow list and it's good enough, right? It won't be able to do anything else beyond just. I think was update import and enlist. That was it.  
Me: Yeah. Yeah. I think, I think the allow list is pretty solid. The potential plan change here is maybe because the way that agents are set up right now, like the pre-tool use, maybe some of it is being shared. But we should be able to kind of maybe separate that. So if it's possible and it's not over engineered, like we could have every other agent and sub agent block any sweet cloud via bash. And then the implementation agent has just a. Short allow list. For suite cloud bath. If that's possible. We should probably hedge towards that instead of creating a small like mcp tool for this. So. For the unsupported, you know, delete rename type change before deploy. So we, we want to avoid hard failures. Like mentioned we mentioned before. Here, you know, one of the, one of the suggestions is to add like an add an early validation and verification or just before deploy. But implementation wrong. Oh, this would be so verification would classify it as implication wrong with the remedian remediation. See, I don't know if this is the best thing. I think we should just try to figure out a way to intelligently. Not track these changes or just, you know, like, you know, kind of pretend they didn't happen. This, I don't, this I don't know yet. This is something that needs to be kind of thought out a little bit. Because. We really want to avoid. Blocking because this is an edge case. Right? It's very, it's possible that this won't happen. So I don't want to, you know, so creating like a whole deployment fail on it. Seems a little too heavy.  
Them: Now let's just log a warning and we can review the warnings. Like every now and then and see if it's actually happening at all.  
Me: Yeah, because we, yeah, exactly. We could kind of just log the warning because, yeah, we don't have to do any hard fail at all or remediation. It just should be like, okay. Because this shouldn't matter because this doesn't, you know, this doesn't deploy. Like if you run and deploy, it doesn't delete anything. So it doesn't really matter. And if there's like an import file flow. Then you'll just get those objects anyways and files again anyways. So it shouldn't, it shouldn't really matter at the end of the day. We shouldn't over index on that. We should just kind of let it go. So deploy phase guard as a backstop. Yeah. Again, there should be no. Guards here. Deploy failure should be real deploy failures. They should not be anything that we need to do some sort of validation. That at the end of the day doesn't even matter because deployments don't delete anything. So. Make parity explicit end prompts and skills agents should understand the scout and diagnosis read only nsgm. Implementation sandbox rights are okay if they become promotion ready artifacts. Sandbox created saved searches must be synced into SDF XML before they count as done. The same thing applies to fields, roles, records. If it won't promote cleanly, it isn't complete. So the parity is something that we could still kind of brainstorm on and see how we could solve that. So. I think we could go ahead and see what happens about this. Oh, and also remember to read the human run. And it's called manual underscore change underscore summary.md. To see where we're at and the possible ways to move forward. 

read helix-global-server/.helix/tickets/cmnth7lzb0001k80u59have2d/runs/human-run/manual_change_summary.md
