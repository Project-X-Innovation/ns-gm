# Ticket Context

- ticket_id: cmnq8vdqm001omi0tnsmyha9k
- run_id: cmnq8vdqv001umi0t4ccd0yoo
- run_branch: helix/ticket/cmnq8vdqm001omi0tnsmyha9k
- repo_key: ns-gm
- repo_url: https://github.com/Project-X-Innovation/ns-gm.git

## Title
Modes Concept: Build, Research/Report, Fix, Execute

## Description
I want to introduce the concept of multiple modes or types for Helix tickets. Right now, Helix just builds features and fixes bugs. We don't really have any different flow for that, but it would be nice to see that Helix can recognize us. That's two modes we already have.

I want to introduce two more kinds:
1. Research/report mode: I think for helix normal we can call it research, and for helix NetSuite we can call it report. I think those names will sit with the intended audience.
2. For NetSuite only, we have an execute mode. Execute mode will actually do things in NetSuite, which is not relevant for Helix Global.
 
There should be a cute way of selecting, when you put in a ticket, what mode it should run in. The default should just be auto, and it'll figure it out. For now, we don't really have any way of figuring out what mode it is, and the other modes besides build and fix have not been implemented. I would just have a cute way on the ticket of selecting the mode: auto should be default, and build and fix are available but are meaningless at this point. Report/research coming soon, and Execute for NetSuite coming soon. 

There should be a cute way, when you see a card in a list page or on a board, of knowing its type. I think colors are already taken, for if you would use green, orange, red, yellow, this already could mean running, done, error, etc. I think maybe a small icon, a cute little icon, subtly placed on the card, and of course on the ticket page, would get the message across in a cute, subtle way. 

For now I'm just introducing the plumbing and concept. You don't have to worry about how we're going to figure out what kind it is. If it's at auto, just leave it in auto, even though that's not really a type. Later you also don't have to worry about implementing Research Report or execute mode. Those will be further tickets that I will put in. It's just getting the UX nailed down. In a future ticket, we'll have to do different things for the different modes, like:
- Research will not make any code changes but will produce research artifacts.
- UX will have to be taken into consideration in the future.
- There will be flows for things that don't get saved to GitHub, no code, just other artifacts.
- Execute has a whole different flow already.


These are all future considerations. 

Future notes:
Build and fix are current
Research/Report for both
Execute only for NetSuite 

Default Auto but can select 
Agent must figure out and classify

Report and Execute are new
Build & Fix may or may not be the same

Everything should more or less move through the same agent structure besides execute

Execute (NetSuite) should run in real time and needs HITL (unless preapproved) but that's a whole topic 

Research/ report mode that just produces artifacts instead of code.

This is a Helix Global Server and Helix Global Client ticket. I have only included the NSGM and the HelixCLI repos for reference.

## Attachments
- (none)
