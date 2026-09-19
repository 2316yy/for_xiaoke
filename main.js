import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createGarden } from './cubes.js';

/* ============================================================
 * 向克苏鲁许愿 · game2.5 祭坛场景
 * 静态手办 + 星向粒子 + 求签仪式钩子（window.__ritual）+ 集曜积木台（cubes.js）
 *
 * 2.5 场景侧新增：
 *   - createGarden 积木台：曜方拖拽堆叠 / 吸附 / 重力 / 点按翻签录
 *   - __ritual.toGarden() ：俯看积木阵镜头
 *   - placeModel 后按底座半径校准神像禁放区
 *
 * 2.0 场景侧新增（配合 UI 交互升级）：
 *   - __ritual.setMood(hex)：心情色联动（轮廓光/凝视光平滑过渡）
 *   - __ritual.energy(r) ：摇签蓄力联动（粒子加速 + 震屏随能量）
 *   - 模型加载失败时：程序化「剪影神像」兜底，流程永不阻断
 *   - prefers-reduced-motion：震屏大幅减弱
 * ============================================================ */

const REDUCED = window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SHAKE_SCALE = REDUCED ? 0.15 : 1;

const app = document.getElementById('app');
const loaderEl = document.getElementById('loader');
const loadText = document.getElementById('load-text');

/* ---------- 渲染器 ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

/* ---------- 场景 / 相机 ---------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060c);
scene.fog = new THREE.FogExp2(0x05060c, 0.02);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 200);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

/* ---------- 调色板 ---------- */
const PALETTE = {
  gold:   new THREE.Color(0xd8b46a),
  violet: new THREE.Color(0x9d7bff),
  ice:    new THREE.Color(0xa8c8ff),
  white:  new THREE.Color(0xf5f2ff),
};

/* ============================================================
 * 地面
 * ============================================================ */
const figurine = new THREE.Group();
scene.add(figurine);

function makeFloorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(256, 256, 10, 256, 256, 256);
  grad.addColorStop(0, '#181426');
  grad.addColorStop(0.45, '#0c0a16');
  grad.addColorStop(1, '#05060c');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(16, 64),
  new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.95, metalness: 0.0 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.181;
floor.receiveShadow = true;
scene.add(floor);

/* ============================================================
 * 符文魔法阵
 * ============================================================ */
