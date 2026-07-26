# KILLING ROOM

A first-person open world set in **downtown Austin, Texas** — built entirely from
code. Every building, street, tree, vehicle, sound and person is generated at
boot from a seed; there is not a single model file in the repository.

Textures work the same way by default — every surface is painted with a 2D
canvas at boot. There is also an optional pass of photographic material art,
generated through the Higgsfield MCP and baked into the same atlas offline; see
[The art](#the-art). The game runs identically without it.

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

**They spawn behind you.** Nobody may materialise in your field of view, so
ahead of you people appear 94 m out and walk in. That rule applied in every
direction is why the pavement used to be empty: 320 people spread over a
94–206 m annulus is 105,000 m² of city, the disc around you fills only by
diffusion, and the far edge recycles them away again. Measured at Congress and
6th, two minutes in, it put **two** pedestrians within 60 m and none within 30.
Behind you they now start from 16 m — turning round to find someone already
walking there is indistinguishable from their having walked in — and the same
corner holds 4 within 12 m, 10 within 30 and 25 within 60, stable over two
minutes. The facing direction comes from the camera, not the player's yaw, so
it still holds while you're driving.

`node tools/streetcheck.mjs` prints that fill-in curve for four locations.

They have faces, and the faces are **painted, not modelled**. A head at
conversation range is about sixty pixels tall and an eye is four of them;
modelling that with geometry gives you boxes stuck on a drum. What actually
reads as a face at that size is shading — the dark under the brow, the shadow
beside the nose, the line between the lips — so the skull is a smooth surface
and the face is a texture multiplied into the skin.

The skull is one lofted surface from chin to crown, rings stacked on a profile
curve with normals accumulated from the faces, so it shades as a continuous
curve rather than a stack of drums. The nose, brow ridge, chin and lower lip
are *displacements of that same surface* — cosine lobes blended into it — so
there is nothing glued to the face to catch the light wrongly, and they cost
no triangles at all. Only the ears are separate geometry, because they sit on
the silhouette where no amount of painted shading can put them.

Multiply is the only operation available, so the texture can darken but never
lighten. That turns out not to matter: everything that reads as a feature at
distance — lashes, brows, nostrils, lip line, the hollows — is darker than the
surrounding skin. Painting them as fractions of the skin tone rather than fixed
colours is also what lets one small texture work across every skin tone in the
crowd. Four variants sit in a 2×2 grid, picked per person from their build,
which is already on the GPU — so a crowd of varied faces costs no extra
instance data. Every cell has a white border, which is how the other 95% of the
body shares the texture without knowing it exists.

2,752 triangles a head at high, on 3,064 vertices — *fewer* vertices than the
box-built head it replaced, because a loft shares them between rings.

Hair and beards are shells riding the same profile, with their edges carved by
pulling geometry inside the skull. The hairline uses a smooth ramp and the
beard a hard cut, which looks like an oversight and isn't: the hair shell is
10 mm proud, so a ramp genuinely crosses the scalp and the edge lands on a
smooth curve, while the beard is only 6 mm proud, so a ramp parks it *at* the
surface and the two interpenetrate in a ragged stripe. Shell clearance decides
which you want.

**All of them are one draw call.** The humanoid is a single box-built mesh
where every vertex carries a bone id, a body-part id and a joint pivot; the
whole walk cycle — hips, knees, shoulders, elbows, spine twist, head
counter-rotation, pelvis bob — is solved in the vertex shader from a per-person
phase. Accessories are all present in the mesh and collapse to zero area for
anyone who doesn't have them, which is how one geometry yields hundreds of
visibly different people.

---

## The art

Every surface is painted from code at boot, and the game ships that way. But
the material tiles — asphalt, sidewalk, limestone, brick, grass, decomposed
granite, corten, live oak bark — are also available as photographic 2K art
generated through the **Higgsfield MCP**, listed in `art/higgsfield.json` with
the job id and prompt behind each one.

The generator was handed the *same hex palettes the procedural painter uses*,
so the photographs land in the colour space the lighting was tuned against
rather than fighting it. `npm run bake-art` then:

1. downloads the 2K originals,
2. makes them genuinely seamless — wrap-offset by half, then heal the seam
   cross with a feathered band lifted from clean interior pixels, because
   "seamless" in a prompt is a request, not a guarantee, and a bad tile shows
   up as a visible grid the moment it repeats down a hundred metres of road,
3. pulls each one's mean luminance towards the procedural tile it replaces,
4. downscales by repeated halving rather than one 8:1 bilinear step, and
5. composites them into the atlas layout — same tile order, same rects, from
   the same `buildAtlas()` the game calls, so the layout cannot drift.

It writes **one atlas per tile size**: 2048² for high and ultra, 1536² for
medium, 1024² for low. That is the point of doing it offline — texture memory
scales with the tier on the same dial as everything else, instead of a laptop
paying for 2K art it will never resolve. At boot the game asks for the size
matching its tier; if `public/tex` is empty, or the file is missing, or the
fetch times out, it paints the tiles itself and nothing else changes. `F3`
reports which one you got.

Windows, storefronts, signage and lamp lenses stay procedural on purpose:
those are structure, not material, and a photograph is the wrong tool for a
facade whose window grid has to line up with the geometry behind it.

---

## Playing it

**On foot**

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
| `F` | Take the nearest vehicle |
| `T` | Skip an hour |
| `F3` | Performance overlay |
| `P` / `Esc` | Pause |

**Driving**

| | |
|---|---|
| `W` / `S` | Throttle / brake, then reverse |
| `A` / `D` | Steer |
| `Space` | Handbrake — breaks traction, so you can swing it round |
| Mouse | Swing the chase camera; it re-centres behind you |
| `V` | Cycle chase / close / bonnet camera |
| `H` | Horn |
| `F` | Get out |

Five weapons, all procedural view models with hitscan ballistics, spread that
opens when you sprint and tightens when you aim, recoil, tracers, impact
decals and shell ejection. Shooting people raises a wanted level; APD spawn and
close on you; sirens come up in the audio bed. The level cools off if you break
line of sight long enough.

There is a full day/night cycle (25 real minutes per in-game day). Window
lights come on across the skyline, streetlights pool on the pavement, headlight
cones sweep the roads, the traffic bed quietens and the cicadas take over.

### Driving

Walk up to any car in traffic and press `F`. The AI instance is recycled onto
another lane so density stays constant, and you get the same body, the same
colour, and handling that matches the shape — a bus wallows, a pickup leans, a
pedicab is a bicycle.

The model is arcade, not a simulation, but it has the handful of things that
make driving feel like driving: steering lock that closes down as you speed up,
a lateral grip budget you can break with the handbrake to swing the tail out,
weight transfer you can see in the body roll and dive, and collisions that
scrub speed in proportion to how square the hit was. Hit a wall hard enough and
the car takes damage and so do you. Hit a person and they go over the bonnet,
the crowd scatters, and the wanted level goes up.

The camera is a spring arm behind the car. It swings out as you turn, re-centres
faster the quicker you're going, pulls in when a wall is about to come between
it and you, refuses to end up underground, rolls slightly into corners, and
widens its field of view with speed.

**Still not built:** there's no mission structure — it's a sandbox.

---

## Running on a slow machine

Quality is measured and governed, not guessed at once and left alone.

**It benchmarks your machine before it builds the world.** Draw distance and
crowd size can be given back at any moment, but polygon density is baked into
the merged chunk meshes at generation time — so a probe runs first: a few
frames of a deliberately shading-heavy workload, timed with a pipeline flush,
which tells you what the GPU can *do* rather than what its name suggests. The
result picks the tier. A tier you choose by hand always wins and sticks.

**Then a governor watches frame time forever after.** It gives quality back in
a fixed order, cheapest first — render scale, then crowd density, then draw
distance, then shadows — twelve rungs in all, dropping two at once if the 95th
percentile frame time collapses, and climbing back only when *both* the average
and the tail are comfortable so a single stutter can't permanently downgrade
you. If it runs out of rungs and the machine is still struggling, the remaining
cost is geometry it can't undo, so it lowers the tier (which persists) and says
plainly that a reload will rebuild at that density.

Everything it does is visible on `F3`.

**Geometry scales with the tier.** The same generators produce a very different
number of triangles depending on what the machine can carry:

| Tier | City triangles | Detail |
|---|---|---|
| low | ~0.54 M | box massing, flat ground, four-sided poles |
| medium | ~1.58 M | chamfered towers, slab bands, subdivided ground |
| high | ~1.93 M | window reveals, cornices with dentils, garage deck slabs, round trunks and limbs |
| ultra | ~1.98 M | as high, with the longest draw distance |

Characters scale the same way: 804 triangles at low, 1,992 at medium, 2,752 at
high — round limbs that taper correctly at the joints, a lofted skull with a
painted face, shoes with soles, hands with thumbs, collars, cuffs and belts.
Low tier drops the ears and the garment trim entirely and halves the skull's
ring count; every tier above it collapses that detail past 34 m.

`npm run polycount -- high` prints the census for any tier.

The structural work underneath all of that:

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
npm run polycount    # triangle census per tier
npm run bake-art     # composite the Higgsfield material art into the atlas
node tools/debug.mjs # dump the texture atlas, overhead surveys, skyline elevations, character sheet
```

Both run against a real Chromium with WebGL. `tools/debug.mjs` also prints a
per-landmark audit (where each one actually landed and how tall it is) and a
surface probe that reports which atlas tile is under any given point — the
fastest way to diagnose a generation bug.

---

## Layout

```
art/         higgsfield.json — the generated material art, job by job
src/
  core/      rng, math, quality tiers + adaptive scaler, input, renderer, loop
  gfx/       procedural texture atlas, shared materials, mesh builder, sky
             bakedatlas.js (optional photographic albedo, per tier)
  world/     austin.js (the map, as data) · roads · buildings · landmarks
             nature · props · bats · world.js (the generator)
  agents/    archetypes · pedmesh (the GPU-animated humanoid) · crowd · traffic
  player/    controller · weapons
  physics/   collision.js (spatial-hash AABBs, swept capsule, DDA raycast)
  audio/     Web Audio synthesis
  ui/        hud · minimap
tools/       smoke.mjs · debug.mjs · polycount.mjs · bake-art.mjs
```

Fictional sandbox. Geography approximates the real downtown grid; nothing here
is affiliated with anyone.
