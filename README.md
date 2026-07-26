# KILLING ROOM

A first-person open world set in **downtown Austin, Texas** — built entirely from
code. No models, no photographs, no textures on disk. Every building, street,
tree, vehicle, sound and person is generated at boot from a seed.

```bash
npm install
npm run dev      # http://127.0.0.1:5173
```

Click **Enter the city**, then click the canvas to lock the mouse.

---

## The map

The playable area is the quadrilateral the brief asked for: **Lamar Blvd** on
the west, **7th Street** on the north, **I‑35** on the east, and **Riverside
Drive** on the south — which means the map spans Lady Bird Lake and includes
both shores. Roughly 2.1 × 1.6 km of city.

It is laid out from **Edwin Waller's 1839 plan**, not invented: 276 ft blocks
separated by 80 ft streets, with Congress Avenue widened to 120 ft and aimed at
the Capitol. That gives a 108.5 m block pitch, which lines up with the real
latitudes and longitudes to within a couple of metres — the reason the skyline
reads correctly when you look north from the south shore.

The north–south avenues are named for Texas rivers in their true west-to-east
geographic order (Rio Grande through Sabine), with West Ave and East Ave as the
original city limits — I‑35 was later built straight down East Ave, which is
why it sits exactly fourteen blocks east of West Ave. Street placement was
cross-checked against Austin's addressing convention: 100 W is Congress →
Colorado, 200 W is Colorado → Lavaca, and so on, so City Hall at 301 W 2nd
lands between Lavaca and Guadalupe and Block 185 at 601 W 2nd lands between
Nueces and Rio Grande.

### Landmarks

53 real buildings are modelled individually, each from its actual height, floor
count, footprint and massing:

| | |
|---|---|
| **Frost Bank Tower** | limestone podium with a colonnade, a pinwheel shaft whose corner notches deepen as it rises, and the folded glass "owl eyes" crown with the logo discs |
| **The Independent** | four stacked cuboid tiers sliding out over each other, and the famously blunt flat top with its off-centre damper box |
| **The Austonian** | one slender unbroken shaft with curved end bays and a cantilevered roof blade |
| **Waterline** | Texas's tallest — a tapering finned shaft with a raked crystalline cap, dominating the east end |
| **Sixth and Guadalupe** | three stacked volumes sheared on a slant to duck under the Capitol view corridor |
| **Google / Sail Tower** | a bowed west face and a roofline raking up to a knife-edge prow over the lake |
| **100 Congress** | the stepped bronze gable that terminates Congress Avenue at the water |
| **One American Center** | the bronze postmodern ziggurat |
| **Austin City Hall** | canted limestone strata under a folded copper roof, with the cantilevered "stinger" prow |
| **Seaholm Power Plant** | the Art Moderne turbine hall and its row of five smokestacks |
| **The Driskill** | the ornate 1886 corner block with turret pavilions, plus the plain 1930 brick annex behind |
| **Paramount Theatre** | a narrow decorated street wall, a blank fly tower, and the vertical blade sign |
| **Central Library**, **W Austin / ACL Live**, **The Republic**, **Indeed Tower**, **Fairmont**, **Long Center**, **Palmer Events Center**, the Rainey Street towers, and 30 more |

Everything else — around 800 more buildings — is generated: blocks are
subdivided into street-fronting lots with shared party walls, and filled with
midrises, parking garages, warehouses, and the two-and-three-storey Victorian
commercial fronts of Dirty Sixth. Height falls off away from the Congress/6th
core the way it really does. A few blocks are always excavation sites with
tower cranes, because this is Austin.

### The rest of downtown

- **Lady Bird Lake** with all six crossings — Lamar's 1942 arch bridge, the
  Pfluger pedestrian bridge, the UP railroad viaduct, the S 1st St bridge, the
  Ann W. Richards Congress Avenue bridge, and elevated I‑35.
- **Shoal Creek** and **Waller Creek**, cut into the terrain.
- **Auditorium Shores** with the Stevie Ray Vaughan statue, **Butler Park**
  with its spiral observation hill, **Republic Square**, **Brush Square**, the
  **Waterloo Greenway** amphitheatre, and the Ann and Roy Butler hike-and-bike
  trail with its boardwalk out over the water.
- **Rainey Street** — the 1884 off-grid addition, bungalow bars with string
  lights and food trucks, hemmed in by residential towers.
- Six tree species (live oak, pecan, bald cypress, cedar elm, crepe myrtle,
  palm), ~2,300 of them, placed by district.

### The bats

At dusk, roughly the right number of Mexican free-tailed bats pour out of the
expansion joints under the Congress Avenue bridge and stream off downstream.
Stand on the bridge around 20:00 in-game.

---

## The people

