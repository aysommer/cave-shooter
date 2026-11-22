// Entity creation shared by all entity types.

export function addEntity(world, props) {
  const e = { id: world.nextId++, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, w: 1, h: 1, ...props };
  // px/py: position at the start of the tick, used for render interpolation.
  e.px = e.x;
  e.py = e.y;
  world.entities.push(e);
  return e;
}
