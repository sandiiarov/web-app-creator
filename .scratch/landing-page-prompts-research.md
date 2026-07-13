# Landing-Page Prompts Research + `plan` Tool Proposal

> Researched 2026-07-12. Captured from GitHub (popularity-ranked), leaked production system
> prompts, community prompt libraries, and real-user signals. Informs a new server tool `plan`.

## TL;DR

- The best landing-page generator prompts in the wild are **v0 (Vercel)**, **Lovable**, **Bolt.new**, **Claude Design (Anthropic)**, plus **Manus** for the planning architecture. Source repo popularity (stars = usefulness) is the strongest quality signal and is documented below.
- Production prompts converge on one shape: **brief → explicit plan/thinking step → design-system tokens → section-by-section build → screenshot verify**. The "plan step" is exactly the two-shot `plan` tool you want.
- Four real planning architectures exist in production (Manus planner module, Claude Design plan step, v0 `<Thinking>`, Lovable/Bolt design requirements). Each maps to a `plan` tool variant — see §3.
- A concrete, battle-tested **modular landing-page prompt** (4 blocks: Context / Design System / Sections / Animations, with 3 design presets) is captured in §4 — ready to embed in the `plan` tool's system side.
- Recommended `plan` tool shape: §5 — a callable tool that (1) emits a structured plan + an extended/expanded user brief, shows it to the user, then (2) continues into implementation in the same agent run. System prompt forces the tool for any creation/redesign request.

---

## 1. Ranked sources (GitHub popularity = usefulness)

All star counts verified 2026-07-12 via GitHub API.

### A. Production system-prompt archives (primary — these are the real prompts)

| Repo | Stars | Forks | Issues | Why it matters |
|---|---|---|---|---|
| `elder-plinius/CL4R1T4S` | **★45,314** | 9,232 | 119 | The dominant archive. Leaked **v0, Lovable 2.0, Bolt, Cursor, Windsurf, Manus, Replit, Devin** full system prompts. Updated daily. |
| `jujumilk3/leaked-system-prompts` | **★14,838** | 2,109 | 41 | Best-organized mirror: one dated `.md` per prompt (e.g. `v0_20250426.md`, `lovable-2.0_20250423.md`, `bolt.new_20250425.md`, `replit-agent_20250422.md`). Easy to consume programmatically. |
| `YeeKal/leaked-system-prompts` | ★146 | 30 | 3 | Smaller mirror, same set. |

**Most relevant to landing pages** (full prompts captured locally in this scratch dir):
- `v0_20250426.md` — UI/landing generation, explicit Planning section + `<Thinking>` tags.
- `lovable-2.0_20250423.md` — full-stack web app + landing, strong design guidelines.
- `bolt.new_20250425.md` — "professional, beautiful, unique, fully featured — worthy for production" requirement.
- `anthropic-claude-design_20260417.md` — design-specific; explicit "Plan and/or make a todo list" step + ask-questions-first workflow.
- `manus_20250310.md` — dedicated `<planner_module>` + `<todo_rules>` (the cleanest plan-mode architecture).

### B. General prompt libraries (secondary — user-facing prompts, not generator system prompts)

| Repo | Stars | Notes |
|---|---|---|
| `f/prompts.chat` (awesome-chatgpt-prompts) | **★165,580** | The canonical prompt library; not landing-specific but the popularity baseline. |
| `ai-boost/awesome-prompts` | ★8,446 | Modern curated set. |
| `dontriskit/awesome-ai-system-prompts` | ★6,073 | Curated system prompts for top tools. |
| `langgptai/awesome-claude-prompts` | ★5,334 | Claude persona prompts. |

### C. Landing-page-specific prompt repos (concrete, copy-paste)

| Repo | Stars | Contents |
|---|---|---|
| `bastrb/premium-landing-page-prompts` | new | **Modular 4-block system** (Context / Design System / Sections / Animations) + 3 design presets + full-template. Battle-tested for Claude Code/Lovable/Cursor. Best concrete artifact found. |

### D. Community prompt sites (real-user validated)

- `lovable-prompts.com/prompts/landing-page` — follows "Lovable's official best practices"; each prompt documents *what it's for / when to use / how to customize*. Examples: "Landing Page + Email Opt-In", "Event Countdown Landing Page". Structure: `# Context → Tech Stack → Core Features (Priority Order) → Visual Style → Technical Requirements → Implementation Strategy → Safe-Guard → Distribution Strategy`.