function makeRuneCircleTexture(size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const cx = size / 2, cy = size / 2;
  g.clearRect(0, 0, size, size);
  g.strokeStyle = '#e6c888';
  g.fillStyle = '#e6c888';
  g.shadowColor = 'rgba(230,200,136,0.9)';
  g.shadowBlur = 10;

  g.lineWidth = 5;
  g.beginPath(); g.arc(cx, cy, size * 0.47, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, size * 0.435, 0, Math.PI * 2); g.stroke();

  g.lineWidth = 2;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const r1 = size * 0.435, r2 = size * (i % 6 === 0 ? 0.415 : 0.425);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    g.stroke();
  }

  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ☿♀♁♂♃♄☉☽'.split('');
  g.font = `${size * 0.036}px serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  runes.forEach((ch, i) => {
    const a = (i / runes.length) * Math.PI * 2 - Math.PI / 2;
    const r = size * 0.385;
    g.save();
    g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.rotate(a + Math.PI / 2);
    g.fillText(ch, 0, 0);
    g.restore();
  });

  g.lineWidth = 2.5;
  g.beginPath(); g.arc(cx, cy, size * 0.335, 0, Math.PI * 2); g.stroke();

  g.lineWidth = 2;
  g.beginPath();
  const pts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    pts.push([cx + Math.cos(a) * size * 0.335, cy + Math.sin(a) * size * 0.335]);
  }
  for (let i = 0; i < 7; i++) {
    const p1 = pts[i], p2 = pts[(i + 3) % 7];
    g.moveTo(p1[0], p1[1]);
    g.lineTo(p2[0], p2[1]);
  }
  g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

const runeCircle = new THREE.Mesh(
  new THREE.PlaneGeometry(6.6, 6.6),
  new THREE.MeshBasicMaterial({
    map: makeRuneCircleTexture(),
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
runeCircle.rotation.x = -Math.PI / 2;
runeCircle.position.y = -0.175;
scene.add(runeCircle);

/* ============================================================
 * 星向粒子系统
 * ============================================================ */
const starMaterials = [];

function worldToPixelScale() {
  const hPx = renderer.domElement.height;
  return hPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

function makeStarTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(32, 4);  g.lineTo(32, 60);
  g.moveTo(4, 32);  g.lineTo(60, 32);
  g.stroke();
  return new THREE.CanvasTexture(c);
}
const starTexture = makeStarTexture();

function makeStars({ count, radius, yRange, riseSpeed, size, colors, shell = false, opacity = 1 }) {
  const pos = new Float32Array(count * 3);
  const aSize = new Float32Array(count);
  const aPhase = new Float32Array(count);
  const aSpeed = new Float32Array(count);
  const aRise = new Float32Array(count);
  const aColor = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    let x, y, z;
    if (shell) {
      const v = new THREE.Vector3().randomDirection();
      const r = radius * (0.8 + Math.random() * 0.4);
      x = v.x * r; y = Math.abs(v.y * r) * 0.9 - 2; z = v.z * r;
    } else {
      const a = Math.random() * Math.PI * 2;
      const r = radius[0] + Math.random() * (radius[1] - radius[0]);
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      y = Math.random() * yRange;
    }
    pos.set([x, y, z], i * 3);
    aSize[i] = size[0] + Math.random() * (size[1] - size[0]);
    aPhase[i] = Math.random() * Math.PI * 2;
    aSpeed[i] = 0.6 + Math.random() * 2.2;
    aRise[i] = shell ? 0 : riseSpeed * (0.5 + Math.random());
    const col = colors[Math.floor(Math.random() * colors.length)];
    aColor.set([col.r, col.g, col.b], i * 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(aSpeed, 1));
  geo.setAttribute('aRise', new THREE.BufferAttribute(aRise, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRange: { value: yRange || 1 },
      uMap: { value: starTexture },
      uScale: { value: worldToPixelScale() },
      uOpacity: { value: opacity },
      uBoost: { value: 1 },
    },
    vertexShader: /* glsl */`
      attribute float aSize;
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aRise;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uRange;
      uniform float uScale;
      uniform float uOpacity;
      uniform float uBoost;
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        vec3 p = position;
        if (aRise > 0.0) {
          p.y = mod(p.y + uTime * aRise * uBoost, uRange);
          vAlpha = 1.0 - smoothstep(uRange * 0.7, uRange, p.y);
        } else {
          vAlpha = 1.0;
        }
        vAlpha *= uOpacity * (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * aSpeed * uBoost + aPhase)));
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * uBoost * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      varying float vAlpha;
      varying vec3 vColor;
      void main() {
        vec4 tex = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vColor, tex.a * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  starMaterials.push(mat);
  return points;
}

const risingStars = makeStars({
  count: 340, radius: [1.3, 3.2], yRange: 3.6, riseSpeed: 0.16,
  size: [0.015, 0.05],
  colors: [PALETTE.gold, PALETTE.violet, PALETTE.ice, PALETTE.white],
  opacity: 0.85,
});
risingStars.position.y = -0.18;
scene.add(risingStars);

const orbitStars = makeStars({
  count: 70, radius: [2.15, 2.45], yRange: 0.35, riseSpeed: 0.02,
  size: [0.03, 0.08],
  colors: [PALETTE.gold, PALETTE.white],
  opacity: 0.9,
});
const orbitGroup = new THREE.Group();
orbitGroup.add(orbitStars);
orbitGroup.rotation.x = 0.42;
orbitGroup.position.y = 1.15;
scene.add(orbitGroup);

