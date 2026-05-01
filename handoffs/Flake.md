# FLAKE — Project Handoff Document
**Last updated: April 28, 2026 (updated with hero headline + icon bg decisions)**
**For: New Claude conversation continuity**

---

## 1. What is Flake?

Flake is a mobile-optimised web app and marketplace for buying and selling **exclusive digital phone wallpapers**. The defining feature: **each image is sold exactly once**. Once purchased, it is permanently removed from sale and belongs solely to the buyer.

- **Brand name:** Flake
- **Company name:** Uniqa Creative (proposed)
- **Primary slogan:** "Only one can be you."
- **Secondary slogan:** "You're unique. Your phone should be too."
- **Domain:** getflake.art (registered, live, privacy protected)

---

## 2. Brand Identity & Tone

- **NOT a premium/luxury brand.** Warm, identity-forward, youth-focused.
- **Target audience:** Gen Z, Millennials, digital artists, AI creators, collectors
- The "snowflake" concept is intentional — reclaiming the word as a positive identity marker. No two snowflakes are alike = no two owners of the same wallpaper.
- The phone is seen as an extension of personal identity.
- The double meaning of the slogan is intentional: "Only one can be you" = identity statement AND product promise (only one person owns each piece).

---

## 2b. Creative Brief & Brand Origin

### The core insight
The phone is no longer just a device — it is an extension of the person. People carry it everywhere, it reflects their personality, and the lock screen is the most-seen surface in their life. That insight is the foundation of Flake: if the phone is *you*, then what's on it should be one-of-a-kind, just like you are.

### The "snowflake" reframe
The brand name deliberately reclaims the word "snowflake" — a term that has been used to dismiss younger generations (Gen Z, Millennials) as overly sensitive or self-important. Flake turns that on its head: being a snowflake means being unique, individual, and irreplaceable. No two snowflakes are alike. No two owners of the same wallpaper will ever exist. The name is a badge of ownership, not an insult.

### Why this matters for the audience
Gen Z and younger Millennials are acutely aware of their own identity and deeply value self-expression. They are also the generation most likely to see their phone as a genuine extension of themselves. Telling them "your phone should be as unique as you are" is not a marketing line — it's a values statement they already believe.

### The investor narrative
"We took the word they used to dismiss a generation and turned it into a badge of ownership." That framing explains the brand name, the target audience, the product concept, and the cultural positioning in a single sentence. The snowflake metaphor also explains the entire product mechanic — no two alike, ever — without needing a slide. This is a founder who understands their audience, and that is what gets remembered in a pitch.

### Slogans in use
- **Primary:** "Only one can be you." — works as both an identity statement and a product promise
- **Secondary:** "You're unique. You deserve something special." — warmer, more personal, useful for onboarding and emotional moments
- **Headline composition:** ONLY ONE / can / BE YOU — "ONLY ONE" = product promise (one piece, one owner, ever); "BE YOU" = identity statement; "can" is the quiet connector between them

---

## 3. Content Tiers

| Tier | Price | Ownership Proof |
|------|-------|----------------|
| Original | $3–$15 | PDF certificate |
| Valuable | $20–$60 | PDF cert + NFT (Polygon/Manifold) |
| Rare | $80+ | Gallery cert + NFT + signed agreement |

---

## 4. Artist Plans

| Plan | Monthly | Commission | Tiers |
|------|---------|-----------|-------|
| Free | $0 | 30% | Original only |
| Creator | $9.99 | 15% | Original + Valuable |
| Pro | $24.99 | 0% | Original + Valuable |
| Verified Pro | Manual approval | 0% | All tiers incl. Rare |

---

## 5. Tech Stack

- **Frontend:** React (Create React App) — runs on localhost:3000
- **Backend/DB:** Firebase
- **Payments:** Stripe
- **Hosting:** Firebase Hosting → getflake.art
- **NFT:** Manifold + Polygon
- **Dev environment:** Windows, VS Code, Command Prompt

---

## 6. Current Project State

### What's built
The React app foundation is running with:
- `src/styles/tokens.css` — design tokens
- `src/styles/global.css` — global styles, buttons, cards, badges
- `src/components/FlakeLogo.jsx` — logo component (bright/dark variants)
- `src/components/Header.jsx` + `Header.css` — sticky nav with mobile menu
- `src/pages/HomePage.jsx` + `HomePage.css` — full landing page
- `src/App.js` — root component (note: .js not .jsx in this project)

