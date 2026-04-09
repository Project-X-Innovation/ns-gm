# Product: NetSuite Execute Mode With Approval

## Problem Statement

Helix NetSuite users spend excessive time manually entering, editing, and looking up data in NetSuite. The platform is slow, manual data entry is error-prone, and the current workflow requires users to navigate complex NetSuite interfaces to make routine record changes. Today, Helix can research and analyze NetSuite data (read-only), but cannot act on that analysis. Users describe what they need, get an answer, and then must manually execute the changes themselves.

There is no mechanism to let the agent make production changes to NetSuite on behalf of users, and there is currently zero infrastructure for approving, previewing, or gating such changes. The EXECUTE mode enum exists in the codebase but does nothing — it behaves identically to AUTO mode. Zero EXECUTE tickets have ever been created in production.

## Product Vision

Users describe what they want done in NetSuite using natural language. Helix researches the request, proposes the exact changes, and shows the user a clear before/after preview. The user reviews and approves, and only then are the changes committed to production NetSuite. This transforms Helix from a read-only research assistant into a safe, human-supervised execution agent for NetSuite operations.

## Users

| User | Description | Key Need |
|------|-------------|----------|
| NetSuite Admin | Non-technical org admin who manages records, invoices, orders in NetSuite daily | Approve/reject proposed changes in plain language without understanding SuiteScript |
| NetSuite Power User | Technically proficient user who wants to automate repetitive record operations | Describe complex multi-record changes in natural language and trust the agent to get it right |
| Organization Owner | Decision-maker who cares about data integrity in their source-of-truth system | Confidence that no agent-initiated change reaches production without explicit human approval |

## Use Cases

1. **Add/Edit Records via Natural Language**: User says "Add a line item for Widget X to Invoice #1234 for Customer Acme" and Helix proposes the exact record changes, showing current vs. proposed state.
2. **Bulk Corrections**: User says "Check all open invoices for Customer Beta and fix the shipping address to 123 Main St" and Helix proposes each change individually for batch approval.
3. **Complex Transactions**: User says "Create a sales order for Customer Gamma with items A, B, C at their negotiated pricing" and Helix resolves item IDs, pricing rules, and customer terms, then presents the proposed order for approval.
4. **Review and Reject**: User reviews a proposed change, sees it's not quite right, and rejects it. Helix refines the proposal based on feedback.

## Core Workflow

1. **Request**: User describes the desired NetSuite change in natural language within Helix.
2. **Research**: Agent uses read-only production access (ns-gm) to gather current record state, codebase context, and historical knowledge.
3. **Propose**: Agent generates the script to make the change and translates it into a human-readable change summary (before/after diff).
4. **Preview**: The proposed changes are captured via a dry-run mechanism that shows the exact record state that would result.
5. **Approve**: User reviews the human-readable change summary in Helix and approves or rejects.
6. **Execute**: Approved changes are committed to production NetSuite by a deterministic program (not the agent itself).
7. **Confirm**: Execution result is reported back to the user with success/failure status.

## Essential Features (MVP)

1. **Approval-Gated Execution**: No agent-initiated write operation reaches production NetSuite without explicit human approval. This is the non-negotiable safety constraint.
2. **Change Preview (Dry Run)**: A mechanism to capture the exact before/after record state of proposed changes without committing them, so users see what will actually happen.
3. **Human-Readable Change Summary**: Proposed changes are translated from SuiteScript operations into plain-language descriptions (e.g., "Customer: Acme Corp, Field: Credit Limit, Current: $50,000, Proposed: $75,000").
4. **Approval UI in Helix Mainland**: Users review and approve/reject proposed changes within the Helix web application — not in NetSuite itself.
5. **Approval State Tracking**: Each execute request has a clear lifecycle (proposed, previewing, pending-approval, approved, executing, succeeded, failed) visible to the user.
6. **Deterministic Execution**: Approved scripts are executed by a deterministic service (not the agent), ensuring the exact approved changes are what gets committed.
7. **EXECUTE Mode Workflow Differentiation**: The EXECUTE ticket mode triggers a distinct workflow tailored to propose-preview-approve-execute, not the standard 9-step implementation chain.

