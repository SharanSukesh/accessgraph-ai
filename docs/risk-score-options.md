# Should the anomaly flag feed the risk score?

Roadmap item 30. This is a decision paper; the risk formula is unchanged until a decision is made.

## The problem

A user's risk score combines several factors: privileged permissions, sensitive data access, breadth, dormancy, sole access, and **peer deviation** (weight 0.35). Peer deviation is driven by the access-anomaly flag. So a flagged user's risk level partly restates the flag, and "rank" (how unusual the access is) and "risk" (how much damage the access could do) aren't independent.

Today Newton works around this by showing **base risk** (the score without the flag) next to every anomaly rank.

## The options

1. **Keep the flag in the score and show both numbers** (today). Every screen that shows a user's risk also shows base risk.
2. **Remove peer deviation from the risk score.** Risk measures impact only, and anomalies stay a separate signal.
3. **Keep peer deviation at a lower weight**, e.g. 0.15, so being unusual nudges the score without moving a level on its own.
4. **Use the flag only as a tie-breaker** when sorting users within a level, never to change the level.

## What each option does on Lumenvale

Numbers are from the synthetic Lumenvale fixture: 400 users and 8 flagged access anomalies. `apps/backend/scripts/risk_options.py` recomputes them; nothing else is changed. Only flagged users can move, because unflagged users have no peer-deviation points.

| Option | Critical | High | Medium | Low |
|---|---:|---:|---:|---:|
| 1 (today: flag in the score, weight 0.35) | 5 | 35 | 197 | 163 |
| 2 and 4 (no peer deviation; equal to base risk) | 5 | 31 | 201 | 163 |
| 3 (peer deviation at 0.15) | 5 | 32 | 200 | 163 |

The 8 flagged users, in rank order, with their score today, at 0.15, and without peer deviation:

| User | Today | At 0.15 | Without |
|---|---|---|---|
| Jun Jovanovic (#1) | 62.9 High | 51.5 High | 43.0 Medium |
| Hayden Galloway | 68.5 High | 58.8 High | 51.5 High |
| Dmitri Fennimore | 68.2 High | 58.4 High | 51.1 High |
| Mina Tanaka | 69.1 High | 59.6 High | 52.5 High |
| Oskar Holloway | 69.2 High | 59.8 High | 52.7 High |
| Fatima Abernathy | 52.3 High | 37.7 Medium | 26.8 Medium |
| Noor Whitlock | 58.5 High | 45.8 Medium | 36.3 Medium |
| Freya Castellan | 58.4 High | 45.8 Medium | 36.3 Medium |

Under option 3, Jun Jovanovic stays High *only* because of the flag (51.5 with it, 43.0 without). This is the double-counting the item asks about, at a smaller weight.

## Trade-offs

| | Pros | Cons |
|---|---|---|
| 1. Keep, show both | No change; nothing to re-explain to a client who has already seen scores | Two numbers on every screen; risk partly restates the flag |
| 2. Remove | Risk means impact only, and anomalies stay a separate signal; simplest to explain; matches base risk, which Newton already shows | Four of Lumenvale's flagged users drop from High to Medium; earlier reports' levels differ |
| 3. Lower weight | Being unusual still raises the score a little | 0.15 needs a rationale that's hard to defend; still moves a level on its own for users near a boundary (Jun Jovanovic above) |
| 4. Tie-breaker | Levels equal option 2; within a level, flagged users sort first | Ordering within a level depends on the flag, which users of the list need to know |

## Recommendation (for discussion)

**Option 2, with option 4's ordering.**
- Risk becomes impact only, so it equals base risk.
- Anomalies stay their own signal, with a rank and reasons.
- Within a level, flagged users sort first.

This removes the double count without inventing a weight. It drops the second number from every screen, since base risk becomes the risk. It also keeps the flagged users visible where people look first.

## If it changes

- **Methodology version:** the change bumps the risk method's version, which the evidence block (item 20) shows. Reports made before it keep showing the version they used.
- **Runbook figure:** Lumenvale's "40 high-risk" (35 High plus 5 Critical) becomes **36** (31 plus 5). The runbook and its tests change with it. The Health Report's 41 / 18 / $183,180 doesn't use these levels, so it doesn't move.
- **Validation:** item 10's validation can then check whether anomalies that reviewers marked "not useful" were the ones whose level only moved because of the flag.
