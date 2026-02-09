# Three-Stage Research Methodology

**Purpose:** How to break down technical research into three focused documents for AI-driven development

**Date:** 2025-11-27

---

## Overview

When researching a new technical project, split the work into three distinct stages, each with its own artifact:

1. **product.md** - Product research (problem, users, use cases)
2. **tech-research.md** - Technical decisions and architecture
3. **implementation-plan.md** - Atomic implementation steps with verification

This separation ensures clarity, reduces confusion, and creates better inputs for AI coding agents.

---

## Stage 1: Product Research (product.md)

### Purpose
Define the problem, users, and product requirements **before** making any technical decisions.

### Key Sections

**Problem Statement:**
- What core problem are we solving?
- Who currently has an advantage? Who is disadvantaged?
- Why is this fundamentally important?

**Product Vision:**
- What is this tool/product?
- What specific capabilities does it provide?
- What is the core value proposition?

**Users:**
- Who is the primary user? (Be specific - humans? AI agents? Developers?)
- Who is managing/deploying it?
- Who is explicitly NOT the user?

**Use Cases:**
- Concrete scenarios showing how users will interact with the product
- Example workflows with actual commands/steps
- Before/after comparisons

**Core Workflow:**
- The fundamental loop or cycle
- Philosophy behind the workflow design
- Why this approach vs alternatives

**Essential Features (MVP):**
- List of must-have features for first version
- What each feature enables

**Features Explicitly Out of Scope (MVP):**
- What you're NOT building yet
- Why minimal MVP matters
- What's deferred to later rounds

**Success Criteria:**
- Functional success: What must work?
- Performance success: How well must it work?
- Adoption success: How do we know it's valuable?

**Key Design Principles:**
- 3-5 core principles guiding all decisions
- Why each principle matters

**Scope & Constraints:**
- What's in scope vs out of scope
- Technical constraints
- Usage constraints

**Future Considerations:**
- Questions to revisit after MVP
- Potential enhancements for Round 2

