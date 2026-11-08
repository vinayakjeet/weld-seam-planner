# Weld Seam Planner

A browser app that turns an STL part into a robot weld plan. Drop in a part and it finds the weld seams for you (concave creases, contact lines between touching bodies, intersection curves between penetrating ones), assigns weld procedures with heat input and travel speed checked against the leg size, works out the ISO 6947 and AWS positions from gravity, samples a torch pose every 5 mm in a documented frame, orders the seams for the least air travel, and exports one validated JSON job a controller can run. Seams a rigid torch cannot reach are flagged and handed to a snake-arm reach model that plays the arm in through a manhole, so the plan ends where a fixed robot stops: inside a closed tank.

Everything runs in the browser. The part never leaves the machine, heavy geometry runs in a Web Worker, and the page makes no request to any other origin.

Author: Vinayakjeet Singh Karki, f20221641@pilani.bits-pilani.ac.in

## Live demo and deep link

- Live app: https://weld-seam-planner.vercel.app
- Snake-arm demo in one click: https://weld-seam-planner.vercel.app/?sample=tank-with-manhole&demo=1

The demo link loads the tank sample, accepts its seams with the spray procedure, places a port on the manhole, runs reach, and stops the arm at a reached station on seam S16, inside the tank where no rigid torch fits. `demo=1` is defined only for `tank-with-manhole`; on any other sample the link loads the sample normally and says so in a notice. `?sample=<id>` alone opens any of the thirteen built-in samples. An unknown id shows a readable error: the id is only ever compared with the ids in the sample manifest, so no value in the address can reach a fetch. The `main` branch deploys to the production URL; every other branch gets its own Vercel preview URL.

## Quick start

Node 24 and npm.

```
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest, node)
npm run test:e2e     # browser tests (Playwright; npx playwright install first)
npm run build        # checks the schema and field table, type checks, bundles, checks the entry budget
```

Other scripts: `npm run lint`, `npm run typecheck`, `npm run schema` (regenerates the JSON Schema from the zod types), `npm run fields` (regenerates the field table in this README), `npx tsx scripts/key-numbers.ts` (measures the numbers under Key numbers), `npm run audit:visual` (not in CI: photographs every sample in both themes at 1280x800, 1440x900 and 1920x1080 through the six steps, the six standard views and the dialogs, and writes a checks.json of clipped, covered, overlapping and low contrast text per screen to test-results/visual-audit; AUDIT_ONLY, AUDIT_SIZES and AUDIT_THEMES narrow it).

## The six-step workflow

The stepper across the top bar walks a plan from part to file. The number keys jump to the steps.

| Key | Step | What happens there |
| --- | --- | --- |
| 1 | Import | Open an STL or one of the samples: binary or ASCII, in mm, inches or metres, with a unit guess you confirm when it is unsure. |
| 2 | Seams | Review the detected candidates, accept or reject them (A, Shift+A), draw a seam on the part (D), split (S), reverse (R), and set the joint type and plate thickness in the inspector. Detection settings and the weld tolerance live here. |
| 3 | Procedures | Assign a procedure from the library to one seam or a selection, override single values per seam, set the fillet leg; heat input and travel speed are checked live. |
| 4 | Access | Every accepted seam gets a free-cone clearance and a class (standard, slim, snake, blocked). Place ports, edit the snake arm, run reach and play the arm in. |
| 5 | Sequence | Order the seams by table order, minimum air travel or balanced heat, lock seams in place, reverse directions, scrub the timeline. |
| 6 | Export | Pre-flight lists every error and warning with what to do; export the job JSON or the ABB RAPID template, copy a one-line summary, or import an exported plan back onto the same part. |

Other keys: F fits the view, X toggles x-ray, Shift+1 to Shift+6 are the six standard views, Space plays the timeline, Ctrl+E exports, Ctrl+Z and Ctrl+Shift+Z undo and redo, and ? opens the full list. Keys never fire while a text field has focus. Plans autosave in the browser and are offered back when the same part is opened again.

## Who it is for

A weld or robot engineer in a shipyard or fabrication shop who has the CAD export of a welded assembly and needs a robot program skeleton: which seams, in which order, with which procedure, from which torch poses, and which ones a fixed robot cannot reach. It is built for Armatrix, whose snake-arm robots weld inside double bottoms, tanks and other closed structures, so the access step and the snake-arm model are first-class rather than an afterthought.

## Architecture and why

| Layer | Where | Why |
| --- | --- | --- |
| Domain core | `src/core` | Pure TypeScript with no React, DOM or renderer: mesh welding, seam detection, frames, positions, welding maths, access, snake kinematics, sequencing, job build and import. Every file has unit tests that run in node, so the maths is tested without a browser. |
| Worker | `src/worker` | Parsing, detection, access, reach and sequencing run in a Web Worker through comlink, so a 1M-triangle part never freezes the page. A watchdog restarts a hung worker and replays the loaded part. |
| State | `src/state` | zustand slices with zundo undo history; flows in `src/state/flows.ts` call the worker and apply results only when they still belong to the current part. |
| View | `src/ui` | React, three.js through @react-three/fiber and drei, three-mesh-bvh for picking, Radix primitives and Tailwind v4 mapped to `src/styles/tokens.css`. |
| Export format | [src/core/job/schema.ts](src/core/job/schema.ts) | One zod schema is the single source of truth: the exporter is typed by it, the importer validates with it, and [public/schema/weld-job-1.0.json](public/schema/weld-job-1.0.json) and the field table below are generated from it. The build fails when either is stale. |

