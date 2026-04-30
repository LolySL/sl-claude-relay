# SL Claude HUD — Project Handoff Document
**Last updated: April 30, 2026 (night — fully working iPad HUD, display confirmed)**
**For: New Claude conversation continuity**

---

## How to use this file
Paste this file at the start of a new chat and say **/handoff** to resume the project.

---

## What is this project?

A personal AI assistant HUD for Second Life. A mesh iPad object attached to the SL viewer UI lengthwise (landscape orientation) that displays a claude.ai-style chat interface via media-on-prim, and listens to local chat when "chat mode" is active to send messages to Claude via the Anthropic API.

**This is a personal-use build first** — just for the owner (Adi). No marketplace, no multi-user, no free tier. Keep it simple.

---

## Key design decisions

- **Input method:** LSL listens to channel 0 (open local chat) when chat mode is active — no channel prefix needed. A button on the HUD toggles chat mode on/off with a visual indicator
- **Display:** Media-on-prim on the mesh face shows a hosted webpage. Confirmed working on HUD. Clicks do NOT register on media-on-prim when attached as HUD — display only, which is fine since input is via local chat
- **Mesh:** iPad mesh, attached lengthwise (landscape). Screen is face 4, button is face 0 (frame face — no physical button on iPad mesh)
- **Button style:** Very dim natural warm white glow when active (0.02 glow), almost invisible when idle. No green — too harsh for frame face
- **Settings:** Notecard named `Claude_Settings` included with HUD. Script reads it on attach and on demand via `llGetNotecardLine()`. Stored persistently with `llLinksetDataWrite()`
- **Quick toggles:** `llDialog()` menu for in-session changes (toggle history, clear session, re-read notecard)
- **URL persistence fix:** LSL timer checks every 10 seconds but only reapplies media URL if it has actually dropped — does NOT reload if already correct (prevents wiping conversation display)
- **Visual style:** Bright theme (light background #f7f5f2), claude.ai-inspired, clean and minimal, font size 40px for readability on HUD

---

## Tech stack

| Component | Choice |
|---|---|
| Relay server | Node.js, deployed to Render free tier |
| Chat webpage | Hosted on Render (same project) |
| API | Anthropic API (user's own API key, stored in notecard only) |
| LSL storage | llLinksetDataWrite() for persistent settings |
| Settings input | Claude_Settings notecard + llDialog() for quick toggles |

---

## Settings notecard fields
```
api_key = sk-ant-...
channel = 0
history = true
```

---

## Relay server — BUILT AND DEPLOYED ✅

### Location
`C:\Users\adi\sl-claude-relay\server.js`

### Live URL
`https://sl-claude-relay.onrender.com`

### GitHub
`https://github.com/LolySL/sl-claude-relay`

### Endpoints
- `/chat` — receives messages from LSL, calls Anthropic API ✅
- `/poll` — webpage polls for new messages by avatar UUID ✅
- `/latest` — webpage calls on load to get avatar UUID (fixes chicken-and-egg UUID problem) ✅
- `/clear` — clears session history ✅
- `/ping` — health check for Render keep-alive ✅

### Model
`claude-sonnet-4-6`

### Important notes
- Render free tier cold starts — first message after idle period may time out, second message works fine once awake
- Dependencies: express, cors, axios

### VS Code note
Persistent issues with VS Code not writing files to disk. Fix: `Ctrl+A` to select all, paste, then `Ctrl+S`. Always verify with `type filename | find "keyword"` in Command Prompt. Use Notepad as fallback if needed.

---

## LSL Script — COMPLETE AND WORKING ✅

### Critical LSL rules learned the hard way
- No ternary operators anywhere — LSL doesn't support `? :`
- No em dashes — use plain `-` in all strings and comments
- No variable initialization with another variable at declaration — declare first, assign after
- Always give full updated script rather than line numbers — lines shift with every edit

### Face assignments
- **Face 4:** Screen — media-on-prim
- **Face 0:** Button — chat mode toggle, dim warm white glow when active

### Key settings
- Long press = 3.0 seconds (SL standard) opens settings dialog
- Short tap = chat mode toggle
- Dialog listen handle stored in `g_dialog_handle`, removed after use
- Timer only reapplies media if URL has dropped — does not force reload

### llOwnerSay debug lines
Still active for Chat mode ON/OFF and Claude replies in local chat. Remove the Claude reply `llOwnerSay` line in `http_response` once Adi is happy with the display.

---

## Webpage — WORKING ✅

### Location
`C:\Users\adi\sl-claude-relay\public\index.html`

### Current state
- Bright theme (light background #f7f5f2)
- Font size 40px (large for HUD readability)
- line-height 1.5 (relative, scales with font)
- transform: rotate(-90deg) on html/body for landscape iPad orientation
- `/latest` endpoint called on load to get avatar UUID
- Polls `/poll` every 1.5 seconds
- Thinking indicator (three animated dots) while waiting for reply
- Status dot in header: grey = idle, green = active, orange pulse = thinking

---

## Git workflow
```
cd C:\Users\adi\sl-claude-relay
git add .
git commit -m "description of change"
git push
```
- `git add .` — stage changed files
- `git commit -m "..."` — save a snapshot
- `git push` — send to GitHub, triggers Render redeploy

---

## Important notes for next Claude

- Adi is **not a developer** but is a **skilled graphic designer (Photoshop)** and **experienced SL builder, sim designer and creator** — explain code in plain language, trust SL and design judgment completely, do NOT over-explain SL concepts or building steps
- Windows, VS Code, Command Prompt, Edge browser
- Project folder: `C:\Users\adi\sl-claude-relay`
- Always give complete files when multiple changes are needed — never partial edits with line numbers
- API key is stored in the Claude_Settings notecard in SL only — never paste it in chat
- Qie is a collaborator helping with LSL — knowledgeable, worth flagging LSL issues to him
- Related projects: Flake (digital wallpaper marketplace, Firebase/React) and Cielomar Resort (SL boutique resort, Airtable/Wix/LSL)
- Use `/handoff` command to update this document

---

## Next steps / known remaining items

1. **Design changes to the webpage** — Adi has changes in mind, continuing in next session
2. **Remove `llOwnerSay` for Claude replies** in `http_response` once display is confirmed fully working
3. **Render cold start** — first message after idle may fail, second works. Could add a keep-alive ping from the webpage if this becomes annoying
4. **Notecard underscore issue** — was intermittent earlier, seems resolved. Root cause never fully confirmed — Qie was investigating

---

## Future potential

### Phase 2 — Distributable HUD
Sold on SL Marketplace, each user enters their own API key. L$500-2000 per copy.

### Phase 3 — Universal AI gateway HUD
Free tier (Gemini/Groq), personal tier (any API key), power tier (model selection + custom system prompt). Nothing like it exists in SL.

### Income options
HUD sales, managed tier subscriptions, custom/commissioned versions, relay-as-a-service for other SL developers.
