"""
FRIDAY KiCad 10.0 Board Builder - Verified Template
This script is the canonical correct way to generate a .kicad_pcb file.
Uses only verified KiCad 10.0 S-expression syntax.
"""
import re
import os

OUTPUT_DIR = r"C:\Users\naman\Downloads\FRIDAY\FRIDAY\hardware_projects"
FOOTPRINT_LIB_ROOT = r"C:\Program Files\KiCad\10.0\share\kicad\footprints"

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── VERIFIED KiCad 10.0 Board Wrapper ──────────────────────────────────────────
# DO NOT add (general), (setup), (design), or (stackup) — all crash the parser.
BOARD_HEADER = '(kicad_pcb (version 20240108) (generator "pcbnew")\n  (paper "A4")\n  (layers\n    (0 "F.Cu" signal)\n    (31 "B.Cu" signal)\n    (44 "Edge.Cuts" user)\n  )\n'
BOARD_FOOTER = ')\n'

# ── VERIFIED gr_line syntax (KiCad 10.0) ───────────────────────────────────────
# CRITICAL: (width ...) must be INSIDE a (stroke ...) wrapper. Bare (width) is invalid.
def make_edge(x1, y1, x2, y2):
    return f'  (gr_line (start {x1} {y1}) (end {x2} {y2}) (stroke (width 0.1) (type default)) (layer "Edge.Cuts"))\n'

def make_board_outline(w, h):
    """Draw a rectangle board outline using 4 gr_line elements."""
    return (
        make_edge(0, 0, w, 0) +
        make_edge(w, 0, w, h) +
        make_edge(w, h, 0, h) +
        make_edge(0, h, 0, 0)
    )

# ── VERIFIED footprint injection ────────────────────────────────────────────────
# CRITICAL: Read raw .kicad_mod text, then use regex to replace ONLY the first (at ...)
# DO NOT use (xy ...) tokens - they crash the parser.
def load_footprint(library_dir, footprint_name, x, y):
    """
    Load a .kicad_mod file and set its position using regex.
    library_dir: e.g., "Package_DIP.pretty"
    footprint_name: e.g., "DIP-8_W7.62mm"
    """
    path = os.path.join(FOOTPRINT_LIB_ROOT, library_dir, f"{footprint_name}.kicad_mod")
    if not os.path.exists(path):
        raise FileNotFoundError(f"Footprint not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        text = f.read()

    # Replace ONLY the first (at ...) block to set the board position
    positioned = re.sub(r'\(at\s[^)]+\)', f'(at {x} {y})', text, count=1)
    return positioned

def build_board(output_filename, board_w, board_h, footprints):
    """
    footprints: list of (library_dir, footprint_name, x, y)
      e.g., [("Package_DIP.pretty", "DIP-8_W7.62mm", 25, 25)]
    """
    parts = [BOARD_HEADER]
    parts.append(make_board_outline(board_w, board_h))

    for lib_dir, fp_name, x, y in footprints:
        fp_text = load_footprint(lib_dir, fp_name, x, y)
        parts.append(fp_text)

    parts.append(BOARD_FOOTER)

    output_path = os.path.join(OUTPUT_DIR, output_filename)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("".join(parts))

    print(f"[FRIDAY] Board written: {output_path}")
    return output_path

# ── EXAMPLE USAGE ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    footprint_list = [
        # (library_dir,              footprint_name,     x,   y)
        ("Package_DIP.pretty",      "DIP-8_W7.62mm",    25,  25),
    ]

    board_path = build_board(
        output_filename="board.kicad_pcb",
        board_w=100,
        board_h=80,
        footprints=footprint_list
    )

    print(f"[FRIDAY] Done. Opening in KiCad...")
    os.system(f'start "" "{board_path}"')
