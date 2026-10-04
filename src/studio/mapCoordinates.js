/**
 * Semantic/MuJoCo 使用右手 z-up，Three.js 使用右手 y-up。
 *
 * 仅交换 Y/Z 会把右手坐标系镜像。正确基变换为：
 * world(x, y, z) -> three(x, z, -y)。
 */
export function worldPositionToMapScene(position = {}) {
  return [Number(position.x || 0), Number(position.z || 0), -Number(position.y || 0)]
}

/** 把 Three.js 地面 X/Z 点还原为 Semantic world X/Y 点。 */
export function mapGroundPointToWorld(point = {}) {
  return {
    x: Number(point.x || 0),
    y: -Number(point.z || 0),
    z: 0
  }
}