Internal units are mm, degrees and seconds everywhere; units are converted only at import and for display. The viewport and the RAPID writer load as separate chunks, so the entry chunk stays under a 500 kB budget that the build enforces.

## Detection pipeline

1. **Parse and weld.** Binary and ASCII STL are read in the worker and scaled to mm. Vertices are welded on a grid whose cell is the weld tolerance times the bounding box diagonal, degenerate triangles are dropped, edges and bodies are labelled, and each closed shell is oriented outward (a body whose solids share an edge, which then has four faces, still gets a known inside when each solid is closed by itself).
2. **Creases.** An edge whose two faces bend by more than the crease angle (30 degrees by default) and that is concave becomes a crease candidate: the inside corner of a single merged body, such as a T-joint exported as one solid. A crease whose free space its own body closes off within 150 mm in every direction across the seam, along a seam at least as long as the narrowest of those distances, is the inside of a tube or a closed box (another body inside it, such as a bar through a tube, leaves it closed): it is hidden as inside a hollow section, has its own switch and count in the Detection tab, and Accept all never takes it. Where a member is fused to what it meets, as tube ends are in a frame exported as one solid, the creases round its end join into one closed weld all around, scored as a contact loop. Flush tubes have only two creases there, or one at a corner, so the outline comes from cutting the body just above the surface; a true mitre has no such surface and stays as its creases.
3. **Contact.** Where two bodies touch, faces of one that lie on the other are found with a BVH per body; the boundary of the shared area is the fillet line. Where an open tube end stands on another body, the edges inside its bore are hidden as inside a hollow section when the bore is under 150 mm across and deeper than it is wide. Where the sides of a member end close into a compact ring on another body (shortest side at least a quarter of the longest), such as a tube end butting a tube, they are offered as one closed weld all around, with the sides that lie flush with the other member included when the member runs away from it; the corners stay samples for the torch to blend round. One cut opens the loop and a second divides it.
4. **Intersection.** Where bodies penetrate (a pipe pushed through a plate), the triangle pair intersections are chained into curves.
5. **Non-manifold and corner edges.** Edges shared by more than two faces, and the outside corners of plate ends, give the remaining candidates.
6. **Classify and measure.** Each chain is smoothed back onto the curve it was tessellated from, keeping real corners, and given a joint type (fillet, lap, corner, saddle; a lap needs both plates at least 1 mm thick and a quarter of the other, so a sliver face or a gap between the bodies reads as a fillet), an opening angle, the plate thickness behind each face (where two touching bodies sit up to 1 mm apart, measured from where the ray enters the plate, not across the gap), and a confidence from 0 to 1 from the length against the part, the closeness of the opening to 90 degrees and the size of the faces beside it. A contact or intersection seam counts its length in full: two bodies that meet along a line are the strongest sign of a weld, and a short tube end on a large frame is still a whole joint. Seam ids come from a start-independent signature of the geometry, so they survive a new detection run.

### Weld tolerance

The weld tolerance (Seams step, Detection tab, Advanced) sets how close two vertices must be to be merged, as a fraction of the part diagonal: default 1e-5, range 1e-6 to 1e-3. CAD exports share exact vertices and need nothing else. A scanned or remeshed part with vertex noise can grow short, low-confidence creases beside holes; raising the tolerance (5e-4 cleans the noisy pipe-on-plate sample in 20 of 20 runs) welds the noise away. It also sets the height under which a needle triangle takes its neighbour's normal. Changing it welds the file again and detects again; seams that survive keep their ids and status. It cannot be raised freely: at 1e-3 the tank's thin plates merge. The value is written to the job as `settings.weldToleranceRel` (files without it were made at 1e-5), and importing a job welds the part at the file's tolerance before detecting, so the restored seams match the file.

## Torch frame and quaternion convention

All positions are in the part frame, in mm, right-handed. At each seam point the detector stores the tangent t along the seam and the outward normals n1 and n2 of the two plates. The torch frame is built in [src/core/torch/frames.ts](src/core/torch/frames.ts):

- b = normalize(n1 + n2), the bisector pointing out of the joint.
- a = minus b rotated about t by the work angle offset.
- z = normalize(a cos(alpha) + t sin(alpha)), where alpha is the travel angle, positive for push and negative for drag. **Tool z points from the torch into the joint.**
- x = t projected perpendicular to z and normalized: **tool x runs along travel.** y = z cross x.

The pose quaternion is that basis as **[x, y, z, w]** with w of at least 0, unit length to 1e-4. Poses are resampled every `settings.poseSpacingMm` (5 mm by default) with `s` the arc length from the arc start; at a sharp corner the orientation is blended over a short distance instead of jumping. Approach and retract run along minus tool z. Gravity is stored with the job (`frames.gravity`) because the welding positions are computed from it.

## Welding maths

The formulas below are the ones in the code, with their units.

Heat input, from [src/core/process/heatInput.ts](src/core/process/heatInput.ts):

