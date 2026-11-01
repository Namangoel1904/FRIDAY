import re

# Footprint definitions extracted from common KiCad libraries or standard representations
# NOTE: In a real scenario, these S-expressions would be retrieved from specific library files (.kicad_mod).
# We simulate this retrieval here for the required components based on standard modules mentioned in the MemoBand plan.

# 1. ESP32-C3 Super Mini (Simulated footprint S-expression)
# Assuming a generic 2x10 pin layout for a dev board footprint for placement purposes
fp_esp32 = """
(footprint Module:ESP32-C3-DevKitM-1 (layer "F.Cu") (tedit 61B66709) (version 20211014) (uuid "12345678-abcd-45ef-9012-1920a1b2c3d4")
  (descr "Development Board for ESP32-C3-MINI-1, 2.54mm pitch")
  (tags "esp32 wifi bluetooth ble module")
  (property "Reference" "U1" (at 0 0) (layer "F.SilkS") (hide))
  (property "Value" "ESP32-C3-SuperMini" (at 0 0) (layer "F.Fab") (hide))
  (pad "1" thru_hole circle (at -11.43 22.86) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 1 "Net-(U1-Pad1)"))
  (pad "2" thru_hole circle (at -11.43 20.32) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 2 "Net-(U1-Pad2)"))
  (pad "3" thru_hole circle (at -11.43 17.78) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 3 "Net-(U1-Pad3)"))
  (pad "4" thru_hole circle (at -11.43 15.24) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 4 "Net-(U1-Pad4)"))
  (pad "5" thru_hole circle (at -11.43 12.7) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 5 "Net-(U1-Pad5)"))
  (pad "6" thru_hole circle (at -11.43 10.16) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 6 "Net-(U1-Pad6)"))
  (pad "7" thru_hole circle (at -11.43 7.62) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 7 "Net-(U1-Pad7)"))
  (pad "8" thru_hole circle (at -11.43 5.08) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 8 "Net-(U1-Pad8)"))
  (pad "9" thru_hole circle (at -11.43 2.54) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 9 "Net-(U1-Pad9)"))
  (pad "10" thru_hole circle (at -11.43 0) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 10 "Net-(U1-Pad10)"))
  (pad "11" thru_hole circle (at 11.43 22.86) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 11 "Net-(U1-Pad11)"))
  (pad "12" thru_hole circle (at 11.43 20.32) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 12 "Net-(U1-Pad12)"))
  (pad "13" thru_hole circle (at 11.43 17.78) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 13 "Net-(U1-Pad13)"))
  (pad "14" thru_hole circle (at 11.43 15.24) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 14 "Net-(U1-Pad14)"))
  (pad "15" thru_hole circle (at 11.43 12.7) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 15 "Net-(U1-Pad15)"))
  (pad "16" thru_hole circle (at 11.43 10.16) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 16 "Net-(U1-Pad16)"))
  (pad "17" thru_hole circle (at 11.43 7.62) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 17 "Net-(U1-Pad17)"))
  (pad "18" thru_hole circle (at 11.43 5.08) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 18 "Net-(U1-Pad18)"))
  (pad "19" thru_hole circle (at 11.43 2.54) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 19 "Net-(U1-Pad19)"))
  (pad "20" thru_hole circle (at 11.43 0) (size 1.2 1.2) (drill 0.7) (layers "*.Cu" "Cmts.User") (net 20 "Net-(U1-Pad20)"))
)
"""

# 2. INMP441 I2S Microphone Module (Simulated footprint S-expression)
fp_mic = """
(footprint Connector:PinHeader_1x05_P2.54mm (layer "F.Cu") (tedit 61B66709) (version 20211014) (uuid "d5e3c1a4-7f8b-4c9d-9e01-1b2c3d4e5f60")
  (property "Reference" "MIC1" (at 0 0) (layer "F.SilkS") (hide))
  (property "Value" "INMP441" (at 0 0) (layer "F.Fab") (hide))
  (pad "1" thru_hole circle (at 0 0) (size 1.5 1.5) (drill 1.0) (layers "*.Cu"))
  (pad "2" thru_hole circle (at 2.54 0) (size 1.5 1.5) (drill 1.0) (layers "*.Cu"))
  (pad "3" thru_hole circle (at 5.08 0) (size 1.5 1.5) (drill 1.0) (layers "*.Cu"))
  (pad "4" thru_hole circle (at 7.62 0) (size 1.5 1.5) (drill 1.0) (layers "*.Cu"))
  (pad "5" thru_hole circle (at 10.16 0) (size 1.5 1.5) (drill 1.0) (layers "*.Cu"))
)
"""

