# Weld Seam Planner

Browser app to plan robotic welds on STL parts.

npm install, npm run dev

## How it works

### Access and reach

The Access step places ports on the part and edits the snake arm (links, link length, diameter, bend limit, torch length). Run reach measures, for each seam the torch cannot reach on its own, how much of it the arm reaches from a port, and the arm can be played in through the port to a chosen point on the seam. This is a kinematic feasibility preview with editable arm parameters, not the Armatrix controller, so treat coverage as a planning estimate. Changing a port or any arm field makes earlier results stale until reach is run again. The ABB RAPID file (Export menu) is a template for the standard and slim seams: the tool, work object and seam, weld and weave data are placeholders to verify on a controller before running.
