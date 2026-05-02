# SL Claude HUD - Project Handoff Document
**Last updated: May 2, 2026 - REALai concept defined, Pastebin handoff system built**
**For: New Claude conversation continuity**

---

## How to use this file
Paste this file at the start of a new chat and say /handoff to resume the project.

---

## What is this project?

A personal AI assistant HUD for Second Life. A mesh iPad object attached to the SL viewer UI lengthwise (landscape orientation) that displays a claude.ai-style chat interface via media-on-prim, and listens to local chat when "chat mode" is active to send messages to Claude via the Anthropic API.

This HUD is now the foundation of REALai Standard — the second tier of the REALai product line (see below).

Personal-use only for now - just for Adi and Qie. No marketplace release yet.
Second user: Qie (experienced LSL scripter, collaborator on Cielomar project). Qie has his own HUD using the same relay with his own API key.

---

## REALai - The bigger picture

REALai is the commercial product line being built on top of this HUD project.
It is currently #1 priority above Flake and Cielomar.

### Product tiers

**REALai Light**
- Drop script (no modify) + settings notecard
- Runs on free Gemini API, no API key needed
- Optional settings notecard: name, about me, about user, location
- Also sold as animesh character packages with built-in animations
- One-time purchase, no ongoing fees

**REALai Standard** (this HUD is the foundation)
- Long term memory and continuity via notecard-based handoff system
- Runs on free Gemini or personal Claude API key (user choice)
- Comes as drop script for any object, or alt-bot pack for SmartBots (sold separately)
- One-time purchase, no ongoing fees
- Optional add-on: Claude Sync — GitHub-based handoff sync between relay and Claude app, no tokens needed, uses Pastebin generator to update files, requires personal Claude API key, one-time fee

**REALai Pro (BYOK)**
- Full Standard feature set plus extensions marketplace
- Personal Claude API key required
- Works as HUD, alt-bot, animesh or any object
- Multi-instance, Developer Kit available, Claude Sync included
- One-time purchase

**REALai Pro (Managed)**
- Full Pro feature set, no API key needed
- We handle all backend infrastructure
- Automated Claude Sync included
- Weekly/monthly subscription + pay per use

**Extensions marketplace (at launch)**
- Developer Kit
- Region Greeter
- Store Manager / Customer Support
- Host / Event Assistant
- RP Character
- Estate Manager
- Companion

### Business notes (private, not in Qie doc)
- Light revenue funds Standard infrastructure
- Pro BYOK is pure margin after sale
- Pro Managed subscription covers server + API costs + commission
- Pricing strategy TBD, kept between Adi and Claude for now

---

## Key design decisions

