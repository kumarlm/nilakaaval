# Privacy policy — Gym app

`gym.html` here is a corrected replacement for
[`nothingdeveloped/pps/gym.html`](https://github.com/nothingdeveloped/pps), which
is served at <https://nothingdeveloped.github.io/pps/gym.html> and is the URL on
the Gym app's Google Play listing.

It lives in this repository only because this session had write access to
`kumarlm/nilakaaval` and not to `nothingdeveloped/pps`. Copy the file over
`gym.html` in that repo and let GitHub Pages redeploy, then re-submit the app
for review.

## Why Google rejected the old policy

1. **App or developer details don't match.** The old policy only said
   *"Application refers to Gym"* and *"Company … refers to Gym"*. It never named
   the developer/publisher, so nothing in it could be matched against the Play
   listing.
2. **Missing data disclosure — Health Data.** Gym is a workout tracker, so
   everything the user enters is health and fitness data under Google's User Data
   policy. The old policy listed only "Usage Data" and never mentioned workouts,
   body measurements, or fitness profile information at all.

## Verify before publishing

These values must match the Play store listing character-for-character, and one
of them is a guess:

| Field in `gym.html` | Value used | Status |
| --- | --- | --- |
| App name | `Gym` | Confirm it is the exact listing title |
| Developer/publisher name | `nothingdeveloped` | Confirm against the listing |
| Contact email | `nothingdeveloped@gmail.com` | Taken from the old policy |
| Package name | `com.nothingdeveloped.gym` | **Guessed — replace with the real application ID** |

Also confirm these behavioural statements are true of the shipped app, since the
policy now asserts them and they must agree with the Play Data Safety form:

- Health and fitness data is stored on-device, not on a server we control.
- The app does not read device sensors or Health Connect / Google Fit in the
  background. If it does integrate with Health Connect, that has to be disclosed
  explicitly here.
- No advertising SDK receives health data.
- Crash/diagnostic reporting exists (the policy discloses it). If the app ships
  no crash reporter at all, delete that section rather than over-disclosing.

Clauses removed from the old policy because a workout tracker almost certainly
does not do them, and claiming them contradicts a "no data shared" Data Safety
declaration: sharing with *business partners* for promotions, sharing with
*affiliates*, sharing *with other users* in public areas, and marketing email
about "special offers".