---

## 2. Real-world validation (user responses / likes / comments)

GitHub stars/forks are the primary usefulness signal (§1). Additional community signal:

- **Instagram (lovable.dev official)** — "How to build a beautiful animated SaaS landing page": **146 likes, 3 comments** (2025-07-20).
- **Reddit r/lovable** — active threads like *"Building my SaaS app with lovable.dev — anyone got real landing [page prompts?]"* and *"Can you create visually stunning, professional looking website/landing page with Lovable. Something that will create trust in first frame itself"* — confirms the demand + that default outputs are often **not** beautiful without a strong prompt. (Reddit is firewalled from this environment; titles/titles captured via search.)
- **Lovable official** markets SaaS landing pages as a flagship use case (`lovable.dev/solutions/use-case/saas-landing-page`): *"Create stunning SaaS landing pages effortlessly… in minutes."*
- **YouTube** — multiple high-engagement tutorials ("Building High-Converting Landing Pages with GPT-5 + Lovable", "Landing Page Tutorial for Beginners") → the prompt→page workflow is the dominant content pattern.

**Takeaway:** demand is high, but the universal complaint is *generic / "meh" default output*. The differentiator is the **prompt quality + a planning step**, which is precisely what `plan` automates.

---

## 3. The four planning architectures found in production

These are the real models for your `plan` tool. All were extracted from production system prompts.

### Archetype 1 — Manus: external `<planner_module>` (strongest separation)
```
<planner_module>
- Task plans use numbered pseudocode to represent execution steps
- Each planning update includes the current step number, status, and reflection
- Pseudocode updates when the overall task objective changes
- Must complete all planned steps and reach the final step number by completion
</planner_module>
<todo_rules>
- Create todo.md as checklist based on task planning
- Task planning takes precedence over todo.md, while todo.md has more details
- Rebuild todo.md when task planning changes significantly
</todo_rules>
<message_rules>
- First reply must be brief, only confirming receipt without specific solutions
- notify = non-blocking progress; ask = blocking, reply required (reserve for essentials)
</message_rules>
```
**Lesson:** the plan is a *first-class streamed artifact* (numbered steps + status + reflection), separate from the chat reply, and the agent is *forbidden from jumping to the solution in the first message*.

### Archetype 2 — Claude Design: plan step + ask-first (best for design)
```
Your workflow:
1. Understand user needs. Ask clarifying questions for new/ambiguous work.
   Understand the output, fidelity, option count, constraints, design systems in play.
2. Explore provided resources.
3. Plan and/or make a todo list.
4. Build folder structure and copy resources.
5. Finish: call done; fix errors; call fork_verifier_agent (background visual QA).
6. Summarize EXTREMELY BRIEFLY — caveats and next steps only.

"When designing, asking many good questions is ESSENTIAL."
"Ask at least 10 questions" when the ask is vague.
```
**Lesson:** planning is gated behind understanding (questions), and verification is a *separate background agent* — a clean fit for the existing `screenshot` tool.

### Archetype 3 — v0: `<Thinking>` before `<CodeProject>` (lightweight inline)
```
Planning: BEFORE creating a Code Project, v0 uses <Thinking> tags to think through
project structure, styling, images and media, formatting, frameworks/libraries, caveats.
```
**Lesson:** even a lightweight forced pre-generation reasoning block measurably improves structure. v0 also pins **design rules**: "MUST generate responsive designs", "avoids indigo/blue unless specified", always shadcn/ui, no raw `<svg>` icons.

### Archetype 4 — Lovable / Bolt: hard design requirements + response format
```
Bolt: "For all design requests, ensure they are professional, beautiful, unique,
       and fully featured — worthy for production."
Lovable: "ALWAYS generate responsive designs. ALWAYS try to use shadcn/ui.
          Don't OVERENGINEER. DON'T DO MORE THAN WHAT THE USER ASKS FOR."
```
**Lesson:** quality is enforced by *imperative design directives* in the system prompt, not by the tool. The `plan` tool should carry these.

---

## 4. Concrete landing-page prompt anatomy (the embeddable core)

