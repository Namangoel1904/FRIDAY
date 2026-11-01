import re
import os

# Define the output path
output_dir = r"C:\Users\naman\Downloads\FRIDAY\FRIDAY\hardware_projects"
os.makedirs(output_dir, exist_ok=True)
output_file = os.path.join(output_dir, "MemoBand_Rev2.kicad_pcb")

# Footprint definitions based on MemoBand project memory: ESP32-C3, INMP441 Mic, SD Card
footprints = {
    "ESP32-C3-WROOM-02": {"library_path": "Package_QFP.pretty:QFN-32-1EP_5x5mm_P0.5mm", "position": "(xy 50 50)", "orientation": "0"},
    "INMP441": {"library_path": "Microsound.pretty:INMP441", "position": "(xy 70 50)", "orientation": "0"},
    "MicroSD_Card": {"library_path": "Connector_Card.pretty:MicroSD_Card_PushPull", "position": "(xy 50 80)", "orientation": "0"},
}

def create_kicad_pcb_content(footprints_data):
    header = "(kicad_pcb (version 20240108) (generator pcbnew) (paper \"A4\") (layers (0 \"F.Cu\" signal) (31 \"B.Cu\" signal) (44 \"Edge.Cuts\" user))"
    footer = ")"
    footprint_strings = []

    # Placeholder logic since we cannot access C:\Program Files\KiCad\ to read actual .kicad_mod files.
    # We will construct generic footprints based on the library names provided.
    for ref, data in footprints_data.items():
        # This is a synthetic footprint structure since we cannot extract the real ones from KiCad's directory
        footprint_str = f"""
  (footprint "{data['library_path']}" (layer "F.Cu") (tedit "6688A793")
    {data['position']} (rotation {data['orientation']})
    (attr smd)
    (fp_text reference "{ref}" (at 0 0.5) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))
    (fp_text value "{data['library_path']}" (at 0 -0.5) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))
    # Placeholder pads for illustration since specific footprints weren't loaded
    (pad 1 smd rect (at 0 0) (size 0.5 0.5) (layers "F.Cu" "F.Paste" "F.Mask"))
  )
"""
        footprint_strings.append(footprint_str)

    return f"{header}\n{''.join(footprint_strings)}\n{footer}"

pcb_content = create_kicad_pcb_content(footprints)

try:
    with open(output_file, "w") as f:
        f.write(pcb_content)
    print(f"Successfully generated new KiCad PCB file: {output_file}")
except IOError as e:
    print(f"Failed to write file: {e}")