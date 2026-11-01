import re
import os

# Define the output path
output_dir = r"C:\Users\naman\Downloads\FRIDAY\FRIDAY\hardware_projects"
os.makedirs(output_dir, exist_ok=True)
output_file = os.path.join(output_dir, "MemoBand_Rev3.kicad_pcb")

# Footprint definitions based on MemoBand project memory: ESP32-C3, INMP441 Mic, SD Card
footprints = {
    "ESP32-C3": {"library_path": "Package_QFP:QFN-32-1EP_5x5mm_P0.5mm", "position": "(xy 50 50)", "orientation": "0", "description": "ESP32-C3-WROOM-02"},
    "INMP441": {"library_path": "Microsound:INMP441", "position": "(xy 70 50)", "orientation": "0", "description": "I2S Digital Microphone"},
    "MicroSD": {"library_path": "Connector_Card:MicroSD_Card_PushPull", "position": "(xy 50 80)", "orientation": "0", "description": "SD Card Connector"},
}

def create_kicad_pcb_content(footprints_data):
    # Updated header with correct attributes
    header = "(kicad_pcb (version 20240108) (generator pcbnew) (paper \"A4\") (layers (0 \"F.Cu\" signal) (31 \"B.Cu\" signal) (44 \"Edge.Cuts\" user)) (setup (last_trace_width 0.25))"
    footer = ")"
    footprint_strings = []

    for ref, data in footprints_data.items():
        # Using a more standard KiCad 6+ footprint structure
        footprint_str = f"""
  (footprint "{data['library_path']}" (layer "F.Cu") (tedit "6688A793")
    {data['position']} (rotation {data['orientation']})
    (attr smd)
    (fp_text reference "{ref}" (at 0 0.5) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))
    (fp_text value "{data['description']}" (at 0 -0.5) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))
    (pad 1 smd rect (at 0 0) (size 0.5 0.5) (layers "F.Cu" "F.Paste" "F.Mask"))
    (model "PLACEHOLDER.STEP" (at (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0)))
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