import sys
import pcbnew

board = pcbnew.BOARD()
pcbnew.SaveBoard("test.kicad_pcb", board)
print("Success")
