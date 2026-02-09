# product.md

**Project:** ns-gm (NetSuite God Mode)
**Date:** 2026-02-09
**Purpose:** Product definition and scope (no implementation details)

## Problem

Developers need a fast command-line workflow to run ad-hoc SuiteScript and inspect account context without manually building deployment scripts. The current auth approach is proprietary and high-liability. We need a clean, standards-based authentication experience with profile management for multiple credential groups.

## Product Vision

ns-gm is a command-line tool for executing SuiteScript snippets against NetSuite with a secure, public-documentation-based auth flow and profile aliases for fast switching.

## Primary Users

- NetSuite developers doing fast validation or debugging.
- Technical consultants switching between multiple client accounts.
- Automation engineers running scripted CLI tasks.

## Core Jobs To Be Done

- Configure one or more NetSuite credential groups once, then reuse them.
- Quickly select an existing credential alias or create a new one during setup.
- Execute ad-hoc SuiteScript code from terminal.
- Get current NetSuite environment type quickly via a single command.

## Core Commands

- `ns-gm setup`
- `ns-gm run --code "..."`
- `ns-gm run --file <path>`
- `ns-gm logs [options]`
- `ns-gm env`

## Functional Requirements

### 1) Clean auth flow (main objective)

- Replace proprietary auth logic with a public, standards-based NetSuite authentication flow.
- Auth setup instructions and runtime behavior must be based on official public documentation.

### 2) Setup must show stored aliases and "new"

- Running `ns-gm setup` must present:
  - existing stored credential aliases
  - a special option: `new`

### 3) Alias input and persistence

- If `new` is selected, user must be prompted for an alias name.
- New credentials are stored under that alias.
- On subsequent `ns-gm setup` runs, saved aliases must appear in the selection list.

### 4) Fast environment command

- Add `ns-gm env` command.
- It must execute the equivalent of:
  - `ns-gm run --code "return runtime.envType"`

## UX Expectations

- Setup flow should be explicit and low-friction.
- Existing aliases should be visible and selectable without manual file editing.
- Error messages should clearly indicate auth/configuration problems and next actions.

## Non-Goals

- No UI application.
- No browser-based dashboard.
- No advanced profile permissions model in this phase.
- No support for proprietary or undocumented authentication mechanisms.

## Acceptance Criteria

- `ns-gm setup` lists saved aliases and `new`.
- Creating a new alias stores credentials and makes that alias selectable in later setup runs.
- `ns-gm env` returns the same value as running `ns-gm run --code "return runtime.envType"`.
- Auth flow is fully based on documented public NetSuite auth guidance.