const farStars = makeStars({
  count: 500, radius: 55, yRange: 1, riseSpeed: 0,
  size: [0.15, 0.45],
  colors: [PALETTE.white, PALETTE.ice, PALETTE.violet],
  shell: true, opacity: 0.5,
});
scene.add(farStars);

/* ============================================================
 * 灯光
 * ============================================================ */
const hemi = new THREE.HemisphereLight(0x8a7bd8, 0x0a0812, 0.28);
scene.add(hemi);

const keyLight = new THREE.SpotLight(0xfff2dd, 14, 30, Math.PI / 5.5, 0.45, 1.6);
keyLight.position.set(3.6, 6.2, 2.8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.bias = -0.0004;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x6f7dd8, 0.4);
fillLight.position.set(-4.5, 2.6, 3.2);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0x9d7bff, 5, 18, 1.8);
rimLight.position.set(-1.8, 3.4, -3.6);
scene.add(rimLight);

/* 仪式用：神像胸口前方的「凝视」光 */
const gazeLight = new THREE.PointLight(0xd8b46a, 0, 12, 1.6);
gazeLight.position.set(0, 1.5, 1.6);
scene.add(gazeLight);

/* ============================================================
 * 相机取景 & 控制
 * ============================================================ */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;

/* game2.5：集曜积木台——方块落在展台四周的地面上（floor y=-0.18） */
const garden = createGarden({ scene, camera, controls, renderer, floorY: -0.18 });
window.__cubes = garden;
garden.onClick((key) => { if (window.__dexUi) window.__dexUi.openCube(key); });

const HOME = { pos: new THREE.Vector3(), target: new THREE.Vector3(0, 0.95, 0) };
const NEAR = { pos: new THREE.Vector3(0.55, 1.5, 3.3), target: new THREE.Vector3(0, 1.02, 0) };
/* 签卡阶段：target 保持在神像，配合 viewOffset 把神像构图偏右——展台可读签也可旋转 */
const ASIDE = { pos: new THREE.Vector3(-0.55, 1.5, 3.55), target: new THREE.Vector3(0, 1.0, 0) };
/* game2.5 积木视角：看地面上的方块阵（俯视压低、距离适中） */
const GARDEN_VIEW = { pos: new THREE.Vector3(0.4, 3.6, 5.6), target: new THREE.Vector3(0, 0.1, 1.1) };

/* 结果阶段构图：投影中心左移 → 神像显示在画面右侧（桌面端） */
function applyResultFraming() {
  if (window.innerWidth > 820) {
    camera.setViewOffset(
      window.innerWidth, window.innerHeight,
      -Math.round(window.innerWidth * 0.17), 0,
      window.innerWidth, window.innerHeight
    );
    camera.updateProjectionMatrix();
  }
}
function clearResultFraming() {
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
}

let resumeTimer = null;
let userDragging = false;   // 面板视差仅在用户主动拖拽场景时跟随
controls.addEventListener('start', () => {
  /* idle 与 reveal（读签）阶段都允许拖拽，拖时停自转 */
  if (ritualActive && ritualPhase !== 'reveal') return;
  userDragging = true;
  controls.autoRotate = false;
  clearTimeout(resumeTimer);
});
controls.addEventListener('end', () => {
  userDragging = false;
  if (ritualActive && ritualPhase !== 'reveal') return;
  resumeTimer = setTimeout(() => { controls.autoRotate = true; }, 2600);
});

/* ---------- 相机补间 ---------- */
const tweens = [];
function tweenCamera(toPos, toTarget, dur = 1600) {
  return new Promise((resolve) => {
    tweens.push({
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPos: toPos.clone(),
      toTarget: toTarget.clone(),
      start: performance.now(),
      dur,
      resolve,
    });
  });
}
function stepTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    let k = (now - tw.start) / tw.dur;
    if (k >= 1) k = 1;
    const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
    camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
    controls.target.lerpVectors(tw.fromTarget, tw.toTarget, e);
    if (k === 1) {
      tweens.splice(i, 1);
      tw.resolve();
    }
  }
}

