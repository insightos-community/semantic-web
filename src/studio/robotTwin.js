// Live display overlay, independent of static map revisions and robot control.
export function compatibleTwin(record, identity) {
  const s = record?.state
  return !!(
    record?.available &&
    s &&
    record.pilot_id === identity.pilot &&
    s.map_hash === identity.map &&
    s.mapping_revision === identity.revision &&
    s.model_sha256 === identity.model &&
    s.urdf_sha256 === identity.urdf &&
    s.frame === 'map' &&
    s.units === 'm_rad'
  )
}

export function freshTwin(record, elapsed = 0) {
  const s = record?.state
  return (
    record?.online === true &&
    Number.isFinite(record.age_s) &&
    record.age_s >= 0 &&
    record.age_s + elapsed < 3 &&
    Array.isArray(s?.pose) &&
    s.pose.length === 4 &&
    s.pose.every(Number.isFinite) &&
    Number.isFinite(s.pose_age_s) &&
    s.pose_age_s + record.age_s + elapsed < 3
  )
}

export function jointNodes(object) {
  const nodes = new Map()
  object.traverse((node) => {
    if (node.userData?.urdf_joint) nodes.set(node.userData.urdf_joint.name, node)
  })
  return nodes
}

export function applyJointValues(THREE, nodes, values) {
  for (const [name, node] of nodes) {
    const spec = node.userData.urdf_joint
    let q = values[name]
    if (spec.mimic && Number.isFinite(values[spec.mimic.joint]))
      q = values[spec.mimic.joint] * spec.mimic.multiplier + spec.mimic.offset
    if (!Number.isFinite(q)) continue // Keep last measured/reference value; never fabricate feedback.
    const axis = new THREE.Vector3(...spec.axis).normalize()
    if (spec.type === 'revolute' || spec.type === 'continuous')
      node.quaternion.setFromAxisAngle(axis, q)
    if (spec.type === 'prismatic') node.position.copy(axis.multiplyScalar(q))
  }
}

export class RobotTwinLayer {
  constructor({ THREE, scene, request, loadVisual, status, visible }) {
    Object.assign(this, { THREE, scene, request, loadVisual, status, visible })
    this.generation = 0
    this.nodes = new Map()
    this.joints = {}
    this.key = ''
  }

