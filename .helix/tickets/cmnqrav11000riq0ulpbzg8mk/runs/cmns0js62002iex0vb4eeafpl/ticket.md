# Ticket Context

- ticket_id: cmnqrav11000riq0ulpbzg8mk
- run_id: cmns0js62002iex0vb4eeafpl
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