/* ============================================================
 * 仪式钩子：awaken 推近+涌光+星尘爆发+震屏 / calm 复位
 * 2.0 新增：setMood 心情色联动 / energy 摇签蓄力联动
 * ============================================================ */
let ritualActive = false;
let ritualPhase = 'idle';       // idle | charge | reveal
let boost = 1;                  // 粒子加速系数（渐变）
let boostTarget = 1;
let shake = 0;                  // 震屏强度
let gaze = 0;                   // 凝视光强度
let gazeTarget = 0;
let energyRatio = 0;            // 摇签蓄力 0..1

/* 心情色：rim / gaze 光平滑过渡 */
const moodColor = { current: new THREE.Color(0x9d7bff), target: new THREE.Color(0x9d7bff) };
const gazeBase = new THREE.Color();

window.__controls = controls;   /* 测试/调试辅助：自动旋转与镜头控制 */
window.__ritual = {
  /* 叩问：推近神像，群星涌动；随后进入「亲手摇」蓄力阶段 */
  async awaken() {
    ritualActive = true;
    ritualPhase = 'charge';
    garden.setEnabled(false);
    document.body.classList.remove('garden-mode');
    clearResultFraming();
    controls.autoRotate = false;
    controls.enabled = false;
    boostTarget = 2.2;
    gazeTarget = 5;
    shake = 0.006 * SHAKE_SCALE;
    await tweenCamera(NEAR.pos, NEAR.target, 2000);
    shake = 0.003 * SHAKE_SCALE;
  },
  /* 摇签蓄力 0..1：粒子与震屏随之攀升（仅蓄力阶段生效） */
  energy(r) {
    energyRatio = r;
    if (ritualPhase !== 'charge') return;
    boostTarget = 2.2 + r * 1.6;
    gazeTarget = 5 + r * 2.5;
    shake = (0.003 + r * 0.011) * SHAKE_SCALE;
  },
  /* 出签瞬间：一次强光脉冲 */
  flash() {
    ritualPhase = 'reveal';
    gazeTarget = 14;
    shake = 0.004 * SHAKE_SCALE;
    setTimeout(() => { gazeTarget = 4; shake = 0.002 * SHAKE_SCALE; }, 420);
  },
  /* 揭签后：镜头让位、神像构图偏右；展台复活——读签时仍可拖拽/自转 */
  async aside() {
    ritualPhase = 'reveal';
    shake = 0.001 * SHAKE_SCALE;
    boostTarget = 1.5;
    await tweenCamera(ASIDE.pos, ASIDE.target, 1500);
    shake = 0;
    applyResultFraming();
    controls.enabled = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.7;
  },
  /* 回到祭坛全景 */
  async calm() {
    ritualPhase = 'idle';
    garden.setEnabled(true);
    shake = 0;
    boostTarget = 1;
    gazeTarget = 0;
    clearResultFraming();
    controls.autoRotateSpeed = 0.9;
    await tweenCamera(HOME.pos, HOME.target, 1600);
    controls.enabled = true;
    controls.autoRotate = true;
    ritualActive = false;
  },
  /* 心情色联动（界面选择心情即调用） */
  setMood(hex) {
    try { moodColor.target.set(hex); } catch (e) { /* ignore */ }
  },
  /* game2.5：一键看向积木阵（镜头压低俯视展台四周，面板退隐） */
  async toGarden() {
    if (ritualActive) return;
    clearResultFraming();
    controls.autoRotate = false;
    document.body.classList.add('garden-mode');
    await tweenCamera(GARDEN_VIEW.pos, GARDEN_VIEW.target, 1600);
    controls.enabled = true;
    resumeTimer = setTimeout(() => { controls.autoRotate = true; }, 3000);
  },
  get active() { return ritualActive; },
};