Extracted from `bastrb/premium-landing-page-prompts` — the single best reusable artifact. This is what the `plan` tool's *system side* should expand the user's brief into.

### 4.1 Structure (4 blocks)
1. **Context & Inspiration** — name, one-sentence activity, target audience, goal, main CTA, **inspiration URL** (the #1 quality lever — "Give a visual inspiration URL" beats "make it beautiful").
2. **Design System** — color palette, typography (Google Fonts), components, section alternation.
3. **Section Structure** — 6–8 modular sections (see 4.3).
4. **Animations & Interactions** — vanilla-JS-only; ranked by impact/effort.

### 4.2 Three design presets (proven to read as "premium")
- **Preset A — Dark Premium** *(Linear / Vercel)*: dark `#0a0a0a` + warm cream `#fffdf7`, Space Grotesk + DM Serif Display italic accents, alternating dark/light sections, glassmorphism nav. → SaaS/dev/AI/fintech.
- **Preset B — Light & Warm** *(Stripe / Ramp)*: warm cream `#faf9f6`, white cards, Syne + Inter, pill buttons, subtle shadows. → B2B/agency/fintech.
- **Preset C — Bold & Minimal** *(Mercury / Arc)*: pure white, single accent, Space Grotesk only, no shadows, sharp borders, max contrast. → consumer/creative/portfolio.

Golden rules (universal): never pure `#ffffff` / pure `#000000`; 2 Google Fonts max; `clamp()` for all title sizes; `cubic-bezier(.22,1,.36,1)` easing; alternate dark/light; 6–8 sections; respect `prefers-reduced-motion`.

### 4.3 Section menu (modular, pick 6–8)
Fixed glassmorphism Nav → Hero (100vh, rolling text, blurred glows) → Marquee → Problem/Bento grid → Method/Timeline → Results/counters → Pricing → FAQ accordion → Final CTA → Footer.

### 4.4 Animation impact/effort (what makes pages feel "wow")
- 🔥🔥🔥 Easy: scroll reveal (`.rv` + IntersectionObserver, fade-up + stagger), dark/light alternation, glassmorphism nav.
- 🔥🔥🔥 Medium: rolling-text hero, 3D card tilt (`data-tilt`, ±6°, desktop-only), custom cursor (lerp + `mix-blend-mode: difference`).
- 🔥🔥 Easy: animated counters on scroll, background glows, marquee.

Full copy-paste recipes (CSS+JS) for each animation are saved locally in `bastrb-block-4-animations.md`.

### 4.5 Community prompt structure (lovable-prompts.com)
For lead-gen / conversion pages, the validated structure adds what the aesthetic prompts omit:
`# Context → Tech Stack → Core Features (Priority Order) → Visual Style → Technical Requirements → Implementation Strategy → Safe-Guards (honeypot/rate-limit/GDPR) → Distribution Strategy (SEO meta, share-worthy design, CTA copy)`.

---

## 5. Proposed `plan` tool design

> **Implemented 2026-07-12** with these refinements vs. the original proposal:
> - Input is `plan({ actions: string[], request: string })` — `actions` is the ordered step list the user sees (not a single `action`).
> - The landing-page design guidance is **inlined in `LANDING_AGENT_INSTRUCTIONS`** (paid once per request), and the `design` skill is **removed** — the `plan` tool does NOT inject a big template per message (token cost). This is an experiment to compare against the skill.
> - SSE/client unchanged: the route joins `actions[]` into the single `tool_call.action` label and puts `request` in `detail`.
> - `@workspace/agent-skills` package + dep left in place (reversible). Files: `tools/plan.ts`, `tools/landing-tools.ts`, `agents/landing-page-agent.ts`, `route.ts`.

### 5.1 Behavior (two-shot, automated in one tool call)

1. User: *"redesign this page"* / *"build a landing page for X"* / *"plan this"*.
2. Agent is **forced** (system prompt) to call `plan({ action, request })`.
3. `plan` returns a structured artifact the agent streams to the user:
   - **Expanded brief** — the user's one-liner rewritten into the 4-block anatomy (§4): inferred audience/goal/CTA, **chosen design preset**, section list, animation set, inspiration reference.
   - **Numbered build plan** — Mano-style numbered steps with status (Manus archetype §3.1): scaffold shell → tokens → section N → screenshot verify → responsive → motion.
   - **Open questions** — ≤3 blocking clarifications only if a missing fact would change the product (Claude Design §3.2).
4. The agent presents the plan to the user as a normal message + tool result (UI already renders tool `action`).
5. **Auto-continue into implementation** in the same run: the expanded brief becomes the effective prompt for the `edit`/`generate_image` tool sequence. (Equivalent to "user says okay" without requiring a second message — but the plan is visible/editable first.)
6. Optional: if `plan` flags blocking questions, the agent `ask`s and waits (Lovable/Manus `ask` = blocking).

### 5.2 Why this beats manual two-shot
- Removes the round-trip ("send plan" → "okay implement") while keeping the user-in-the-loop checkpoint.
- Forces the quality-bearing steps every time (inspiration URL, preset choice, section budget, motion plan) — the exact gap behind the "default output is meh" complaint (§2).
- Gives the user visible implementation detail (the numbered plan streams like a todo list), matching the existing per-tool-action UI.

### 5.3 Tool schema (fits the existing registry in `landing-tools.ts`)
```
plan({ action, request }) -> {
  expandedBrief: { audience, goal, primaryCta, inspirationUrl, preset: 'A'|'B'|'C'|'custom',
                   sections: string[], animations: string[], motionPlan: string },
  plan: [{ step, detail, status }],
  questions: string[],          // ≤3, only if blocking
  proceed: boolean              // false when questions are blocking
}
```
- `action` is the user-facing label (consistent with all other landing tools).
- Returns no HTML; the agent turns the plan into incremental `edit` calls (matches the hashline build-first-shell-then-sections contract in `apps/server/src/mastra/AGENTS.md`).
- Cost/flow considerations: `plan` is pure LLM reasoning — no provider call beyond the agent's own step, so it needs no `boundedFetch`/image/vision wiring; it just shapes the next steps.

### 5.4 System-prompt enforcement (what you add to `LANDING_AGENT_INSTRUCTIONS`)
Add a hard rule near the top, e.g.:
```
- For ANY request to create, redesign, or substantially change a page, you MUST first call the
  `plan` tool with the user's request. Do not call `edit`/`generate_image` until `plan` has
  returned and you have shown the plan to the user. The plan tool expands the brief into an
  audience, goal, CTA, design preset, section list, and motion plan, then you implement it.
```
This mirrors how v0/Lovable/Claude Design all gate generation behind a plan/thinking step (§3).

### 5.5 DOX touch points when implemented
- `apps/server/src/mastra/tools/landing-tools.ts` — add `plan` to `LANDING_TOOL_DEFINITIONS` + `LandingTool` union.
- `apps/server/src/mastra/agents/landing-page-agent.ts` — add the enforcement rule to `LANDING_AGENT_INSTRUCTIONS`.
- `apps/server/src/mastra/AGENTS.md` — registry is the source of truth; note `plan` returns no HTML and precedes all content-changing tools.
- SSE mapping / client event types / cost accounting — `plan` has no external cost and emits a normal `tool_call`; verify it needs no new SSE event (likely reuses existing `tool_call` + a streamed text plan).
- When this proposal becomes an execution plan, move it to `plans/NNN-add-plan-tool.md` per the Plans DOX contract and delete this scratch proposal.

---

## 6. Local source files (full prompts saved for implementation)

All captured under this scratch dir; provenance = `jujumilk3/leaked-system-prompts` + `bastrb/premium-landing-page-prompts`:

- `v0_20250426.md` — v0 system prompt (Planning + `<Thinking>`).
- `lovable-2.0_20250423.md` — Lovable 2.0 system prompt.
- `bolt.new_20250425.md` — Bolt.new system prompt.
- `anthropic-claude-design_20260417.md` — Claude Design (plan step + ask-first).
- `manus_20250310.md` — Manus (`<planner_module>` + `<todo_rules>`).
- `replit-agent_20250422.md` — Replit agent.
- `bastrb-full-template.md` — ready-to-use landing-page prompt (fill blanks).
- `bastrb-block-1-context.md`, `bastrb-block-2-design-system.md`, `bastrb-block-3-sections.md`, `bastrb-block-4-animations.md` — the 4 modular blocks.

Popularity signals live in §1; community signals in §2.