- Arc energy E = (V x I x 60) / (1000 x v) in kJ/mm, with v the travel speed in mm/min.
- Heat input Q = k x E, with the thermal efficiency k from ISO/TR 18491 and EN 1011-1: SAW 1.0, GMAW 0.8, FCAW 0.8, GTAW 0.6.
- Checks: amber above 2.5 kJ/mm, red above 3.5 kJ/mm, amber below 0.4 kJ/mm on a part 6 mm or thicker.

Travel speed from deposition, from [src/core/process/travelSpeed.ts](src/core/process/travelSpeed.ts):

- Deposited volume per minute = WFS x 1000 x (pi x d^2 / 4) x eta in mm3/min, with WFS the wire feed in m/min, d the wire diameter in mm, eta 0.95.
- Fillet cross section = 0.5 x z^2 x (1 + r), with z the leg in mm and r the bead reinforcement, 0.1.
- Suggested travel speed = deposited volume per minute / fillet cross section, in mm/min. A procedure travel speed more than 25 percent off is amber, more than 50 percent off is red.

Per seam estimates, from [src/core/process/estimates.ts](src/core/process/estimates.ts):

- Arc time = passes x L / v, with L in mm and v in mm/s.
- Wire mass = (WFS x 1000 / 60) x arc time x (pi x d^2 / 4) x 7.85e-6 kg/mm3.
- Gas volume = flow x (arc time + pre-flow + post-flow) / 60, in L with the flow in L/min.

Fillet throat = 0.707 x leg for equal legs. A seam without a set leg takes the leg its procedure deposits (the formula above solved for z, rounded to 0.5 mm and kept within the AWS D1.1 minimum for the thicker plate and the maximum along an edge), or that minimum when the procedure has no wire feed. Cycle time = arc time + air time + the pre-flow, crater fill and post-flow of every seam + the torch cleaning stops; air time is the air move length over `settings.airSpeedMmS`.

## Access classes and the snake-arm model

For every pose (every 20 mm) the app casts rings of rays around minus tool z, 5 degrees apart up to 60 degrees, and finds the widest free cone out to 300 mm, and again out to 60 mm. The seam takes the smallest cone along its length:

| Class | Rule | Meaning |
| --- | --- | --- |
| standard | cone of 30 degrees or more | A standard torch on a fixed robot reaches it. |
| slim | 15 to 30 degrees | A slim or long-neck torch reaches it. |
| snake | under 15 degrees, but 10 degrees or more out to 60 mm | Only an arm that arrives along the seam reaches it: the snake arm. |
| blocked | less than 10 degrees out to 60 mm | Nothing fits at the joint. |

Snake seams are handed to a reach model: ports placed on the part (the arm enters along the port axis), and an arm of N links (24 x 150 mm, 80 mm diameter, 18 degrees bend between links and a 250 mm torch by default, all editable). For each station along the seam the solver pushes a straight part in along the port axis, then fits the links with a constrained FABRIK that respects the bend limit, finished with an exact Jacobian step, retries blocked stations from a chain peaked over the contact, and checks every link as a capsule against the part's BVH with the arm's clearance. The answer is a reach coverage from 0 to 1 per seam and the arc-length intervals it misses, both written into the export, and the arm can be played in along its follow-the-leader insertion path.

This is a kinematic feasibility preview with editable arm parameters, not Armatrix's controller or its real arm geometry: treat coverage as a planning estimate. Changing a port or any arm field marks earlier results stale until reach runs again.

## The job JSON

One self-contained file per plan, version 1.0.0: units and frames first, reusable procedures, every accepted seam with its sampled tool poses, the sequence, access data, a summary and the pre-flight warnings. It validates against [public/schema/weld-job-1.0.json](public/schema/weld-job-1.0.json), which is generated from the same zod types the app uses. Rules a consumer can rely on: positions in mm in the part frame, angles in degrees, quaternions unit length in x, y, z, w order with w of at least 0, `s` starting at 0 at the first pose, `sequence.order` listing every seam exactly once, and any unknown field safe to ignore (minor versions only add optional fields).

A seam welded against its stored points has `sequence.order[].reversed` true and `direction` "reverse"; its poses, start and end are already in weld direction, so a consumer welds the poses in the order given and never reverses them again. [examples/consume_job.py](examples/consume_job.py) is a 42-line standard library consumer that prints the weld order with the first and last pose of each seam; a unit test runs it against the exporter's output.

```
$ python3 examples/consume_job.py tests/unit/job/fixtures/spec-example.json
1  S07  WPS-GMAW-SPRAY-FW6  first=(1200.000, 300.000, 12.000)  last=(2000.000, 300.000, 12.000)  arc=88.9 s  access=standard
```

Every field, generated from the schema by `npm run fields` (the overrides of a seam use the procedure keys listed under `procedures[]`):

<details>
<summary>Field table (194 fields)</summary>