### Logo files
Located at `public/assets/`:
- `flake_logo_bright.svg` — used on dark/purple backgrounds
- `flake_logo_dark.svg` — used on light backgrounds

**Logo structure:** Word "FLAKE" + snowflake icon (tagline-free version being made in Canva)
**Logo colors:**
- Text: `#daf3fe`
- Icon: `#6abade`, `#98e2f7`, `#dbf4fe`, `#daf3fe`

### Header current state
```jsx
<a href="/" className="header__logo" aria-label="Flake home"
   style={{ display: 'flex', alignItems: 'flex-start', marginTop: '12px' }}>
  <FlakeLogo variant="bright" height={120} />
</a>
```

---

## 7. Current Color System

### Brand colors
```css
--flake-ice:        #daf3fe;   /* Primary text/logo color */
--flake-ice-dim:    #98e2f7;   /* Secondary text */
--flake-ice-faint:  #daf3fe18; /* Ghost backgrounds */
--flake-deep:       #5a4d96;   /* Main background — medium purple */
--flake-dark:       #4a3d86;   /* Surface — cards, panels */
--flake-mid:        #6657a8;   /* Elevated surface — inputs, hover */
--flake-border:     #ffffff15; /* Subtle border */
--flake-border-mid: #ffffff30; /* Hover/active border */
```

### Tier colors
```css
--tier-original:    #cae8ff;
--tier-valuable:    #a78bfa;
--tier-rare:        #f59e0b;
```

### Semantic colors
```css
--color-success:    #34d399;
--color-warning:    #f59e0b;
--color-danger:     #f87171;
```

---

## 8. Page Layout & Design — Current State

### Two-tone page design
The page alternates between two visual zones:

**Purple zones** — Header, Hero, CTA: background `#5a4d96`, light text
**Light zones** — Props, Tiers: background `#daf3fe`, purple cards (`#5a4d96`)

### Scroll animation
The hero section is `position: sticky; top: 0; z-index: 1` and the props/tiers sections have `z-index: 2` so they slide up over the hero as the user scrolls down.

### Current HomePage.jsx structure
- Hero: sticky, purple background, headline + subtext + CTA buttons + decorative icon PNG background
- Props: light background (`#daf3fe`), three purple cards (Truly exclusive, Fair to artists, Verified ownership)
- Tiers: light background, three purple cards (Original, Valuable, Rare)
- CTA: purple background, closing headline + button

---

## 9. Page Section Class Names Reference

**Header:** `.header`, `.header__logo`, `.header__nav`, `.header__actions`

**Hero:** `.hero`, `.hero__inner`, `.hero__headline`, `.hero__headline--accent`, `.hero__sub`, `.hero__actions`, `.hero__bg`

**Props:** `.props`, `.props__grid`, `.props__card`, `.props__icon`, `.props__title`, `.props__text`

**Tiers:** `.tiers`, `.tiers__heading`, `.tiers__sub`, `.tiers__grid`, `.tiers__card`, `.tiers__card--featured`

**CTA:** `.cta`, `.cta__inner`, `.cta__heading`, `.cta__sub`

---

## 10. Important Workflow Notes

- **Copy button quirk:** The Claude code copy button sometimes only captures partial code on the first click. Always click the copy button **twice** before pasting to get the full code.
- When making changes to JSX files, always replace the **complete file** using Ctrl+A to avoid mismatched tags.
- Same for CSS files — replace completely when making structural changes.

---

## 11. MVP Phases

### MVP v1 (founder only — current focus)
- Buyer registration and login
- Gallery with tier filters (Original + Valuable)
- One-sale-per-image enforcement
- Stripe payments
- Auto PDF certificate on purchase
- NFT minting (Valuable tier)
- Download flow with wallpaper-setting guide
- User profile and purchase history

### MVP v2 (multi-artist)
- Artist registration + fast-lane onboarding
- Artist studio (upload, categorise, price, manage)
- Subscription billing via Stripe
- Admin panel
- Automated reverse image search
- Revenue split + artist payouts
- In-app messaging
- Verified artist application flow

---

## 12. Pages Still To Build
- Gallery page
- How it works page
- Footer
- Artist upload flow
- Login / signup pages

---

## 13. Hero Headline — Finalised Design

The hero headline replaces the old `.hero__headline` / `.hero__headline--accent` classes with a new two-block symmetric layout.

