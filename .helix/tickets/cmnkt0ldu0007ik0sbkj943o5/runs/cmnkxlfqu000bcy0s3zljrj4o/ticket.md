# Ticket Context

- ticket_id: cmnkt0ldu0007ik0sbkj943o5
- run_id: cmnkxlfqu000bcy0s3zljrj4o
- run_branch: helix/ticket/cmnkt0ldu0007ik0sbkj943o5
- repo_key: ns-gm
- repo_url: https://github.com/Project-X-Innovation/ns-gm.git

## Title
Pulling it all together and polishing up Helix Setup for NetSuite

## Description
This is a continuation for the Easy Setup for Helix. The work should be done in Helix Client and Helix Server. I am only including the NSGM package for reference. 

Previously, there were two runs on making this easy setup. Some of the missing pieces were knowledge of NSGM and how it works, in particular the restlet. 

There was also a question about the permissions. In production, NSGM should have read-only access to everything. In Sandbox, it should have admin access. 

Ideally, there should be a UI in the Helix Client that lets you set this up with as little work as possible. I don't know what is the minimum amount of work to be done, but you should think about what are the minimum steps. I'm assuming there has to be at least one thing done in NetSuite, but maybe not; maybe nothing has to get done. Either way, it should be the minimal amount. Everything that can be done through scripts should be done through scripts. Think about it, come up with a coherent plan, and brainstorm what the minimal effort is. 

Additionally, there should be very clear documentation on:
1. First of all, the setup: there should be user-facing documentation on the setup, and then there should be developer-facing documentation on how each aspect that is currently done manually became automated.
2. In particular, all the various different kinds of access and credentials, whether it's SDF, whether it's NSGM, whether it's tokens, all the different ways that you need access, how they're managed, and how we automate the process of getting those credentials. It should point out how everything is automated, and whatever is not automated should explain why it cannot be automated and that is there.
3. It should also explain how things can be changed in the future: if there are new records, if there are new scripts, if there are new permissions, new authentications, new ways of doing things, what is the way to update? This install, this easy install.


Again, user-facing documentation that explains how to do it, and developer-facing documentation explaining how everything is done, how it is automated, which part of access control, which part of access is done by what, and how it is automated, and how to add future changes. 

I previously referenced something called Sweet Flow. I meant the Suite Development Framework. That was a mistake. 


In the future, we plan on adding more functionality. In particular, there will be user event scripts. There will be a production version of NSGM that has different kinds of access. You don't have to do anything about that, but leave notes on how to incorporate those elements.

## Attachments
- (none)

## Continuation Context
See if you can automate it even further. See if you can come up with good ideas to make the process even smoother.

As a very small side note, the set-up doesn't need its own menu item. Better if it can be accessed from the settings page.