<!-- job-fields:start -->

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `$schema` | string | yes | Where the JSON Schema for this version lives. |
| `format` | "weld-job" | yes | Identifies the document type. |
| `version` | string | yes | Semver; minor versions only add optional fields. |
| `id` | string | yes | Job id: wj-, the UTC date and time of export to the second, and the first 8 hex of the part SHA-256. |
| `createdAt` | string | yes | Creation time, ISO 8601 UTC. |
| `generator` | object | yes | App name and version that wrote the file. |
| `generator.name` | string | yes | Name of the app that wrote the file. |
| `generator.version` | string | yes | Version of that app. |
| `units` | object | yes | Units for every number in the file; consumers must read this, never assume. |
| `units.length` | "mm" | yes | Lengths and positions. |
| `units.angle` | "deg" | yes | Every angle; quaternions are unitless. |
| `units.time` | "s" | yes | Times, except fields whose name ends in Ms. |
| `units.speed` | "mm/s" | yes | Travel and air speeds. |
| `units.wireFeed` | "m/min" | yes | Wire feed speed. |
| `units.gasFlow` | "L/min" | yes | Shielding gas flow. |
| `units.heatInput` | "kJ/mm" | yes | Heat input. |
| `units.mass` | "kg" | yes | Wire mass. |
| `frames` | object | yes | Handedness and axis conventions, gravity in the part frame, and where the part sits in the cell. |
| `frames.convention` | string | yes | Readable statement of handedness, quaternion order and tool axes. |
| `frames.gravity` | number[3] | yes | Unit gravity direction in the part frame; welding positions are computed from it. |
| `frames.partToCell` | object | yes | Where the part sits in the cell. |
| `frames.partToCell.position` | number[3] | yes | Part origin in the cell frame, in mm. |
| `frames.partToCell.quaternion` | number[4] | yes | Part orientation in the cell frame, x, y, z, w. |
| `part` | object | yes | Source file name, SHA-256, source units and scale, triangle and body counts, bounding box. |
| `part.name` | string | yes | File name of the STL the plan was made on. |
| `part.sha256` | string | yes | SHA-256 of the STL bytes in lowercase hex; a plan is only restored onto the same file. |
| `part.sourceUnits` | "mm", "in" or "m" | yes | Units the STL was drawn in. |
| `part.scaleToMm` | number | yes | Factor that took the STL coordinates to mm. |
| `part.triangles` | integer | yes | Triangle count after welding vertices and dropping degenerate triangles. |
| `part.bodies` | integer | yes | Number of separate connected bodies. |
| `part.boundingBox` | object | yes | Axis-aligned bounding box of the part. |
| `part.boundingBox.min` | number[3] | yes | Smallest corner in mm, part frame. |
| `part.boundingBox.max` | number[3] | yes | Largest corner in mm, part frame. |
| `settings` | object | yes | Detection and export settings used, so the file is reproducible. |
| `settings.creaseAngleDeg` | number | yes | Bend in degrees between neighbouring faces above which an edge counts as a crease. |
| `settings.poseSpacingMm` | number | yes | Arc length in mm between two exported poses. |
| `settings.airSpeedMmS` | number | yes | Torch speed for air moves in mm/s, used for air time. |
| `settings.approachMm` | number | yes | Approach and retract distance in mm along minus tool z. |
| `settings.cleanEveryS` | number | no | Arc time between torch cleaning stops in seconds, 0 for none. Absent in files written before cleaning was modelled. |
| `settings.cleanTimeS` | number | no | Duration of one torch cleaning stop in seconds. |
| `settings.weldToleranceRel` | number | no | Vertex weld tolerance as a fraction of the part bounding box diagonal; the seams were detected on the part welded at it. Absent in files written before it was stored, which used 1e-5. |
| `procedures` | object[] | yes | Reusable weld procedures referenced by seams. |
| `procedures[].id` | string | yes | Stable id referenced by seams. |
| `procedures[].name` | string | yes | Readable name. |
| `procedures[].process` | "GMAW", "FCAW", "GTAW" or "SAW" | yes | GMAW, FCAW, GTAW or SAW. |
| `procedures[].transfer` | "short-circuit", "spray" or "pulse" | no | Metal transfer mode. |
| `procedures[].baseMaterial` | object | yes | Material spec and the thickness range in mm this procedure covers. |
| `procedures[].baseMaterial.spec` | string | yes | Base material designation, for example S355. |
| `procedures[].baseMaterial.thicknessMm` | number[2] | yes | Plate thickness range in mm this procedure is qualified for, smaller value first. |
| `procedures[].wire` | object | yes | Filler classification and diameter in mm. |
| `procedures[].wire.classification` | string | yes | Filler wire classification, for example ER70S-6. |
| `procedures[].wire.diameterMm` | number | yes | Wire diameter in mm. |
| `procedures[].gas` | object | no | Shielding gas mix and flow in L/min. |
| `procedures[].gas.mix` | string | yes | Shielding gas mix, for example Ar 82 / CO2 18. |
| `procedures[].gas.flowLpm` | number | yes | Gas flow in L/min. |
| `procedures[].electrical` | object | yes | Current in A, voltage in V, wire feed speed in m/min, polarity. |
| `procedures[].electrical.currentA` | number | yes | Welding current in A. |
| `procedures[].electrical.voltageV` | number | yes | Arc voltage in V. |
| `procedures[].electrical.wireFeedMpm` | number | no | Wire feed speed in m/min; wire mass is estimated from it when present. |
| `procedures[].electrical.polarity` | "DCEP", "DCEN" or "AC" | yes | Electrode polarity. |
| `procedures[].travelSpeedMmS` | number | yes | Travel speed in mm/s. |
| `procedures[].ctwdMm` | number or null | yes | Contact tip to work distance in mm, null when not applicable. |
| `procedures[].torch` | object | yes | Work angle offset from the bisector in degrees, travel angle, push or drag. |
| `procedures[].torch.workAngleOffsetDeg` | number | yes | Tilt of the torch away from the joint bisector, across the seam, in degrees. |
| `procedures[].torch.travelAngleDeg` | number | yes | Lean of the torch along the seam in degrees, always 0 or more; technique gives its sense. |
| `procedures[].torch.technique` | "push" or "drag" | yes | push leans the torch forward along travel, drag leans it back. |
| `procedures[].weave` | object | yes | Pattern, amplitude in mm, frequency in Hz, dwell at the edges in ms. |
| `procedures[].weave.pattern` | "none", "zigzag", "triangle" or "circle" | yes | Weave pattern, none for a straight bead. |
| `procedures[].weave.amplitudeMm` | number | yes | Weave amplitude in mm. |
| `procedures[].weave.frequencyHz` | number | yes | Weave frequency in Hz. |
| `procedures[].weave.dwellMs` | number | yes | Dwell at each edge of the weave in ms. |
| `procedures[].arcStart` | object | yes | Pre-flow in seconds. |
| `procedures[].arcStart.preflowS` | number | yes | Gas flow before the arc strikes, in seconds. |
| `procedures[].arcEnd` | object | yes | Crater fill in seconds, burnback in ms, post-flow in seconds. |
| `procedures[].arcEnd.craterFillS` | number | yes | Crater fill time at the end of the seam, in seconds. |
| `procedures[].arcEnd.burnbackMs` | number | yes | Wire burnback after the arc stops, in ms. |
| `procedures[].arcEnd.postflowS` | number | yes | Gas flow after the arc stops, in seconds. |
| `procedures[].positions` | ("PA", "PB", "PC", "PD", "PE", "PF" or "PG")[] | yes | ISO 6947 positions this procedure is valid for. |
| `procedures[].thermalEfficiency` | number | yes | Process factor k used for heat input. |
| `procedures[].preheatC` | number | yes | Preheat temperature in degrees C. |
| `procedures[].interpassMaxC` | number | yes | Maximum interpass temperature in degrees C. |
| `seams` | object[] | yes | Every accepted seam, in no particular order. |
| `seams[].id` | string | yes | Stable id of the seam. |
| `seams[].label` | string | yes | Readable name of the seam. |
| `seams[].source` | "crease", "contact", "intersection", "nonmanifold" or "manual" | yes | How the seam was found. |
| `seams[].confidence` | number | yes | The detector score from 0 to 1. |
| `seams[].jointType` | "fillet", "butt", "lap", "corner" or "saddle" | yes | Joint type of the seam. |
| `seams[].procedureId` | string | yes | Id of the procedure to use. |
| `seams[].overrides` | object | yes | Per-seam changes to the procedure, same keys as a procedure. |
| `seams[].legMm` | number | yes | Fillet leg in mm. |
| `seams[].throatMm` | number | yes | Fillet throat in mm, 0.707 x leg for equal legs. |
| `seams[].passes` | object[] | yes | One entry per pass with lateral and vertical offsets and work-angle change. |
| `seams[].passes[].index` | integer | yes | Pass number, 1 for the root pass. |
| `seams[].passes[].lateralOffsetMm` | number | yes | Offset of this pass across the seam in mm, along tool y. |
| `seams[].passes[].verticalOffsetMm` | number | yes | Offset of this pass away from the root in mm, along minus tool z. |
| `seams[].passes[].workAngleOffsetDeg` | number | yes | Change of the work angle for this pass in degrees. |
| `seams[].intermittent` | object or null | yes | null for continuous, or segment length and pitch. |
| `seams[].intermittent.lengthMm` | number | yes | Length of each welded segment in mm. |
| `seams[].intermittent.pitchMm` | number | yes | Distance from the start of one segment to the start of the next in mm. |
| `seams[].boxing` | object | yes | Wrap around the start and/or end, with length. |
| `seams[].boxing.start` | boolean | yes | True to wrap the weld around the start of the seam. |
| `seams[].boxing.end` | boolean | yes | True to wrap the weld around the end of the seam. |
| `seams[].boxing.lengthMm` | number | yes | Length of each wrap in mm. |
| `seams[].closed` | boolean | yes | True for a loop, false for an open chain. |
| `seams[].lengthMm` | number | yes | Length in mm after trimming. |
| `seams[].direction` | "forward" or "reverse" | yes | reverse when the seam is welded against its stored points, forward otherwise; it matches sequence.order[].reversed. |
| `seams[].geometry` | object | yes | Opening angle, the two plate normals, plate thickness behind each normal, start and end points. |
| `seams[].geometry.openingAngleDeg` | number | yes | Angle between the two plate faces on the side the torch works from, 180 minus the angle between the normals, length weighted, in degrees; 90 for a square T. |
| `seams[].geometry.plateNormals` | number[3][2] | yes | Unit outward normals of the two plates at the middle of the seam. |
| `seams[].geometry.plateThicknessMm` | (number or null)[2] | no | Thickness in mm of the plate behind each normal, null where it could not be measured. |
| `seams[].geometry.start` | number[3] | yes | Where the weld starts in mm, part frame; the first pose position. |
| `seams[].geometry.end` | number[3] | yes | Where the weld ends in mm, part frame; equal to start for a closed seam. |
| `seams[].position` | object | yes | AWS and ISO 6947 position plus the two angles they were computed from. |
| `seams[].position.aws` | "1F", "2F", "3F", "4F" or null | yes | AWS fillet position, null when the ISO position has no AWS fillet name. |
| `seams[].position.iso6947` | string | yes | ISO 6947 position that covers most of the seam length, for example PB. |
| `seams[].position.inclinationDeg` | number | yes | Weld axis inclination from horizontal in degrees, length weighted over the dominant position. |
| `seams[].position.rotationDeg` | number | yes | Rotation of the weld face about the weld axis in degrees, a circular mean over the dominant position. |
| `seams[].poses` | object[] | yes | Tool poses in the order they are welded, along the travel direction: already reversed for a seam welded against its stored points. s is arc length in mm; position is the TCP at the weld root in the part frame; quaternion is the tool orientation, x,y,z,w. |
| `seams[].poses[].s` | number | yes | Arc length in mm from the arc start, along the travel direction; 0 at the first pose. |
| `seams[].poses[].position` | number[3] | yes | TCP at the weld root in mm, part frame. |
| `seams[].poses[].quaternion` | number[4] | yes | Tool orientation as a unit quaternion x, y, z, w with w of at least 0; tool z points from the torch into the joint, tool x along travel. |
| `seams[].approach` | object | yes | Distance along minus tool z before arc start. |
| `seams[].approach.distanceMm` | number | yes | Approach distance in mm. |
| `seams[].retract` | object | yes | Distance along minus tool z after arc end. |
| `seams[].retract.distanceMm` | number | yes | Retract distance in mm. |
| `seams[].sensing` | object | yes | Touch-sensing searches (direction and distance) and seam tracking mode. |
| `seams[].sensing.touch` | object[] | yes | Touch-sensing searches to run before the arc starts, one per plate. |
| `seams[].sensing.touch[].direction` | number[3] | yes | Unit search direction, towards the plate it finds. |
| `seams[].sensing.touch[].searchMm` | number | yes | Longest search distance in mm. |
| `seams[].sensing.seamTracking` | "through-arc" or "none" | yes | through-arc tracking while welding, or none (GTAW). |
| `seams[].access` | object | yes | Free-cone clearance, class, port, reach coverage 0 to 1, unreachable arc-length intervals. |
| `seams[].access.clearanceDeg` | number or null | yes | Smallest free cone half-angle in degrees around the torch axis out to 300 mm, over the poses of the seam; null before access was analysed. |
| `seams[].access.nearClearanceDeg` | number or null | no | The same free cone measured only out to 60 mm, the room the snake arm nozzle needs; null in files written before the field existed. |
| `seams[].access.class` | "standard", "slim", "snake", "blocked" or null | yes | Which tool reaches the seam: a standard torch, a slim torch, the snake arm through a port, or none. |
| `seams[].access.portId` | string or null | yes | The access port the snake arm enters through, null for other classes. |
| `seams[].access.reachCoverage` | number or null | yes | Share of the seam length the arm reaches, 0 to 1, null before reach was run. |
| `seams[].access.unreachable` | number[2][] | yes | Arc-length intervals [from, to] in mm the arm cannot reach, measured like poses[].s along the travel direction. |
| `seams[].estimates` | object | yes | Arc time, heat input, wire mass, gas volume for this seam. |
| `seams[].estimates.arcTimeS` | number | yes | Arc-on time in seconds: passes x length / travel speed. |
| `seams[].estimates.heatInputKJmm` | number | yes | Heat input in kJ/mm: k x V x I / (1000 x travel speed in mm/s). |
| `seams[].estimates.wireKg` | number | yes | Wire mass in kg from wire feed speed, wire diameter and arc time; 0 without a wire feed speed. |
| `seams[].estimates.gasL` | number | yes | Gas volume in L over pre-flow, arc time and post-flow; 0 without a gas. |
| `seams[].warnings` | object[] | yes | Seam-level warnings carried into the file. |
| `seams[].warnings[].code` | string | yes | Stable machine-readable code, for example LEG_OUT_OF_RANGE. |
| `seams[].warnings[].seamId` | string or null | yes | The seam the issue is about, null when it concerns the whole job. |
| `seams[].warnings[].message` | string | yes | Readable explanation: what happened, why, and what to do next. |
| `seams[].points` | object[] | no | The seam polyline with frames, unrounded, so the plan can be restored exactly. |
| `seams[].points[].s` | number | yes | Arc length in mm along the stored points from the first point. |
| `seams[].points[].p` | number[3] | yes | Point on the weld root in mm, part frame. |
| `seams[].points[].t` | number[3] | yes | Unit tangent along the stored points. |
| `seams[].points[].n1` | number[3] | yes | Unit outward normal of the first plate. |
| `seams[].points[].n2` | number[3] | yes | Unit outward normal of the second plate. |
| `sequence` | object | yes | Strategy used, ordered seam list with direction, air moves. |
| `sequence.strategy` | "table-order", "min-air-move", "balanced-heat" or "manual" | yes | How the order was chosen. |
| `sequence.order` | object[] | yes | Weld order: every seam exactly once. |
| `sequence.order[].seamId` | string | yes | Id of a seam in seams. |
| `sequence.order[].reversed` | boolean | yes | True when the seam is welded against its stored points. Its poses, geometry.start and geometry.end already follow the travel direction, so weld the poses in the order given and never reverse them again. |
| `sequence.airMoves` | object[] | yes | Moves with the arc off: home to the first seam, between seams in order, and the last seam back home. |
| `sequence.airMoves[].from` | string | yes | Seam id the move leaves, or home. |
| `sequence.airMoves[].to` | string | yes | Seam id the move enters, or home. |
| `sequence.airMoves[].lengthMm` | number | yes | Path length in mm, including the retract and approach. |
| `access` | object | yes | Access ports and snake-arm parameters used for reach analysis. |
| `access.ports` | object[] | yes | Openings the snake arm can enter through. |
| `access.ports[].id` | string | yes | Port id referenced by seams[].access.portId. |
| `access.ports[].position` | number[3] | yes | Centre of the port opening in mm, part frame. |
| `access.ports[].direction` | number[3] | yes | Unit direction the arm enters along, into the part. |
| `access.ports[].diameterMm` | number | yes | Clear diameter of the opening in mm. |
| `access.arm` | object or null | yes | Snake-arm parameters, null when the job has no port. |
| `access.arm.links` | integer | yes | Number of links in the snake arm. |
| `access.arm.linkLengthMm` | number | yes | Length of one link in mm. |
| `access.arm.diameterMm` | number | yes | Outer diameter of the arm in mm. |
| `access.arm.maxBendDeg` | number | yes | Largest bend between two neighbouring links in degrees. |
| `access.arm.torchLengthMm` | number | yes | Torch length from the last link to the contact tip in mm. |
| `access.arm.insertionMm` | number | no | Longest straight feed in mm along the port axis before the links bend; the solver picks a depth up to it. |
| `access.arm.clearanceMm` | number | no | Gap in mm added to the link radius when the arm is checked for collisions with the part. |
| `summary` | object | yes | Totals for quoting and checking. |
| `summary.seamCount` | integer | yes | Number of seams in the job. |
| `summary.weldLengthMm` | number | yes | Sum of the seam lengths in mm. |
| `summary.arcTimeS` | number | yes | Sum of the seam arc times in seconds. |
| `summary.airTimeS` | number | yes | Sum of the air move lengths over the air speed, in seconds. |
| `summary.cycleTimeS` | number | yes | Arc time, air time, arc start and end times and torch cleaning stops. |
| `summary.torchCleanings` | integer | no | Number of torch cleaning stops in the cycle time. |
| `summary.cleaningTimeS` | number | no | Total time of the torch cleaning stops, included in cycleTimeS. |
| `summary.wireKg` | number | yes | Total wire mass in kg. |
| `summary.gasL` | number | yes | Total gas volume in L. |
| `validation` | object | yes | Pre-flight errors (must be empty to export) and warnings, each with code, seamId and message. |
| `validation.errors` | object[] | yes | Always empty: a job with pre-flight errors is not exported. |
| `validation.errors[].code` | string | yes | Stable machine-readable code, for example LEG_OUT_OF_RANGE. |
| `validation.errors[].seamId` | string or null | yes | The seam the issue is about, null when it concerns the whole job. |
| `validation.errors[].message` | string | yes | Readable explanation: what happened, why, and what to do next. |
| `validation.warnings` | object[] | yes | Pre-flight warnings the user exported with. |
| `validation.warnings[].code` | string | yes | Stable machine-readable code, for example LEG_OUT_OF_RANGE. |
| `validation.warnings[].seamId` | string or null | yes | The seam the issue is about, null when it concerns the whole job. |
| `validation.warnings[].message` | string | yes | Readable explanation: what happened, why, and what to do next. |

