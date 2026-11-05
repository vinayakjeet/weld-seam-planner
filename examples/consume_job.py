"""Print the weld order of a weld job file, one line per seam.

Usage: python3 consume_job.py job.json

Standard library only. Field meanings are in README.md (The job JSON) and in
public/schema/weld-job-1.0.json.
"""

import json
import sys


def point(xyz):
    return "(" + ", ".join(f"{c:.3f}" for c in xyz) + ")"


def main(path):
    with open(path, encoding="utf-8") as f:
        job = json.load(f)

    if job.get("format") != "weld-job" or not str(job.get("version", "")).startswith("1."):
        sys.exit(f"{path} is not a version 1 weld job, so its fields cannot be read. Export the job again from the planner.")
    units = job["units"]
    if units["length"] != "mm" or units["time"] != "s":
        sys.exit(f"{path} uses {units['length']} and {units['time']}, and this example prints mm and s. Convert the file first.")

    seams = {seam["id"]: seam for seam in job["seams"]}
    for n, entry in enumerate(job["sequence"]["order"], start=1):
        seam = seams[entry["seamId"]]
        # Poses already run in weld direction; reversed only says that this is against the stored points.
        poses = seam["poses"]
        access = seam["access"]["class"] or "unknown"
        print(
            f"{n}  {seam['id']}  {seam['procedureId']}  first={point(poses[0]['position'])}  "
            f"last={point(poses[-1]['position'])}  arc={seam['estimates']['arcTimeS']:.1f} s  access={access}"
        )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 consume_job.py job.json")
    main(sys.argv[1])