### Composition
- **LEFT block:** "ONLY" (small label) above "ONE" (massive)
- **CENTRE:** vertical divider line with dot markers top and bottom, "can" in small lightweight text at midpoint
- **RIGHT block:** "BE" (small label) above "YOU" (massive)

### Meaning
- "ONLY ONE" = product promise (one piece, one owner, ever)
- "BE YOU" = identity statement (be yourself, be unique)
- "can" = quiet connector, deliberately understated

### Typography
- Labels (ONLY, BE): Inter 700, 22px, letter-spacing 0.28em, `#98e2f7` at 85% opacity
- Big words (ONE, YOU): Inter 900, `clamp(72px, 12vw, 118px)`, letter-spacing 0.01em, `#daf3fe`
- "can": Inter 400, 22px, letter-spacing 0.38em, `#98e2f7` at 55% opacity
- Divider: 0.5px `#daf3fe` at 15% opacity, dots `#6abade` at 50% opacity

### JSX structure
```jsx
<h1 className="hero__headline">
  <div className="hero__headline-block hero__headline-block--left">
    <span className="hero__headline--label">ONLY</span>
    <span className="hero__headline--word">ONE</span>
  </div>
  <div className="hero__headline-divider">
    <span className="hero__headline-divider--dot"></span>
    <span className="hero__headline-divider--line"></span>
    <span className="hero__headline--can">can</span>
    <span className="hero__headline-divider--line"></span>
    <span className="hero__headline-divider--dot"></span>
  </div>
  <div className="hero__headline-block hero__headline-block--right">
    <span className="hero__headline--label">BE</span>
    <span className="hero__headline--word">YOU</span>
  </div>
</h1>
```

### Rendered size of ONE / YOU
At typical screen width: **191 × 86px** (measured in Edge DevTools)

---

## 14. Hero Background Icon — Decisions & Status

### What was decided
- The old `.hero__bg` decorative element (described as "spiderweb-like") is being replaced
- The Flake logo icon (8-crystal formation) will be used as a ghosted background decoration behind the headline
- The icon should be embedded as a **PNG `<img>` tag** — NOT recreated in SVG — to preserve exact colors, gradients and 3D faceting

### Icon description
- 8 crystal/rhombus shapes arranged in a circular formation
- 7 petals in `#daf3fe` tones, **1 unique petal** in `#98e2f7` — representing the one unique piece / one unique owner
- The unique petal is at **45°** (northeast, one step clockwise from the top)
- Petal at **0° points straight north** (matching original icon orientation)
- Has a faceted 3D look using light/shadow shading within each petal

### Do NOT use snowflake imagery
The brand deliberately avoids the snowflake symbol in all design — do not suggest or use snowflakes, spiderweb patterns, or radial line patterns. The icon is a crystal/gem formation, not a snowflake.

### PNG workflow
The user (Adi) is a skilled Photoshop / graphic designer. For visual assets:
- Adi creates the PNG in Photoshop with exact colors, opacity, and effects
- Claude embeds the PNG into the React/CSS code
- Target export size: **~600–800px** (3–4× rendered size for retina sharpness)
- PNG to be placed in `public/assets/`

### Status
Waiting for Adi to export the washed/adjusted icon PNG from Photoshop.

---

## 15. Key Decisions Still Open
1. **Hero icon PNG** — Adi to export from Photoshop, Claude to embed
2. **Props section** — further design tweaks still needed
3. **New logo files** — tagline-free version being made in Canva

---

## 16. Important Notes for Next Claude
- The user is **not a developer** but is a **skilled graphic designer (Photoshop)** — explain code in plain language, but trust their design judgment completely
- Always give exact instructions (which file, which line, what to change)
- When giving full file replacements, remind user to click copy button **twice**
- The project uses `.js` not `.jsx` for the root App file
- SVG files must be loaded as `<img>` tags (not imported as React components) — Canva SVGs contain c2pa metadata that breaks React's SVG parser
- `marginTop` on FlakeLogo component doesn't work — apply it to the parent `<a>` tag instead
- User works in Windows, VS Code, Command Prompt, Edge browser
- Project is at `C:\Users\adi\flake`
- To start: `cd C:\Users\adi\flake` then `npm start`
- Use `/handoff` command to update this document
- **Workflow agreement:** if something is easier for Adi to design in Photoshop than for Claude to approximate in SVG/code, Adi makes a PNG and Claude embeds it