## Features Explicitly Out of Scope (MVP)

1. **Non-NetSuite Execution**: Execute mode is scoped to NetSuite only. Other platforms are future work.
2. **Autonomous Execution Without Approval**: No auto-approve or trust-level bypass. Every change requires human approval in MVP.
3. **Suitelet-Based Approval UI Inside NetSuite**: Approval happens in Helix mainland, not via a NetSuite-native Suitelet interface.
4. **Batch Auto-Approval**: No "approve all" for bulk operations. Each change set requires individual review in MVP.
5. **Role-Based Approval Delegation**: No approval chains or delegated approvers. The requesting user approves in MVP.
6. **Real-Time WebSocket Updates**: Polling-based status updates are sufficient for the async approval flow in MVP.
7. **helix-cli Approval Commands**: Approval management is web UI only in MVP.
8. **Sandbox-First Execution**: Running scripts in a sandbox environment before production adds significant complexity and data-sync risk. Not MVP.

## Success Criteria

Since this is a **research ticket**, success is measured by the quality of the design output, not shipped features:

1. **Approach Analysis Complete**: All six competing approaches (BeforeSubmit Intercept, Two-Phase RESTlet, Pre-Execution State Snapshot, Sandbox-First Execution, Suitelet-Based UI, Server-Side Simulation) are fully analyzed with pros, cons, and feasibility grounded in the actual codebase.
2. **Clear Recommendation**: One approach (or combination) is recommended with evidence-backed rationale balancing safety, accuracy, UX quality, and implementation complexity.
3. **Data Model Specified**: The approval data model design has enough detail for future implementation (entities, relationships, state machine).
4. **Cross-Repo Scope Delineated**: Changes needed in helix-global-server, helix-global-client, and ns-gm are clearly scoped.
5. **Governance Constraints Addressed**: NetSuite governance risks (unit costs, chaining, timeouts) are documented with evidence from NetSuite documentation.
6. **Approval UX Concept Defined**: How non-technical admins will review and approve changes is described with enough specificity to guide UI implementation.

## Key Design Principles

1. **Safety Over Speed**: Never trade approval rigor for convenience. Every production write must be human-approved.
2. **Show, Don't Tell**: Users see the actual record changes (before/after), not just a description of what the script does.
3. **Frictionless Approval UX**: The approval experience should be "seamless, adorable, lovable" per the ticket owner. Non-technical users must be able to approve confidently.
4. **Deterministic Execution**: The approved script is what runs — no re-interpretation or agent modification between approval and execution.
5. **Fail Safe**: If anything is ambiguous (approval status unknown, record state changed, governance exhausted), the system refuses to commit changes rather than guessing.

## Scope & Constraints

- **Repositories in scope**: helix-global-server (primary: data models, API, workflow), helix-global-client (approval UI), ns-gm (dry-run/execution mechanism). helix-cli is context-only.
- **Platform constraint**: EXECUTE mode is restricted to NETSUITE platform organizations (already enforced in ticket-controller.ts).
- **Production state**: 0 EXECUTE tickets exist; 4 NetSuite orgs in production; zero approval infrastructure of any kind.
- **Client tech constraints**: React 19, Tailwind v4, no WebSocket (polling only), TanStack React Query v5.
- **NetSuite constraints**: RESTlet governance limits (5000 units); beforeSubmit scripts should be lean; N/https calls cost governance units; governance chaining across script contexts is a known risk.
- **Ticket type**: This is a RESEARCH ticket. The deliverable is a design recommendation, not shipped code.

## Future Considerations

- **Trust Levels / Auto-Approve**: Once users build confidence, allow configurable auto-approval for low-risk changes (e.g., field updates on non-financial records).
- **Bulk Approval**: Approve multiple related changes in a single action for batch operations.
- **Approval Delegation**: Allow organization owners to designate approvers or require multi-party approval for high-value changes.
- **Non-NetSuite Execution**: Extend execute mode to other platforms beyond NetSuite.
- **BeforeSubmit Safety Net**: Layer a NetSuite-side beforeSubmit intercept as a defense-in-depth check once the core flow is proven, catching any unauthorized writes.
- **Audit Trail**: Full audit log of all proposed, approved, rejected, and executed changes for compliance.
- **Rollback Support**: Ability to undo an executed change by generating and approving a reversal script.