/* 页面可能在场景就绪前选好心情 */
if (window.__pendingMood) {
  window.__ritual.setMood(window.__pendingMood);
}

/* ============================================================
 * 程序化「剪影神像」：模型缺失时的兜底，流程永不阻断
 * ============================================================ */
function buildFallbackIdol() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a2338, roughness: 0.62, metalness: 0.2 });
  const glow = new THREE.MeshStandardMaterial({
    color: 0x1a1428, emissive: 0xd8b46a, emissiveIntensity: 0.9, roughness: 0.4,
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 24), mat);
  head.position.y = 1.52;
  head.scale.set(1, 1.05, 0.95);

  const eyeGeo = new THREE.SphereGeometry(0.06, 12, 8);
  const eyeL = new THREE.Mesh(eyeGeo, glow);
  eyeL.position.set(-0.2, 1.6, 0.47);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.2;

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.5, 8, 16), mat);
  body.position.y = 0.78;

  const wingGeo = new THREE.ConeGeometry(0.26, 0.72, 4);
  const wingL = new THREE.Mesh(wingGeo, mat);
  wingL.position.set(-0.42, 1.18, -0.16);
  wingL.rotation.set(0.2, 0.3, 0.95);
  const wingR = wingL.clone();
  wingR.position.x = 0.42;
  wingR.rotation.set(0.2, -0.3, -0.95);

  g.add(head, eyeL, eyeR, body, wingL, wingR);

  // 触手：六条弯管自颌下垂落
  for (let i = 0; i < 6; i++) {
    const a = (i / 5 - 0.5) * 1.5;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.sin(a) * 0.16, 1.18, 0.42),
      new THREE.Vector3(Math.sin(a) * 0.3, 0.88, 0.5),
      new THREE.Vector3(Math.sin(a) * 0.4, 0.56, 0.4 - Math.abs(a) * 0.08),
    ]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.05, 8), mat);
    g.add(tube);
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return g;
}

/* ============================================================
 * 加载手办模型（静态；失败则以剪影神像兜底）
 * ============================================================ */
function placeModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = 2.0 / size.y;
  model.scale.setScalar(scale);
  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
      if (o.material) {
        o.material.envMapIntensity = 0.7;
        o.material.needsUpdate = true;
      }
    }
  });

  const footprint = Math.max(size.x, size.z) * scale;
  const baseR = Math.max(footprint * 0.72, 0.85);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(baseR, baseR * 1.12, 0.18, 72),
    new THREE.MeshStandardMaterial({ color: 0x14101f, roughness: 0.32, metalness: 0.55 })
  );
  base.position.y = -0.09;
  base.castShadow = true;
  base.receiveShadow = true;
  const trim = new THREE.Mesh(
    new THREE.TorusGeometry(baseR * 1.01, 0.014, 12, 96),
    new THREE.MeshStandardMaterial({ color: 0xd8b46a, roughness: 0.25, metalness: 0.9, emissive: 0x2e2410 })
  );
  trim.rotation.x = Math.PI / 2;
  trim.position.y = -0.005;

  figurine.add(base, trim, model);

  /* game2.5.1：神像底座即展台——台面环带可放方块，神像本体与底座边缘禁放 */
  if (garden) garden.setPlatform(
    baseR - 0.19,                        /* 台面可放半径（方块半宽 0.19 留在台面内） */
    Math.max(footprint * 0.42, 0.4),     /* 神像本体占位 */
    baseR * 1.12 + 0.16                  /* 底座外沿 + 边距 */
  );

  /* 2.5.1 竖屏/窄屏拉远机位：手机竖屏也能看到神像全身与底座 */
  const aspect = window.innerWidth / window.innerHeight;
  const dist = 4.6 * (aspect < 1 ? Math.min(1.6, 0.72 / aspect) : 1);
  HOME.pos.set(Math.sin(0.6) * dist, 1.75, Math.cos(0.6) * dist);
  camera.position.copy(HOME.pos);
  controls.target.copy(HOME.target);
  controls.minDistance = 1.6;
  controls.maxDistance = (window.__device && window.__device.touch) ? 12 : 9;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.9;
  controls.update();

  requestAnimationFrame(() => {
    loaderEl.classList.add('done');
    setTimeout(() => {
      window.__ready = true;
      /* game2.5：恢复已集曜方（懒加载 + 线框坯先行） */
      garden.sync();
    }, 800);
  });
}

