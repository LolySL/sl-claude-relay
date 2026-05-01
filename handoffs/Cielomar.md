# Cielomar Project — Handoff File
_Last updated: April 2026_

---

## How to use this file
Paste this file at the start of a new chat and say **/handoff** to resume the project. Claude will read this and be up to speed on everything below.

---

## What is this project?

**Cielomar Resort** is a private boutique resort in Second Life, built on a divided parcel within a public region owned by **The Dive Shop (TDS)** group. The user is the owner/builder/in-world presence with full permissions. The resort is connected to TDS's scuba diving region.

---

## Key context

- The region is public and group-owned by The Dive Shop group
- The resort sits on a **divided parcel** — cannot be on a separate group due to prim count constraints
- Access control is handled via the **parcel access list** (guests are added by name)
- There is a **Cielomar group** that resort guests join — used for: staff communication before arrival, in-stay support, and passing through scripted physical barriers around the parcel border
- TDS group members have special abilities in the region but should NOT have resort access
- Invisible physical barriers sit just outside the parcel border (natural-looking, prevents visitors bumping into ban lines)
- **SmartBots** is used for bot services (group invites, etc.) — HTTP API is accessible from LSL scripts via llHTTPRequest
- The user is comfortable with LSL and in-world deployment. Claude writes the code, user deploys and tests, Qie is backup for complex issues
- SLT (Second Life Time = US Pacific Time) is the standard for all reservation dates/times

---

## Rooms available for booking

Only 2 rooms are open for reservations at launch:
- **Cielo Azul** (Underwater Room 1 — blue sky)
- **Cielo Profundo** (Underwater Room 2 — deep sky)

**Altamar Suite** (main top-floor suite) is NOT open for booking yet. Future plans: rent as event venue (weddings etc.), requiring a second reservation type that may or may not include a room.

---

## Facility names

| Facility | Name |
|---|---|
| Main suite | Altamar Suite |
| Underwater room 1 | Cielo Azul |
| Underwater room 2 | Cielo Profundo |
| Cinema | CieloLuz Cinema Room |
| Lounge | The Blue Note |
| Spa | Stillwaters |
| Sweets shop | TBD |
| Breakfast deck | TBD |
| Pier | TBD |
| Underwater pool | TBD |
| Lower level (bar) | TBD |
| Japanese bathhouse | TBD |

---

## Services & pricing

| Service | Duration | Price | Notes |
|---|---|---|---|
| Resort day pass | 6 hours | 500L$ / person | Fully operational |
| Overnight stay | ~24 hours | TBD — 1500L$ flagged as too low, needs proper pricing discussion | 2 people |
| Guided dive | 2 hours | TBD | Optional add-on, must reserve ahead. May offer to non-guests too. |
| Diving course | 5 × 2.5–3 hrs | TBD | Includes scuba set + TDS membership |
| Discover scuba course | 2 × 2.5–3 hrs | TBD | |

**Pricing note:** The resort is unique on the grid and should be priced accordingly. Full pricing discussion to happen when working on marketing. User wants to go deep on this.

---

## What is already working

### Day pass system ✅
- Payment terminals in-world
- Guest pays → SmartBots API triggered → Cielomar group invite sent + guest added to parcel access list automatically
- Access list entry expires when paid time is up
- Uses SL's built-in "pay for access" + SmartBots HTTP API

### HUD & environment system ✅
- EEP experience HUD working
- Night dive setting implemented in HUD
- HUD detach script error fixed by Qie
- Qie is building a fixed environment wall panel for the resort (user needs to build the panel itself)

---

## Resort reservation system — DESIGNED, NOT YET BUILT

### Tech stack decided

| Tool | Purpose |
|---|---|
| **Wix (free plan)** | Website + marketing + reservation form. Form submissions sent to Airtable via Wix Automations webhook — no Velo/paid plan needed for this part |
| **Airtable (free plan)** | Backend database — guest accounts, availability, booking status. Has REST API that LSL terminal calls directly |
| **LSL terminal (in-world)** | Reads from and writes to Airtable via llHTTPRequest. Claude writes the code, user deploys |
| **SmartBots HTTP API** | Group invites + access list triggers, called from LSL |
| **SL Parcel Access List** | Physical access control |

### Reservation flow

**Stage 1 — Reservation (on website)**
1. Guest browses website, views rooms, checks availability
2. Guest fills reservation form (see fields below)
3. Form submission → Airtable record created automatically via Wix Automation webhook
4. Selected dates marked as unavailable for that room

