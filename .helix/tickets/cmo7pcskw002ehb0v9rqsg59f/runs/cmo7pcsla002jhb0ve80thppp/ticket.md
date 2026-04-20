# Ticket Context

- ticket_id: cmo7pcskw002ehb0v9rqsg59f
- short_id: RSH-286
- run_id: cmo7pcsla002jhb0ve80thppp
- run_branch: helix/research/RSH-286-continuation-to-deploy-objects-feature
- repo_key: ns-gm
- repo_url: https://github.com/Project-X-Innovation/ns-gm.git

## Title
Continuation to "Deploy Objects" feature

## Description
### Add this into consideration and research again

#### Onboarding
- On onboarding, we only want to sync the **core objects**, not everything in the account.
- Core objects discussed:
  - **Workflows**
  - **Script definitions**
  - **Custom fields**
  - **Custom records**
- The reason script definitions matter is that script files alone are not enough to know which records are actually being touched.
- The onboarding sync should establish the baseline repository of core objects that later agents can use for discovery and diagnosis.
- The recurring **7-day sync** should also apply only to these core objects.
- **Non-core objects** should not be pulled during onboarding; they should only be fetched later when a ticket flow finds that they are referenced by relevant core objects.

#### Scout / Diagnostic / updating objects on request
- The **scout** should act more like a cartographer: it scans the available object landscape and tags what may be relevant.
- The stored repository exists mainly so scout does not need to resync everything just to identify potentially relevant objects.
- The **diagnosis** step should then determine what the actual issue is and which objects need fresh definitions.
- We discussed having diagnosis output something like an **array of objects to update**, so there can be a deterministic update step between scouting and diagnosis or before deeper implementation.
- At the same time, we also said agents should still have access to an **object update tool on the fly**, so the system can self-correct if an earlier step missed a needed reference.
- Best direction:
  - Allow **diagnosis, implementation planning, implementation, and possibly code review** to update objects when needed
  - Track whether an object has already been updated during the current ticket chain
  - Prevent redundant back-to-back updates of the same object
- Goal: every agent should be able to work from the latest object definition without getting stuck with stale data if scout/diagnosis missed something earlier.

#### Deployment process changes
- We said the deployment step should become more **deterministic** and less dependent on the agent manually composing `deploy.xml` file-by-file.
- Two options discussed:
  1. **Release folder approach**
     - Implementation writes all changed/new objects into a specific release folder
     - Deployment then targets that folder
     - This reduces risk of the agent forgetting or incorrectly listing files
  2. **Git diff approach**
     - Use git to detect which files changed
     - Generate the deployment scope deterministically from the changed files
- The main desired change is:
  - The agent should implement changes in a clearly scoped place
  - Deployment should operate from that scoped set of changed artifacts instead of relying on fragile manual file references
- We also called out a major deployment caveat with **SDF account-specific values**:
  - Exported objects may replace real IDs with `account specific value`
  - Reimport can then fail
  - This especially affects scoped script deployments and parameters with specific record references
- Additional verification needed for deployment:
  - Whether NSGM can surface those missing IDs
  - How consistent or inconsistent that SDF behavior really is in practice

## Attachments
- (none)
