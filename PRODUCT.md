# Product

## Register

product

## Users

Co-living couples who share meals but often work mismatched schedules. Both own
smartphones (iOS or Android), at least one cooks regularly, and both have
opinions on food — frequently including dietary restrictions, allergies, or
intolerances. Their context of use is the end-of-day, low-energy moment when the
question "what do you want to eat?" usually stalls. They open the app on mobile,
start a **live, synchronized session**, and within ~2 minutes of swiping have a
concrete dinner decision. The relationship is strictly 1:1 — a "pod" is exactly
two people sharing one cookbook, one shopping list, and one pantry, with
per-user dietary filters that are never shared.

## Product Purpose

cookDaddy replaces the daily "what's for dinner?" negotiation with a fast,
playful, shared decision. Each partner swipes Tinder-style through a deck of
recipes in a live session; when both right-swipe the same recipe it's a
**match** — saved to the shared cookbook, with ingredients flowing to a
pantry-aware shopping list. Success is: short time-to-decision, matches that
actually convert into cooked meals and grocery runs, and a discovery experience
that feels collaborative rather than transactional. The match moment is the
payoff that justifies every other surface.

## Brand Personality

**Playful · Bold · Dopamine-rich.** The voice is energetic and satisfying,
closer to a polished mobile game than a utility. It leans deliberately into
variable reward and game-feel: the match celebration is the emotional core, and
the craft of motion, haptics, and timing carries the brand. Confident and fun,
never timid — but the energy is earned through restraint, not constant noise.

## Anti-references

- **Generic recipe-app clutter** — no dense, ad-heavy, SEO-recipe-blog
  aesthetic (Allrecipes / Yummly): walls of cards, busy filter chrome, content
  overload. The deck is the hero; one decision at a time.
- **Sterile productivity SaaS** — no cold gray enterprise-dashboard energy.
  Shopping list, pantry, and cookbook are personal and shared, not a
  spreadsheet.
- **Childish / cartoonish** — no mascots, comic-sans energy, or balloon
  gradients. Playful but tasteful and adult; craft over cute.

## Design Principles

1. **The match moment is the product.** Every other surface earns its keep by
   getting two people to a shared "yes" faster. Optimize the path to the
   payoff, not the surfaces around it.
2. **Restraint preserves potency.** Only matches get the full celebration;
   ordinary swipes whisper, not shout. Rarity is what keeps the reward potent —
   constant celebration habituates and reads as noise.
3. **Two people, one ritual.** Favor synchrony and shared state over individual
   optimization. Both phones do the same thing at the same time; the partner is
   present on screen. Bonding is a feature, not a side effect.
4. **Reward the loop, never fake it.** Variable reward is intentional and
   ethical; engineered FOMO and fake near-matches are banned — they erode trust
   faster than they build engagement. If they didn't both swipe right, the
   system stays silent.
5. **Playful, but adult.** The bar is tasteful craft: precise motion,
   confident color, real polish. Fun comes from quality and timing, never from
   gimmicks.

## Accessibility & Inclusion

- **WCAG 2.1 AA** as the standard: body text ≥4.5:1 contrast, large text ≥3:1,
  full screen-reader labelling on interactive surfaces (deck, match overlay, tab
  bar, lists).
- **Reduced motion is a hard requirement.** Every match/celebration animation
  has a `prefers-reduced-motion` alternative (crossfade or instant), per the
  existing MATCH-UX spec.
- **Color-blind safe.** Success/danger and match/pass signals must never rely on
  color alone — pair with icon, label, or position so the meaning survives
  deuteranopia/protanopia.
