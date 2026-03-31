# Vocabify Browser Extension

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

### Available gstack skills

**Planning & Review:**
- `/office-hours` - Product idea forcing questions
- `/plan-ceo-review` - CEO perspective planning review
- `/plan-eng-review` - Engineering manager review
- `/plan-design-review` - Design review
- `/autoplan` - Automated planning

**Design:**
- `/design-consultation` - Design system consultation
- `/design-shotgun` - Generate design variants
- `/design-html` - Production HTML from design
- `/design-review` - Design review

**Development:**
- `/review` - Staff-engineer-level code review with auto-fixes
- `/qa` - Real browser testing with bug fixing
- `/qa-only` - QA testing only (no fixes)
- `/benchmark` - Performance benchmarking
- `/investigate` - Deep investigation
- `/codex` - Cross-model review via OpenAI
- `/learn` - Project-specific learnings

**Security & Safety:**
- `/cso` - Security audit (OWASP Top 10 + STRIDE)
- `/careful` - Destructive command warnings
- `/freeze` / `/unfreeze` - Edit scope restrictions
- `/guard` - Combined safety guardrails

**Shipping:**
- `/ship` - Release automation
- `/land-and-deploy` - Production deployment
- `/canary` - Post-deploy monitoring
- `/document-release` - Auto-update documentation

**Browser & Setup:**
- `/browse` - Chromium browser control via Playwright
- `/connect-chrome` - Live Chrome control
- `/setup-deploy` - Deployment configuration
- `/setup-browser-cookies` - Browser cookie setup

**Meta:**
- `/retro` - Weekly retrospectives
- `/gstack-upgrade` - Update gstack

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
