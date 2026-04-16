# Ticket Context

- ticket_id: cmnqrav11000riq0ulpbzg8mk
- short_id: RSH-174
- run_id: cmo1qixgh00e4ht0u3bome86r
- run_branch: helix/ticket/cmnqrav11000riq0ulpbzg8mk
- repo_key: ns-gm
- repo_url: https://github.com/Project-X-Innovation/ns-gm.git

## Title
Helix NetSuite: Creating Items that will be deployed to production

## Description
Another major feature, so get ready. Relax, get your coffee filled up, take a sip of that steaming hot brew, get your thinking hats on, and let's go. 

This is specifically for Helix NS. Currently, all Helix NS can do is make changes to scripts and have them uploaded. This is very limited, as you can imagine, because it can't even create new scripts, deploy them, or create new script deployments. It can't create custom records. It can't create custom fields. It can't do any of that, so all I can do is make actual code changes and upload the files. Can't even make new files and have them deployed. 

That's simply because the only current mechanism Helix has for making any changes is file upload. 

However, of course, as you know, you can research the NetSuite docs using Context7 or any other method. As you know, there are other ways of programmatically making changes to NetSuite. I think primarily the Suite Cloud development framework, but of course research all available options. 

So really, Helix needs to be able to create all complete customizations end-to-end:
- Create new files
- Create new script records
- Create new deployments for those script records
- Create new custom fields
- Create new searches
- Create new everything


Everything that is required for a total customization end-to-end. If I say I need a license management customization, I'll likely include a whole bunch of custom records, several scripts, several possibly a Suitelet, possibly a SPA, possibly user event scripts, all sorts of different scripts and customizations working together. 

Now, of course, this can be done theoretically using ns-gm, and look at the research that we've done. On execution, it'll certainly be able to be done with ns-gm; however, the challenge with using ns-gm to do it is that it later has to be deployed to production. Of course, the whole point is to get it deployed to production. If you can recreate everything in sandbox, the hard part is going to be figuring out how we get that into production. I think that's where the Suite Cloud Development Framework comes in. 

So that's the plan: to give Helix the ability to be able to build any kind of NetSuite customization with any custom records, custom fields, deployments, script deployments, new files. Of course, all of these need to be able to be made in Sandbox, verified, and then deployed by Helix. Helix has to have a plan for deploying these as well.

## Attachments
- (none)

