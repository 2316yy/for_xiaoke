/* ============================================================
 * 向克苏鲁许愿 · game2.5 —— cubes.js 集曜积木台（3D 引擎）
 *
 * 方块是积木：自由拖拽、网格吸附、简化重力、可堆叠。
 *   - 摆放区域：展台（神像底座）四周的环形地面，不可放上神像
 *   - 手感：拿起轻抬 + 吸附预览（金=可放 / 红=禁放）+ 落点指示
 *           + 松手下落回弹 + 木鱼式叩击声；R 键 / 双指轻点旋转 90°
 *   - 点按（位移<7px 且 <400ms）= 翻开该方块的签录
 *   - 布局持久化于 __dex（layout: key -> [i,j,k,ry]）
 *   - GLB 懒加载：先落「线框坯」，模型到后替换；8 个文件总计 ~10MB
 * ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SIZE = 0.42;          // 方块世界边长
const PITCH = 0.52;         // 网格间距
const MAX_LEVEL = 8;        // 最高堆 8 层
const LIFT = 0.055;         // 拖拽中的悬浮高度
const OUTER_R = 4.4;        // 可摆放外半径

const REDUCED = window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createGarden({ scene, camera, controls, renderer, floorY }) {
  const group = new THREE.Group();      // 所有方块
  scene.add(group);
  const fxGroup = new THREE.Group();    // 指示器 / 特效
  scene.add(fxGroup);

  const loader = new GLTFLoader();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY);
  const planeHit = new THREE.Vector3();

  let exclusionR = 1.45;                // 神像禁放半径（placeModel 后校准）
  let enabled = true;                   // 仪式中暂停
  let onCubeClick = () => {};

  /* ---------- 方块注册表 ---------- */
  const cubes = new Map();   // key -> entry
  /* entry: { key, meta, grp, body, proxy, ring, i,j,k, ry, ryTarget,
             state, bornAt, phase, moodColor, loadState, sparkles } */

  const grid = new Map();    // "i,j" -> [key@lv0, key@lv1, ...]
  const colKey = (i, j) => i + ',' + j;
  function colStack(i, j, exclKey) {
    const arr = grid.get(colKey(i, j)) || [];
    return exclKey ? arr.filter(k => k !== exclKey) : arr;
  }

  /* ---------- 材质小件 ---------- */
  function ringMesh(rIn, rOut, color, opacity) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(rIn, rOut, 40),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  }
  /* ---------- 线框坯（加载中 / 失败兜底） ---------- */
  function makeBlank(meta) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(SIZE * 0.92, SIZE * 0.92, SIZE * 0.92),
      new THREE.MeshStandardMaterial({
        color: 0x191426, roughness: 0.5, metalness: 0.3,
        emissive: new THREE.Color(meta.color), emissiveIntensity: 0.14,
      })
    );
    box.castShadow = true;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(box.geometry),
      new THREE.LineBasicMaterial({ color: new THREE.Color(meta.color), transparent: true, opacity: 0.85 })
    );
    g.add(box, edges);
    return g;
  }

  /* ---------- GLB 装载与整形 ---------- */
  function dressCube(key, meta, entry) {
    loader.load('./assets/cubes/' + meta.file, (gltf) => {
      if (!cubes.has(key)) return;              // 已移除
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const s = SIZE / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(s);
      box.setFromObject(model);
      const c = box.getCenter(new THREE.Vector3());
      model.position.set(-c.x, -box.min.y, -c.z);
      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          if (o.material) { o.material.envMapIntensity = 0.75; o.material.needsUpdate = true; }
        }
      });
      entry.grp.remove(entry.body);
      entry.body.clear();
      entry.body.add(model);
      entry.grp.add(entry.body);
      entry.loadState = 'ok';
      /* 到货微光 */
      pop(entry, 1.1);
    }, undefined, () => {
      /* 失败：线框坯继续服役 */
      entry.loadState = 'fail';
    });
  }

  /* ---------- 建方块 ---------- */
  function buildCube(key, quiet) {
    const meta = window.__dex.BY_KEY[key];
    const entry = {
      key, meta, i: 0, j: 0, k: 0, ry: 0, ryTarget: 0,
      state: 'idle', bornAt: performance.now(),
      phase: Math.random() * Math.PI * 2,
      moodColor: new THREE.Color(meta.color),
      loadState: 'loading', sparkles: null,
      grp: new THREE.Group(), body: new THREE.Group(),
      proxy: null, ring: null,
    };
    entry.body.add(makeBlank(meta));
    entry.grp.add(entry.body);

    /* 命中代理（不可见大盒，加速拾取） */
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(SIZE * 1.12, SIZE * 1.12, SIZE * 1.12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    proxy.position.y = SIZE / 2;
    proxy.userData.cubeKey = key;
    entry.proxy = proxy;
    entry.grp.add(proxy);

    /* 心情色底晕（缝光） */
    entry.ring = ringMesh(SIZE * 0.6, SIZE * 0.8, meta.color, 0.3);
    entry.ring.position.y = 0.006;
    entry.grp.add(entry.ring);

    /* 宝石的星尘 */
    if (key === 'gem') {
      const n = 42;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = SIZE * (0.7 + Math.random() * 0.9);
        pos.set([Math.cos(a) * r, Math.random() * SIZE * 1.6, Math.sin(a) * r], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xf0d8a0, size: 0.02, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      entry.sparkles = pts;
      entry.grp.add(pts);
    }

    group.add(entry.grp);
    cubes.set(key, entry);
    dressCube(key, meta, entry);
    if (!quiet) pop(entry, 1.14);
    return entry;
  }

  /* ---------- 格子工具 ---------- */
  function cellCenter(i, j) { return { x: i * PITCH, z: j * PITCH }; }
  function cellValid(i, j, exclKey) {
    const { x, z } = cellCenter(i, j);
    const r = Math.hypot(x, z);
    if (r < exclusionR || r > OUTER_R) return false;
    if (colStack(i, j, exclKey).length >= MAX_LEVEL) return false;
    return true;
  }
  function cellAt(x, z) { return { i: Math.round(x / PITCH), j: Math.round(z / PITCH) }; }
  function targetPos(i, j, k, lift) {
    const { x, z } = cellCenter(i, j);
    return new THREE.Vector3(x, floorY + k * SIZE + (lift || 0), z);
  }

  /* 默认落位：左侧弧带优先（初始镜头下最可见），随后环带铺开 */
  function findFreeCell() {
    const thetas = [-1.25, -1.6, -0.9, -1.95, -0.55, -2.3, -2.7, -3.1, 0.6, 0.1, 1.1, 1.6, 2.1, 2.6, 3.1, -0.2];
    const rs = [2.15, 2.7, 3.25, 3.8];
    for (const r of rs) {
      for (const a of thetas) {
        const { i, j } = cellAt(Math.sin(a) * r, Math.cos(a) * r);
        if (cellValid(i, j, null) && colStack(i, j, null).length === 0) return { i, j };
      }
    }
    /* 兜底：全环扫描 */
    for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) {
      if (cellValid(i, j, null) && colStack(i, j, null).length === 0) return { i, j };
    }
    return { i: 5, j: 0 };
  }

  function occupy(entry, i, j, k) {
    entry.i = i; entry.j = j; entry.k = k;
    const ck = colKey(i, j);
    const arr = (grid.get(ck) || []).filter(key => key !== entry.key);
    arr[k] = entry.key;
    /* 压缩空位 */
    grid.set(ck, arr.filter(Boolean));
  }
  function release(entry) {
    const ck = colKey(entry.i, entry.j);
    const arr = (grid.get(ck) || []).filter(key => key !== entry.key);
    if (arr.length) grid.set(ck, arr); else grid.delete(ck);
  }

  /* ---------- 动画小件 ---------- */
  const anims = [];
  function animate(dur, fn, done) {
    anims.push({ t0: performance.now(), dur, fn, done });
  }
  function stepAnims(now) {
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      let k = (now - a.t0) / a.dur;
      if (k >= 1) k = 1;
      a.fn(k);
      if (k === 1) { anims.splice(i, 1); if (a.done) a.done(); }
    }
  }
  const easeOutCubic = k => 1 - Math.pow(1 - k, 3);
  const easeOutBack = k => { const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

  function pop(entry, to) {
    animate(420, (k) => {
      const s = 1 + (to - 1) * Math.sin(k * Math.PI);
      entry.body.scale.setScalar(s);
    });
  }

  /* 落点宣告：扩散环 + 轻叩 */
  const dropRings = [];
  function dropFx(pos, color) {
    const ring = ringMesh(SIZE * 0.4, SIZE * 0.52, color, 0.75);
    ring.position.copy(pos);
    ring.position.y = floorY + 0.01;
    fxGroup.add(ring);
    dropRings.push({ ring, t0: performance.now() });
    if (window.__audio && window.__audio.knock) window.__audio.knock(0.9);
  }

  /* ---------- 特效：今日之曜 ---------- */
  const todayRing = ringMesh(SIZE * 0.66, SIZE * 0.72, 0xd8b46a, 0.0);
  fxGroup.add(todayRing);

  /* ---------- 指示器：吸附预览 ---------- */
  const marker = ringMesh(SIZE * 0.55, SIZE * 0.62, 0xd8b46a, 0);
  fxGroup.add(marker);
  const guideGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const guide = new THREE.Line(guideGeo, new THREE.LineBasicMaterial({
    color: 0xd8b46a, transparent: true, opacity: 0,
  }));
  fxGroup.add(guide);

  /* ============================================================
   * 拖拽会话
   * ============================================================ */
  let drag = null;
  /* drag: { key, entry, pointerId, sx, sy, t0, moved, valid,
             cellI, cellJ, level, target(Vector3), twoFingers } */

  const dom = renderer.domElement;

  function pickCube(e) {
    const rect = dom.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const proxies = [];
    cubes.forEach(en => proxies.push(en.proxy));
    const hits = raycaster.intersectObjects(proxies, false);
    return hits.length ? hits[0].object.userData.cubeKey : null;
  }

  function updateDragTarget(e) {
    const rect = dom.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const { entry } = drag;
    /* 优先吸附到指针下的方块所在列（自然手势：把方块拖到另一个方块上） */
    const proxies = [];
    cubes.forEach(en => { if (en.key !== entry.key) proxies.push(en.proxy); });
    const hits = raycaster.intersectObjects(proxies, false);
    let c = null;
    if (hits.length) {
      const tgt = cubes.get(hits[0].object.userData.cubeKey);
      if (tgt) c = { i: tgt.i, j: tgt.j };
    }
    if (!c) {
      if (!raycaster.ray.intersectPlane(dragPlane, planeHit)) return;
      c = cellAt(planeHit.x, planeHit.z);
    }
    const changed = c.i !== drag.cellI || c.j !== drag.cellJ;
    drag.cellI = c.i; drag.cellJ = c.j;
    drag.level = colStack(c.i, c.j, entry.key).length;
    drag.valid = cellValid(c.i, c.j, entry.key);
    drag.target = targetPos(c.i, c.j, drag.level, LIFT);
    if (changed && window.__audio && drag.moved) window.__audio.tick();
  }

  dom.addEventListener('pointerdown', (e) => {
    if (window.__DBG) console.log('[cube] pd', e.clientX, e.clientY, 'ena', enabled);
    if (!enabled || drag) return;
    if (window.__ritual && window.__ritual.active) return;
    if (window.__dexUi && window.__dexUi.anyVeilOpen()) return;
    if (dragSessionActive()) return;
    const key = pickCube(e);
    if (window.__DBG) console.log('[cube] pick', key);
    if (!key) return;
    const entry = cubes.get(key);
    if (!entry || entry.state !== 'idle') return;
    if (window.__DBG) console.log('[cube] down', key);

    drag = {
      key, entry, pointerId: e.pointerId,
      sx: e.clientX, sy: e.clientY, t0: performance.now(),
      moved: false, valid: true,
      cellI: entry.i, cellJ: entry.j, level: entry.k,
      target: entry.grp.position.clone(),
    };
  }, true);

  /* 双指轻点 = 旋转（拖拽中） */
  dom.addEventListener('pointerdown', (e) => {
    if (drag && drag.moved && e.pointerId !== drag.pointerId) rotateDrag();
  }, true);

  window.addEventListener('keydown', (e) => {
    if ((e.key === 'r' || e.key === 'R') && drag && drag.moved) rotateDrag();
  });
  function rotateDrag() {
    drag.ryTarget = (drag.ryTarget + 1) % 4;
    if (window.__audio) window.__audio.tick();
  }

  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 7) return;
      /* 拿起 */
      drag.moved = true;
      drag.ryTarget = drag.entry.ry;
      drag.entry.state = 'drag';
      controls.enabled = false;
      controls.autoRotate = false;
      release(drag.entry);
      settleColumn(drag.entry.i, drag.entry.j);
      pop(drag.entry, 1.07);
      marker.material.opacity = 0.85;
      guide.material.opacity = 0.4;
      dom.style.cursor = 'grabbing';
      if (window.__audio) window.__audio.tick();
    }
    updateDragTarget(e);
  });

  window.addEventListener('pointerup', (e) => {
    if (window.__DBG) console.log('[cube] pu', e.pointerId, drag ? drag.pointerId : '-', drag ? (performance.now() - drag.t0) : '-');
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    marker.material.opacity = 0;
    guide.material.opacity = 0;
    dom.style.cursor = '';

    const dt = performance.now() - d.t0;
    const dist = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
    d.entry.body.scale.setScalar(1);

    if (!d.moved && dt < 400 && dist < 7) {
      /* 点按 = 翻阅 */
      d.entry.state = 'idle';
      if (window.__DBG) console.log('[cube] click', d.key);
      onCubeClick(d.key);
      return;
    }
    if (!d.moved) { d.entry.state = 'idle'; controlsMaybeEnable(); return; }

    if (d.valid) {
      /* 落子 */
      occupy(d.entry, d.cellI, d.cellJ, d.level);
      d.entry.ry = d.ryTarget;
      d.entry.grp.rotation.y = d.ryTarget * Math.PI / 2;
      settleCube(d.entry, true);
      dropFx(d.entry.grp.position, d.entry.moodColor);
      saveLayout();
      if (window.__DBG) console.log('[cube] drop', d.key, '->', d.cellI, d.cellJ, d.level);
    } else {
      /* 归位：落到原列柱顶（原位的重力已在拿起时重新沉降） */
      const k = colStack(d.entry.i, d.entry.j, d.entry.key).length;
      occupy(d.entry, d.entry.i, d.entry.j, k);
      settleCube(d.entry, true);
      if (window.__DBG) console.log('[cube] invalid-return', d.key);
      if (window.__audio && window.__audio.knock) window.__audio.knock(0.4);
    }
    d.entry.state = 'idle';
    controlsMaybeEnable();
  });
  window.addEventListener('pointercancel', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    marker.material.opacity = 0;
    guide.material.opacity = 0;
    dom.style.cursor = '';
    if (d.moved) {
      const k = colStack(d.entry.i, d.entry.j, d.entry.key).length;
      occupy(d.entry, d.entry.i, d.entry.j, k);
      settleCube(d.entry, true);
      d.entry.state = 'idle';
    }
    controlsMaybeEnable();
  });

  function controlsMaybeEnable() {
    setTimeout(() => {
      if (!(window.__ritual && window.__ritual.active)) {
        controls.enabled = true;
        controls.autoRotate = true;
      }
    }, 30);
  }
  function dragSessionActive() { return !!drag; }

  /* ---------- 落位与重力 ---------- */
  function settleCube(entry, animateDrop) {
    const p = targetPos(entry.i, entry.j, entry.k, 0);
    if (!animateDrop || REDUCED) {
      entry.grp.position.copy(p);
      return;
    }
    const from = entry.grp.position.clone();
    const rise = Math.max(from.y, p.y + 0.16);
    animate(340, (k) => {
      const e1 = easeOutCubic(k);
      entry.grp.position.x = from.x + (p.x - from.x) * e1;
      entry.grp.position.z = from.z + (p.z - from.z) * e1;
      /* 先起后落的小弧线 */
      const up = k < 0.35 ? (k / 0.35) : 1;
      const down = k < 0.35 ? 0 : easeOutBack((k - 0.35) / 0.65);
      entry.grp.position.y = from.y + (rise - from.y) * up + (p.y - rise) * down;
    });
  }
  /* 抽走一块后，同列上方块依序落下 */
  function settleColumn(i, j) {
    const arr = grid.get(colKey(i, j)) || [];
    arr.forEach((key, lv) => {
      const en = cubes.get(key);
      if (!en) return;
      if (en.k !== lv) {
        en.k = lv;
        settleCube(en, true);
        if (window.__audio && window.__audio.knock) {
          setTimeout(() => window.__audio.knock(0.5), lv * 45);
        }
      }
    });
  }

  /* ---------- 布局持久化 ---------- */
  function saveLayout() {
    const l = {};
    cubes.forEach(en => { l[en.key] = [en.i, en.j, en.k, en.ry]; });
    if (window.__dex) window.__dex.saveLayout(l);
  }

  /* ---------- 拖拽跟随：吸附滑移 + 落点指示 ---------- */
  function dragStep() {
    if (!drag || !drag.moved) return;
    const en = drag.entry;
    /* 方块平滑滑向吸附点 */
    en.grp.position.lerp(drag.target, 0.24);
    const ryGoal = (drag.ryTarget || 0) * Math.PI / 2;
    let dr = ryGoal - en.grp.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    en.grp.rotation.y += dr * 0.2;
    /* 落点标记：金=可落，红=禁放 */
    marker.position.set(drag.target.x, floorY + 0.011, drag.target.z);
    marker.material.color.set(drag.valid ? 0xd8b46a : 0xd85e6a);
    /* 牵引线：从格心到方块 */
    const pos = guide.geometry.attributes.position;
    pos.setXYZ(0, drag.target.x, floorY + 0.012, drag.target.z);
    pos.setXYZ(1, en.grp.position.x, en.grp.position.y, en.grp.position.z);
    pos.needsUpdate = true;
    guide.material.color.set(drag.valid ? 0xd8b46a : 0xd85e6a);
    /* 禁放时方块微缩 */
    en.body.scale.setScalar(drag.valid ? 1.06 : 0.94);
  }

  /* ---------- 微动效 ---------- */
  function idleFx(t) {
    cubes.forEach((en) => {
      if (en.state === 'drag') return;
      const bob = REDUCED ? 0 : Math.sin(t * 1.1 + en.phase) * 0.004;
      en.body.position.y = bob;
      if (en.key === 'gem' && !REDUCED) {
        en.body.rotation.y = t * 0.3;
        if (en.sparkles) {
          en.sparkles.rotation.y = -t * 0.5;
          en.sparkles.material.opacity = 0.5 + 0.35 * Math.sin(t * 2.2);
        }
      }
    });
    /* 今日之曜呼吸环 */
    const td = window.__dex ? window.__dex.WEEK[new Date().getDay()].key : null;
    const ten = td && cubes.get(td);
    if (ten && ten.state !== 'drag') {
      todayRing.material.opacity = 0.4 + 0.22 * Math.sin(t * 1.6);
      todayRing.position.set(ten.grp.position.x, floorY + 0.012, ten.grp.position.z);
    } else {
      todayRing.material.opacity = 0;
    }
    /* 落点扩散环 */
    const now = performance.now();
    for (let i = dropRings.length - 1; i >= 0; i--) {
      const r = dropRings[i];
      const k = (now - r.t0) / 620;
      if (k >= 1) { fxGroup.remove(r.ring); dropRings.splice(i, 1); continue; }
      r.ring.scale.setScalar(1 + k * 2.6);
      r.ring.material.opacity = 0.75 * (1 - k);
    }
  }

  /* ---------- 悬停 ---------- */
  let hoverKey = null;
  let hoverCheckAt = 0;
  dom.addEventListener('pointermove', (e) => {
    if (!enabled || drag) return;
    if (window.__ritual && window.__ritual.active) return;
    const now = performance.now();
    if (now - hoverCheckAt < 70) return;
    hoverCheckAt = now;
    const key = pickCube(e);
    if (key !== hoverKey) {
      hoverKey = key;
      dom.style.cursor = key ? 'pointer' : '';
    }
  });

  /* ============================================================
   * 对外 API
   * ============================================================ */
  const api = {
    /* 入场（已有收藏恢复 / 新解锁掉落） */
    spawn(key, { fanfare = true } = {}) {
      if (cubes.has(key)) return cubes.get(key);
      const entry = buildCube(key, !fanfare);
      const layout = window.__dex ? window.__dex.getLayout() : {};
      const saved = layout[key];
      let i, j;
      if (saved && cellValid(saved[0], saved[1], key)) {
        [i, j] = [saved[0], saved[1]];
        entry.ry = saved[3] || 0;
        entry.ryTarget = entry.ry;
      } else {
        const c = findFreeCell();
        i = c.i; j = c.j;
      }
      const k = colStack(i, j, key).length;
      occupy(entry, i, j, k);
      const p = targetPos(i, j, k, 0);

      if (fanfare && !REDUCED) {
        /* 从天而降 */
        entry.grp.position.set(p.x, p.y + 2.6, p.z);
        entry.state = 'spawn';
        animate(950, (kk) => {
          const e2 = 1 - Math.pow(1 - kk, 4);
          entry.grp.position.y = p.y + (1 - e2) * 2.6;
        }, () => {
          entry.state = 'idle';
          dropFx(p, entry.moodColor);
          if (window.__audio && window.__audio.knock) window.__audio.knock(1);
          saveLayout();
        });
      } else {
        entry.grp.position.copy(p);
      }
      entry.grp.rotation.y = entry.ry * Math.PI / 2;
      if (!fanfare) saveLayoutQuietGuard();
      else if (REDUCED) saveLayout();
      return entry;
    },
    pulse(key, colorHex) {
      const en = cubes.get(key);
      if (!en) return;
      if (colorHex) {
        try { en.moodColor.set(colorHex); en.ring.material.color.set(colorHex); } catch (e) { /* ignore */ }
      }
      pop(en, 1.16);
      const ring = ringMesh(SIZE * 0.5, SIZE * 0.6, en.moodColor, 0.8);
      ring.position.set(en.grp.position.x, floorY + 0.01, en.grp.position.z);
      fxGroup.add(ring);
      dropRings.push({ ring, t0: performance.now() });
      if (window.__audio) window.__audio.tick();
    },
    sync() {
      if (!window.__dex) return;
      const layout = window.__dex.getLayout();
      const keys = window.__dex.cubeKeys();
      /* 按保存层级自底向上恢复，堆塔顺序不颠倒 */
      keys.sort((a, b) => (((layout[a] || [])[2]) || 0) - (((layout[b] || [])[2]) || 0));
      keys.forEach((key, idx) => {
        setTimeout(() => { if (!cubes.has(key)) api.spawn(key, { fanfare: false }); }, idx * 420);
      });
      /* 各方块底晕染成最近一签的心情色 */
      setTimeout(() => {
        keys.forEach((key) => {
          const list = window.__dex.drawsForCube(key);
          const en = cubes.get(key);
          if (en && list.length && window.__dex.BY_KEY[key]) {
            const m = list[0].mood;
            const meta = { lost:'#9d7bff',tired:'#7f8fc9',lonely:'#6fb6cf',fear:'#6a7fd8',angry:'#e07856',hollow:'#9d95b0',joy:'#f0b45c',calm:'#8fd0a8',hope:'#e8d078',grace:'#e8a0b8' };
            if (meta[m]) { en.moodColor.set(meta[m]); en.ring.material.color.set(meta[m]); }
          }
        });
      }, keys.length * 420 + 400);
    },
    resetLayout() {
      if (window.__dex) window.__dex.saveLayout({});
      const arr = [...cubes.values()];
      grid.clear();
      arr.forEach((en, idx) => {
        const c = findFreeCell();
        const k = colStack(c.i, c.j, en.key).length;
        occupy(en, c.i, c.j, k);
        setTimeout(() => settleCube(en, true), idx * 70);
      });
      setTimeout(saveLayout, arr.length * 70 + 420);
    },
    setExclusion(r) { exclusionR = r; },
    setEnabled(v) { enabled = v; },
    onClick(fn) { onCubeClick = fn; },
    count() { return cubes.size; },
    /* 测试辅助：方块世界坐标 → 屏幕 CSS 像素 */
    screenPos(key) {
      const en = cubes.get(key);
      if (!en) return null;
      const v = en.grp.position.clone();
      v.y += SIZE / 2;
      v.project(camera);
      const rect = dom.getBoundingClientRect();
      return {
        x: rect.left + (v.x + 1) / 2 * rect.width,
        y: rect.top + (-v.y + 1) / 2 * rect.height,
      };
    },
    cellOf(key) { const en = cubes.get(key); return en ? [en.i, en.j, en.k] : null; },
    /* 测试辅助：格子 → 屏幕 CSS 像素 */
    cellScreen(i, j) {
      const v = new THREE.Vector3(i * PITCH, floorY + SIZE / 2, j * PITCH).project(camera);
      const rect = dom.getBoundingClientRect();
      return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (-v.y + 1) / 2 * rect.height };
    },
    debugInfo() { return { exclusionR, outerR: OUTER_R, cubes: cubes.size }; },
    tick(t) { stepAnims(performance.now()); dragStep(); idleFx(t); },
  };

  /* sync 时避免每块都覆写布局（保留未生成方块的已有摆放） */
  function saveLayoutQuietGuard() {
    const l = Object.assign({}, window.__dex ? window.__dex.getLayout() : {});
    cubes.forEach(en => { l[en.key] = [en.i, en.j, en.k, en.ry]; });
    if (window.__dex) window.__dex.saveLayout(l);
  }

  return api;
}