<!-- job-fields:end -->

</details>

## RAPID as a template

The Export step also writes an ABB RAPID module for the standard and slim seams, in sequence order, with `MoveL` approach and retract and `ArcLStart`, `ArcL` and `ArcLEnd` along the poses. The tool, the work object and the seam, weld and weave data are placeholders named in the file header: they belong to the cell, which the app does not know. Verify them on a controller before running anything. Snake and blocked seams are left out because a fixed robot cannot reach them.

## Brand usage

The interface follows the Armatrix brand kit: Onest for all text with tabular numbers, Redaction only for the app title, the empty-state headline and the one heading at the top of each step's panel; Sand and Dark Forest neutrals; Revolution Green for selection, focus and the active step, and Bright Discovery for accepted seams, the torch nozzle, the arc glow and the Export button. The two highlight colours stay under 10 percent of any screen, measured from screenshots in the e2e suite. Fonts and logos are served from the app's own origin under their licences in `public/brand` and `src/styles/fonts`, and every colour is a token in `src/styles/tokens.css`.

## Testing

- **Unit (Vitest, node):** more than 2,000 tests over `src/core`, the worker API, the state flows and the build scripts, including the round trip export, import, export byte for byte on the samples, detection on every sample against expected seam sets, vertex noise stability, and the JSON Schema validated with ajv against exported jobs.
- **End to end (Playwright):** 21 specs drive the real app: load, pick, accept, draw, ports, reach and arm playback, sequence, export, autosave, deep links, the help sheet, layout at several widths, lighting and brand colour shares from pixels.
- **Origin only:** a spec records every request while a sample is loaded and exported, checks that each one goes to the app's own origin, and that Onest and Redaction load from it.
- **CI:** GitHub Actions runs lint, typecheck, unit tests and the build on every push, the full Chromium e2e suite on every push, and the cross-browser specs in Firefox and WebKit on `main`.

