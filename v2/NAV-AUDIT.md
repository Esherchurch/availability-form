# How the original site is linked, compared with v2's menu

Read on 8 Oct 2026 by the reviewing window from the live original portal (`EGBCWorship&AV.html`, signed in as Martin) and from the code. Read only; nothing was changed.

## 1. The original portal's menu (what the church actually uses)

The sidebar of `EGBCWorship&AV.html` is built from the `portal/menuItems` data and is the same for everyone:

```
Dashboard                       (the portal's own landing page)
Rota                            view-only-rota.html
Worship & AV                    Worshipteamcharter.html
    Worship                     (heading)
        Play-Through            EGBC-PlayThrough.html
        Worship Training        EGBC-Training-Worship.html
            Music Databases     (heading)
                Music Database  Library.html
                Music Uploader  batchupload.html
    AV                          (heading)
        How-To AV               EGBC-HowTo-AV.html
        AV Troubleshoot         EGBC-Troubleshoot-AV.html
Youth                           Youthcharter.html
    Youth Service Planner       youthserviceplanner.html
Resources                       (heading)
    Idea's pin board            stickynotes.html
    Apps and downloads          hubresources.html
```

**Not in that menu.** These are reached from inside another page, from the installed phone apps, or from SharePoint:
- **The Core Team tools:** Rota Planner, Sunday Service Planner, Address Book, Email Builder, Music Uploader, Inventory, AV Schematic, Monitor Setup and the Availability form.
- **Pages opened from inside a tool, never from a menu:**
  - `sundayplannersonglibrary.html` (the cut-down song library): the Sunday Service Planner's "songs database viewer" button, CoreTeamApp, youthapp2, the Youth Service Planner
  - `song-summary.html`: from the Sunday Service Planner
  - `Serviceplannerinstructions.html`, `rotaplannerinstructions.html`, `emailcompilerinstructions.html`, `uploaderinstructions.html`: each from its own tool
  - the training copies: from `trainingportalhub.html`

There is also a root `hub.html` with tiles per team. Martin's team uses the portal above, so that is the reference for how things are linked.

## 2. v2's Menu today (Martin, master admin)

The Menu has these groups:
- **Apps:** EGBC Hub, Rota Planner, Service Planner, Youth Planner, Availability.
  - These are the pages that can be installed as phone apps, but in the Menu they are plain links.
  - Rota Planner, Service Planner and Availability appear **again** under Core Team.
- **Everyone:** Rota, Idea's pin board, Team Resources, Team Videos, Meetings, What's on.
- **AV:** How-To AV, AV Troubleshoot, AV Infrastructure Mapper, Monitor Setup.
- **Core Team:** Email Compiler, Rota Planner, Sunday Service Planner, Address Book, Music Upload, EGBC Inventory, Availability Form, Backup & Restore, Places, Events.
- **Worship:** Play-Through, Worship Training, Music Database, Music Uploader, Apps and downloads, **Song Library - quick view**, **Song Summary**.
  - The last two are pages opened from inside the Sunday Service Planner, not menu items.
- **Youth:** Youth Service Planner.

The hub's sidebar has **"Worship & AV Hub (old)"**, a v2 copy of the original portal page. The word "(old)" is confusing.

## 3. v2 pages that send people back to the original site

**44 links in 20 v2 files** are full addresses to the original site (`https://esherchurch.github.io/availability-form/<page>.html`, without `/v2/`). Clicking one in v2 leaves v2 and opens the old page. Examples:
- the Sunday Service Planner's song library, song summary, Play-Through and instructions links
- the Rota Planner's instructions
- the Email Compiler's instructions
- the training portal's four tools
- the Youth Service Planner's uploader and song library

Find them all with:

    grep -o "https://esherchurch.github.io/availability-form/[A-Za-z0-9_%&?=. -]*" v2/*.html v2/*.js | grep -v "/v2/"

Inside v2 these must be relative links (`sundayplannersonglibrary.html`) so they stay in v2.

**The exception is a link inside an email.** That needs a full address, and it should be the v2 address, with care that the original site keeps sending its own.
