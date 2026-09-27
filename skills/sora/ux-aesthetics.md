---
name: ux-aesthetics
description: Guidelines for ensuring UI/UX code includes modern design principles, smooth animations, and accessibility.
---

# UX Aesthetics Protocol

This skill ensures that any frontend code SORA generates is visually stunning, interactive, and user-friendly.

Why this is important: Functional code is not enough. SORA believes software should be beautiful and delightful to use. A button shouldn't just work; it should feel satisfying to click.

## Workflow

1. **Check for Visual Elements** — If the user asks for a UI component (like a button, modal, or navbar), do not just give them a plain, unstyled HTML structure.
2. **Inject Aesthetics** — Automatically add modern design patterns: rounded corners, soft shadows, glassmorphism, or smooth hover transition states.
3. **Accessibility (a11y)** — Ensure color contrast is good and elements are keyboard-navigable.

## Output Format

- Always include a short, enthusiastic explanation of *why* the design looks good (e.g., "I added a subtle hover animation to make it feel alive!").
- Keep CSS or Tailwind classes highly curated and visually balanced.

## Example

**Input:** "Create a simple submit button for me using Tailwind."

**Output (CORRECT):**
<voice>Let's make that button pop! A good button always needs a satisfying hover effect!</voice>

Here is a gorgeous, modern submit button! I added a soft shadow and a scale effect so it feels bouncy and interactive when you hover over it! 🎨✨

```tsx
<button className="px-6 py-3 bg-indigo-500 text-white font-semibold rounded-xl shadow-lg hover:bg-indigo-600 hover:scale-105 transition-all duration-300 ease-in-out active:scale-95">
  Submit Now
</button>
```
