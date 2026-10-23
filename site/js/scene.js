// WebGL background: noise-displaced core + orbiting particle field.
// Each section (data-scene) blends the core towards a different palette / shape.
// three.js r160, self-hosted (verified against the npm registry sha512) so no third-party script runs
import * as THREE from './vendor/three.module.js';

const canvas = document.getElementById('gl');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  window.dispatchEvent(new Event('scene:ready'));
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x05060a, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 0, 9);

// 3D simplex noise (Ashima / Stefan Gustavson)
const NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

// ---------- Core blob ----------
const coreUniforms = {
  uTime: { value: 0 },
  uAmp: { value: 0.35 },
  uFreq: { value: 0.9 },
  uSpikes: { value: 0 },
  uColA: { value: new THREE.Color('#7cf7d4') },
  uColB: { value: new THREE.Color('#8b7cff') },
  uMouse: { value: new THREE.Vector2() },
};

const coreMat = new THREE.ShaderMaterial({
  uniforms: coreUniforms,
  vertexShader: /* glsl */`
    uniform float uTime, uAmp, uFreq, uSpikes;
    uniform vec2 uMouse;
    varying float vDisp;
    varying vec3 vNormal;
    varying vec3 vView;
    ${NOISE}
    void main(){
      vec3 p = position;
      float n = snoise(p * uFreq + vec3(uTime * 0.25, uTime * 0.18, uMouse.x * 0.5));
      float ridge = 1.0 - abs(snoise(p * 3.0 + uTime * 0.4));
      float d = n * uAmp + pow(ridge, 6.0) * uSpikes;
      vDisp = d;
      p += normal * d;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uColA, uColB;
    uniform float uTime;
    varying float vDisp;
    varying vec3 vNormal;
    varying vec3 vView;
    void main(){
      float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.5);
      vec3 col = mix(uColB, uColA, smoothstep(-0.3, 0.45, vDisp));
      col = col * (0.18 + fres * 1.4);
      float bands = smoothstep(0.92, 1.0, sin(vDisp * 40.0 + uTime) * 0.5 + 0.5) * 0.25;
      gl_FragColor = vec4(col + bands * uColA, 1.0);
    }`,
  wireframe: false,
});

const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 96), coreMat);
scene.add(core);

// Wire shell
const shell = new THREE.Mesh(
  new THREE.IcosahedronGeometry(2.3, 2),
  new THREE.MeshBasicMaterial({ color: 0x8b7cff, wireframe: true, transparent: true, opacity: 0.08 })
);
scene.add(shell);