**Stage 2 — Deposit payment (in-world, in advance)**
1. Guest visits the **Resort Reservation Terminal** in-world
2. Terminal calls Airtable API, finds guest by SL username, displays their specific reservation (name, room, dates, deposit amount: 500L$)
3. Guest pays 500L$ deposit (non-refundable)
4. Terminal updates Airtable record → deposit marked paid
5. SmartBots triggered → guest receives Cielomar group invite

**Stage 3 — Arrival day payment (same terminal)**
1. Guest returns to same terminal
2. Terminal shows remaining balance
3. Guest pays remaining amount
4. Terminal updates Airtable → balance marked paid
5. SmartBots triggered → guest + partner both added to parcel access list (no expiry, no auto-kick)

### Key decisions
- Deposit: 500L$, non-refundable
- Overnight price: TBD
- Partner: gets access list entry on arrival, NOT auto group invite (owner adds manually if requested)
- Partner SL username collected on reservation form
- No checkout/kick — guests stay as long as they like
- Day pass terminal and resort reservation terminal are completely separate
- Both deposit and balance paid at the same reservation terminal
- All payments in-world in L$ only
- No strict check-in/check-out times — SLT dates are the standard, estimated arrival time collected as courtesy
- System supports multi-night stays (check-in + check-out dates) even though 99% will be 1 night
- Reservation form fields are ONLY what the payment/booking system needs — additional fields (extras, special activities, special occasion, etc.) will be added when designing the full website form

### Airtable structure (designed, not yet built)

**Table 1: Reservations**
- Reservation ID (auto)
- Guest SL username
- Guest display name
- Partner SL username
- Email
- Room (Cielo Azul / Cielo Profundo)
- Check-in date (SLT)
- Check-out date (SLT — default: check-in + 1 day)
- Estimated arrival time (SLT)
- Number of nights (auto-calculated)
- Total price (L$)
- Deposit (500L$) — paid yes/no + timestamp
- Remaining balance (auto-calculated)
- Balance paid — yes/no + timestamp
- Status (pending / confirmed / arrived / completed / cancelled)
- Notes (filled by owner — extras, special requests, etc.)

**Table 2: Rooms**
- Room name
- Description
- Max guests (2)

Availability logic: a date is unavailable if any confirmed reservation for that room has overlapping check-in/check-out dates.

### Next steps for the reservation system
1. Set up Airtable (tables, fields, API key)
2. Set up Wix form + Automation webhook to Airtable
3. Write LSL terminal script
4. Connect SmartBots triggers in LSL
5. Test full flow

---

## Website (Wix)

- Cielomar page is the landing page for all social/marketing links
- Primary marketing tool — guests need to be convinced from the website before visiting
- Reservation form will live here
- Room and facility descriptions still need to be written (waiting on photos)

### Copy already written
- Homepage intro paragraph ✅
- Facilities section lead-in: _"Explore the spaces that shape your stay — from underwater suites to warm-water wellness, sunset lounges, and oceanfront experiences crafted for pure tranquility."_ ✅
- Primary CTA: **"Reserve Your Stay"** ✅

---

## Open tasks (Phase 1 — Editor's Picks)

- Fix greeter message at landing point (replace with bot)
- Fix directory map
- Welcome poster with PBR instructions
- Update teleport tiles and woodpoles
- Finish non-PBR environment settings
- Rename all collision points and check if any need update
- Dancing balls in cafe/terminal area
- Region TP signs
- Build the fixed environment wall panel (Qie fixing the script)

## Open tasks (Phase 2 — Resort opening)

- Build reservation system (Airtable + Wix + LSL terminal) ⚠️ IN PROGRESS
- Finish bot settings + train it for guest chats
- Check Casper Door option for room key access
- Add room keys so day pass guests can't enter rooms
- Underwater pool ladder animations
- Main suite finishing
- The men cave finishing
- The Japanese bathhouse finishing
- Fix Marnie furniture issues
- Main swimming pool animations
- Finalize names for remaining facilities (6 TBD)
- Underwater location signs
- Complete Cielomar website — room + facility descriptions (waiting on photos)
- Set up reservation/booking flow on site
- Playlists for TVs, cinema, club screen
- Scuba area gear vendor and info setup
- Pricing discussion (overnight + extras)

## Open tasks (Phase 3 — Post-opening & marketing)

- Define marketing strategy
- List of photos and graphics needed
- Social media links to Cielomar landing page
- Rebuild RL training program once resort income is stable

---

## People involved

| Person | Role |
|---|---|
| User | Owner, builder, project lead, in-world deployment |
| Claude | System design, LSL code, documentation |
| Qie | Scripter — backup/complex issues (HUD, access scripts, environment) |
| Marnie | Furniture (has some unresolved issues) |

---

## Future upgrade path
The RL project has its own domain, server, and direct payment system. If resort booking volume grows, the Airtable + Wix free setup can be migrated to that infrastructure.