## Browser support

The app targets current Chromium, Firefox and WebKit (Safari). CI runs every e2e spec in Chromium on every push, and on `main` runs the load, export, isolation, offline, reach and weld tolerance specs in Firefox and WebKit as well (the projects in `playwright.config.ts`). Every spec also passes in Firefox and WebKit when run locally with the subset filter lifted.

When the page is cross-origin isolated (COOP same-origin and COEP require-corp, sent by `vercel.json` and the Vite dev and preview servers), the display mesh and its BVH live in a SharedArrayBuffer that the page and the worker both read, so a large part is not copied between them. WebKit checks the worker's own response against the page's embedder policy, including a 304 on a reload, so the dev and preview servers send both headers on every response, not only full ones. Isolation alone is not enough: a browser may refuse to upload a WebGL buffer from shared memory. So the page runs a runtime capability probe once ([src/worker/sharedMemory.ts](src/worker/sharedMemory.ts)): it uploads a small shared vertex and index array to a throwaway WebGL context, checks for an exception or a GL error, and names the worker for the answer. A browser that refuses, or a host that drops the two headers, gets the copy path with the same results. The app loads no cross-origin resources, so the isolation headers break nothing.

## Key numbers

Measured with `npx tsx scripts/key-numbers.ts` in Node 24 on an Intel i7-14700HX under WSL2, three runs:

