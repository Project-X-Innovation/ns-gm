# Ticket Context

- ticket_id: cmnqr8lkk000hiq0usgmitppy
- run_id: cmnrnux2g00ftiq0u170yikyj
- run_branch: helix/ticket/cmnqr8lkk000hiq0usgmitppy
- repo_key: ns-gm
- repo_url: https://github.com/Project-X-Innovation/ns-gm.git

## Title
NetSuite Execute Mode With Approval Research

## Description
Okay, this is the second big mode feature. Buckle up, fill up your coffee, do some push-ups, and let's dive in. 

So what is the point of execute? It goes as follows: We spend a lot of time manually entering things into NetSuite. For now, we'll keep the feature scoped to just the NetSuite. Maybe one day we'll bring it into other contexts, but for now we can scope to NetSuite.

The idea is that users spend a lot of time manually entering data into NetSuite. Entering, saving, editing, entering, saving; they have to look up data, change it in some way, enter it in. It takes a long time. NetSuite is slow; human enterings are slow; it's a pain. 

So the idea is you just describe to Helix NetSuite what you want. Make an order that does this and this and this and this with this and this and this item for this and this and this customer. Helix, together with ns-gm, codebase awareness, and historical knowledge, will figure out what exactly the best way to do this is and get it done. It's quite brilliant, actually. Instead of saying, "Oh yeah, that customer was missing a line on the invoice," you then have to look up which customer or which line. What happened? Was it right? Was it wrong?

Right now with Helix, you just say, "Hey Helix, check out that invoice and propose changes for what it should look like with the changes done," and NSGM gets the history. You have ticket history. You have NetSuite history with NSGM. You have access to their different code bases and customizations in NetSuite, and you have all of this. You can really do a solid job at figuring out what work needs to get done, and then NSGM can script anything. NSGM is really what we call God mode for a reason. It can just create any record and run it, and so let me, that's all the easy part. Well, obviously it's not so easy, but that's the relatively easy part here. 

Here is the hard part. 
I don't think users are quite ready for autonomous agents making changes to their number one source of truth record-keeping software without approval. And so the real challenge here is setting up a system of approval that leverages what we know about NetSuite, that leverages all the scripts and possibilities that you have in NetSuite to make the most seamless, adorable, lovable, frictionless approval process possible. 

At this point, we cannot give the ability to an agent to make production write or edit changes in NetSuite; it just won't fly. All real live changes must be deployed by a deterministic program that a human can approve of. The flow will be something like:
1. The agent gathers research (read-only production access is fine).
2. The agent proposes the script to be run, which gets translated to human speak.
3. The human can approve it, and then it will run.


Another question is: how do we get to the stage where, without having it run, we are sure about the changes and they can be approved?

I thought of one way. I'm going to tell you the way that I thought about doing it, but I want you to brainstorm maybe five or six competing other ways that may be better and then weigh all the pros and cons. I'll tell you one way so you have a baseline. 

Here's how I would do it. User puts in the task that needs to get done. Agent, with read-only NSGM prod among other tools, including code-based access, does the research and comes up with a potential plan. Now we don't know at this point what the exact effects of the potential plan are, so we can't also expect our user to understand the potential effects. Our users may not be programmers of Helix NetSuite. Helix, normally yes, but Helix NetSuite, they can just be admins. The question is how can we show them the effect so that they can approve it meaningfully? Here's how, here's one way that I would suggest. You have a before submit script that, when a transaction or record is being saved or submitted or edited by Helix, it checks and sends a request to the Helix mainland for approval. If this exact transaction with these exact changes has been approved, we're already in the before submit state. It can compare the previous transaction and the current transaction. Feel free to look up all NetSuite documentation using contact seven or any other approach necessary, but back to the plan.

The before submit script catches every transaction from Helix and sends a request to Helix Mainland to see if this has already been approved. This does two things: it covers two cases.
- If it has already been approved, then we just go right ahead. In that case, we know it's been totally approved, and Helix can go and make those changes.
- In the case where it hasn't been approved, it prompts the user to approve. We can know who submitted the request, and because it's in a before submit, we already know all the changes that are going to happen. We know what the new record was going to look like, and we know what the old record looked like when it's an edit or transform. Therefore, we just need to come up with a very clever, creative, I'm sure this will be a long project, UX for allowing them to submit and approve the changes.


Technically, every time there is an execute request, Helix won't run any scripts. Helix prepares the script; it gets given to a deterministic program that runs it in NetSuite. The first time, it'll always not have been approved, so it'll always fail, but an approval request will show up in the Mainland Helix for that user. That user, in the meantime, the first submit disappears; that fails. There's no approval, but it sends the approval request. We don't want them waiting in real time because of a timeout, but that one is just kind of a trial run; it's just a trial run to get the outcome.

Now that we know the outcome, we can get it submitted for approval. The user approves it. The first Helix can also check that the outcome was what he wanted. If it's not the outcome that he wanted, he can try resubmitting to the deterministic program a new script. The first one always fails because there hasn't been approval; any unknown outcome fails because there's no approval, but we capture the expected outcome, and now we can get approved. Once he looks satisfied with it, it gets sent to the user for approval in Mainland Helix; now he is waiting. Once it's approved, Helix runs it again, and once it reaches the before submit, we see the approval record does actually exist for these exact changes, so this solves many problems.
- Number one, there's always a "dry run" which captures the expected changes; it's always going to fail, but now the changes are captured, and the user can approve them. Helix can approve them, and the user can approve them.
- Once Helix approves them, they get sent to the user for approval.
- Once the user approves them, Helix can have the script re-run by the orchestrator or the deterministic program, and once it reaches the before submit, it makes a request and sees that these exact changes have already been approved by a human.

I think this can work. It's just one idea. 

I want you to brainstorm this idea and maybe four or five other ideas using all of the available NetSuite infrastructure. Weigh all the pros with all the cons and come out with the best option that does what we need to do, which of course is being able to make any change in NetSuite using speech, using natural language in a very safe, approved manner.

## Attachments
- (none)