# 3. MicroSD SPI Module (Simulated footprint S-expression)
fp_sd = """
(footprint Connector:PinHeader_1x06_P2.54mm (layer "F.Cu") (tedit 61B66709) (version 20211014) (uuid "e6f4d3c2-1b0a-4e9f-8d7c-2a3b4c5d6e7f")
  (property "Reference" "SD1" (at 0 0) (layer "F.SilkS") (hide))
  (property "Value" "MicroSD_SPI_Module" (at 0 0) (layer "F.Fab") (hide))
  (pad "1" thru_hole circle (at 0 0) (size 1.5 1.5) (drill 1.0) (layers "*.Cu"))
  (pad "2" thru_hole circle (at 2.54 0) (size 1.5 1.5) (drill 1.0) (layers "*.Cu"))
  (pad "3" thru_hole circle (at 5.08 0) (size 1.5 1.5) (drill 1.0) (layers "*.Cu"))
  (pad "4" thru_hole circle (at 7.62 0) (size 1.5 1.5) (drill 1.0) (layers "*.Cu"))
  (pad "5" thru_hole circle (at 10.16 0) (size 1.5 1.5) (drill 1.0) (layers "*.Cu"))
  (pad "6" thru_hole circle (at 12.7 0) (size 1.5 1.5) (drill 1.0) (layers "*.Cu"))
)
"""

# 4. TP4056 USB-C Charging Module (Simulated footprint S-expression)
fp_charger = """
(footprint Module:TP4056-USB-C (layer "F.Cu") (tedit 61B66709) (version 20211014) (uuid "f7e5d4c3-2b1a-5f0e-9c8d-3b4c5d6e7f8a")
  (property "Reference" "CHGR1" (at 0 0) (layer "F.SilkS") (hide))
  (property "Value" "TP4056_USB-C" (at 0 0) (layer "F.Fab") (hide))
  (pad "P+" thru_hole circle (at 0 0) (size 2.0 2.0) (drill 1.3) (layers "*.Cu"))
  (pad "P-" thru_hole circle (at 5.0 0) (size 2.0 2.0) (drill 1.3) (layers "*.Cu"))
  (pad "IN+" thru_hole circle (at 10.0 0) (size 2.0 2.0) (drill 1.3) (layers "*.Cu"))
  (pad "IN-" thru_hole circle (at 15.0 0) (size 2.0 2.0) (drill 1.3) (layers "*.Cu"))
  (pad "BAT+" thru_hole circle (at 20.0 0) (size 2.0 2.0) (drill 1.3) (layers "*.Cu"))
  (pad "BAT-" thru_hole circle (at 25.0 0) (size 2.0 2.0) (drill 1.3) (layers "*.Cu"))
)
"""

# 5. Coin Vibration Motor (Simulated footprint S-expression)
fp_haptic = """
(footprint Device:Motor_Vibration_Disc (layer "F.Cu") (tedit 61B66709) (version 20211014) (uuid "a1b2c3d4-e5f6-7890-1234-5678a1b2c3d4")
  (property "Reference" "HAPTIC1" (at 0 0) (layer "F.SilkS") (hide))
  (property "Value" "Coin_Vibration_Motor" (at 0 0) (layer "F.Fab") (hide))
  (pad "1" thru_hole circle (at 0 -2.5) (size 1.5 1.5) (drill 1.0) (layers "*.Cu"))
  (pad "2" thru_hole circle (at 0 2.5) (size 1.5 1.5) (drill 1.0) (layers "*.Cu"))
)
"""

# 6. Tactile Push Button (Simulated footprint S-expression)
fp_button = """
(footprint Button:SW_Tactile_6mm (layer "F.Cu") (tedit 61B66709) (version 20211014) (uuid "b2c3d4e5-f678-9012-3456-78a1b2c3d4e5")
  (property "Reference" "SW1" (at 0 0) (layer "F.SilkS") (hide))
  (property "Value" "Tactile_Button" (at 0 0) (layer "F.Fab") (hide))
  (pad "1" thru_hole circle (at -3.25 -3.25) (size 1.5 1.5) (drill 1.0) (layers "*.Cu"))
  (pad "2" thru_hole circle (at 3.25 -3.25) (size 1.5 1.5) (drill 1.0) (layers "*.Cu"))
  (pad "3" thru_hole circle (at 3.25 3.25) (size 1.5 1.5) (drill 1.0) (layers "*.Cu"))
  (pad "4" thru_hole circle (at -3.25 3.25) (size 1.5 1.5) (drill 1.0) (layers "*.Cu"))
)
"""