## Continuation Context
Them: So regarding parity. Yeah. Because for Helix to make any change to some sort of object or whatever it may be, it needs to have  
Me: Yeah.  
Them: the object How else is it going to make edits  
Me: Yeah.  
Them: on something it can't see? It can't just create a whole new one. And then try pushing it and replacing it. It'll it'll miss it'll miss a ton of stuff.  
Me: Yeah. It might be able to see some stuff, but  
Them: So  
Me: without the XML, you won't be able to change it.  
Them: yeah. I think so.  
Me: I don't think there's a script  
Them: So that  
Me: way of changing stuff.  
Them: So that means that we have to we either have to one possibility is that we we have to make, like, a tool that is really confined and that will allow it to kind of do, like, list and object import.  
Me: Mi Yeah, I think it it could be don't know. Let me let me know how that this sounds. Right? For n s, tickets, right, we could have, like, an optional parity parity resolution phase. And so at that stage, if we find that there's something on production that is not on Sandbox, because that's kinda easy to do. I think we we've seen that. Right? It goes and says, okay, there's a feeling production. It doesn't seem to be, you know, on sandbox, like, available on sandbox and stuff. So I think it can recognize those situations when when they when the with the tools that it  
Them: I think I think this issue is  
Me: has. But it  
Them: I think this issue is one level up. What can it do at all if it doesn't have the object dot XML? What can it do?  
Me: Right. Right. It it won't Right. Right. It it won't be able to act, you know, to to to do anything. So I I guess it could be like an intermediate optional phase, if there's like a a parity issue In that phase, we can do we could do something like  
Them: It's not even a pair of anything. It's not even a parody thing. It's it's it's do anything. What can it do? What can it do if it doesn't have access to the object? What can it do at all?  
Me: True. True. True. True. True. True. True.  
Them: It can't do anything. Can't do anything. Even even this evening.  
Me: Yeah. Yeah. Yeah. It is right. It is right.  
Them: If there wasn't a parody, what it'll be like, what? I'm gonna create a whole new object for  
Me: Yeah. That's true. That's true. Yeah. You will need to pull them. Yeah. Okay. So yeah.  
Them: it doesn't even know.  
Me: You're right. Like, we need to be able to, you know, to to list not, like, pull everything because it's a bit unrealistic, but you know, to to list and to to let it choose exactly what it needs you know, and pull them to start working.  
Them: It could be it could be a very confined tool that, one, diagnosis Implementation plan implementation has encoder view Because it should be very, very, very confined tool that will give you SuiteCloud  
Me: Okay.  
Them: production All you could do is object list. And all you could do is object import.  
Me: Importé  
Them: So it's like, boom. Go production check. Boom. I need to go check. I need to go check. Extremely, extremely confined tool. In that way, we now give it access to go figure out whatever there is and pull in an object that it needs to work on.  
Me: Right. Then it shouldn't be dangerous because on on all those phases, before deployment, right, you should be able to only list and pull. Right? During implement... At least for production. List and pull for production. Up until the actual deployment of production. And for Sandbox, right, it should be able to push this, if needed, right, this at least the missing objects. Right? Because that's what we want. We want to to push the the production version to to staging. That's what we do with the with this scripts. Yeah. That's what we do with scripts too. Yeah. So so okay. So if it doesn't have it, if if if it doesn't exist on Sammox, yeah, at that point, push them. I think that's something that we can we can know, that we can identify. And I think it won't be the majority of cases. So let's just pull them from production, work, and then push them to sandbox right, when when deployment happens, and that's it. Like, I'm I'm and now that I'm saying it, like, we don't even have to know that there's a parity issue. Right? Because you're pushing it either way. If it exists, you just push the updated version. If it doesn't need any change, you would push the exact same version that  
Them: That's fine.  
Me: already existed.  
Them: That's that's that's why I realized.  
Me: And if it exist, you are pushing it. So  
Them: Exactly. That that that's that's why I realized this  
Me: Okay.  
Them: that's why I realized this when when I was about to send a prompt because I was like, oh, what about the parity? But then I'm like, wait. We already do from anyways. We start from production.  
Me: Yeah.  
Them: So okay. Okay. So creating this, like, really, really confined tool, then okay. Interesting. Okay. So and then and then in that little process, that tool, what it could do is it could you could have this is the tricky part. Right? It's like in the tool, whenever you use it, do you set up SDF and then the production and then just remove it right after? Or do you, like, or the whole the whole workflow you just have SDF production available, and you block everything from  
Me: I think that's what I think that's what we do right now. Right? We set up first of all, we set up STS for production to pull everything. And so the sandbox already has the even the account setup. But the agents are not allowed to to call, you know, these these commands, and I think that's the security we have. Yeah?  
Them: In now,  
Me: Right now. No. No. No. Exactly.  
Them: Isn't that crazy that we did that that we're just lucky that the the agents decided not to do anything, but  
Me: Yeah.  
Them: like, be rogue or whatever. But they they technically  
Me: Well, I mean,  
Them: can go and do whatever they want in production.  
Me: Well, I mean, like like we said the other day, if there's, like, you know, malicious intent, they could do it either way, because we are rocking Suitecloud whatever, but they could do, like, no x execute. And put the SuiteCloud command inside that  
Them: Yeah. Yeah. Yeah.  
Me: that will effectively bypass the whole thing. Maybe we can do, like, something more a bit more robust  
Them: Oh, well, no. I mean, they they would have to do that through Bash anyways.  
Me: Yeah. But, you know, I'm not sure what the the verification is, but as far as I understand it, we are blocking, like, Suitecloud dot whatever whatever. Right? If they do, like, node hyphen e, which is like execute, and then they put the SuiteCloud code inside it, I think maybe that works.  
Them: We reject it now. Reject the Suite Cloud. They have to do that through Bash.  
Me: Okay.  
Them: Right? Right?  
Me: Okay. Yeah.  
Them: Like, the node node execute thing, you have to do that through Bash.  
Me: Yeah. Correct. But are we are we able to filter that?  
Them: In batch, we're using a rejects on the batch, I think.  
Me: Okay. Okay. It's at Okay. Okay. It's a reject. So it finds it whatever it is.  
Them: Yeah. Yeah. Yeah. Yeah.  
Me: Right? If it's at at the beginning or where okay. Okay. So perfect.  
Them: I'm pretty sure that's likely.  
Me: So in that case, we're we're safe then.  
Them: Yeah. I'm pretty sure that's exactly what the Parker did. Yeah. Yeah.  
Me: Maybe we want to verify.  
Them: Okay. So this  
Me: Maybe we want to verify that, like, at some point. Right?  
Them: sorry? Yes. Yes. Yes. Yes. Yes. So okay. This makes sense. So we should give the we should give the ability to we should do that tool. And then, also, we should we should really be strict on the SuiteCloud stuff. I mean, we kind of were comfortable with what we have now, but we should we should literally make it now we should make this a tool.  
Me: Yeah.  
Them: We should make this a tool now where like, no. You're you're this is very, very, very, very specific.  
Me: Yeah. And there's a few other things. Right? Like, for example, on scouting phase, I think we have, like, a a section or or some something on the prompt. For it to go scouting on production. But, also, it it does some scouting on Sandbox. Right? It goes and says,  
Them: Nope. It  
Me: no, like, nothing. It's all on production. Okay. So  
Them: All production.  
Me: perfect. That works. Because then we can say, okay. The relevant fields are, you know, this one and this one and this one, Obviously, there's scripts that are relevant, but there's also, like, objects that are relevant. And we put those on some kind of, like, array, right, and some kind of artifact, and then at some point, we use the tool to pull only the objects that are relevant. And so you don't have to pull everything, but you pull, like, the five, 10, 15 fields that are relevant for this implementation, and that that way you can just push them to to sandbox and so  
Them: Yeah. Yeah. Because because the scout the scout is going to be able to use this  
Me: Does that make any sense? Exactly. Exactly.  
Them: object list tool. Yeah. And then and then we'll we'll put it in the scout summary. And diagnosis summary, whatever summaries it needs. We'll make it put a list like, we have files changed, but we'll make it put a list of what  
Me: Yeah.  
Them: you know, files, like objects objects, like, important objects, important whatever.  
Me: It really does. It already does. Something like that. Right? It says, like, okay. This is relevant to, you know, this custom field, this custom field, and this other custom field. Because it's that's needed for the for the scripts. But now that we have that list, we could say, okay. But also fool the objects too. Right? And and have
Cross reference this helix-global-server/docs/guides/claude-agent-sdk-typescript-ref.md