### What NOT to Include
- No technical decisions (that's for tech-research.md)
- No architecture discussions
- No implementation details
- No specific technologies or frameworks

### Critical User Feedback

> "This is all for the technical research doc, not the product doc. Ask later"

When technical questions arise during product research, note them for tech-research.md but don't answer them yet.

---

## Stage 2: Technical Research (tech-research.md)

### Purpose
Document all technical decisions and architecture choices **based on** the product requirements from product.md.

### Key Sections

**Technology Foundation:**
- What core technologies/SDKs are we using?
- What are their key features?
- Why these technologies?

**Architecture Decision:**
- What architecture problem are we solving?
- What options did we consider?
- Which option did we choose and why?
- Visual diagrams of architecture (ASCII art is fine)
- Why this works (benefits)

**Core API/Methods:**
- Key methods from frameworks/SDKs we'll use
- Brief description of each
- What they enable

**Technical Decisions:**
Each decision should follow this format:
- **Decision number and topic**
- **Decision:** What we chose
- **Reasoning:** Why we chose it (bullet points)
- **Rejected alternatives:** What we didn't choose and why

Example categories:
- Environment/deployment mode
- Output format
- Error handling approach
- Configuration strategy
- Installation method
- Language choice
- Session management

**Cross-Platform Considerations:**
- Platform-specific details (Mac/Linux/Windows)
- Path differences
- Command differences

**Performance Expectations:**
- Expected timing for operations
- Overhead considerations

**Dependencies:**
- Core dependencies with versions
- Dev dependencies
- Why each is needed

**Deferred to Round 2:**
- Questions for future iterations
- Features/decisions postponed

**Summary Table:**
Quick reference of all major decisions

### Balance of Detail

**Critical user feedback:**

> "In general its good, is there a way to condense it with less code examples but retaining the decisions? Code samples we can leave for the implementation plan"

**What to include:**
- Architecture diagrams
- Configuration examples (small snippets)
- Key technical patterns
- Decision reasoning

**What NOT to include:**
- Complete code implementations
- Full function implementations
- Extensive code examples
- Step-by-step coding instructions

The tech doc should be condensed - focus on WHAT you decided and WHY, not HOW to implement it.

---

## Stage 3: Implementation Plan (implementation-plan.md)

### Purpose
Provide atomic, verifiable implementation steps that a coding agent can execute independently.

### Critical Requirements

**User's atomic steps requirement (verbatim):**

> "Ok actually before I start, the implementation plan should have clear 'atomic steps', each one must be a (possibly tiny) delivered unit. Each unit should include the plan for the implementation of the unit as well as the plan for verification, be it testing or manually. If manually, it must be done by the Agent, not manually by a human."

> "Exactly"

**User's balance requirement (verbatim):**

> "I don't think you need to put the entire implementation in there, we can let the coding agent figure it out in real time. What is a good balance?"

**User's table of contents requirement (verbatim):**

> "Add a simple table-of-contents style list of unit-steps before going into each"

### Structure

**1. Overview Section:**
- Brief description
- Links to product.md and tech-research.md for context

**2. Implementation Principles:**
- Atomic Steps: Each step is self-contained and deliverable
- Verification Strategy: AI agent runs commands, no human needed
- Progressive Development: Can stop at any step with working subset

**3. Implementation Steps Summary (Table):**
Table with columns: Step | Goal | Deliverable

This gives a quick scan of all steps before diving into details.

**4. Detailed Implementation Steps:**

Each step follows this format:

```markdown
### Step N: [Step Name]

**Goal:** One sentence describing what this step achieves

**What to Build:**
- Bullet points of what needs to be created
- Key files and their purposes
- Important modules/functions
- Technical approach (but not complete code)

**Key Technical Decisions:** (optional)
- Platform detection approach
- Library usage patterns
- Important configuration

**Expected Output Format:** (if applicable)
Example JSON or output format

**Verification (AI Agent Runs):**
```bash
# Concrete commands the AI agent runs
# Expected outputs or behaviors
# What success looks like
```

**Success Criteria:**
- Bullet points of pass/fail criteria
- Observable outcomes
- What should work at this point
```

### What to Include in Each Step

**DO include:**
- Goal and deliverable
- What files/modules to create
- Key architectural patterns
- Configuration examples (small snippets)
- Verification commands AI agent runs
- Clear success criteria
- Expected output formats

**DON'T include:**
- Complete function implementations
- Full code files
- Step-by-step coding instructions
- Every line of code needed

**The balance:** Enough guidance to be atomic and verifiable, but let the coding agent figure out implementation details in real-time.

### Verification Requirements

**Critical: Verification must be testable by AI agent, not human.**

**Good verification:**
```bash
eyes navigate http://example.com
eyes url  # Should return example.com
curl http://localhost:9222/json/version  # Should return JSON
```

**Bad verification:**
```bash
# AI agent observes: Chrome window visible on screen
# (AI agent cannot observe screen)
```

**User's feedback on bad verification (verbatim):**

> "I don't think your headless check is thought through"

When verification cannot be automated, either:
- Find an alternative testable approach (e.g., `eyes config show` to display config)
- Test for command success without verifying visual behavior
- Accept that some aspects can't be fully verified by AI agent

**User's decision on verification limits (verbatim):**

> "Overkill"

When asked about adding desktop screenshot capability to verify headless mode, user said it was overkill. Simple verification (command succeeds, no crash) is sufficient for MVP.

### Specific Verification Example: Configuration Testing

**User's question (verbatim):**

> "The test/verifications on the flags/envs is not clear. How should this be tested"

**Solution approach:**
1. Add a `config show` command that displays current configuration
2. Test with observable behavior changes (timeout causes failures, files appear in specified directories)
3. Test that flags are accepted without crashing

**Good configuration verification:**
```bash
# Show config values
eyes config show

# Test env var override
EYES_TIMEOUT=5000 eyes config show
# Expected: Shows timeout: 5000

# Test CLI flag override
EYES_TIMEOUT=5000 eyes config show --timeout 10000
# Expected: Shows timeout: 10000 (CLI wins)

# Test observable behavior
eyes navigate http://slow-site.com --timeout 2000
# Expected: Timeout error after 2 seconds

# Test directory changes
eyes screenshot --screenshots-dir ./custom/
ls ./custom/  # Should contain screenshot
```

### Additional Sections

**Dependencies Reference:**
- List core and dev dependencies
- Versions
- Purpose of each

**File Structure:**
- ASCII tree showing project structure
- Comments on what each directory/file contains

**Development Order:**
- Recommended sequence for implementing steps
- Can group related steps
- Emphasize that you can stop at any point with working subset

**Success Metrics:**
- Technical success criteria
- Workflow success criteria
- How to know the MVP is complete

**Next Steps After MVP:**
- Deferred enhancements
- Round 2 considerations

---

## Key User Prompts

### Initial Structure Request (verbatim)

> "Actually I want to break this into 3 stages, a product research stage, a tech decisions stage, and then finally, based on those 2, an implementation plan. Each stage has their own artifact namely product.md, tech-research.md and implementation.md respectively"

### On Separating Product from Technical (verbatim)

> "This is all for the technical research doc, not the product doc. Ask later"

### On Condensing Technical Doc (verbatim)

> "In general its good, is there a way to condense it with less code examples but retaining the decisions? Code samples we can leave for the implementation plan"

### On Atomic Steps (verbatim)

> "Ok actually before I start, the implementation plan should have clear 'atomic steps', each one must be a (possibly tiny) delivered unit. Each unit should include the plan for the implementation of the unit as well as the plan for verification, be it testing or manually. If manually, it must be done by the Agent, not manually by a human."

> "Exactly"

### On Implementation Balance (verbatim)

> "I don't think you need to put the entire implementation in there, we can let the coding agent figure it out in real time. What is a good balance?"

### On Verification Clarity (verbatim)

> "The test/verifications on the flags/envs is not clear. How should this be tested"

### On Verification Practicality (verbatim)

> "I don't think your headless check is thought through"

> "Overkill" (in response to desktop screenshot suggestion)

### On Table of Contents (verbatim)

> "Add a simple table-of-contents style list of unit-steps before going into each"

---

## Process Flow

### Step 1: Start with Product Research
- Understand the problem deeply
- Define users and use cases
- Establish core workflow
- Define MVP scope
- **Don't make technical decisions yet**

### Step 2: Technical Research
- Reference product.md for requirements
- Evaluate technical options
- Make and document decisions
- Focus on WHAT and WHY, not HOW
- Keep it condensed - remove code examples

### Step 3: Implementation Plan
- Reference product.md and tech-research.md
- Break into atomic steps
- Each step must be deliverable and verifiable
- Add table of contents summary
- Provide guidance without prescribing complete code
- Ensure AI agent can verify each step

### Step 4: Iterate Based on Feedback
- Condense where too verbose
- Add verification where unclear
- Balance detail level
- Remove content that doesn't belong in that stage

---

## Common Mistakes to Avoid

### Product.md Mistakes
- ❌ Including technical decisions
- ❌ Discussing architecture options
- ❌ Specifying technologies/frameworks
- ✅ Focus only on problem, users, and product vision

### Tech-research.md Mistakes
- ❌ Including full code implementations
- ❌ Writing step-by-step coding guides
- ❌ Being too verbose with examples
- ✅ Document decisions with reasoning, stay condensed

### Implementation-plan.md Mistakes
- ❌ Writing complete code for every step
- ❌ Making verification require human observation
- ❌ Steps that aren't truly atomic
- ❌ No table of contents for quick scanning
- ✅ Atomic steps with AI-verifiable success criteria
- ✅ Balance of guidance and autonomy

---

## Why This Structure Works

**Separation of Concerns:**
- Product thinking separate from technical thinking
- Technical decisions separate from implementation details
- Each document has clear purpose

**For AI Coding Agents:**
- Product.md gives them context and goals
- Tech-research.md tells them WHAT was decided
- Implementation-plan.md gives them atomic tasks to execute
- Each step is independently verifiable

**For Human Reviewers:**
- Easy to review product vision without technical noise
- Easy to review technical decisions without implementation details
- Easy to scan implementation steps via table of contents

**Iterative Development:**
- Can stop at any stage
- Can stop at any implementation step
- Each milestone is working and deliverable

**Clarity:**
- No confusion about what belongs where
- Forces thinking through product before technical
- Forces atomic, verifiable steps

---

## Template Summary

### product.md Template
- Problem Statement
- Product Vision
- Users
- Use Cases (with concrete examples)
- Core Workflow
- Essential Features (MVP)
- Features Out of Scope
- Success Criteria
- Key Design Principles
- Scope & Constraints
- Future Considerations

### tech-research.md Template
- Technology Foundation
- Architecture Decision (with options considered)
- Core API/Methods (if using framework)
- Technical Decisions (numbered, with reasoning)
- Cross-Platform Considerations
- Performance Expectations
- Dependencies
- Deferred to Round 2
- Summary Table

### implementation-plan.md Template
- Overview
- Implementation Principles
- **Implementation Steps Summary (Table)**
- Detailed Implementation Steps:
  - Goal
  - What to Build
  - Key Technical Decisions (optional)
  - Expected Output Format (if applicable)
  - Verification (AI Agent Runs)
  - Success Criteria
- Dependencies Reference
- File Structure
- Development Order
- Success Metrics
- Next Steps After MVP

---

**Methodology Created:** 2025-11-27

**Status:** Field-tested and validated

**Application:** Any technical project requiring structured research and AI-driven implementation
