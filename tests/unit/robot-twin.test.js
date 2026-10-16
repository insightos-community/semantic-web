import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import fs from 'node:fs'
import { JSDOM } from 'jsdom'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  RobotTwinLayer,
  applyJointValues,
  jointNodes,
  compatibleTwin,
  freshTwin
} from '@/studio/robotTwin'

const identity = { pilot: 'pilot', map: 'map', revision: 'rev', model: 'model', urdf: 'urdf' }
const layer = {
  properties: {
    pilot_instance_id: 'pilot',
    map_hash: 'map',
    mapping_revision: 'rev',
    mapping: { robot_visual: { urdf_sha256: 'urdf', map_visual: { sha256: 'model' } } }
  }
}
const sample = () => ({
  available: true,
  online: true,
  age_s: 0.1,
  pilot_id: 'pilot',
  state: {
    frame: 'map',
    units: 'm_rad',
    map_hash: 'map',
    mapping_revision: 'rev',
    model_sha256: 'model',
    urdf_sha256: 'urdf',
    stream_id: 'boot',
    sequence: 1,
    pose: [1, 2, 0.168, 0.5],
    pose_age_s: 0.01,
    joints: { j: 0.4 },
    components: Object.fromEntries(
      ['arm_left', 'arm_right', 'torso', 'gripper_right'].map((k) => [k, { fresh: true }])
    )
  }
})
afterEach(() => vi.useRealTimers())

describe('Real Map telemetry', () => {
  it('requires the selected map, model and pilot; clocks expire independently', () => {
    const r = sample()
    expect(compatibleTwin(r, identity)).toBe(true)
    for (const key of ['pilot', 'map', 'revision', 'model', 'urdf'])
      expect(compatibleTwin(r, { ...identity, [key]: 'other' })).toBe(false)
    expect(freshTwin(r)).toBe(true)
    expect(freshTwin(r, 3)).toBe(false)
    expect(freshTwin({ ...r, online: false })).toBe(false)
    r.state.pose_age_s = 4
    expect(freshTwin(r)).toBe(false)
  })

  it('moves the base and joints, freezes stale feedback, stops reads off-page and disposes', async () => {
    vi.useFakeTimers()
    const node = new THREE.Group()
    node.userData.urdf_joint = { name: 'j', type: 'revolute', axis: [0, 0, 1] }
    const model = new THREE.Group()
    model.add(node)
    const request = { get: vi.fn(async () => sample()) },
      status = vi.fn()
    let visible = true
    const twin = new RobotTwinLayer({
      THREE,
      scene: new THREE.Scene(),
      request,
      loadVisual: vi.fn(async () => model),
      status,
      visible: () => visible
    })
    twin.setContext('project', layer, true)
    await vi.advanceTimersByTimeAsync(0)
    twin.frame(twin.received + 500)
    expect(twin.root.visible).toBe(true)
    expect(twin.root.position.toArray()).toEqual([1, 0.168, -2])
    expect(node.rotation.z).toBeCloseTo(0.4)
    const position = twin.root.position.clone()
    twin.frame(twin.received + 4000)
    expect(twin.root.position.equals(position)).toBe(true)
    expect(status.mock.lastCall[0]).toContain('过期')
    visible = false
    await vi.advanceTimersByTimeAsync(2000)
    expect(request.get).toHaveBeenCalledTimes(1)
    twin.clear()
    await vi.advanceTimersByTimeAsync(5000)
    expect(request.get).toHaveBeenCalledTimes(1)
    expect(twin.scene.children.length).toBe(0)
  })

  it('never renders a robot using a response from a previous source', async () => {
    vi.useFakeTimers()
    let resolve
    const request = {
      get: () =>
        new Promise((r) => {
          resolve = r
        })
    }
    const twin = new RobotTwinLayer({
      THREE,
      scene: new THREE.Scene(),
      request,
      loadVisual: async () => new THREE.Group(),
      status: () => {},
      visible: () => true
    })
    twin.setContext('project', layer, true)
    await vi.advanceTimersByTimeAsync(0)
    twin.setContext('project', layer, false)
    resolve(sample())
    await vi.advanceTimersByTimeAsync(0)
    expect(twin.root).toBeNull()
    expect(twin.record).toBeNull()
  })
})

it.skipIf(!process.env.R1PRO_TWIN_ASSETS || !process.env.R1PRO_URDF)(
  'loads the original robot geometry and matches independent URDF forward kinematics',
  async () => {
    const bytes = fs.readFileSync(process.env.R1PRO_TWIN_ASSETS + '/r1pro-robot.glb')
    const { scene } = await new Promise((resolve, reject) =>
      new GLTFLoader().parse(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        '',
        resolve,
        reject
      )
    )
    const xml = new JSDOM(fs.readFileSync(process.env.R1PRO_URDF, 'utf8'), {
      contentType: 'text/xml'
    }).window.document
    const nodes = jointNodes(scene)
    expect(nodes.size).toBe(45)
    let meshes = 0
    scene.traverse((n) => {
      if (n.isMesh) meshes++
    })
    expect(meshes).toBe(46)
    const joints = [...xml.querySelectorAll('robot > joint')]
    const numbers = (s, fallback) => (s ? s.split(/\s+/).map(Number) : fallback)
    const q = {
      torso_joint1: 0.4,
      torso_joint2: -1,
      torso_joint3: -0.6,
      right_arm_joint1: 0.3,
      right_arm_joint3: 0.8,
      right_arm_joint4: -1.2,
      right_gripper_finger_joint1: 0.028,
      right_gripper_finger_joint2: -0.028
    }
    function fk(link) {
      const j = joints.find((j) => j.querySelector('child')?.getAttribute('link') === link)
      if (!j) return new THREE.Matrix4()
      const o = j.querySelector('origin'),
        rpy = numbers(o?.getAttribute('rpy'), [0, 0, 0])
      const origin = new THREE.Matrix4().compose(
        new THREE.Vector3(...numbers(o?.getAttribute('xyz'), [0, 0, 0])),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rpy, 'ZYX')),
        new THREE.Vector3(1, 1, 1)
      )
      const axis = new THREE.Vector3(
        ...numbers(j.querySelector('axis')?.getAttribute('xyz'), [1, 0, 0])
      ).normalize()
      const value = q[j.getAttribute('name')] || 0
      const motion =
        j.getAttribute('type') === 'prismatic'
          ? new THREE.Matrix4().makeTranslation(...axis.multiplyScalar(value).toArray())
          : new THREE.Matrix4().makeRotationAxis(axis, value)
      return fk(j.querySelector('parent').getAttribute('link')).multiply(origin).multiply(motion)
    }
    applyJointValues(THREE, nodes, q)
    scene.updateMatrixWorld(true)
    for (const link of [
      'torso_link4',
      'right_gripper_link',
      'right_D405_link',
      'right_gripper_finger_link1',
      'left_gripper_link'
    ]) {
      const expected = new THREE.Matrix4().makeRotationX(-Math.PI / 2).multiply(fk(link))
      const actual = scene.getObjectByName(link).matrixWorld
      expect(
        Math.max(...actual.elements.map((v, i) => Math.abs(v - expected.elements[i])))
      ).toBeLessThan(1e-7)
    }
  }
)