  setContext(project, layer, active) {
    const props = layer?.properties
    const visual = props?.mapping?.robot_visual
    const key =
      active && project && visual
        ? JSON.stringify([
            project,
            props.pilot_instance_id,
            props.map_hash,
            props.mapping_revision,
            visual.map_visual.sha256
          ])
        : ''
    if (key === this.key) return
    this.clear()
    this.key = key
    if (!key) {
      this.status('')
      return
    }
    const run = this.generation
    this.identity = {
      pilot: props.pilot_instance_id,
      map: props.map_hash,
      revision: props.mapping_revision,
      model: visual.map_visual.sha256,
      urdf: visual.urdf_sha256
    }
    this.project = project
    this.status('R1Pro 模型加载中…')
    const url = `/api/v1/projects/${encodeURIComponent(project)}/maps/visual-assets/${visual.map_visual.sha256}.glb`
    this.loadVisual({ ...visual, map_visual: { ...visual.map_visual, content_url: url } }, 'map')
      .then((model) => {
        if (!model) throw new Error('机器人模型不可用')
        if (run !== this.generation) {
          this.release(model)
          return
        }
        this.root = new this.THREE.Group()
        this.root.name = 'real-map-robot-twin'
        this.root.visible = false
        this.root.add(model)
        this.scene.add(this.root)
        this.nodes = jointNodes(model)
        model.traverse((node) => {
          if (!node.material) return
          for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
            m.userData.twinColor = m.color?.clone()
          }
        })
        this.status('R1Pro · 等待实测定位和关节反馈')
        this.poll()
      })
      .catch((e) => {
        if (run === this.generation) this.status('R1Pro 模型加载失败：' + e.message)
      })
  }

  async poll() {
    const run = this.generation
    if (!this.key) return
    if (!this.visible()) {
      this.timer = setTimeout(() => this.poll(), 1000)
      return
    }
    const controller = new AbortController()
    this.abort = controller
    try {
      const record = await this.request.get(
        `/projects/${encodeURIComponent(this.project)}/maps/real_map/robot-state`,
        { signal: controller.signal, timeout: 2500 }
      )
      if (run !== this.generation) return
      if (!record?.available) {
        if (this.record) this.record = { ...this.record, online: false }
        this.status(
          this.root.visible ? 'R1Pro · 等待反馈，保留最后观测姿态' : 'R1Pro · 等待首次有效定位'
        )
        return
      }
      if (!compatibleTwin(record, this.identity)) {
        this.record = null
        // Different source/map/model must never be drawn over the current scene.
        this.root.visible = false
        this.status('R1Pro · 等待当前地图对应的实测反馈')
        return
      }
      this.record = record
      this.received = performance.now()
      this.interval = Math.max(0.1, Math.min(60, record.state.sample_interval_s || 1))
      const state = record.state
      const newSample = state.stream_id !== this.stream || state.sequence !== this.sequence
      if (newSample && freshTwin(record)) {
        const restart = state.stream_id !== this.stream
        const from = this.pose || state.pose
        // Shortest yaw arc across ±pi; interpolation is display-only.
        const yaw =
          from[3] + Math.atan2(Math.sin(state.pose[3] - from[3]), Math.cos(state.pose[3] - from[3]))
        const to = [...state.pose.slice(0, 3), yaw]
        this.transition = {
          start: performance.now(),
          from: restart ? to : from,
          to,
          before: restart ? state.joints : { ...this.joints },
          after: state.joints || {}
        }
        this.stream = state.stream_id
        this.sequence = state.sequence
        this.root.visible = true
      }
    } catch (e) {
      if (run === this.generation && e.name !== 'CanceledError')
        this.status('R1Pro · 反馈连接中断，保留最后观测')
    } finally {
      if (run === this.generation && this.key)
        this.timer = setTimeout(() => this.poll(), (this.interval || 1) * 1000)
    }
  }

  frame(now = performance.now()) {
    if (!this.root || !this.record) return
    const fresh = freshTwin(this.record, (now - this.received) / 1000)
    const t = this.transition
    if (fresh && t) {
      const mix = Math.max(0, Math.min(1, (now - t.start) / 400))
      this.pose = t.to.map((v, i) => t.from[i] + (v - t.from[i]) * mix)
      for (const [name, value] of Object.entries(t.after)) {
        if (Number.isFinite(value))
          this.joints[name] = (t.before[name] ?? value) + (value - (t.before[name] ?? value)) * mix
      }
      const [x, y, z, yaw] = this.pose
      this.root.position.set(x, z, -y)
      this.root.quaternion.setFromAxisAngle(new this.THREE.Vector3(0, 1, 0), yaw)
      applyJointValues(this.THREE, this.nodes, this.joints)
    }
    const expected = ['arm_left', 'arm_right', 'torso', 'gripper_right']
    const missing = expected.filter((name) => !this.record.state.components?.[name]?.fresh)
    const measured = fresh && !missing.length
    if (this.measured !== measured) {
      this.measured = measured
      this.root.traverse((node) => {
        if (!node.material) return
        for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
          if (m.userData.twinColor)
            m.color
              .copy(m.userData.twinColor)
              .lerp(new this.THREE.Color(0x83909d), measured ? 0 : 0.7)
        }
      })
    }
    const age = this.record.age_s + (now - this.received) / 1000
    this.status(
      fresh
        ? `R1Pro · 实测 ${age.toFixed(1)} s 前 · ${Number((1 / (this.interval || 1)).toFixed(1))} Hz${missing.length ? ' · 部分关节为最后观测／参考位' : ''}`
        : this.root.visible
          ? 'R1Pro · 反馈过期／离线，灰色为最后观测姿态'
          : 'R1Pro · 等待首次有效定位'
    )
  }

  release(object) {
    object.traverse((node) => {
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) m?.dispose()
    }) // Geometry belongs to the shared model cache.
  }

  clear() {
    this.generation++
    clearTimeout(this.timer)
    this.abort?.abort()
    if (this.root) {
      this.scene.remove(this.root)
      this.release(this.root)
    }
    this.root = null
    this.record = null
    this.transition = null
    this.pose = null
    this.joints = {}
    this.nodes.clear()
    this.stream = null
    this.sequence = null
    this.measured = null
    this.key = ''
    this.interval = 1
  }
}
