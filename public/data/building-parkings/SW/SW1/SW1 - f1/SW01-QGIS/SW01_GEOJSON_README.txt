BCIT SW01 FIRST FLOOR — LOCAL COORDINATE EXTRACTION
Source: bsw0101.pdf, AutoCAD-authored, updated September 17, 2026.

DELIVERABLES
- sw01_room_points_local.geojson : Extracted room/area number points, with approximate types.
- sw01_linework_local.geojson : Extracted dark, thick CAD strokes of the drawing (unclassified).
- bsw0101_preview.png : Rendered reference PDF page.

LIMITATIONS
IMPORTANT: these are NON-GEOREFERENCED LOCAL DRAWING COORDINATES, not true
longitude / latitude. The PDF does not include geographic control points and
is explicitly marked SCALE: NTS. Therefore these GeoJSON files use arbitrary
local coordinates for prototyping and annotation. They are NOT compliant
WGS84 layers for placing directly on Google Maps or OpenStreetMap.

X increases to the right, Y increases upward in the upright preview.
The local drawing extent is 0..1224 by 0..792.
To overlay on the reference preview (1530x990):
  preview_x = local_x * 1.25
  preview_y = (792 - local_y) * 1.25

Room points identify the center of printed room numbers, not verified room
centroids; semantic room types may be missing or approximate. Linework includes
walls AND doors, symbols, fixtures, stair details, etc. Paths may be fragmented.
No true room polygons or navigable corridor graph has been generated.

RECOMMENDED FOR A PRODUCTION MAP
1. If possible, request the original DWG/DXF with floor plan layers. In QGIS,
   Project > Import/Export > Import Layers from DWG/DXF.
2. Alternatively, open/trace the PDF in a CAD or vector editor.
3. Georeference to surveyed or known building points, if real-world mapping
   is required. Otherwise keep a local floor-plan CRS for indoor navigation.
4. Manually create verified rooms (polygons), doors and walkable corridors.
5. Use QGIS to export verified layers to GeoJSON (WGS84 if geographical).

This is an automated starting point, not a fully mapped floor plan.