| What | Measured |
| --- | --- |
| A generated 1M-triangle STL (999,996 triangles) parsed, welded and analysed for seams, using the code the Web Worker runs | about 4.8 s (4.7 to 4.9 s) |
| Access analysis of the 56 seams of `double-bottom-cell` | about 0.12 s |
| Air travel, table order to minimum air travel, `double-bottom-cell` | 24.3 m to 8.5 m, 65 percent less |
| Reach coverage of the tank seam at x 746 from the manhole port | 21 percent at an 18 degree bend limit, 100 percent at 25 degrees |
| Entry chunk of the production build | 415 kB (budget 500 kB) |

## Known limits

- **Unit guess:** the split between inches and metres for a part about 1 unit across needs real SolidWorks exports to choose; the app asks when it is unsure.
- **Bodies:** an STL has no body ids, so bodies that share a welded vertex fuse into one, and contact and intersection passes trust the winding of open or non-orientable bodies.
- **Vertex noise:** with 0.02 mm of noise on every vertex at the default weld tolerance, short low-confidence creases appear beside holes on some samples (8 of 20 runs on l-bracket-gussets, 12 on box-beam, 15 on pipe-on-plate, 1 on the tank). Raising the weld tolerance removes most of them; box-beam keeps a spurious crease in 7 of 20 runs. Seams found again keep their ids (99.4 percent of 5,200 comparisons). Hidden seams are the exception: the inside corners of the tube frame lie 0.03 mm from a 0.1 mm step of the id, because its 3.18 mm wall puts them 3.18 and 22.22 mm from the box corner, so this noise moved 2 of their ids in 545 comparisons over 3 seeds; no visible seam's id moved.
- **Faceted curves:** a faceted 50 mm bar measures 49.97 mm; the true cylinder is not in the file.
- **Drawn seams on open surface** read "Fillet ?": with no second plate, inside and outside are undefined. Plate thickness is set per seam, not for a selection.
- **Positions:** PE (groove overhead) is not produced; groove welds are out of scope, so overhead fillets report PD.
- **Reach:** the tank reach takes about 9 s at defaults (7 to 13 s with machine load), because 660 stations out of reach have to be proven so. There is no free-space path search where FABRIK finds no chain; a bend-limited search would be needed and no sample needs it. Some exact-fit failures are physics: 4 links at 18 degrees shift the wrist about 180 mm sideways.
- **Keyboard layouts:** on French AZERTY the step keys and Shift plus a digit are the same keystroke; the view keys win and the steps stay on the numpad and the stepper.
- **RAPID data:** seamdata, welddata and weavedata belong to the cell and are placeholders.
- **Autosave on close:** a change still inside the one second autosave delay is written when the page hides or another part loads, but a browser does not promise to finish a storage write started while the page unloads: an edit made the moment before a reload or a closed tab can be lost.
- **Access model:** access and reach use the neutral torch (no work or travel angle) and a 50 mm approach, not each procedure's angles and approach, so a seam near a class threshold can change class with the real torch.
- **Rounding:** the cycle time in the status bar can differ from the exported `summary.cycleTimeS` by 0.1 s, because the export rounds arc and air time before adding them.

## Next steps

- STEP import, so seams come from exact B-rep edges instead of facets.
- Scan-based seam refinement: touch sensing or a laser line scan to correct each seam against the real part before welding.
- A ROS 2 bridge that publishes the job as poses and services for a cell.
- KUKA (ArcTech), FANUC and Yaskawa exporters beside the ABB RAPID template.
