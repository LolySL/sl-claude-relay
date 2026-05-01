# SL Claude HUD - Project Handoff Document
**Last updated: May 1, 2026 - handoff system built and almost deployed**
**For: New Claude conversation continuity**

---

## How to use this file
Paste this file at the start of a new chat and say /handoff to resume the project.

---

## What is this project?

A personal AI assistant HUD for Second Life. A mesh iPad object attached to the SL viewer UI lengthwise (landscape orientation) that displays a claude.ai-style chat interface via media-on-prim, and listens to local chat when "chat mode" is active to send messages to Claude via the Anthropic API.

Personal-use only - just for Adi. No marketplace, no multi-user, no free tier.

---

## Key design decisions

- Input: LSL listens to channel 0 (open local chat) when chat mode is active. No channel prefix needed
- Display: Media-on-prim on face 4 shows hosted webpage. Display only - clicks don't register on HUD
- Mesh: iPad mesh, attached lengthwise (landscape). Screen = face 4, button = face 0 (frame face)
- Button style: Very dim warm white glow when active (0.02 glow), nearly invisible when idle
- Settings: Notecard named Claude_Settings. Read on attach, stored with llLinksetDataWrite()
- Quick toggles: llDialog() menu - toggle history, clear session, re-read notecard
- URL persistence: Timer checks every 10s but only reapplies media if it has actually dropped
- Visual style: Bright theme (#f7f5f2 background), claude.ai-inspired, font size 40px
- Webpage rotated -90deg for landscape iPad orientation

---

## Tech stack

Component        | Choice
Relay server     | Node.js, deployed to Render free tier
Chat webpage     | Hosted on Render (same project)
API              | Anthropic API (Adi's own key, stored in notecard only - never in chat)
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
- /chat - receives messages from LSL, calls Anthropic API
- /poll - webpage polls for new messages by avatar UUID
- /latest - webpage calls on load to get avatar UUID
- /sethandoff - fetches handoff .md from GitHub, sets as system prompt, clears session
- /clear - clears session history AND system prompt
- /ping - health check

### Model
claude-sonnet-4-6

### History limit
50 messages

### Notes
- Render free tier cold starts - first message after idle may time out, second works
- Dependencies: express, cors, axios

---

## Handoff system - BUILT, ALMOST DEPLOYED

### How it works
- Handoff .md files live in /handoffs/ folder in the sl-claude-relay GitHub repo
- Type /HUD, /Cielomar, or /Flake in SL local chat while chat mode is active
- LSL intercepts these as commands, POSTs to /sethandoff with the project name
- Relay fetches the matching raw GitHub URL, sets it as system prompt, clears session
- Claude responds "Context loaded. Claude is ready."

### Handoff file URLs
- HUD:      https://raw.githubusercontent.com/LolySL/sl-claude-relay/main/handoffs/HUD.md
- Cielomar: https://raw.githubusercontent.com/LolySL/sl-claude-relay/main/handoffs/Cielomar.md
- Flake:    https://raw.githubusercontent.com/LolySL/sl-claude-relay/main/handoffs/Flake.md

### What still needs to be done to deploy
1. The handoffs/ folder exists in VS Code project but is empty
2. Right-click HUD.md -> Open with -> Notepad, copy content, paste into the empty HUD.md in VS Code
3. Do the same for Cielomar.md and Flake.md when ready
4. git add . / git commit / git push
5. Update LSL script with new version (see below)
6. Render will redeploy automatically after push

### To open .md files
Right-click -> Open with -> Notepad. They cannot be double-clicked as VS Code has claimed them.

---

## LSL Script - NEW VERSION READY, NOT YET DEPLOYED

### Critical LSL rules
- No ternary operators - LSL does not support ? :
- No em dashes - use plain - everywhere
- No variable initialization with another variable at declaration - declare first, assign after
- Always provide full updated script, never partial edits with line numbers

### Face assignments
- Face 4: Screen - media-on-prim
- Face 0: Button - chat mode toggle

### New in this version
- /HUD /Cielomar /Flake intercepted as commands in listen() before sendMessage()
- g_handoff_request key stored to identify handoff http_response separately
- sendHandoff() function added

### llOwnerSay debug
Still active for Claude replies in local chat. Remove once display fully confirmed.

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
- Thinking indicator (three animated dots)
- Status dot: grey = idle, green = active, orange pulse = thinking
- Design changes still pending - Adi has ideas for next session

---

## Git workflow

cd C:\Users\adi\sl-claude-relay
git add .
git commit -m "description"
git push

If push is rejected, do git pull first, then git push.

---

## Important notes

- Adi is a skilled graphic designer and experienced SL builder/sim designer - trust her judgment completely on SL and design, no need to explain SL basics
- Adi has strong logical thinking and often arrives at the right solution herself - listen to her, don't just agree with her
- Do NOT end replies with next steps unless asked - Adi will ask when she is ready
- Do NOT agree with suggestions you know won't work - correct them clearly and immediately
- Explain code in plain language
- Always give complete files when multiple changes are needed
- API key in notecard only - never in chat
- Qie is an LSL-knowledgeable collaborator
- Related projects: Flake (digital wallpaper marketplace, Firebase/React) and Cielomar Resort (SL boutique resort, Airtable/Wix/LSL)
- Use /handoff to update this document
- Handoff files use Mermaid syntax for flowcharts in complex projects (Cielomar, Flake)