new GLTFLoader().load('./小克1.1.glb', (gltf) => {
  placeModel(gltf.scene);
}, (xhr) => {
  if (xhr.total && loadText) {
    const pct = Math.round((xhr.loaded / xhr.total) * 100);
    loadText.textContent = `召 唤 中 … ${pct}%`;
  }
}, (err) => {
  console.warn('模型加载失败，以剪影神像兜底：', err);
  if (loadText) loadText.textContent = '深 渊 以 剪 影 现 身';
  placeModel(buildFallbackIdol());
});

/* ============================================================
 * 主循环
 * ============================================================ */
const clock = new THREE.Clock();
let parxCur = 0;

function tick() {
  requestAnimationFrame(tick);
  const t = clock.getElapsedTime();
  const now = performance.now();

  stepTweens(now);
  garden.tick(t);

  // 面板视差：仅在用户主动拖拽场景时跟随，松手缓回 0——
  // 静止时文字组完全稳定，保证可点击性；拖拽瞬间建立空间关联
  if (!ritualActive && !REDUCED) {
    const target = userDragging ? Math.sin(controls.getAzimuthalAngle()) * 12 : 0;
    parxCur += (target - parxCur) * 0.1;
    if (!userDragging && Math.abs(parxCur) < 0.05) parxCur = 0;
    const px = parxCur.toFixed(2) + 'px';
    if (px !== tick._lastParx) {
      document.documentElement.style.setProperty('--parx', px);
      tick._lastParx = px;
    }
  }

  // 渐变逼近仪式状态
  boost += (boostTarget - boost) * 0.035;
  gaze += (gazeTarget - gaze) * 0.08;

  // 心情色过渡：轮廓光全量，凝视光与金色调和
  moodColor.current.lerp(moodColor.target, 0.045);
  rimLight.color.copy(moodColor.current);
  gazeBase.copy(PALETTE.gold).lerp(moodColor.current, 0.55);
  gazeLight.color.copy(gazeBase);

  risingStars.material.uniforms.uTime.value = t;
  orbitStars.material.uniforms.uTime.value = t;
  farStars.material.uniforms.uTime.value = t;
  risingStars.material.uniforms.uBoost.value = boost;
  orbitStars.material.uniforms.uBoost.value = boost;

  orbitGroup.rotation.y = t * 0.22 * (0.5 + boost * 0.5);
  runeCircle.rotation.z = t * 0.05 * (0.5 + boost * 0.5);
  runeCircle.material.opacity = (0.4 + 0.1 * Math.sin(t * 0.7)) * (0.7 + boost * 0.3);
  rimLight.intensity = 5 + 1.5 * Math.sin(t * 1.1) + gaze * 0.6;
  gazeLight.intensity = gaze * (1 + 0.08 * Math.sin(t * 7));

  // 震屏（蓄力期随能量微颤；reduced-motion 下近乎关闭）
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
  }

  controls.update();
  renderer.render(scene, camera);
}
tick();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (ritualPhase === 'reveal') applyResultFraming();   // viewOffset 需随窗口重设
  const s = worldToPixelScale();
  starMaterials.forEach((m) => { m.uniforms.uScale.value = s; });
});
