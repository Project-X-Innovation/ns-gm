# Ticket Context

- ticket_id: cmnqrdomm0015iq0u8l5jfzds
- run_id: cmnrxn4tb002ahu0uwjeyho1t
- run_branch: helix/ticket/cmnqrdomm0015iq0u8l5jfzds
- repo_key: ns-gm
- repo_url: https://github.com/Project-X-Innovation/ns-gm.git

## Title
Monitoring with Auto Solve (Both NS and normal)

## Description
This is a ticket for Helix Global client and server. The functionality must cover both Helix NetSuite and Helix Global. I have included ns-gm and Helix HLI for reference; however, you can suggest changes to both of those as necessary, no problem.

This is a major feature, so get ready. Put on your seat belt, fill up a coffee, do your push-ups, take a seat back, relax, because we're about to get started. 

For both Helix NetSuite and Helix Global, we build features, we make bug fixes, we deploy, we test and preview our staging or sandbox environments, and we deploy to production environments. They have this all in common. What they also both have in common is access to runtime logs and runtime database through Helix CLI and NSGM. 
It happens very often that we deploy a new feature as an MVP or we deploy a bug fix that gets part of the way there, and for whatever reason it's not totally done. Of course it's not; for whatever reason, it's for good reason. You can't expect everything to be right on the first try. Very often we throw things out there. We see how they perform. They get part of the way there. That's part of the normal process of building software. 
Now that we know this, we can build with this in mind when doing a bug fix or creating a feature. We can actively monitor after deployment in the production environment for feedback. We can actually monitor and say, "When I see these logs or when I see these records, I know it's working properly." When I see this and this and this, I know it's working properly. On the contrary, if I see these error logs or I see this situation in the database, I see this situation evolving, I know I still have problems. I know something is not quite right. As long as we put in good logs in both NetSuite and normal, this can be a very powerful concept. 

And so here's the idea: whenever a build or fix ticket is created, there is an agent. I don't know if it should be a new agent or an old agent. Here's the concept, and then we'll work through the implementation.

Whenever there's a new feature or bug fix built, there is a monitoring plan agent. Some agent functions as the monitoring planner that says you should be looking out for these positive logs or situations, and then it's working correctly. You should be monitoring for these negative logs and negative situations, and then it's not working. There is, of course, a grey area in between where we don't see the positive logs and we don't see the negative logs, so keep that in mind. Now this monitoring agent, the monitoring plan agent, has to first of all coordinate with someone who can write code and put these logs in the code. This monitoring agent has to persist its plan while it's in preview mode up till deployment, because again the plan only goes into effect in production, so it has to be ready and waiting while the ticket stays in sandbox or staging until it's deployed. And then finally there has to be an actual monitoring agent that regularly consults the production environment, the production runtime, for these clues, for these situations, for these logs, and is able to say "check passed", "x failed", or "we need to wait". In the event that there is a failure, the monitoring agent should right away create a ticket with all the relevant information and pass it in to Helix to fix it. There is another ability hiding here to create, on special occasions, tickets. 

So, here is the whole flow:
1. When creating a fix or building something new, a monitoring planning agent comes up with all the scenarios: the good scenarios, the wait scenarios, and the bad scenarios, based on logs that will have the implementation agent put in, based on situations that can arise from the data.
 All of the tools are available, anything that NSGM or Helix CLI can do or can be augmented to do.
 Brainstorm all the different kinds of things you might want to monitor.
 Be as creative as possible.

Once the plan is in place and the pieces of the plan, the logs, etc., are in place, the plan goes into hibernation until deployment. Once it goes into deployment part two, I guess part two is the hibernation, and then part three is when the monitoring plan goes into action.

There's some system where an agent can monitor the production environment, take it in, analyze it, and see whether it's a check success, whether it's not enough information yet, and whether it's a failure. Again, failure can be from lack of good information, but failure 
And then part four is the resolution. If it's a success, I don't know how exactly that looks, but you can brainstorm some options for what a success means. A feature is considered good; it goes off the monitoring board, and it's considered a success.

On the contrary, if it's a failure, of course it stays on the monitoring board, and immediately Helix makes a new ticket, either immediately or Helix decides to wait a little bit to gather more information. It creates a ticket to fix the problem. That new ticket augments the monitoring plan. Maybe it's the joint monitoring plan. Maybe it's a second monitoring plan. Maybe the second monitoring plan replaces the first. You can branch them out as options, but Helix automatically puts in a ticket that has a fix, and the monitoring continues. 

So as you can see, this is a very large, important feature. Relax, go for a walk in the park, brainstorm it. Think of maybe four or five different ways of doing this. There are many mobile parts, but it should be very frictionless. It should be easy. It should be frictionless. It should be intuitive. It should be cute. It should be slick. It should be smooth. It should be helpful.

Take your time, relax, think of a few different ways, think of all the things that go right and all the things that go wrong, and come up with a good plan for this feature.

## Attachments
- (none)