- Input: LSL listens to channel 0 (open local chat) when chat mode is active. No channel prefix needed
- Display: Media-on-prim on face 4 shows hosted webpage. Display only - clicks don't register on HUD
- Mesh: iPad mesh, attached lengthwise (landscape). Screen = face 4, button = face 0 (frame face)
- Button style: Very dim warm white glow when active (0.02 glow), nearly invisible when idle
- Settings: Notecard named Claude_Settings. Read on attach, stored with llLinksetDataWrite()
- Quick toggles: llDialog() menu - toggle history, clear session, re-read notecard
- URL persistence: Timer checks every 10s but only reapplies media if URL is empty (not just different)
- Visual style: Bright theme (#f7f5f2 background), claude.ai-inspired, font size 40px
- Webpage rotated -90deg for landscape iPad orientation
- Webpage pings /ping every 10 minutes to keep Render alive and session in memory

---

## Tech stack

Component        | Choice
Relay server     | Node.js, deployed to Render free tier
Chat webpage     | Hosted on Render (same project)
API              | Anthropic API (each user's own key, stored in notecard only - never in chat)
LSL storage      | llLinksetDataWrite()
Settings input   | Claude_Settings notecard + llDialog()

---

## Settings notecard fields

api_key = sk-ant-...
channel = 0
history = true

---

## Relay server - DEPLOYED AND WORKING

### Location
C:\Users\adi\sl-claude-relay\server.js

### Live URL
https://sl-claude-relay.onrender.com

### GitHub
https://github.com/LolySL/sl-claude-relay

### Endpoints
- /chat - receives messages from LSL, calls Anthropic API. Detects [HANDOFF]...[/HANDOFF] tags, strips content, stores in pendingHandoffs, returns "Working... ready."
- /poll - webpage polls for new messages by avatar UUID
- /latest - webpage calls on load to get avatar UUID
- /sethandoff - fetches handoff .md from GitHub, sets as system prompt, clears session
- /clear - clears session history, system prompt, pending and pendingHandoffs
- /gethandoff - webpage retrieves stored handoff content (consumed once)
- /pastebin - server-side Pastebin POST using PASTEBIN_API_KEY env variable, returns URL
- /ping - health check, also pinged every 10 minutes by webpage to keep Render alive

### Model
claude-sonnet-4-6

### History limit
20 messages

### Notes
- Render free tier cold starts - first message after idle may time out, second works
- Webpage keep-alive ping prevents cold starts during active sessions
- Dependencies: express, cors, axios
- PASTEBIN_API_KEY must be set as environment variable in Render

---

## Handoff system - DEPLOYED AND WORKING

### How it works
- Handoff .md files live in /handoffs/ folder in the sl-claude-relay GitHub repo
- Type trigger word in SL local chat while chat mode is active
- LSL intercepts as command, POSTs to /sethandoff with the project name
- Relay fetches the matching raw GitHub URL, sets it as system prompt, clears session
- Claude responds "Context loaded. Claude is ready."

### Trigger words
- #HUD - loads HUD.md
- #Cielomar - loads Cielomar.md
- #Flake - loads Flake.md
- #Qie - loads Qie.md (Qie's own handoff)

### Handoff file URLs
- HUD:      https://raw.githubusercontent.com/LolySL/sl-claude-relay/main/handoffs/HUD.md
- Cielomar: https://raw.githubusercontent.com/LolySL/sl-claude-relay/main/handoffs/Cielomar.md
- Flake:    https://raw.githubusercontent.com/LolySL/sl-claude-relay/main/handoffs/Flake.md
- Qie:      https://raw.githubusercontent.com/LolySL/sl-claude-relay/main/handoffs/Qie.md

### HANDOFF_URLS in server.js
const HANDOFF_URLS = {
  HUD: "https://raw.githubusercontent.com/LolySL/sl-claude-relay/main/handoffs/HUD.md",
  Cielomar: "https://raw.githubusercontent.com/LolySL/sl-claude-relay/main/handoffs/Cielomar.md",
  Flake: "https://raw.githubusercontent.com/LolySL/sl-claude-relay/main/handoffs/Flake.md",
  Qie: "https://raw.githubusercontent.com/LolySL/sl-claude-relay/main/handoffs/Qie.md"
};

---

## Pastebin handoff update system - BUILT, NOT YET TESTED

### How it works
- HUD Claude wraps updated handoff content in [HANDOFF]...[/HANDOFF] tags
- Relay detects tags, strips content, stores in pendingHandoffs object
- Only "Working... ready." appears in chat bubble
- Webpage polls /gethandoff after every poll cycle
- If content waiting, "Open in Pastebin" button appears in footer
- Button POSTs to /pastebin endpoint on relay (server-side, key never exposed)
- Relay calls Pastebin API using PASTEBIN_API_KEY env variable
- Pastebin returns URL, browser opens in new tab
- Full clean file ready to copy and push to GitHub

### What still needs doing
1. Add PASTEBIN_API_KEY to Render environment variables
2. Update system prompt to instruct Claude to use [HANDOFF]...[/HANDOFF] tags
3. Test full flow

---

## Shared activity log - DESIGNED, NOT YET BUILT

### The problem
Both Adi and Qie work on the HUD project. When either loads #HUD, there is no way to know who was last in, when, or what changed.

### Solution designed
When either user types #HUD, HUD Claude responds with:
"Last viewed by [name] - [date/time] - Changes: [description]"
Changes refers to script and code updates only, not general conversation.

### What needs to be built
- Log storage in relay (by project name, not avatar UUID)
- /sethandoff updates the log on each #HUD call with avatar name and timestamp
- System prompt instructs HUD Claude to ask "did you make any code changes this session?" before session ends, and relay stores the answer
- Log returned as part of the handoff confirmation message

---

## LSL Script - DEPLOYED AND WORKING

### Critical LSL rules
- No ternary operators - LSL does not support ? :
- No em dashes - use plain - everywhere
- No variable initialization with another variable at declaration - declare first, assign after
- Always provide full updated script, never partial edits with line numbers

### Face assignments
- Face 4: Screen - media-on-prim
- Face 0: Button - chat mode toggle (short press), settings menu (long press 3 seconds)

### Trigger words in LSL listen()
- #HUD, #Cielomar, #Flake, #Qie intercepted as handoff commands
- All other messages sent to sendMessage()

---

## Webpage - WORKING

### Location
C:\Users\adi\sl-claude-relay\public\index.html

### Current state
- Bright theme (#f7f5f2 background)
- Font size 40px
- line-height 1.5
- transform: rotate(-90deg) for landscape iPad
- Polls /poll every 1.5 seconds
- Pings /ping every 10 minutes to keep Render alive
- Thinking indicator (three animated dots)
- Status dot: grey = idle, green = active, orange pulse = thinking
- Font fix applied - double font-family declaration bug resolved
- Pastebin button added - hidden until handoff content waiting, appears in footer

---

## Git workflow

cd C:\Users\adi\sl-claude-relay
git add .
git commit -m "description"
git push

If push is rejected, do git pull first, then git push.
Render redeploys automatically after every push.

---

## People

- Adi: owner, builder, project lead, in-world deployment
- Qie: experienced LSL scripter (one of top 5 in SL, oldest residents), collaborator on Cielomar, has his own HUD on the same relay. His handoff file is Qie.md. REALai concept document sent for review.
- Claude (app): system design, code, documentation, handoff file maintenance
- HUD Claude: in-world assistant, project tracking, simple LSL help

---

## Important notes

- Adi is a skilled graphic designer and experienced SL builder/sim designer - trust her judgment completely on SL and design, no need to explain SL basics
- Adi has strong logical thinking and often arrives at the right solution herself - listen to her, don't just agree with her
- Do NOT end replies with next steps unless asked - Adi will ask when she is ready
- Do NOT agree with suggestions you know won't work - correct them clearly and immediately
- Explain code in plain language
- Always give complete files when multiple changes are needed
- API key in notecard only - never in chat
- Qie is an LSL-knowledgeable collaborator and second HUD user - his handoff is Qie.md
- Related projects: Flake (digital wallpaper marketplace, Firebase/React) and Cielomar Resort (SL boutique resort, Airtable/Wix/LSL)
- REALai is now #1 priority project - Light and Standard are the immediate focus
- Flake.art domain to be acquired once REALai generates initial revenue
- Use /handoff to update this document