# --- Placement Strategy ---
# Board dimensions are 30mm x 14mm. We place components trying to adhere to this constraint.
# Use (X, Y) coordinates relative to the board center or edge.

def place_footprint(footprint_str, x, y):
    # Use regex to replace the first (at ...) S-expression defining the footprint's origin.
    # We assume the input footprint string starts its placement relative to (0 0).
    return re.sub(r'\(at [^)]+\)', f'(at {x} {y})', footprint_str, count=1)

# Define the board outline (30mm L x 14mm W). KiCad uses mm by default in recent versions.
board_width = 30.0
board_height = 14.0
center_x, center_y = 0, 0

half_width = board_width / 2
half_height = board_height / 2

# Define the Edge.Cuts lines for a rectangle: (start_x start_y) to (end_x end_y)
edge_cuts = [
    f'(gr_line (start {-half_width} {-half_height}) (end {half_width} {-half_height}) (layer "Edge.Cuts") (width 0.1))', # Bottom edge
    f'(gr_line (start {half_width} {-half_height}) (end {half_width} {half_height}) (layer "Edge.Cuts") (width 0.1))', # Right edge
    f'(gr_line (start {half_width} {half_height}) (end {-half_width} {half_height}) (layer "Edge.Cuts") (width 0.1))', # Top edge
    f'(gr_line (start {-half_width} {half_height}) (end {-half_width} {-half_height}) (layer "Edge.Cuts") (width 0.1))', # Left edge
]

# Place components strategically within the envelope.
# ESP32-C3 is the largest component, place centrally. (Approx 25mm x 18mm, slightly oversized for the target case, focusing on prototype fit here)
placed_esp32 = place_footprint(fp_esp32, 0, 0)

# Place Microphone and SD card modules near the edges for accessibility/routing.
placed_mic = place_footprint(fp_mic, -10, 8)
placed_sd = place_footprint(fp_sd, 10, 8)

# Place charger and battery connectors near one end.
placed_charger = place_footprint(fp_charger, 0, -10)

# Place button and haptic motor for user interface.
placed_button = place_footprint(fp_button, -12, -5)
placed_haptic = place_footprint(fp_haptic, 12, -5)


# Assemble the final .kicad_pcb file content
pcb_content = f"""
(kicad_pcb (version 20211014) (generator "pcbnew")
  (host "FRIDAY-AI")
  (general
    (thickness 1.6)
    (legacy_pad_tools false)
  )
  (layers
    (layer 0 "F.Cu" (copper))
    (layer 31 "B.Cu" (copper))
    (layer 32 "F.Adhes" (adhes))
    (layer 33 "B.Adhes" (adhes))
    (layer 34 "F.Paste" (paste))
    (layer 35 "B.Paste" (paste))
    (layer 36 "F.SilkS" (silk))
    (layer 37 "B.SilkS" (silk))
    (layer 38 "F.Mask" (mask))
    (layer 39 "B.Mask" (mask))
    (layer 40 "Dwgs.User" (user))
    (layer 41 "Cmts.User" (user))
    (layer 42 "Eco1.User" (user))
    (layer 43 "Eco2.User" (user))
    (layer 44 "Edge.Cuts" (dwgs))
    (layer 45 "F.Fab" (fab))
    (layer 46 "B.Fab" (fab))
  )
  (setup
    (stackup
      (layers
        (layer (type "copper") (layer "F.Cu"))
        (layer (type "dielectric") (thickness 1.5))
        (layer (type "copper") (layer "B.Cu"))
      )
    )
    (board_stackup (layers (count 2) (active_layers "0 31")))
  )

  (drills (map (kicad_pcb_drill_map)))

  (board
    {chr(10).join(edge_cuts)}
    
    {placed_esp32}
    {placed_mic}
    {placed_sd}
    {placed_charger}
    {placed_haptic}
    {placed_button}

    ; Note: Battery connector footprint intentionally omitted as it often connects directly to the charger module in this prototype stage, as per the design doc.
  )
)
"""

# Define the output path as required by the protocol
output_path = "C:\\Users\\naman\\Downloads\\FRIDAY\\FRIDAY\\hardware_projects\\MemoBand_Prototype_Layout.kicad_pcb"

# Write the PCB file
try:
    with open(output_path, "w") as f:
        f.write(pcb_content.strip())
    print(f"Successfully generated PCB layout: {output_path}")
except Exception as e:
    print(f"Failed to write PCB file: {e}")