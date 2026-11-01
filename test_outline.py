import pcbnew
try:
    board = pcbnew.BOARD()
    shape = pcbnew.PCB_SHAPE(board)
    shape.SetShape(pcbnew.SHAPE_T_SEGMENT)
    shape.SetStart(pcbnew.VECTOR2I_MM(0, 0))
    shape.SetEnd(pcbnew.VECTOR2I_MM(50, 0))
    shape.SetLayer(pcbnew.Edge_Cuts)
    board.Add(shape)

    fp = pcbnew.FootprintLoad("C:\\Program Files\\KiCad\\10.0\\share\\kicad\\footprints\\Package_DIP.pretty", "DIP-8_W7.62mm")
    fp.SetPosition(pcbnew.VECTOR2I_MM(25, 25))
    board.Add(fp)

    pcbnew.SaveBoard("test2.kicad_pcb", board)
    print("Outline and footprint success")
except Exception as e:
    print(f"Error: {e}")