// ---------- Particles ----------
const COUNT = window.innerWidth < 700 ? 2500 : 6000;
const pos = new Float32Array(COUNT * 3);
const seed = new Float32Array(COUNT);
for (let i = 0; i < COUNT; i++) {
  const r = 2.6 + Math.pow(Math.random(), 1.6) * 9;
  const th = Math.random() * Math.PI * 2;
  const ph = Math.acos(2 * Math.random() - 1);
  pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
  pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.55;
  pos[i * 3 + 2] = r * Math.cos(ph);
  seed[i] = Math.random();
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
pGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

const pUniforms = {
  uTime: { value: 0 },
  uSize: { value: 22 * renderer.getPixelRatio() },
  uCol: { value: new THREE.Color('#7cf7d4') },
  uFlow: { value: 0 },
};
const particles = new THREE.Points(pGeo, new THREE.ShaderMaterial({
  uniforms: pUniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    uniform float uTime, uSize, uFlow;
    attribute float aSeed;
    varying float vA;
    ${NOISE}
    void main(){
      vec3 p = position;
      float a = uTime * (0.03 + aSeed * 0.05);
      p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
      p += 0.35 * vec3(snoise(p * 0.3 + uTime * 0.1), snoise(p * 0.3 + 7.0 + uTime * 0.1), snoise(p * 0.3 + 13.0));
      // "market flow": particles drift along x like a tape
      p.x += mod(uTime * (0.4 + aSeed) + aSeed * 20.0, 20.0) * uFlow - 10.0 * uFlow;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = uSize * (0.3 + aSeed) / -mv.z;
      vA = 0.25 + 0.75 * fract(aSeed * 13.7 + uTime * 0.2);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uCol;
    varying float vA;
    void main(){
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(uCol, a * vA * 0.7);
    }`,
}));
scene.add(particles);

// ---------- Section states ----------
// x, y: core position; s: scale; amp/freq/spikes: shape; a/b: palette; flow: particle tape
const STATES = [
  { x: 1.4, y: 0.3, s: 1.0, amp: 0.35, freq: 0.9, spikes: 0.0, a: '#7cf7d4', b: '#8b7cff', flow: 0 },
  { x: -2.2, y: 0.0, s: 0.8, amp: 0.55, freq: 1.4, spikes: 0.0, a: '#8b7cff', b: '#ff5fa2', flow: 0 },
  { x: 2.4, y: -0.2, s: 0.75, amp: 0.25, freq: 2.2, spikes: 0.35, a: '#3ef0a8', b: '#ff4d6d', flow: 1 },
  { x: -2.0, y: 0.2, s: 0.9, amp: 0.45, freq: 0.6, spikes: 0.0, a: '#ffb86b', b: '#8b7cff', flow: 0 },
  { x: 0.0, y: 0.0, s: 0.6, amp: 0.8, freq: 1.0, spikes: 0.15, a: '#7cf7d4', b: '#2f6bff', flow: 0.4 },
  { x: 0.0, y: -0.2, s: 1.5, amp: 0.3, freq: 0.7, spikes: 0.0, a: '#ffffff', b: '#7cf7d4', flow: 0 },
].map(s => ({ ...s, a: new THREE.Color(s.a), b: new THREE.Color(s.b) }));

const sections = [...document.querySelectorAll('[data-scene]')];
const cur = { ...STATES[0], a: STATES[0].a.clone(), b: STATES[0].b.clone() };
const target = { ...cur };

function sectionBlend() {
  // Fractional section index based on which section the viewport center is in.
  const mid = window.innerHeight * 0.5;
  for (let i = 0; i < sections.length; i++) {
    const r = sections[i].getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid) {
      const t = (mid - r.top) / r.height;
      const next = Math.min(i + 1, sections.length - 1);
      const k = Math.max(0, (t - 0.65) / 0.35); // start blending in the last third
      return { i, next, k };
    }
  }
  return { i: 0, next: 0, k: 0 };
}

const mouse = new THREE.Vector2(), mouseS = new THREE.Vector2();
window.addEventListener('pointermove', e => {
  mouse.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight * 2 - 1));
});

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // Keep the core centred-ish on narrow screens
  camera.position.z = w < 700 ? 13 : 9;
}
window.addEventListener('resize', resize);
resize();

const lerp = (a, b, t) => a + (b - a) * t;
const clock = new THREE.Clock();
let scrollVel = 0, lastY = window.scrollY;

// Inactivity suspension (driven by main.js): stop rendering entirely while asleep
let asleep = false;
addEventListener('site:sleep', () => { asleep = true; });
addEventListener('site:wake', () => {
  if (!asleep) return;
  asleep = false;
  clock.getDelta();
  requestAnimationFrame(tick);
});

function tick() {
  if (asleep) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime * (reduceMotion ? 0.2 : 1);

  const { i, next, k } = sectionBlend();
  const A = STATES[Math.min(i, STATES.length - 1)], B = STATES[Math.min(next, STATES.length - 1)];
  for (const key of ['x', 'y', 's', 'amp', 'freq', 'spikes', 'flow']) target[key] = lerp(A[key], B[key], k);
  const ease = 1 - Math.pow(0.04, dt);
  for (const key of ['x', 'y', 's', 'amp', 'freq', 'spikes', 'flow']) cur[key] = lerp(cur[key], target[key], ease);
  cur.a.lerp(A.a.clone().lerp(B.a, k), ease);
  cur.b.lerp(A.b.clone().lerp(B.b, k), ease);

  const narrow = window.innerWidth < 700;
  scrollVel = lerp(scrollVel, window.scrollY - lastY, 0.1);
  lastY = window.scrollY;
  mouseS.lerp(mouse, 0.05);

  core.position.set(narrow ? 0 : cur.x, (narrow ? 1.2 : cur.y) + mouseS.y * 0.15, 0);
  core.scale.setScalar(cur.s);
  core.rotation.y += dt * 0.12 + scrollVel * 0.0006;
  core.rotation.x = mouseS.y * 0.3;
  shell.position.copy(core.position);
  shell.scale.setScalar(cur.s * (1 + Math.sin(t * 0.6) * 0.03));
  shell.rotation.y -= dt * 0.05;
  shell.rotation.z += dt * 0.03;

  coreUniforms.uTime.value = t;
  coreUniforms.uAmp.value = cur.amp + Math.min(Math.abs(scrollVel) * 0.004, 0.25);
  coreUniforms.uFreq.value = cur.freq;
  coreUniforms.uSpikes.value = cur.spikes;
  coreUniforms.uColA.value.copy(cur.a);
  coreUniforms.uColB.value.copy(cur.b);
  coreUniforms.uMouse.value.copy(mouseS);
  shell.material.color.copy(cur.b);

  pUniforms.uTime.value = t;
  pUniforms.uCol.value.copy(cur.a);
  pUniforms.uFlow.value = cur.flow;
  particles.rotation.y = mouseS.x * 0.15;
  particles.rotation.x = -mouseS.y * 0.08 + window.scrollY * 0.00008;

  camera.position.x = mouseS.x * 0.4;
  camera.position.y = mouseS.y * 0.3;
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

renderer.compile(scene, camera);
requestAnimationFrame(tick);
window.dispatchEvent(new Event('scene:ready'));
