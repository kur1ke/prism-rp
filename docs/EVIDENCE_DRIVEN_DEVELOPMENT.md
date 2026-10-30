# PrismRP — Evidence-Driven Development

**Status:** Active · **Scope:** design, debugging, implementation and review.

## Principle

**We do not invent hypothetical problems in order to build solutions for them. We solve observed problems.**

Boundary cases matter when they follow from a demonstrated defect, documented requirement or protected architectural invariant. Imagined conflicts alone do not justify additional guards, model calls, state machines or restrictions.

## Workflow

1. **Observe:** record actual behavior with user reproduction, Debug, failing test or a demonstrable code contradiction.
2. **Trace:** follow the real inputs and source-bound events to the outcome. Label hypotheses as hypotheses.
3. **Minimize:** fix the causal mechanism rather than adding another controller or semantic interpretation layer.
4. **Protect:** test relevant boundary cases from the reproduction and required invariants, including chat and swipe isolation, source provenance, async freshness, replay, and Card/Scene/Experience/World separation.
5. **Verify:** run applicable tests/build and live mirror tests when possible; label anything unperformed **NOT RUN**.

## Clothing / RP / DRAW

- The RP model develops the narrative; Observer extracts its grounded state changes and does not grant permission to act.
- Initial wear is an initial scene condition, like an optional first scenario message, **not a permanent wardrobe authority**.
- An incomplete outfit is not an exhaustive inventory. **Unknown is not absent; not visible is not removed.**
- Historical/gallery images cannot override current wear merely because they appear in a current reply.
- Do not assert that a negative tag or validation rule caused a particular failure without tracing the actual event, current branch state and final prompts.
- Do not add clothing constraints to address invented replacement-garment scenarios.

## PR evidence gate

Describe the **observed failure**, **reproduction**, **verified cause**, **minimum fix**, **invariant-based boundary cases**, **checks actually run**, and **remaining uncertainty**. Investigate unverified assumptions before implementation.

This guideline supplements `AGENTS.md` and branch review protocols; it does not override their protected invariants.
