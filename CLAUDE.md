# OpenRide.bike — Claude Code Session Context

At the start of every session, read this file first:
C:\OpenRide.bike\openride-project-master.txt

It contains the full project context, build rules, image generation rules,
voice guidelines, and division of labor. Do not proceed with any task
until you have read it.

## Copy Rules (mandatory, every commit)

Before committing any HTML file that contains visible text changes,
run the content through the openride-voice rules:

1. No em dashes or en dashes anywhere in copy. Use periods, commas, or rewrite.
2. No AI vocabulary (embark, nestled, vibrant, breathtaking, seamless, tapestry, etc.)
3. No cycling clichés (epic, adventure awaits, hit the trail, push your limits, etc.)
4. No exclamation points in body copy.
5. Every location named specifically with mileposts where relevant.
6. No sentence tells the reader how to feel. Describe what they'll see.
7. Short sentences for emphasis, longer ones for explanation.
8. Read it like Chris would say it to a rider at the start of Day 2. If it sounds like a brochure, rewrite it.

Full rules: ~/.claude/skills/openride-voice/SKILL.md

## PDF Preview Rule
Every route page with a PDF modal MUST blur below the fold.
See natchez-trace-lower.html modal-blur-overlay pattern.
Never show full PDF content in a modal. Always include a $19 buy CTA.
