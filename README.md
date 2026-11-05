# Weld Seam Planner

Browser app to plan robotic welds on STL parts.

npm install, npm run dev

## How it works

### Access and reach

The Access step places ports on the part and edits the snake arm (links, link length, diameter, bend limit, torch length). Run reach measures, for each seam the torch cannot reach on its own, how much of it the arm reaches from a port, and the arm can be played in through the port to a chosen point on the seam. This is a kinematic feasibility preview with editable arm parameters, not the Armatrix controller, so treat coverage as a planning estimate. Changing a port or any arm field makes earlier results stale until reach is run again. The ABB RAPID file (Export menu) is a template for the standard and slim seams: the tool, work object and seam, weld and weave data are placeholders to verify on a controller before running.

## The job JSON

<!-- job-fields:start -->

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `$schema` | string | yes | Where the JSON Schema for this version lives. |
| `format` | "weld-job" | yes | Identifies the document type. |
| `version` | string | yes | Semver; minor versions only add optional fields. |
| `id` | string | yes | Unique job id. |
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
