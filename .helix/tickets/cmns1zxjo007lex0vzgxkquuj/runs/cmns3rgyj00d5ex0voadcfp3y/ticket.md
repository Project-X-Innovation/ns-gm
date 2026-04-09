# Ticket Context

- ticket_id: cmns1zxjo007lex0vzgxkquuj
- run_id: cmns3rgyj00d5ex0voadcfp3y
- run_branch: helix/ticket/cmns1zxjo007lex0vzgxkquuj
- repo_key: ns-gm
- repo_url: https://github.com/Project-X-Innovation/ns-gm.git

## Title
Proxy Module Research

## Description
Can we dig in further to the proxy modules.
Do we have to implement modules that just capture the users input? Then we don't actually get the real result.
Can we somehow hijack what actually gets sent to NetSuite? We must have access to the modules

## Attachments
- (none)

## Continuation Context
I understand how the proxy works. I understand that you're suggesting we inject a module with the same name and the same methods so we can see the inputs past that. Can we do better than that? Can we somehow keep the NetSuite module, not our own version of the module, all the code that actually runs in the NetSuite module, but just hijack it at the end when it sends it off to NetSuite? Grab that, and that way we can see what NetSuite actually gets. It doesn't have all the side effects, like the scripts that run, but it's not just the user input; it's what NetSuite actually gets after it runs its own version of the modules.
