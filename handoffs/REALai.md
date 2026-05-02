[REALai.md](https://github.com/user-attachments/files/27307633/REALai.md)
# REALai - Project Handoff Document
**Last updated: May 2, 2026 - Project tracker built, key decisions made, homestead and HUD approach decided**
**For: New Claude conversation continuity**

---

## How to use this file
Paste this file at the start of a new chat and say /handoff to resume the project.

---

## What is REALai?

REALai is a commercial AI assistant product line for Second Life, built on top of the SL Claude HUD project. It allows SL residents to have AI assistants running in-world — as HUDs, animesh characters, alt-bots, or any object — using the Anthropic or Gemini API.

The relay infrastructure is already built and deployed. See HUD.md for full technical details.

REALai is currently #1 priority above Flake and Cielomar.

---

## Product tiers

**REALai Light**
- Drop script (no modify) + settings notecard
- Runs on free Gemini API, no API key needed
- Optional settings notecard: name, about me, about user, location
- Also sold as animesh character packages with built-in animations
- One-time purchase, no ongoing fees

**REALai Standard** (HUD project is the foundation)
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

**Extensions - future / roadmap ideas**
- SL Marketplace search assistant (genuine pain point for most residents)
- Inventory organizer
- Adult content products (intentionally left to Pro + Developer Kit buyers — most profitable category, Adi is not building this, leaving it to developers)

---

## Business notes (private, not in Qie doc)
- Light revenue funds Standard infrastructure
- Pro BYOK is pure margin after sale
- Pro Managed subscription covers server + API costs + commission
- Pricing strategy TBD, kept between Adi and Claude for now
- Flake.art domain to be acquired once REALai generates initial revenue

---

## Key decisions made

### HUD / display
- No commissioned mesh for the HUD object
- Using a mocap (free/purchased from SL marketplace) of smartphone or tablet
- Invisible prim overlay over screen face gives media-on-prim face and clickables
- Mocap customized with REALai brand and colors
- Media-on-prim displays our relay-hosted HTML chat interface (not claude.ai — that is account-based and cannot be embedded)

### Public indicator wearable (NEW — not yet built)
- Optional attachable item included with Standard and above
- Core is an invisible prim (or non-fitted mesh like earpiece/headset)
- Drop menu lets user choose indicator style:
  - Floating glyph (original design, inspired by but not copying Claude/Gemini logos)
  - Thinking bubble graphic ("AFK with my REALai" style)
  - Other fun options TBD
- Communicates with HUD via llLinksetDataRead() to detect chat mode state automatically
- Simple on/off fallback if link detection is too complex
- Functions as status signal ("I'm talking to my AI, not you") and walking brand advertisement

### In-world store
- Flagship: private homestead rented from Serena Estates, weekly payment
- Serena already used for PerSempre (Adi's 1/4 sim art gallery/landscaping showcase)
- Region name chosen by Serena — cannot be customized through 3rd party estate
- Rating: Moderate
- Timing: secure homestead once brand, main building, and landscape direction are decided (target ~1 week from May 2)
- Secondary: Stellardawn (Adi's sci-fi mainland sim — space station, airport, GTFO hub) as demo/RP environment and live proof of concept
- Stellardawn notes: co-owned, mainland limits on prims, co-owner could leave anytime — use as demo only, not primary

### Branding
- Starting from zero — no logo, palette or wordmark yet
- Name: REALai (plays on "relay" — the underlying tech)
- Direction: sci-fi tech company aesthetic
- Branding must be done before: website, marketplace listings, vendor textures, store build
- Target: branding direction decided within ~1 week of May 2

---

## Launch scope (2-3 weeks from May 2, 2026)
- REALai Light and REALai Standard
- Website announcing Pro coming soon
- Flagship homestead store + Stellardawn demo
- SL Marketplace listings for both tiers

---

## Project tracker summary (41 tasks)

### Tech (tasks 1-9)
1. Pastebin handoff system — test full flow
2. REALai Light — drop script (no modify)
3. REALai Light — animesh variant
4. REALai Standard — long term memory via notecard handoff
5. REALai Standard — Gemini + Claude API key option
6. Claude Sync add-on — GitHub-based handoff sync
7. Shared activity log system
8. In-world support group bot
9. Store manager bot for in-world store

### Design & mesh (tasks 10-17)
10. REALai branding — logo, wordmark, color palette
11. HUD — source mocap (smartphone/tablet), customize with brand, add invisible prim overlay — NO commissioned mesh ✓ DECIDED
12. Source full perm animesh base avatars
13. Source full perm animation packs per role
14. Animesh character packaging — textures, outfits per role
15. Flagship store build — private homestead
16. Stellardawn demo space setup
17. Product vendor design and textures

### Content (tasks 18-25)
18. Website — domain + hosting setup
19. Website — landing page
20. Marketplace listings — REALai Light
21. Marketplace listings — REALai Standard
22. In-world setup instructions notecard
23. API key setup guide
24. REALai Light settings notecard template
25. Demo video / promo images

### In-world (tasks 26-31)
26. Secure private homestead from Serena Estates (weekly payment, wait for brand/build decisions)
27. Free up prims in Stellardawn for demo space
28. Set up in-world support group
29. Product delivery system (vendor script or CasperVend)
30. Live demo units running in Stellardawn
31. Test full buyer flow end to end

### Marketing (tasks 32-36)
32. Identify SL communities to target at launch (GTFO players, tech-forward, sim owners, RP, store owners)
33. Launch post — SL forums and feeds
34. Qie review and feedback on product + concept
35. Soft launch — friends and trusted residents first
36. SL destination guide listing for Stellardawn demo

### Business (tasks 37-41)
37. Finalize pricing for Light and Standard
38. Decide on homestead — DECIDED: Serena Estates, full homestead, weekly, when brand/build ready ✓
39. Pro tier announcement page
40. Flake.art domain — defer until REALai revenue
41. Qie collaboration terms for shared infrastructure

---

## Homestead research notes
- Serena Estates full homestead: ~6,799 L$/week (~$110-115 USD/month)
- Azure Islands (Anshe Chung): ~6,499-6,999 L$/week, similar pricing
- Direct from Linden Lab: ~$109/month (Adi qualifies as Premium Plus + full region owner)
- LL is cheapest but monthly only and no support — Serena chosen for weekly payments and existing relationship
- 3rd party estates assign region names — cannot be customized
- Full estate manager rights only come with whole homestead (not quarter)

---

## People

- Adi: owner, builder, project lead, in-world deployment. Skilled graphic designer, experienced SL builder/sim designer. Strong logical thinking — trust her judgment on SL and design completely.
- Qie: experienced LSL scripter (one of top 5 in SL), collaborator on Cielomar, has his own HUD on the same relay. REALai concept doc sent for review.
- Claude (app): system design, code, documentation, handoff file maintenance
- HUD Claude: in-world assistant, project tracking, simple LSL help

---

## Working notes for Claude
- Do NOT end replies with next steps unless asked
- Do NOT agree with suggestions you know won't work — correct them clearly
- Explain code in plain language
- Always give complete files when multiple changes are needed
- API key in notecard only — never in chat
- Adi pays weekly in SL, prefers weekly costs over monthly where possible
- Related projects: HUD.md (technical foundation), Flake (digital wallpaper marketplace), Cielomar Resort (SL boutique resort)
- Use /handoff to update this document
