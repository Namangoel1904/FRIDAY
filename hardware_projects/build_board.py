import re
import os

# Define the output path
OUTPUT_DIR = r"C:\Users\naman\Downloads\FRIDAY\FRIDAY\hardware_projects"
os.makedirs(OUTPUT_DIR, exist_ok=True)
OUTPUT_PCB = os.path.join(OUTPUT_DIR, "memoband.kicad_pcb")

# KiCad 10.0 Board Wrapper (must be exact)
kicad_wrapper_start = """(kicad_pcb (version 20240108) (generator "pcbnew")
  (paper "A4")
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (44 "Edge.Cuts" user)
  )
"""
# CORRECTED Board Outline definition using a (gr_poly ...) for robustness
# Define a 50mm x 30mm rectangle using polygon definition for Edge.Cuts
board_outline = """
  (gr_poly
    (pts
      (xy 0 0)
      (xy 50 0)
      (xy 50 30)
      (xy 0 30)
      (xy 0 0)
    )
    (stroke (width 0.1) (type default))
    (fill (type none))
    (layer "Edge.Cuts")
  )
"""


# Placeholder Footprints (Same as before)
# Generic ESP32-C3 Module Placeholder (Simulated WROOM-02 footprint)
esp32_c3_footprint = """
  (footprint "Module:ESP32-C3-WROOM-02" (layer "F.Cu") (tedit 6690500A)
    (at 0 0)
    (descr "ESP32-C3-WROOM-02 module, 2mm pitch, 38 pins")
    (tags "wifi ble module esp esp32-c3 espressif")
    (property "Reference" "U1" (at 0 32) (layer "F.SilkS") (effects (font (size 1.27 1.27) (thickness 0.25))))
    (property "Value" "ESP32-C3" (at 0 -5) (layer "F.Fab") (effects (font (size 1.27 1.27) (thickness 0.25))))
    (pad "1" smd (at -14.1 12.7) (size 0.6 1.8) (layers "F.Cu F.Paste F.Mask"))
    (pad "2" smd (at -14.1 10.7) (size 0.6 1.8) (layers "F.Cu F.Paste F.Mask"))
    (pad "38" smd (at 14.1 -12.7) (size 0.6 1.8) (layers "F.Cu F.Paste F.Mask"))
  )
"""

# Generic INMP441 MEMS Microphone Placeholder
inmp441_mic_footprint = """
  (footprint "MEMS:MP45DT02" (layer "F.Cu") (tedit 6690500B)
    (at 0 0)
    (descr "INMP441 PDM Microphone breakout substitute")
    (tags "mems mic pdm digital")
    (property "Reference" "MIC1" (at 0 5) (layer "F.SilkS") (effects (font (size 1.0 1.0) (thickness 0.15))))
    (property "Value" "INMP441" (at 0 -5) (layer "F.Fab") (effects (font (size 1.0 1.0) (thickness 0.15))))
    (pad "1" smd (at -1.25 1.25) (size 0.5 0.5) (layers "F.Cu F.Paste F.Mask"))
    (pad "VCC" smd (at 1.25 1.25) (size 0.5 0.5) (layers "F.Cu F.Paste F.Mask"))
  )
"""

# --- Positioning the components ---
esp32_c3_placed = re.sub(r'\(at [^)]+\)', r'(at 25 10)', esp32_c3_footprint, count=1)
inmp441_mic_placed = re.sub(r'\(at [^)]+\)', r'(at 10 10)', inmp441_mic_footprint, count=1)

# Assemble the final PCB string
full_pcb_layout = (
    kicad_wrapper_start +
    board_outline +
    esp32_c3_placed +
    inmp441_mic_placed +
    "\n)" # Close the main kicad_pcb block
)

# Write the file
try:
    with open(OUTPUT_PCB, "w") as f:
        f.write(full_pcb_layout)
    print(f"Successfully wrote corrected KiCad PCB file to {OUTPUT_PCB}")
except IOError as e:
    print(f"Error writing PCB file: {e}")