

Map data is stored in `/server/data/map`.

Each file is a node definition. A node contains the following structure:

### Structure
```
{ 
  name?: string,
  type: NodeType,
  aliases?: string[],
  children?: (Node | NodePath)[]
}
```
For those unfamiliar with type syntax:
- Square brackets denote an array, such that string[] means an array of strings
- Question mark means that field is optional

### Default Properties
- `name` is the name of the node. If no name is specified, it will first take the name of the containing file. If it is a direct child, it will take the name of the type instead.
- `aliases` are extra names that can be indexed by the search engine but are not primarily used.
- `type` describes what type of node it is. More on it below.
- `children` allows you to specify the children of the node. Direct children are nodes specified directly within another node, instead of as a reference.

### Node Types
- `pointMap` for any feature that contains one or multiple points.
  - `points: Point[]`
  - `pointIcon: string`
- `building` for a building
- `floor` for a floor.
- `room` for a room.
- `layout` defines a layout for a building, floor, or room.
  - `points: Point[]`

### Point
- Lat-long point: `[lat: number, long: number]`
- Labeled lat-long point: `[name: string, lat: number, long: number]`
- Point reference `[path: string]`
