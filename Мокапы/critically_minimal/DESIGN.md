# Design System Strategy: The Archive of Intent

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Grimoire."** 

Unlike traditional tabletop tools that rely on faux-parchment and skeuomorphic ink, this system treats character data as a high-performance workspace. It draws inspiration from the precision of **Linear** and the structural modularity of **Notion**. We are moving away from the "cluttered fantasy" trope and toward an **Editorial Utility** aesthetic. 

The experience must feel like a premium, bespoke tool for a professional storyteller. We achieve this by breaking the standard web grid with **intentional asymmetry**: information-dense stat blocks are balanced against expansive, quiet breathing room. We use high-contrast typography scales—pairing the architectural `manrope` for headers with the utilitarian `inter` for data—to ensure the sheet feels authored, not just generated.

---

## 2. Colors & Surface Philosophy
Our palette is a sophisticated range of architectural grays (`surface` to `surface-dim`) accented by a single, authoritative indigo (`primary`).

### The "No-Line" Rule
Standard 1px borders are strictly prohibited for sectioning. They create visual noise and "box in" the data. Instead, boundaries are defined by **background color shifts**. 
- Use `surface-container-low` for the main body.
- Use `surface-container-lowest` (pure white) for high-priority interactive cards.
- Content sections should feel like "zones of focus" rather than "boxes of data."

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of fine paper. 
1. **The Foundation:** `background` (#f7f9fb).
2. **The Workspace:** `surface-container` (#e8eff3) for sidebars or secondary navigation.
3. **The Active Sheet:** `surface-container-lowest` (#ffffff) for the primary character sheet modules to make them "pop" against the environment.

### The "Glass & Gradient" Rule
To prevent the app from feeling "flat" or "generic," use **Glassmorphism** for floating elements like modals or fixed action bars. Use a `backdrop-blur` of 12px-16px paired with a semi-transparent `surface-bright` at 80% opacity. 
- **Signature Polish:** For primary action buttons, apply a subtle linear gradient from `primary` (#4c5f80) to `primary-dim` (#405373). This adds a "soul" to the UI that flat colors lack.

---

## 3. Typography
The typography is our primary tool for hierarchy. We pair two sans-serifs to distinguish between **Identity** (Manrope) and **Utility** (Inter).

*   **Display & Headlines (Manrope):** Large, bold, and authoritative. Use `display-md` for the Character Name and `headline-sm` for major sheet sections (Abilities, Inventory). The wide tracking and geometric shapes of Manrope convey a sense of modern permanence.
*   **Body & Labels (Inter):** Highly legible and compact. Use `body-md` for spell descriptions and `label-sm` for secondary stats (Weight, Gold). 
*   **The Hierarchy Rule:** Never use two different font sizes if a change in weight or color (`on-surface-variant`) can achieve the same result. This keeps the interface clean and "Linear-esque."

---

## 4. Elevation & Depth
In "The Digital Grimoire," depth is whispered, not shouted.

*   **Tonal Layering:** Avoid shadows for static elements. Place a `surface-container-lowest` card on a `surface-container-low` background to create a "Natural Lift."
*   **Ambient Shadows:** For floating menus (long-press or right-click), use an ultra-diffused shadow: `box-shadow: 0 12px 40px rgba(42, 52, 57, 0.08)`. The shadow color must be a tint of `on-surface`, never pure black.
*   **The "Ghost Border":** For input fields or cards that require containment for accessibility, use `outline-variant` at **20% opacity**. This provides a "suggestion" of a boundary without creating a hard visual stop.

---

## 5. Components

### Buttons
- **Primary:** Gradient from `primary` to `primary-dim`, text `on-primary`. Corner radius `md` (0.375rem).
- **Secondary:** Surface `surface-container-high` with `on-surface` text. No border.
- **Tertiary/Ghost:** No background. `on-surface-variant` text that shifts to `primary` on hover.

### Character Stats (The "Module")
- Avoid the traditional "D&D Hexagon." Use a clean, vertical stack: `label-md` (uppercase, tracked out) for the attribute name, and `headline-lg` for the modifier.
- **Background:** Use `surface-container-lowest` with a "Ghost Border" for interactivity.

### Lists (Spells/Inventory)
- **Rule:** No divider lines. 
- Use **Spacing Scale 2** (0.7rem) as a gap between list items. Use a subtle background hover state (`surface-container-high`) to indicate interactivity.
- **Leading Elements:** Use `primary-container` for icon backgrounds to highlight spell schools or item types.

### Input Fields
- Understated and "Notion-like." No heavy borders. 
- Use a `surface-container-highest` bottom-border (2px) that transforms into a `primary` color bar when focused.

### Action Chips (Conditions/Status)
- Small, `sm` (0.125rem) radius.
- Use `tertiary-container` for neutral statuses (Concentrating) and `error-container` for negative ones (Exhausted).

---

## 6. Do's and Don'ts

### Do:
- **Do** embrace white space. If a section feels "tight," use **Spacing Scale 4** (1.4rem) instead of 3.
- **Do** use `on-surface-variant` (#566166) for secondary metadata to create a clear visual hierarchy.
- **Do** use `surface-container-low` to group related items without drawing a box around them.

### Don't:
- **Don't** use pure black (#000000) for text. Always use `on-surface` (#2a3439) for a softer, premium feel.
- **Don't** use "Fantasy" icons (swords, shields) that are overly detailed. Use thin-stroke, geometric SVG icons.
- **Don't** use 1px solid dividers to separate content. Use the **Spacing Scale** and **Tonal Layering** instead.
- **Don't** use high-saturation reds for errors. Use the sophisticated `error` (#9f403d) which feels integrated into the palette.