## Open Questions / Risks

| # | Question / Risk | Category |
|---|----------------|----------|
| 1 | Can the dry-run mechanism in a Two-Phase RESTlet accurately capture all side effects (workflows, UserEventScript triggers, formula fields)? If not, how do we communicate the gap to users? | Technical |
| 2 | What happens when the record state changes between dry-run preview and approved execution (stale approval problem)? Should re-validation be required? | Technical |
| 3 | How will the deterministic executor service be separated from the agent? What prevents the agent from bypassing the approval gate? | Architecture |
| 4 | What is the actual governance unit cost of N/https calls within a beforeSubmit UserEventScript context, and does governance chaining from RESTlet -> record.submit -> beforeSubmit make Approach A infeasible? | NetSuite Platform |
| 5 | Can a beforeSubmit script reliably differentiate Helix-initiated record saves from user-initiated saves to avoid blocking normal NetSuite usage? | NetSuite Platform |
| 6 | How will complex record changes (sublists, line items, transforms) be rendered in human-readable form for non-technical approvers? | UX |
| 7 | What approval response latency is acceptable? Users should not wait in real time for a synchronous approval flow. | UX |
| 8 | Should approval records live in Helix's PostgreSQL, in NetSuite custom records, or both? What are the consistency implications? | Data Architecture |
| 9 | How does execute mode interact with the existing NsDeployment pipeline? Are they complementary or separate workflows? | Architecture |
| 10 | What is the deployment mechanism for any new NetSuite scripts (UserEventScript, extended RESTlet) to customer accounts? | Operations |

## Artifact Inputs Used

| Artifact | Why Used | Key Takeaway |
|----------|----------|--------------|
| ticket.md (helix-global-client) | Primary problem statement and ticket owner's baseline approach | EXECUTE mode needs dry-run capture, human approval UX, deterministic execution; owner proposes beforeSubmit intercept; wants 5-6 competing approaches analyzed |
| scout/scout-summary.md (helix-global-server) | Server-side infrastructure state and architectural boundaries | Zero approval infrastructure; EXECUTE treated as AUTO; NsDeployment pattern exists for async operations; ns-gm RESTlet is fire-and-forget |
| scout/scout-summary.md (helix-global-client) | Client-side infrastructure state and UI patterns | EXECUTE mode selectable but no approval UI; existing wizard/status patterns for reference; polling-based updates only |
| scout/scout-summary.md (ns-gm) | Execution vehicle architecture and capabilities | RESTlet executes arbitrary SuiteScript; no intercept hooks; three-tier pipeline (CLI -> proxy -> RESTlet); no Helix callback channel |
| scout/reference-map.json (helix-global-server) | Detailed file-level mapping and production facts | 0 EXECUTE tickets in production; 4 NS orgs; 22 NS deployments; no approval models or tables |
| scout/reference-map.json (helix-global-client) | Client file mapping and unknowns | No approval types, API hooks, or components; existing UX patterns identified |
| scout/reference-map.json (ns-gm) | ns-gm file mapping and governance unknowns | RESTlet supports only 'run' and 'getscriptexecutionlogs'; governance chaining is a known risk |
| diagnosis/diagnosis-statement.md (helix-global-server) | Root cause analysis and six competing approaches | Architectural gap is the root cause; six approaches analyzed; Two-Phase RESTlet (Approach B) recommended for deeper evaluation |
| diagnosis/diagnosis-statement.md (helix-global-client) | Confirms identical diagnosis across repos | Same six-approach analysis with consistent recommendation |
| diagnosis/apl.json (helix-global-server) | Structured evidence and answers to key questions | Confirmed zero infrastructure, governance risks, cross-repo scope, and data model needs |
| repo-guidance.json (helix-global-client) | Repository intent classification | server=target, client=target, ns-gm=target, cli=context; diagnosis-authored |