The crowd is generated per-person, not picked from a set of prefabs. Each one
rolls a skin tone from ten values spanning the full human range, a hairstyle
and colour, height and build, garments from their archetype's palette, and a
bundle of accessories — so no two are identical and no archetype is monolithic.

Twelve archetypes, weighted by district: **hipsters** around Rainey, **tech
workers** in the Seaholm district, **runners and cyclists** on the lake trail,
**UT students** (both the burnt-orange gameday crowd and the sorority crowd),
**musicians** loading gear on 6th, **service industry** workers, **tourists**,
**downtown professionals**, and **unhoused people** — the last portrayed as
people, with packs and bedrolls, more often resting than walking, concentrated
where they actually are: near the ARCH on 7th and under I‑35. Plus **APD**,
who only ever show up because of you.

They navigate a graph built from the sidewalk rings of every block, plus path
grids through the parks, with crossings linked at the corners. They steer
around each other, give you personal space, stop to look at things, and scatter
when the shooting starts.

**All of them are one draw call.** The humanoid is a single box-built mesh
where every vertex carries a bone id, a body-part id and a joint pivot; the
whole walk cycle — hips, knees, shoulders, elbows, spine twist, head
counter-rotation, pelvis bob — is solved in the vertex shader from a per-person
phase. Accessories are all present in the mesh and collapse to zero area for
anyone who doesn't have them, which is how one geometry yields hundreds of
visibly different people.

---

## Playing it

| | |
|---|---|
| `W A S D` | Move |
| Mouse | Look |
| `Shift` | Sprint |
| `Ctrl` / `C` | Crouch |
| `Space` | Jump |
| LMB | Fire |
| RMB | Aim down sights |
| `R` | Reload |
| `1`–`5`, wheel | Switch weapon |
| `T` | Skip an hour |
| `F3` | Performance overlay |
| `P` / `Esc` | Pause |

Five weapons, all procedural view models with hitscan ballistics, spread that
opens when you sprint and tightens when you aim, recoil, tracers, impact
decals and shell ejection. Shooting people raises a wanted level; APD spawn and
close on you; sirens come up in the audio bed. The level cools off if you break
line of sight long enough.

There is a full day/night cycle (25 real minutes per in-game day). Window
lights come on across the skyline, streetlights pool on the pavement, headlight
cones sweep the roads, the traffic bed quietens and the cicadas take over.

**Not built yet:** vehicles are ambient traffic only — you can't get in and
drive one, which is the obvious missing GTA verb. There's also no mission
structure; it's a sandbox.

---

## Running on a slow machine

This was built to stay playable on a cheap laptop or a phone, so the
performance work is structural rather than cosmetic:

- **The entire city is ~60 draw calls.** One canvas-drawn texture atlas covers
  every surface; each vertex carries the atlas rect for its tile and the
  fragment shader wraps UVs inside that rect, so a 200 m facade and a kerbstone
  can share one material. Everything static is merged into 260 m chunk meshes
  that frustum-cull as units.
- **The crowd is one draw call**, animated on the GPU (above). Traffic is one
  per body type. Tree canopies are one per species. Streetlight pools and
  headlight glows are one instanced mesh each.
- **Four quality tiers** with an **adaptive resolution scaler** that watches
  frame time and quietly drops render scale before the frame rate collapses,
  then walks it back up when there's headroom. Crowd count, draw distance,
  shadow resolution, tree distance and particle budgets all scale with the
  tier; the starting tier is guessed from the GPU string, core count and
  memory, one notch conservative.
- Lighting is one directional sun with a texel-snapped shadow cascade that
  follows the player, plus one hemisphere bounce. No deferred pass, no SSAO,
  no screen-space reflections.

Touch controls (left half drag to move, right half to look) are wired up for
phones.

---

## Tools

```bash
npm run smoke        # boot headless, screenshot 12 vantage points, fail on any console error
node tools/debug.mjs # dump the texture atlas, overhead surveys, skyline elevations, character sheet
```

Both run against a real Chromium with WebGL. `tools/debug.mjs` also prints a
per-landmark audit (where each one actually landed and how tall it is) and a
surface probe that reports which atlas tile is under any given point — the
fastest way to diagnose a generation bug.

---

## Layout

```
src/
  core/      rng, math, quality tiers + adaptive scaler, input, renderer, loop
  gfx/       procedural texture atlas, shared materials, mesh builder, sky
  world/     austin.js (the map, as data) · roads · buildings · landmarks
             nature · props · bats · world.js (the generator)
  agents/    archetypes · pedmesh (the GPU-animated humanoid) · crowd · traffic
  player/    controller · weapons
  physics/   collision.js (spatial-hash AABBs, swept capsule, DDA raycast)
  audio/     Web Audio synthesis
  ui/        hud · minimap
tools/       smoke.mjs · debug.mjs
```

Fictional sandbox. Geography approximates the real downtown grid; nothing here
is affiliated with anyone.
