import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRM, VRMUtils } from "@pixiv/three-vrm";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import {
  ReactiveVRMController,
  resolveModelPath,
  shouldReloadModel,
  PersonaId,
} from "./avatar/ReactiveVRMController.js";
import { DiagnosticHUD } from "./ui/DiagnosticHUD.js";

// --- Tauri Window Dragging & Bottom-Left Positioning ---
try {
  const appWindow = getCurrentWindow();
  
  // Left-click dragging (only if not holding Shift/Alt for model rotate)
  window.addEventListener("mousedown", (e) => {
    if (e.button === 0 && !e.shiftKey && !e.altKey) {
      appWindow.startDragging();
    }
  });

  // Automatically ensure window is docked at bottom-left corner
  async function dockBottomLeft() {
    try {
      const monitor = await currentMonitor();
      if (monitor) {
        const scaleFactor = monitor.scaleFactor;
        const screenLogical = monitor.size.toLogical(scaleFactor);
        const winPhysical = await appWindow.outerSize();
        const winLogical = winPhysical.toLogical(scaleFactor);

        const x = 24;
        const taskbarHeight = 50;
        const y = Math.max(0, screenLogical.height - winLogical.height - taskbarHeight);
        await appWindow.setPosition(new LogicalPosition(x, y));
      }
    } catch (e) {
      console.debug("Could not position window:", e);
    }
  }
  dockBottomLeft();
} catch (err) {
  console.debug("Tauri window API not available (browser preview mode):", err);
}

// --- 360° Debug Model Rotation Controls ---
let isRotatingModel = false;
let prevMouseX = 0;
let userModelRotationY = 0;
let baseModelRotationY = 0;

// Prevent right-click context menu so rotation is smooth
window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

window.addEventListener("mousedown", (e) => {
  // Rotate with Right-Click OR Shift + Left-Click
  if (e.button === 2 || (e.button === 0 && (e.shiftKey || e.altKey))) {
    isRotatingModel = true;
    prevMouseX = e.clientX;
  }
});

window.addEventListener("mousemove", (e) => {
  if (isRotatingModel && currentVRM) {
    const deltaX = e.clientX - prevMouseX;
    prevMouseX = e.clientX;
    // Rotate model around Y axis smoothly
    userModelRotationY += deltaX * 0.018;
  }
});

window.addEventListener("mouseup", (e) => {
  if (e.button === 2 || e.button === 0) {
    isRotatingModel = false;
  }
});

// Reset rotation to front on Double-Click or Middle-Click
window.addEventListener("dblclick", () => {
  userModelRotationY = 0;
});

window.addEventListener("auxclick", (e) => {
  if (e.button === 1) { // Middle mouse click
    userModelRotationY = 0;
  }
});

// --- Scene Setup ---
const canvas = document.getElementById("canvas") as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0); // 100% transparent background

const scene = new THREE.Scene();

// Camera setup with dynamic look target
const cameraLookTarget = new THREE.Vector3(0, 0.8, 0);

const camera = new THREE.PerspectiveCamera(
  26,
  window.innerWidth / window.innerHeight,
  0.1,
  30
);
camera.position.set(0, 0.8, 3.2);
camera.lookAt(cameraLookTarget);

// Mouse wheel to zoom in / out smoothly
window.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const zoomDelta = e.deltaY * 0.002;
    camera.position.z = THREE.MathUtils.clamp(camera.position.z + zoomDelta, 0.8, 6.0);
  },
  { passive: false }
);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xfff5ee, 1.6);
keyLight.position.set(1.5, 2.5, 1.5);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xccddff, 0.8);
fillLight.position.set(-1.5, 1.5, -0.5);
scene.add(fillLight);

// --- Look Target for Subtle Eye Tracking ---
const lookAtTarget = new THREE.Object3D();
scene.add(lookAtTarget);
lookAtTarget.position.set(0, 1.2, 2.0);

let mouseInside = false;
let mousePos = { x: 0, y: 1.2 };

window.addEventListener("mousemove", (e) => {
  mouseInside = true;
  const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
  const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
  mousePos.x = ndcX * 0.45;
  mousePos.y = cameraLookTarget.y + ndcY * 0.35;
});

window.addEventListener("mouseleave", () => {
  mouseInside = false;
});

// --- VRM Loading & Natural Posing ---
let currentVRM: VRM | null = null;
let initialHipsY = 0;
let activePersona: PersonaId = "rei";

const vrmController = new ReactiveVRMController(null, {
  initialPersona: activePersona,
  initialState: "idle",
});

let hud: DiagnosticHUD | null = null;

const loader = new GLTFLoader();
loader.register((parser: any) => new VRMLoaderPlugin(parser));

const MODEL_PATH = resolveModelPath(activePersona);

// ============================================================================
// SISTEM POSE DASAR KUUDERE (6 POSE DENGAN BOBOT & PENGURANGAN GERAK TUBUH)
// ============================================================================
export type ArmBoneName =
  | "leftShoulder"
  | "rightShoulder"
  | "leftUpperArm"
  | "rightUpperArm"
  | "leftLowerArm"
  | "rightLowerArm"
  | "leftHand"
  | "rightHand";

export const ARM_BONE_NAMES: ArmBoneName[] = [
  "leftShoulder",
  "rightShoulder",
  "leftUpperArm",
  "rightUpperArm",
  "leftLowerArm",
  "rightLowerArm",
  "leftHand",
  "rightHand",
];

export interface BoneRotEuler {
  x: number;
  y: number;
  z: number;
}

export interface PoseDef {
  name: string;
  weight: number;
  armMotionScale: number; // 0.30 - 1.0 (skala reduksi counter-rotation & micro-noise saat lengan menempel badan)
  leftShoulder: BoneRotEuler;
  rightShoulder: BoneRotEuler;
  leftUpperArm: BoneRotEuler;
  rightUpperArm: BoneRotEuler;
  leftLowerArm: BoneRotEuler;
  rightLowerArm: BoneRotEuler;
  leftHand: BoneRotEuler;
  rightHand: BoneRotEuler;
  spine?: Partial<BoneRotEuler>;
  chest?: Partial<BoneRotEuler>;
  hips?: { x?: number; y?: number; z?: number };
  fingerCurlScale?: {
    left?: number;
    right?: number;
    leftThumb?: number;
    rightThumb?: number;
  };
}

export const POSES: Record<string, PoseDef> = {
  // 1. Attention: Pose santai di samping paha (default Kuudere, bobot tinggi)
  attention: {
    name: "attention",
    weight: 42,
    armMotionScale: 1.0,
    leftShoulder: { x: 0.0, y: 0.0, z: -0.018 },
    rightShoulder: { x: 0.0, y: 0.0, z: 0.024 },
    leftUpperArm: { x: 0.01, y: -0.06, z: -1.33 },
    rightUpperArm: { x: -0.02, y: 0.10, z: 1.28 },
    // [VISUAL CHECK: leftLowerArm.x memutar telapak ke paha, y menekuk siku]
    leftLowerArm: { x: -0.45, y: -0.30, z: -0.03 },
    rightLowerArm: { x: 0.40, y: 0.35, z: 0.06 },
    leftHand: { x: 0.01, y: -0.05, z: -0.02 },
    rightHand: { x: 0.03, y: 0.07, z: 0.03 },
    fingerCurlScale: { left: 1.0, right: 1.0, leftThumb: 1.0, rightThumb: 1.0 },
  },

  // 2. At Ease: Kedua tangan di belakang punggung, dada tegak membusung tipis
  atEase: {
    name: "atEase",
    weight: 16,
    armMotionScale: 0.40,
    chest: { x: -0.035, y: 0.0, z: 0.0 }, // dada sedikit terangkat
    leftShoulder: { x: 0.03, y: -0.04, z: -0.02 },
    rightShoulder: { x: 0.03, y: 0.04, z: 0.02 },
    // [VISUAL CHECK: lengan atas ditarik ke belakang punggung; dibalik — model ini x positif menarik siku ke belakang]
    leftUpperArm: { x: 0.26, y: -0.08, z: -1.28 },
    rightUpperArm: { x: 0.26, y: 0.08, z: 1.24 },
    // [VISUAL CHECK: lengan bawah ditekuk menyilang di pinggang belakang]
    leftLowerArm: { x: -0.30, y: -0.78, z: 0.08 },
    rightLowerArm: { x: 0.30, y: 0.82, z: -0.08 },
    leftHand: { x: 0.02, y: -0.18, z: 0.0 },
    rightHand: { x: -0.02, y: 0.20, z: 0.0 },
    fingerCurlScale: { left: 0.85, right: 0.90, leftThumb: 0.8, rightThumb: 0.8 },
  },

  // 3. Hands Front: Kedua tangan bertaut ringan di depan perut bawah
  handsFront: {
    name: "handsFront",
    weight: 18,
    armMotionScale: 0.45,
    spine: { x: 0.015, y: 0.0, z: 0.0 },
    leftShoulder: { x: 0.02, y: 0.03, z: -0.01 },
    rightShoulder: { x: 0.02, y: -0.03, z: 0.01 },
    // [VISUAL CHECK: x positif memajukan lengan atas ke depan badan]
    leftUpperArm: { x: 0.20, y: -0.08, z: -1.24 },
    rightUpperArm: { x: 0.18, y: 0.10, z: 1.20 },
    // [VISUAL CHECK: lengan bawah mengarah ke pusar/pergelangan tangan satunya]
    leftLowerArm: { x: -0.35, y: -0.88, z: 0.14 },
    rightLowerArm: { x: 0.38, y: 0.92, z: -0.14 },
    leftHand: { x: 0.04, y: -0.28, z: -0.08 },
    rightHand: { x: -0.04, y: 0.26, z: 0.08 },
    fingerCurlScale: { left: 1.15, right: 1.10, leftThumb: 1.1, rightThumb: 1.1 },
  },

  // 4. Hold Elbow: Tangan kiri memegang siku kanan di depan badan
  holdElbow: {
    name: "holdElbow",
    weight: 11,
    armMotionScale: 0.35,
    chest: { x: 0.01, y: 0.015, z: 0.0 },
    leftShoulder: { x: 0.03, y: 0.02, z: -0.01 },
    rightShoulder: { x: -0.01, y: -0.02, z: 0.02 },
    // Lengan kanan menekuk mendatar di depan badan
    rightUpperArm: { x: 0.24, y: 0.14, z: 1.16 },
    rightLowerArm: { x: 0.42, y: 1.25, z: 0.0 },
    rightHand: { x: 0.0, y: 0.14, z: 0.0 },
    // Lengan kiri menyilang memegang siku kanan
    leftUpperArm: { x: 0.18, y: -0.10, z: -1.20 },
    leftLowerArm: { x: -0.38, y: -0.92, z: 0.10 },
    leftHand: { x: 0.08, y: -0.22, z: 0.0 },
    fingerCurlScale: { left: 1.2, right: 0.9, leftThumb: 1.0, rightThumb: 0.9 },
  },

  // 5. Arms Crossed: Bersedekap dada (kedua lengan terangkat ke depan, menyilang pas di dada)
  armsCrossed: {
    name: "armsCrossed",
    weight: 7,
    armMotionScale: 0.30,
    chest: { x: 0.025, y: 0.0, z: 0.0 },
    leftShoulder: { x: 0.05, y: -0.04, z: -0.02 },
    rightShoulder: { x: 0.05, y: 0.04, z: 0.02 },
    // Lengan kiri (menyilang di atas): siku terangkat (z: -0.72), maju ke depan dada (y: -0.92)
    leftUpperArm: { x: -0.18, y: -0.92, z: -0.72 },
    // Lengan kanan (menyilang di bawah): siku terangkat (z: 0.78), maju ke depan dada (y: 0.86)
    rightUpperArm: { x: -0.15, y: 0.86, z: 0.78 },
    // Siku ditekuk menyilang pas di depan dada (kiri menekuk -2.30 rad, kanan menekuk +2.22 rad)
    leftLowerArm: { x: 0.32, y: -2.30, z: 0.0 },
    rightLowerArm: { x: 0.28, y: 2.22, z: 0.0 },
    // Telapak tangan relaks menempel di lengan seberang
    leftHand: { x: -0.06, y: -0.22, z: 0.0 },
    rightHand: { x: -0.06, y: 0.22, z: 0.0 },
    fingerCurlScale: { left: 0.95, right: 0.95, leftThumb: 0.9, rightThumb: 0.9 },
  },

  // 6. Pocket: Kedua tangan di saku mantel (siku sedikit melebar ke belakang)
  pocket: {
    name: "pocket",
    weight: 6,
    armMotionScale: 0.38,
    leftShoulder: { x: -0.01, y: -0.02, z: -0.02 },
    rightShoulder: { x: -0.01, y: 0.02, z: 0.02 },
    // [VISUAL CHECK: siku mundur sedikit dan menjauhi pinggang agar tidak tembus mantel]
    leftUpperArm: { x: -0.07, y: -0.04, z: -1.22 },
    rightUpperArm: { x: -0.06, y: 0.06, z: 1.18 },
    // [VISUAL CHECK: lengan bawah mengarah ke mulut saku]
    leftLowerArm: { x: -0.38, y: -0.52, z: -0.08 },
    rightLowerArm: { x: 0.34, y: 0.56, z: 0.08 },
    leftHand: { x: -0.12, y: -0.06, z: -0.04 },
    rightHand: { x: -0.12, y: 0.06, z: 0.04 },
    fingerCurlScale: { left: 0.75, right: 0.75, leftThumb: 0.8, rightThumb: 0.8 },
  },
};

// Unified Finger Descriptors & Initial Resting Angles (single source of truth)
// Proximal / Intermediate / Distal: index 10/12/8°, middle 16/18/12°, ring 22/24/16°, little 28/30/20°, thumb 6/8/10°
// Left fingers negative Z, Right fingers positive Z
const FINGER_DESCRIPTORS = [
  // Left Hand
  { bone: "leftThumbMetacarpal", speed: 0.52, phase: 0.3, ampDeg: 2.0, baseAngle: THREE.MathUtils.degToRad(-6) },
  { bone: "leftThumbProximal", speed: 0.55, phase: 0.7, ampDeg: 2.2, baseAngle: THREE.MathUtils.degToRad(-8) },
  { bone: "leftThumbDistal", speed: 0.58, phase: 1.1, ampDeg: 2.5, baseAngle: THREE.MathUtils.degToRad(-10) },
  { bone: "leftIndexProximal", speed: 0.72, phase: 1.4, ampDeg: 2.6, baseAngle: THREE.MathUtils.degToRad(-10) },
  { bone: "leftIndexIntermediate", speed: 0.72, phase: 1.8, ampDeg: 2.8, baseAngle: THREE.MathUtils.degToRad(-12) },
  { bone: "leftIndexDistal", speed: 0.74, phase: 2.1, ampDeg: 2.2, baseAngle: THREE.MathUtils.degToRad(-8) },
  { bone: "leftMiddleProximal", speed: 0.58, phase: 2.5, ampDeg: 3.2, baseAngle: THREE.MathUtils.degToRad(-16) },
  { bone: "leftMiddleIntermediate", speed: 0.58, phase: 2.9, ampDeg: 3.5, baseAngle: THREE.MathUtils.degToRad(-18) },
  { bone: "leftMiddleDistal", speed: 0.60, phase: 3.2, ampDeg: 2.7, baseAngle: THREE.MathUtils.degToRad(-12) },
  { bone: "leftRingProximal", speed: 0.82, phase: 3.6, ampDeg: 3.8, baseAngle: THREE.MathUtils.degToRad(-22) },
  { bone: "leftRingIntermediate", speed: 0.82, phase: 4.0, ampDeg: 4.1, baseAngle: THREE.MathUtils.degToRad(-24) },
  { bone: "leftRingDistal", speed: 0.84, phase: 4.3, ampDeg: 3.0, baseAngle: THREE.MathUtils.degToRad(-16) },
  { bone: "leftLittleProximal", speed: 0.66, phase: 4.7, ampDeg: 4.2, baseAngle: THREE.MathUtils.degToRad(-28) },
  { bone: "leftLittleIntermediate", speed: 0.66, phase: 5.1, ampDeg: 4.5, baseAngle: THREE.MathUtils.degToRad(-30) },
  { bone: "leftLittleDistal", speed: 0.68, phase: 5.4, ampDeg: 3.4, baseAngle: THREE.MathUtils.degToRad(-20) },

  // Right Hand (asymmetrical phase offsets, positive angles)
  { bone: "rightThumbMetacarpal", speed: 0.50, phase: 0.6, ampDeg: 2.0, baseAngle: THREE.MathUtils.degToRad(6) },
  { bone: "rightThumbProximal", speed: 0.53, phase: 1.0, ampDeg: 2.2, baseAngle: THREE.MathUtils.degToRad(8) },
  { bone: "rightThumbDistal", speed: 0.56, phase: 1.4, ampDeg: 2.5, baseAngle: THREE.MathUtils.degToRad(10) },
  { bone: "rightIndexProximal", speed: 0.68, phase: 1.7, ampDeg: 2.5, baseAngle: THREE.MathUtils.degToRad(10) },
  { bone: "rightIndexIntermediate", speed: 0.68, phase: 2.1, ampDeg: 2.7, baseAngle: THREE.MathUtils.degToRad(12) },
  { bone: "rightIndexDistal", speed: 0.70, phase: 2.4, ampDeg: 2.1, baseAngle: THREE.MathUtils.degToRad(8) },
  { bone: "rightMiddleProximal", speed: 0.54, phase: 2.8, ampDeg: 3.0, baseAngle: THREE.MathUtils.degToRad(16) },
  { bone: "rightMiddleIntermediate", speed: 0.54, phase: 3.2, ampDeg: 3.3, baseAngle: THREE.MathUtils.degToRad(18) },
  { bone: "rightMiddleDistal", speed: 0.56, phase: 3.5, ampDeg: 2.5, baseAngle: THREE.MathUtils.degToRad(12) },
  { bone: "rightRingProximal", speed: 0.78, phase: 3.9, ampDeg: 3.6, baseAngle: THREE.MathUtils.degToRad(22) },
  { bone: "rightRingIntermediate", speed: 0.78, phase: 4.3, ampDeg: 3.9, baseAngle: THREE.MathUtils.degToRad(24) },
  { bone: "rightRingDistal", speed: 0.80, phase: 4.6, ampDeg: 2.8, baseAngle: THREE.MathUtils.degToRad(16) },
  { bone: "rightLittleProximal", speed: 0.62, phase: 5.0, ampDeg: 4.0, baseAngle: THREE.MathUtils.degToRad(28) },
  { bone: "rightLittleIntermediate", speed: 0.62, phase: 5.4, ampDeg: 4.3, baseAngle: THREE.MathUtils.degToRad(30) },
  { bone: "rightLittleDistal", speed: 0.64, phase: 5.7, ampDeg: 3.2, baseAngle: THREE.MathUtils.degToRad(20) },
];

// Precomputed quaternions for each pose
const POSE_QUATS: Record<string, Record<ArmBoneName, THREE.Quaternion>> = {};
for (const [key, pose] of Object.entries(POSES)) {
  POSE_QUATS[key] = {
    leftShoulder: new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.leftShoulder.x, pose.leftShoulder.y, pose.leftShoulder.z)),
    rightShoulder: new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.rightShoulder.x, pose.rightShoulder.y, pose.rightShoulder.z)),
    leftUpperArm: new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.leftUpperArm.x, pose.leftUpperArm.y, pose.leftUpperArm.z)),
    rightUpperArm: new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.rightUpperArm.x, pose.rightUpperArm.y, pose.rightUpperArm.z)),
    leftLowerArm: new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.leftLowerArm.x, pose.leftLowerArm.y, pose.leftLowerArm.z)),
    rightLowerArm: new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.rightLowerArm.x, pose.rightLowerArm.y, pose.rightLowerArm.z)),
    leftHand: new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.leftHand.x, pose.leftHand.y, pose.leftHand.z)),
    rightHand: new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.rightHand.x, pose.rightHand.y, pose.rightHand.z)),
  };
}

// Active dynamic base quaternions (interpolated smoothly between poses via slerp)
const currentBase: Record<ArmBoneName, THREE.Quaternion> = {
  leftShoulder: POSE_QUATS.attention.leftShoulder.clone(),
  rightShoulder: POSE_QUATS.attention.rightShoulder.clone(),
  leftUpperArm: POSE_QUATS.attention.leftUpperArm.clone(),
  rightUpperArm: POSE_QUATS.attention.rightUpperArm.clone(),
  leftLowerArm: POSE_QUATS.attention.leftLowerArm.clone(),
  rightLowerArm: POSE_QUATS.attention.rightLowerArm.clone(),
  leftHand: POSE_QUATS.attention.leftHand.clone(),
  rightHand: POSE_QUATS.attention.rightHand.clone(),
};

const startBase: Record<ArmBoneName, THREE.Quaternion> = {
  leftShoulder: currentBase.leftShoulder.clone(),
  rightShoulder: currentBase.rightShoulder.clone(),
  leftUpperArm: currentBase.leftUpperArm.clone(),
  rightUpperArm: currentBase.rightUpperArm.clone(),
  leftLowerArm: currentBase.leftLowerArm.clone(),
  rightLowerArm: currentBase.rightLowerArm.clone(),
  leftHand: currentBase.leftHand.clone(),
  rightHand: currentBase.rightHand.clone(),
};

// Finger resting angle interpolation buffers
const currentFingerBaseAngles = new Float32Array(FINGER_DESCRIPTORS.length);
const startFingerBaseAngles = new Float32Array(FINGER_DESCRIPTORS.length);
const targetFingerBaseAngles = new Float32Array(FINGER_DESCRIPTORS.length);
for (let i = 0; i < FINGER_DESCRIPTORS.length; i++) {
  currentFingerBaseAngles[i] = FINGER_DESCRIPTORS[i].baseAngle;
  startFingerBaseAngles[i] = FINGER_DESCRIPTORS[i].baseAngle;
  targetFingerBaseAngles[i] = FINGER_DESCRIPTORS[i].baseAngle;
}

// Torso offset buffers
const currentTorsoOffset = { spine: new THREE.Vector3(), chest: new THREE.Vector3() };
const startTorsoOffset = { spine: new THREE.Vector3(), chest: new THREE.Vector3() };
const targetTorsoOffset = { spine: new THREE.Vector3(), chest: new THREE.Vector3() };

let currentArmMotionScale = 1.0;
let startArmMotionScale = 1.0;
let targetArmMotionScale = 1.0;

let activePoseName = "attention";
let targetPoseName = "attention";
let isPoseTransitioning = false;
let poseTransitionProgress = 1.0;
let poseTransitionDuration = 1.8;
let poseTimer = 0;
let nextPoseChangeAt = 45.0 + Math.random() * 45.0; // 40 - 90 detik

function selectNextPose(): string {
  const poseKeys = Object.keys(POSES).filter((k) => k !== activePoseName);
  const totalWeight = poseKeys.reduce((sum, k) => sum + POSES[k].weight, 0);
  let rnd = Math.random() * totalWeight;
  for (const k of poseKeys) {
    if (rnd < POSES[k].weight) return k;
    rnd -= POSES[k].weight;
  }
  return poseKeys[0];
}

function transitionToPose(name: string, customDuration?: number) {
  if (!POSES[name]) return;
  if (name === activePoseName && !isPoseTransitioning) return;

  targetPoseName = name;
  isPoseTransitioning = true;
  poseTransitionProgress = 0;
  poseTransitionDuration =
    customDuration ??
    (IDLE_ARM_CONFIG.poseTransition.minDuration +
      Math.random() * (IDLE_ARM_CONFIG.poseTransition.maxDuration - IDLE_ARM_CONFIG.poseTransition.minDuration));

  for (const b of ARM_BONE_NAMES) {
    startBase[b].copy(currentBase[b]);
  }

  const targetPose = POSES[name];
  for (let i = 0; i < FINGER_DESCRIPTORS.length; i++) {
    startFingerBaseAngles[i] = currentFingerBaseAngles[i];
    const f = FINGER_DESCRIPTORS[i];
    let scale = 1.0;
    if (f.bone.includes("leftThumb")) scale = targetPose.fingerCurlScale?.leftThumb ?? 1.0;
    else if (f.bone.includes("rightThumb")) scale = targetPose.fingerCurlScale?.rightThumb ?? 1.0;
    else if (f.bone.startsWith("left")) scale = targetPose.fingerCurlScale?.left ?? 1.0;
    else scale = targetPose.fingerCurlScale?.right ?? 1.0;
    targetFingerBaseAngles[i] = f.baseAngle * scale;
  }

  startTorsoOffset.spine.copy(currentTorsoOffset.spine);
  startTorsoOffset.chest.copy(currentTorsoOffset.chest);
  targetTorsoOffset.spine.set(targetPose.spine?.x ?? 0, targetPose.spine?.y ?? 0, targetPose.spine?.z ?? 0);
  targetTorsoOffset.chest.set(targetPose.chest?.x ?? 0, targetPose.chest?.y ?? 0, targetPose.chest?.z ?? 0);

  startArmMotionScale = currentArmMotionScale;
  targetArmMotionScale = targetPose.armMotionScale;
}

// Console debug helper untuk inspeksi langsung setiap pose
(window as any).setPose = (name: string, instant = false) => {
  if (!POSES[name]) {
    console.warn(`[Rei Pose] Pose '${name}' tidak ditemukan. Pilihan:`, Object.keys(POSES));
    return;
  }
  console.log(`[Rei Pose] Berganti ke pose '${name}' (instant=${instant})`);
  transitionToPose(name, instant ? 0.05 : 1.8);
};

function frameCameraToModel(vrm: VRM) {
  vrm.scene.updateMatrixWorld(true);

  const bbox = new THREE.Box3().setFromObject(vrm.scene);
  const hipsNode = vrm.humanoid?.getNormalizedBoneNode("hips");

  const hipsPos = new THREE.Vector3();
  if (hipsNode) {
    hipsNode.getWorldPosition(hipsPos);
  } else {
    hipsPos.set(0, bbox.min.y + (bbox.max.y - bbox.min.y) * 0.5, 0);
  }

  // Framing half-body: from waist/upper-thighs (just below hips) to top of head
  const topY = bbox.max.y;
  const bottomY = Math.max(bbox.min.y, hipsPos.y - 0.1);
  const halfBodyHeight = Math.max(0.65, topY - bottomY);
  const halfBodyCenterY = bottomY + halfBodyHeight * 0.52;

  // Upper body width (shoulders + relaxed arms)
  const upperBodyWidth = 0.55;

  const margin = 1.18; // 18% margin for comfortable head and arm breathing room
  const halfFovRad = THREE.MathUtils.degToRad(camera.fov / 2);

  const distForHeight = ((halfBodyHeight * margin) / 2) / Math.tan(halfFovRad);
  const distForWidth = ((upperBodyWidth * margin) / 2) / (Math.tan(halfFovRad) * camera.aspect);

  const optimalDistance = Math.max(distForHeight, distForWidth);

  cameraLookTarget.set(0, halfBodyCenterY, 0);
  camera.position.set(0, halfBodyCenterY, optimalDistance);
  camera.lookAt(cameraLookTarget);

  console.log("Framed Half-Body VRM:", {
    topY,
    bottomY,
    halfBodyHeight,
    halfBodyCenterY,
    optimalDistance,
  });
}

function loadVRMModel(modelPath: string, persona: PersonaId, onLoaded?: () => void) {
  if (currentVRM) {
    scene.remove(currentVRM.scene);
    currentVRM = null;
  }

  loader.load(
    modelPath,
    (gltf: any) => {
      const vrm = gltf.userData.vrm as VRM;
      if (!vrm) {
        console.error("Failed to load VRM data from glTF:", modelPath);
        return;
      }

      VRMUtils.removeUnnecessaryJoints(vrm.scene);
      VRMUtils.removeUnnecessaryVertices(vrm.scene);
      VRMUtils.rotateVRM0(vrm);

      const hips = vrm.humanoid?.getNormalizedBoneNode("hips");
      if (hips) {
        initialHipsY = hips.position.y;
      }

      scene.add(vrm.scene);
      currentVRM = vrm;
      vrmController.setVRM(vrm);
      baseModelRotationY = vrm.scene.rotation.y;

      // Connect eye lookAt to dynamic target
      if (vrm.lookAt) {
        vrm.lookAt.target = lookAtTarget;
        vrm.lookAt.autoUpdate = true;
      }

      // Apply asymmetrical resting arm pose and natural non-uniform finger curls
      if (vrm.humanoid) {
        const initialPose = POSES.attention;
        const leftUpperArm = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
        if (leftUpperArm) leftUpperArm.rotation.set(initialPose.leftUpperArm.x, initialPose.leftUpperArm.y, initialPose.leftUpperArm.z);
        const rightUpperArm = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
        if (rightUpperArm) rightUpperArm.rotation.set(initialPose.rightUpperArm.x, initialPose.rightUpperArm.y, initialPose.rightUpperArm.z);

        const leftLowerArm = vrm.humanoid.getNormalizedBoneNode("leftLowerArm");
        if (leftLowerArm) leftLowerArm.rotation.set(initialPose.leftLowerArm.x, initialPose.leftLowerArm.y, initialPose.leftLowerArm.z);
        const rightLowerArm = vrm.humanoid.getNormalizedBoneNode("rightLowerArm");
        if (rightLowerArm) rightLowerArm.rotation.set(initialPose.rightLowerArm.x, initialPose.rightLowerArm.y, initialPose.rightLowerArm.z);

        // Relax fingers with organic asymmetrical curls from unified descriptors
        for (let i = 0; i < FINGER_DESCRIPTORS.length; i++) {
          const node = vrm.humanoid.getNormalizedBoneNode(FINGER_DESCRIPTORS[i].bone as any);
          if (node) node.rotation.z = currentFingerBaseAngles[i];
        }

        vrm.scene.updateMatrixWorld(true);
      }

      // Auto-frame camera so half body is framed
      frameCameraToModel(vrm);

      hud?.updatePersona(persona, modelPath, true);
      console.log(`VRM loaded successfully: ${persona} (${modelPath})`);
      onLoaded?.();
    },
    (progress: ProgressEvent) => {
      const percent = ((progress.loaded / progress.total) * 100).toFixed(1);
      console.log(`Loading VRM: ${percent}%`);
    },
    (error: unknown) => {
      console.error("Error loading VRM:", error);
    }
  );
}

function handlePersonaChange(nextPersonaStr: string) {
  const nextPersona = nextPersonaStr.toLowerCase() as PersonaId;
  if (!["eli", "rei", "sora", "rin"].includes(nextPersona)) return;
  const currentPersona = vrmController.persona;
  if (currentPersona === nextPersona) return;

  if (!shouldReloadModel(currentPersona, nextPersona)) {
    // In-place persona switch without mesh reload from disk
    vrmController.setPersona(nextPersona);
    hud?.updatePersona(nextPersona, resolveModelPath(nextPersona), false);
    console.log(`[Avatar] Persona updated in-place: ${currentPersona} -> ${nextPersona} (no mesh reload)`);
  } else {
    // 3D mesh reload required
    vrmController.setPersona(nextPersona);
    const newModelPath = resolveModelPath(nextPersona);
    hud?.updatePersona(nextPersona, newModelPath, true);
    console.log(`[Avatar] Reloading 3D VRM model for persona ${nextPersona}: ${newModelPath}`);
    loadVRMModel(newModelPath, nextPersona);
  }
}

// Initial VRM model load
loadVRMModel(MODEL_PATH, activePersona);

// ============================================================================
// CONFIGURASI ANIMASI IDLE LENGAN & TUBUH (KUUDERE CLINICAL AI)
// ============================================================================
export const IDLE_ARM_CONFIG = {
  // Flag Debug: Jika di-set ke 3, semua gerakan mikro/noise dikali 3 agar mudah diverifikasi secara visual
  debugAmplify: 1,

  // 1. Parameter Siklus Napas (3-5 detik, non-linear easing)
  breath: {
    minDuration: 3.2,        // Durasi minimum 1 siklus napas (detik)
    maxDuration: 4.8,        // Durasi maksimum 1 siklus napas (detik)
    chestPitchDeg: 1.6,      // Rotasi dada maju-mundur (1-2 derajat)
    upperChestPitchDeg: 0.9, // Rotasi upperChest (derajat)
    spinePitchDeg: 0.45,     // Rotasi spine (derajat)
    shoulderRiseDeg: 0.35,   // Kenaikan bahu vertikal sangat tipis (derajat)
  },
  // 2. Rasio Counter-rotation (Menetralisir ayunan dada di pangkal lengan)
  counterRotation: {
    shoulderCancelRatio: 0.50, // Bahu menyerap 50% rotasi dada
    upperArmCancelRatio: 0.25, // Lengan atas menyerap 25% rotasi dada
    lowerArmCancelRatio: 0.0,  // Lengan bawah tidak di-counter-rotate (ikut terbawa lengan atas)
  },
  // 3. Follow-through Damping (0.1 - 0.2 detik delay respon & low-pass filtering)
  followThrough: {
    shoulderDamping: 9.0,    // Delay respon bahu
    upperArmDamping: 6.0,    // Delay respon lengan atas
    lowerArmDamping: 4.0,    // Delay respon lengan bawah
    handDamping: 3.5,        // Delay respon telapak tangan
  },
  // 4. Gerakan Mikro / Multi-frequency Noise
  microNoise: {
    speed: 1.0,              // Kecepatan osilasi noise
    upperArmDeg: 1.5,        // Amplitudo noise lengan atas (derajat)
    lowerArmDeg: 2.5,        // Amplitudo noise siku / bend lengan bawah (derajat)
    lowerArmTwistDeg: 2.0,   // Noise sumbu X twist lengan bawah (derajat)
    handDeg: 3.5,            // Amplitudo noise pergelangan tangan (derajat)
    fingerMaxDeg: 4.5,       // Amplitudo noise jari maks (derajat)
  },
  // 5. Asimetri Kiri dan Kanan
  asymmetry: {
    rightPhaseOffset: 0.95,  // Offset fase tangan kanan (radian)
    rightAmpScale: 0.88,     // Skala amplitudo tangan kanan (relatif terhadap kiri)
  },
  // 6. Konfigurasi Pergantian Pose (40 - 90 detik, durasi blend 1.5 - 2.2 detik)
  poseTransition: {
    minInterval: 40.0,       // Interval minimum pergantian pose (detik)
    maxInterval: 90.0,       // Interval maksimum pergantian pose (detik)
    minDuration: 1.5,        // Durasi blend minimum slerp (detik)
    maxDuration: 2.2,        // Durasi blend maksimum slerp (detik)
  },
  // 7. Konfigurasi Micro-Actions (10 - 30 detik, envelope halus tanpa bounce)
  microActions: {
    minInterval: 10.0,       // Interval jeda minimum antar action (detik)
    maxInterval: 30.0,       // Interval jeda maksimum antar action (detik)
    hairTuckCooldown: 45.0,  // Cooldown minimum untuk action hairTuck (detik)
  },
  // 8. Sifat Kuudere Terkontrol & Dingin
  personality: {
    blinkMinInterval: 4.0,   // Blink jarang (4-8 detik)
    blinkMaxInterval: 8.0,
    blinkDuration: 0.25,     // Durasi blink halus (0.25 detik)
    saccadeMinInterval: 3.0, // Saccade jarang (3-6 detik)
    saccadeMaxInterval: 6.0,
    saccadeAmpScale: 0.60,   // Amplitudo saccade diperkecil 60%
    interactionRelaxedWeight: 0.15, // Ekspresi relaxed halus saat interaksi mouse
  },
  // 9. Sway Postural Lambat (mencegah tubuh terasa kaku/statis)
  // Drift frekuensi sangat rendah yang membuat torso, pelvis, dan lengan atas
  // terus bergerak halus tanpa harus berganti pose. Ini adalah lapisan tambahan
  // di luar breath & micro-noise — nilai default konservatif, naikkan perlahan
  // sambil mengamati hasil render.
  postureSway: {
    enabled: true,
    speed: 0.045,          // sangat lambat (periode dasar ~140s, dimodulasi multi-frekuensi)
    spineYawDeg: 1.1,      // drift rotasi Y torso (menghadap sedikit kiri/kanan)
    spineRollDeg: 0.7,     // drift rotasi Z torso (condong kiri/kanan)
    hipsYawDeg: 1.3,       // drift rotasi Y pelvis
    armDriftDeg: 0.45,     // drift lengan atas — gerakan mengambang halus
  },
};

// --- Easing & Noise Helpers ---
function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// Multi-frequency smooth noise (non-harmonic multipliers avoid short repeating patterns)
function multiSinNoise(t: number, speed: number, phase: number): number {
  return (
    Math.sin(t * speed * 1.00 + phase) * 0.52 +
    Math.sin(t * speed * 1.63 + phase * 1.7) * 0.31 +
    Math.sin(t * speed * 2.71 + phase * 3.1) * 0.17
  );
}

// Frame-rate-independent exponential damping.
// Replaces lerp(a, b, dt * k): feel is ~identical at 60fps, but the factor is
// 1 - exp(-k*dt), which asymptotes to 1.0 and NEVER overshoots — even when delta
// is capped to 0.1 after a frame hitch. This directly fixes the saccade jitter
// (delta * 18.0 → factor 1.8 > 1 → eyes snap past target then back) and makes
// every follow-through / glance / head response correct at any framerate.
function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

// --- Breath Controller dengan Variasi Durasi Acak 3-5 Detik ---
class BreathController {
  public phase = 0;
  public currentCycleDuration = 4.0;
  public breathCurve = 0; // -1 (exhale) to +1 (inhale)
  public chestPitch = 0;  // radians
  public upperChestPitch = 0; // radians
  public spinePitch = 0;  // radians
  public totalChestPitch = 0; // total pitch diwariskan ke pangkal lengan

  update(delta: number) {
    this.phase += delta / this.currentCycleDuration;
    if (this.phase >= 1.0) {
      this.phase -= 1.0;
      // Variasi acak durasi siklus napas berikutnya (3.2 - 4.8 detik)
      const { minDuration, maxDuration } = IDLE_ARM_CONFIG.breath;
      this.currentCycleDuration = minDuration + Math.random() * (maxDuration - minDuration);
    }
    // Easing sinusoidal continue
    const rawSine = -Math.cos(this.phase * Math.PI * 2);
    // Modulasi halus agar tidak membentuk loop kaku
    const harmonicMod = Math.sin(this.phase * Math.PI * 4.31) * 0.08;
    this.breathCurve = rawSine + harmonicMod;

    this.chestPitch = this.breathCurve * THREE.MathUtils.degToRad(IDLE_ARM_CONFIG.breath.chestPitchDeg);
    this.upperChestPitch = this.breathCurve * THREE.MathUtils.degToRad(IDLE_ARM_CONFIG.breath.upperChestPitchDeg);
    this.spinePitch = this.breathCurve * THREE.MathUtils.degToRad(IDLE_ARM_CONFIG.breath.spinePitchDeg);
    this.totalChestPitch = this.spinePitch + this.chestPitch + this.upperChestPitch;
  }
}

const breathCtrl = new BreathController();

// Quaternion working variables (Zero allocation in animation frame)
const VEC_X = new THREE.Vector3(1, 0, 0);
const VEC_Z = new THREE.Vector3(0, 0, 1);
const _qCounter = new THREE.Quaternion();
const _qRise = new THREE.Quaternion();
const _qNoise = new THREE.Quaternion();
const _eulerNoise = new THREE.Euler();
const _qAction = new THREE.Quaternion();
const _eulerAction = new THREE.Euler();

// Follow-through delayed pitch states (for shoulder & upper arm counter-rotation)
let leftShoulderLagPitch = 0;
let rightShoulderLagPitch = 0;
let leftUpperArmLagPitch = 0;
let rightUpperArmLagPitch = 0;

// Hand & Forearm micro-noise lag states (low-pass smoothing via followThrough damping)
let leftLowerArmLagNoiseX = 0;
let leftLowerArmLagNoiseY = 0;
let rightLowerArmLagNoiseX = 0;
let rightLowerArmLagNoiseY = 0;
let leftHandLagNoiseX = 0;
let leftHandLagNoiseY = 0;
let rightHandLagNoiseX = 0;
let rightHandLagNoiseY = 0;

// ============================================================================
// MICRO-ACTION CONTROLLER (AKSI DISENGJA, JARANG, KEMBALI NETRAL)
// ============================================================================
type MicroActionType = "sigh" | "straighten" | "lookDownHands" | "sleeveFidget" | "hairTuck" | "slowGlance";

interface ActiveMicroAction {
  type: MicroActionType;
  phase: "rising" | "holding" | "falling";
  phaseTimer: number;
  riseTime: number;
  holdTime: number;
  fallTime: number;
  envelope: number; // 0.0 to 1.0 (eased)
}

let activeMicroAction: ActiveMicroAction | null = null;
let microActionTimer = 0;
let nextMicroActionAt = 14.0 + Math.random() * 12.0; // 10 - 30 detik
let lastHairTuckTime = -999;
let interactionRelaxedWeight = 0;

function isMicroActionActive(): boolean {
  return activeMicroAction !== null;
}

function startMicroAction(type: MicroActionType) {
  const time = clock.getElapsedTime();
  let riseTime = 0.6;
  let holdTime = 0.8;
  let fallTime = 0.9;

  if (type === "sigh") {
    riseTime = 0.55;
    holdTime = 0.70;
    fallTime = 0.95;
  } else if (type === "straighten") {
    riseTime = 0.60;
    holdTime = 0.60;
    fallTime = 0.80;
  } else if (type === "lookDownHands") {
    riseTime = 0.75;
    holdTime = 1.20;
    fallTime = 0.90;
  } else if (type === "sleeveFidget") {
    riseTime = 0.60;
    holdTime = 1.40;
    fallTime = 0.80;
  } else if (type === "hairTuck") {
    riseTime = 1.10;
    holdTime = 0.65;
    fallTime = 1.15;
    lastHairTuckTime = time;
  } else if (type === "slowGlance") {
    if (glanceState === "idle") {
      glanceState = "turning";
      const dir = Math.random() < 0.5 ? 1 : -1;
      targetGlanceYaw = dir * (0.22 + Math.random() * 0.10);
      glanceHoldDuration = 2.0 + Math.random() * 1.5;
      glanceHoldTimer = 0;
    }
    return;
  }

  activeMicroAction = {
    type,
    phase: "rising",
    phaseTimer: 0,
    riseTime,
    holdTime,
    fallTime,
    envelope: 0,
  };
}

function pickMicroAction(): MicroActionType | null {
  const time = clock.getElapsedTime();
  const candidates: { type: MicroActionType; weight: number }[] = [
    { type: "sigh", weight: 26 },
    { type: "straighten", weight: 24 },
    { type: "lookDownHands", weight: 22 },
    { type: "slowGlance", weight: 18 },
  ];

  // sleeveFidget hanya boleh dijalankan jika tangan bebas
  if (activePoseName === "attention" || activePoseName === "handsFront" || activePoseName === "holdElbow") {
    candidates.push({ type: "sleeveFidget", weight: 14 });
  }

  // hairTuck HANYA dari pose attention dan jeda minimum 45 detik
  if (activePoseName === "attention" && time - lastHairTuckTime >= IDLE_ARM_CONFIG.microActions.hairTuckCooldown) {
    candidates.push({ type: "hairTuck", weight: 8 });
  }

  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of candidates) {
    if (r < c.weight) return c.type;
    r -= c.weight;
  }
  return candidates[0].type;
}

// --- Kuudere Idle Animation System (Clinical AI Analyst) ---
const clock = new THREE.Clock();

// 1. Blinking (Random 4-8s dengan durasi 0.25s)
let blinkTimer = 0;
let nextBlinkAt = getRandomBlinkInterval();

function getRandomBlinkInterval(): number {
  const { blinkMinInterval, blinkMaxInterval } = IDLE_ARM_CONFIG.personality;
  return blinkMinInterval + Math.random() * (blinkMaxInterval - blinkMinInterval); // 4 to 8 seconds
}

// 2. Eye Saccades (Jarang 3-6s, amplitudo dikurangi 60%)
let saccadeTimer = 0;
let nextSaccadeAt = 3.5;
let currentSaccadeX = 0;
let currentSaccadeY = 0;
let targetSaccadeX = 0;
let targetSaccadeY = 0;

// 3. Periodic Weight Shift (Pindah tumpuan kaki setiap 5-10s dengan easing kubik)
let weightShiftTimer = 0;
let nextWeightShiftAt = 6.0 + Math.random() * 4.0; // 5 to 10s
let currentWeightShift = 0; // -0.85 = left, 0 = center, 0.85 = right
let startWeightShift = 0;
let targetWeightShift = 0;
let weightShiftProgress = 1;

// 4. Secondary Motion Lag (Head leads, neck follows with drag)
const headEuler = new THREE.Euler(0, 0, 0);
const neckEuler = new THREE.Euler(0, 0, 0);

// 5. Data Processing / Diagnostic State (Kuudere half-lidded analytical gaze)
let diagnosticTimer = 0;
let nextDiagnosticAt = 24 + Math.random() * 20; // Every 24-44s
let diagnosticState: "idle" | "lowering" | "holding" | "rising" = "idle";
let diagnosticWeight = 0;
let diagnosticHoldTimer = 0;
const diagnosticHoldDuration = 2.4;

// 6. Occasional Analytical Glance (Infrequent, deliberate)
let glanceTimer = 0;
let nextGlanceAt = 18 + Math.random() * 18; // Every 18-36s
let glanceState: "idle" | "turning" | "holding" | "returning" = "idle";
let targetGlanceYaw = 0;
let currentGlanceYaw = 0;
let glanceHoldTimer = 0;
let glanceHoldDuration = 2.2;

function getRandomGlanceInterval(): number {
  return 20 + Math.random() * 22; // 20 - 42s
}

// ============================================================================
// LIP-SYNC CONTROLLER & AUDIO ANALYZER (HYBRID PHONEMES + REAL-TIME AMPLITUDE)
// ============================================================================
export type VrmViseme = "aa" | "ih" | "ou" | "ee" | "oh";

export interface VisemeCue {
  time: number;
  duration: number;
  vowel: VrmViseme | null;
  text?: string;
}

export interface VoicePayload {
  id: string;
  persona: string;
  emotion?: string;
  text: string;
  audioBase64: string;
  cues: VisemeCue[];
  totalDuration: number;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

const VOWEL_MAX_OPENING: Record<VrmViseme, number> = {
  aa: 0.95, // Vokal A: bukaan jelas terlihat dari jarak framing setengah badan
  ih: 0.85, // Vokal I: tarikan bibir melebar ke samping
  ou: 0.80, // Vokal U: membulat maju
  ee: 0.88, // Vokal E: agak terbuka dan melebar
  oh: 0.92, // Vokal O: membulat terbuka penuh
};

class LipSyncController {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private timeDomainData: Uint8Array | null = null;

  private queue: VoicePayload[] = [];
  private isPlaying = false;
  private currentCues: VisemeCue[] = [];
  private playbackStartTime = 0;
  private currentSource: AudioBufferSourceNode | null = null;

  public currentVisemes: Record<VrmViseme, number> = {
    aa: 0,
    ih: 0,
    ou: 0,
    ee: 0,
    oh: 0,
  };

  private targetVisemes: Record<VrmViseme, number> = {
    aa: 0,
    ih: 0,
    ou: 0,
    ee: 0,
    oh: 0,
  };

  public isSpeaking = false;

  public getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.25;
      this.timeDomainData = new Uint8Array(this.analyser.frequencyBinCount);
    }
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public enqueueVoice(payload: VoicePayload) {
    this.queue.push(payload);
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  private async playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.isSpeaking = false;
      this.currentCues = [];
      return;
    }

    const payload = this.queue.shift()!;
    try {
      if (this.currentSource) {
        try {
          this.currentSource.stop();
        } catch {}
        this.currentSource = null;
      }

      const ctx = this.getAudioContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const arrayBuf = base64ToArrayBuffer(payload.audioBase64);
      const audioBuffer = await ctx.decodeAudioData(arrayBuf);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      if (this.analyser) {
        source.connect(this.analyser);
        this.analyser.connect(ctx.destination);
      } else {
        source.connect(ctx.destination);
      }

      this.currentSource = source;
      this.currentCues = payload.cues;
      this.playbackStartTime = ctx.currentTime;
      this.isPlaying = true;
      this.isSpeaking = true;

      source.onended = () => {
        if (this.currentSource === source) {
          this.currentSource = null;
        }
        this.isPlaying = false;
        this.isSpeaking = false;
        setTimeout(() => this.playNext(), 60);
      };

      source.start(0);
    } catch (err) {
      console.error("[LipSync] Gagal memutar audio payload", err);
      this.isPlaying = false;
      this.isSpeaking = false;
      this.playNext();
    }
  }

  public update(delta: number, vrm: VRM) {
    let volume = 0;

    if (this.isSpeaking && this.audioCtx && this.analyser && this.timeDomainData) {
      this.analyser.getByteTimeDomainData(this.timeDomainData as any);
      let sum = 0;
      for (let i = 0; i < this.timeDomainData.length; i++) {
        const v = (this.timeDomainData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.timeDomainData.length);
      // Sensitivitas volume dinaikkan: desibel suara vokal langsung terdeteksi
      volume = Math.min(1.0, Math.max(0.0, (rms - 0.005) * 12.0));
    }

    if (this.isSpeaking && this.audioCtx) {
      const elapsed = this.audioCtx.currentTime - this.playbackStartTime;
      let activeVowel: VrmViseme | null = null;

      for (let i = 0; i < this.currentCues.length; i++) {
        const c = this.currentCues[i];
        if (elapsed >= c.time && elapsed < c.time + c.duration) {
          activeVowel = c.vowel;
          break;
        }
      }

      const vKeys: VrmViseme[] = ["aa", "ih", "ou", "ee", "oh"];
      for (const k of vKeys) {
        if (k === activeVowel) {
          const maxOpening = VOWEL_MAX_OPENING[k];
          // Baseline bukaan 0.45 agar gerakan mulut jelas terlihat dari kamera,
          // meningkat proporsional hingga maxOpening (0.80 - 0.95) saat ada desibel suara
          const dynamicOpening = 0.45 + Math.pow(volume, 0.6) * (maxOpening - 0.45);
          this.targetVisemes[k] = Math.min(maxOpening, dynamicOpening);
        } else {
          this.targetVisemes[k] = 0;
        }
      }
    } else {
      this.targetVisemes.aa = 0;
      this.targetVisemes.ih = 0;
      this.targetVisemes.ou = 0;
      this.targetVisemes.ee = 0;
      this.targetVisemes.oh = 0;
    }

    const vKeys: VrmViseme[] = ["aa", "ih", "ou", "ee", "oh"];
    for (const k of vKeys) {
      // Damping 22.0: responsif mengikuti pergantian suku kata cepat, transisi luwes tanpa snapping
      this.currentVisemes[k] = damp(this.currentVisemes[k], this.targetVisemes[k], 22.0, delta);
      vrm.expressionManager?.setValue(k, this.currentVisemes[k]);
    }
  }
}

const lipSyncCtrl = new LipSyncController();

// Unlock AudioContext on first user interaction if browser policy requires it
window.addEventListener("pointerdown", () => {
  lipSyncCtrl.getAudioContext();
}, { once: true });

function initBridgeConnection() {
  const bridgeUrl = "http://127.0.0.1:39420/events";

  // Fetch initial state snapshot from REST endpoint
  fetch("http://127.0.0.1:39420/state")
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data?.state) {
        vrmController.transitionTo(data.state);
        if (data.persona) handlePersonaChange(data.persona);
        hud?.updateTelemetry(data, true);
      }
    })
    .catch(() => {
      hud?.setBridgeOnline(false);
    });

  try {
    const es = new EventSource(bridgeUrl);

    es.onopen = () => {
      console.log("[Bridge] Connected to Elenalyse CLI voice stream.");
      hud?.setBridgeOnline(true);
    };

    es.addEventListener("connected", () => {
      hud?.setBridgeOnline(true);
    });

    const handleStateChange = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload?.state) {
          vrmController.transitionTo(payload.state);
          if (payload.persona) handlePersonaChange(payload.persona);
          hud?.updateTelemetry(payload, true);
        }
      } catch (err) {
        console.error("[Bridge] Error parsing avatar state event:", err);
      }
    };

    es.addEventListener("avatar:state", handleStateChange);
    es.addEventListener("state", handleStateChange);

    es.addEventListener("speak", (e: MessageEvent) => {
      try {
        const payload: VoicePayload = JSON.parse(e.data);
        console.log(`[Bridge] Speak event: ${payload.persona} (${payload.text.slice(0, 30)}...)`);
        lipSyncCtrl.enqueueVoice(payload);
        vrmController.transitionTo("speaking");
        hud?.updateTelemetry(
          {
            state: "speaking",
            persona: vrmController.persona,
            detail: payload.text.slice(0, 30),
          },
          true
        );
      } catch (err) {
        console.error("[Bridge] Error parsing speak event payload", err);
      }
    });

    es.addEventListener("persona", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        console.log(`[Bridge] Persona changed to: ${data.persona}`);
        if (data?.persona) handlePersonaChange(data.persona);
      } catch (err) {}
    });

    es.onerror = () => {
      hud?.setBridgeOnline(false);
    };
  } catch (err) {
    console.warn("[Bridge] EventSource connection failed", err);
    hud?.setBridgeOnline(false);
  }
}

function updateIdleAnimation(delta: number) {
  if (!currentVRM || !currentVRM.humanoid) return;

  const time = clock.getElapsedTime();
  const humanoid = currentVRM.humanoid;
  const { followThrough, counterRotation, microNoise, asymmetry } = IDLE_ARM_CONFIG;
  const debugMultiplier = IDLE_ARM_CONFIG.debugAmplify || 1;

  // --- Postural Sway: drift frekuensi sangat rendah (mencegah kesan kaku/statis) ---
  // Dihitung sekali per frame, ditambahkan ke rotasi torso/pelvis/lengan.
  // Tidak dibatalkan oleh counter-rotation, jadi lengan tetap "hidup".
  const sway = IDLE_ARM_CONFIG.postureSway;
  const swayYaw = sway.enabled ? multiSinNoise(time, sway.speed, 0.0) * THREE.MathUtils.degToRad(sway.spineYawDeg) : 0;
  const swayRoll = sway.enabled ? multiSinNoise(time, sway.speed * 1.3, 1.4) * THREE.MathUtils.degToRad(sway.spineRollDeg) : 0;
  const hipsSwayYaw = sway.enabled ? multiSinNoise(time, sway.speed * 0.8, 2.7) * THREE.MathUtils.degToRad(sway.hipsYawDeg) : 0;
  const armDriftL = sway.enabled ? multiSinNoise(time, sway.speed * 1.7, 3.3) * THREE.MathUtils.degToRad(sway.armDriftDeg) : 0;
  const armDriftR = sway.enabled ? multiSinNoise(time, sway.speed * 1.7, 3.3 + asymmetry.rightPhaseOffset) * THREE.MathUtils.degToRad(sway.armDriftDeg * asymmetry.rightAmpScale) : 0;

  // ==========================================
  // 0. INTERAKSI & SMOOTH RELAXED EXPRESSION
  // ==========================================
  if (mouseInside) {
    interactionRelaxedWeight = damp(
      interactionRelaxedWeight,
      IDLE_ARM_CONFIG.personality.interactionRelaxedWeight,
      2.5,
      delta
    );
  } else {
    interactionRelaxedWeight = damp(interactionRelaxedWeight, 0, 1.8, delta);
  }

  // ==========================================
  // 0.1 POSE TRANSITION (SLERP DASAR QUATERNION & FINGERS)
  // ==========================================
  if (isPoseTransitioning) {
    poseTransitionProgress = Math.min(1.0, poseTransitionProgress + delta / poseTransitionDuration);
    const t = easeInOutCubic(poseTransitionProgress);

    for (const b of ARM_BONE_NAMES) {
      currentBase[b].copy(startBase[b]).slerp(POSE_QUATS[targetPoseName][b], t);
    }

    for (let i = 0; i < FINGER_DESCRIPTORS.length; i++) {
      currentFingerBaseAngles[i] = THREE.MathUtils.lerp(startFingerBaseAngles[i], targetFingerBaseAngles[i], t);
    }

    currentTorsoOffset.spine.lerpVectors(startTorsoOffset.spine, targetTorsoOffset.spine, t);
    currentTorsoOffset.chest.lerpVectors(startTorsoOffset.chest, targetTorsoOffset.chest, t);
    currentArmMotionScale = THREE.MathUtils.lerp(startArmMotionScale, targetArmMotionScale, t);

    if (poseTransitionProgress >= 1.0) {
      isPoseTransitioning = false;
      activePoseName = targetPoseName;
      poseTimer = 0;
      nextPoseChangeAt =
        IDLE_ARM_CONFIG.poseTransition.minInterval +
        Math.random() * (IDLE_ARM_CONFIG.poseTransition.maxInterval - IDLE_ARM_CONFIG.poseTransition.minInterval);
    }
  } else {
    // Batasan: Jangan pernah berpindah pose saat micro-action berjalan, saat glance/diagnostic aktif, atau saat user sedang berinteraksi
    const isBusy =
      isMicroActionActive() || glanceState !== "idle" || diagnosticState !== "idle" || mouseInside || isRotatingModel;
    if (!isBusy) {
      poseTimer += delta;
      if (poseTimer >= nextPoseChangeAt) {
        poseTimer = 0;
        const nextPose = selectNextPose();
        transitionToPose(nextPose);
      }
    }
  }

  // ==========================================
  // 0.2 MICRO-ACTION SCHEDULER & ENVELOPE
  // ==========================================
  let microSighDrop = 0;
  let microSighChest = 0;
  let microHeadPitch = 0;
  let microHeadTilt = 0;
  let microSpinePitch = 0;
  let microHipsY = 0;
  let microFingerCurl = 0;
  let microLookAtY = 0;

  if (activeMicroAction) {
    const act = activeMicroAction;
    act.phaseTimer += delta;

    if (act.phase === "rising") {
      const p = Math.min(1.0, act.phaseTimer / act.riseTime);
      act.envelope = easeInOutCubic(p);
      if (p >= 1.0) {
        act.phase = "holding";
        act.phaseTimer = 0;
      }
    } else if (act.phase === "holding") {
      act.envelope = 1.0;
      if (act.phaseTimer >= act.holdTime) {
        act.phase = "falling";
        act.phaseTimer = 0;
      }
    } else if (act.phase === "falling") {
      const p = Math.min(1.0, act.phaseTimer / act.fallTime);
      act.envelope = 1.0 - easeInOutCubic(p);
      if (p >= 1.0) {
        activeMicroAction = null;
        microActionTimer = 0;
        nextMicroActionAt =
          IDLE_ARM_CONFIG.microActions.minInterval +
          Math.random() * (IDLE_ARM_CONFIG.microActions.maxInterval - IDLE_ARM_CONFIG.microActions.minInterval);
      }
    }

    if (activeMicroAction) {
      const env = activeMicroAction.envelope;
      if (activeMicroAction.type === "sigh") {
        microSighDrop = env * THREE.MathUtils.degToRad(1.5);
        microSighChest = env * THREE.MathUtils.degToRad(1.3);
        microHeadPitch = env * THREE.MathUtils.degToRad(2.4);
      } else if (activeMicroAction.type === "straighten") {
        microHeadPitch = -env * THREE.MathUtils.degToRad(2.0);
        microSpinePitch = -env * THREE.MathUtils.degToRad(1.1);
        microHipsY = env * 0.0035;
      } else if (activeMicroAction.type === "lookDownHands") {
        microHeadPitch = env * THREE.MathUtils.degToRad(7.5);
        microLookAtY = -env * 0.18;
        microFingerCurl = env * THREE.MathUtils.degToRad(8.0);
      }
    }
  } else {
    // Schedule micro-action berikutnya jika tidak sedang sibuk
    const isBusy =
      isPoseTransitioning || glanceState !== "idle" || diagnosticState !== "idle" || mouseInside || isRotatingModel;
    if (!isBusy) {
      microActionTimer += delta;
      if (microActionTimer >= nextMicroActionAt) {
        microActionTimer = 0;
        const nextAction = pickMicroAction();
        if (nextAction) {
          startMicroAction(nextAction);
        }
      }
    }
  }

  // ==========================================
  // 1. NAPAS (Breathing: 3-5s cycle, 1-2° Chest/UpperChest)
  // ==========================================
  breathCtrl.update(delta);

  // Chest & Spine pitch (ditambah offset pose aktif & micro action)
  const spine = humanoid.getNormalizedBoneNode("spine");
  const chest = humanoid.getNormalizedBoneNode("chest");
  const upperChest = humanoid.getNormalizedBoneNode("upperChest");

  if (spine) {
    spine.rotation.x = breathCtrl.spinePitch + currentTorsoOffset.spine.x + microSpinePitch;
    spine.rotation.z = -currentWeightShift * 0.009 + swayRoll; // spine counter-balance + postural sway
    spine.rotation.y = -currentWeightShift * 0.003 + swayYaw;
  }

  if (upperChest && chest) {
    upperChest.rotation.x = breathCtrl.upperChestPitch;
    chest.rotation.x = breathCtrl.chestPitch + currentTorsoOffset.chest.x + microSighChest;
    chest.rotation.z = -currentWeightShift * 0.005;
  } else if (chest) {
    chest.rotation.x = breathCtrl.chestPitch + breathCtrl.upperChestPitch + currentTorsoOffset.chest.x + microSighChest;
    chest.rotation.z = -currentWeightShift * 0.005;
  }

  // ==========================================
  // 2. COUNTER-ROTATION & FOLLOW-THROUGH DAMPING (Dihitung di atas currentBase)
  // ==========================================
  // Skala reduksi gerak lengan saat pose menempel tubuh (atEase, armsCrossed, pocket)
  const effectiveShoulderCancel = counterRotation.shoulderCancelRatio * currentArmMotionScale;
  const effectiveUpperCancel = counterRotation.upperArmCancelRatio * currentArmMotionScale;
  const effectiveNoiseScale = currentArmMotionScale * debugMultiplier;

  // Sinyal lag lengan kiri & kanan dari breathCtrl.totalChestPitch
  leftShoulderLagPitch = damp(leftShoulderLagPitch, breathCtrl.totalChestPitch, followThrough.shoulderDamping, delta);
  rightShoulderLagPitch = damp(rightShoulderLagPitch, breathCtrl.totalChestPitch, followThrough.shoulderDamping, delta);

  leftUpperArmLagPitch = damp(leftUpperArmLagPitch, breathCtrl.totalChestPitch, followThrough.upperArmDamping, delta);
  rightUpperArmLagPitch = damp(rightUpperArmLagPitch, breathCtrl.totalChestPitch, followThrough.upperArmDamping, delta);

  // --- SHOULDERS: pre-multiply _qCounter against currentBase, absorb rotasi dada ---
  const leftShoulder = humanoid.getNormalizedBoneNode("leftShoulder");
  const rightShoulder = humanoid.getNormalizedBoneNode("rightShoulder");
  if (leftShoulder) {
    const counterX = -leftShoulderLagPitch * effectiveShoulderCancel;
    const riseZ = -breathCtrl.breathCurve * THREE.MathUtils.degToRad(IDLE_ARM_CONFIG.breath.shoulderRiseDeg) - microSighDrop;
    _qCounter.setFromAxisAngle(VEC_X, counterX);
    _qRise.setFromAxisAngle(VEC_Z, riseZ);
    leftShoulder.quaternion.copy(_qCounter).multiply(currentBase.leftShoulder).multiply(_qRise);
  }
  if (rightShoulder) {
    const counterX = -rightShoulderLagPitch * effectiveShoulderCancel * asymmetry.rightAmpScale;
    const riseZ = breathCtrl.breathCurve * THREE.MathUtils.degToRad(IDLE_ARM_CONFIG.breath.shoulderRiseDeg * asymmetry.rightAmpScale) - microSighDrop;
    _qCounter.setFromAxisAngle(VEC_X, counterX);
    _qRise.setFromAxisAngle(VEC_Z, riseZ);
    rightShoulder.quaternion.copy(_qCounter).multiply(currentBase.rightShoulder).multiply(_qRise);
  }

  // --- UPPER ARMS: pre-multiply _qCounter against currentBase + micro-noise teredam ---
  const leftUpperArm = humanoid.getNormalizedBoneNode("leftUpperArm");
  const rightUpperArm = humanoid.getNormalizedBoneNode("rightUpperArm");
  if (leftUpperArm) {
    const counterX = -leftUpperArmLagPitch * effectiveUpperCancel;
    const nX = multiSinNoise(time, microNoise.speed, 1.2) * THREE.MathUtils.degToRad(microNoise.upperArmDeg * effectiveNoiseScale);
    const nY = multiSinNoise(time, microNoise.speed * 0.85, 2.4) * THREE.MathUtils.degToRad(microNoise.upperArmDeg * 0.7 * effectiveNoiseScale) + armDriftL;
    const nZ = multiSinNoise(time, microNoise.speed * 0.70, 3.6) * THREE.MathUtils.degToRad(microNoise.upperArmDeg * 0.8 * effectiveNoiseScale);
    _eulerNoise.set(nX, nY, nZ);
    _qNoise.setFromEuler(_eulerNoise);
    _qCounter.setFromAxisAngle(VEC_X, counterX);
    leftUpperArm.quaternion.copy(_qCounter).multiply(currentBase.leftUpperArm).multiply(_qNoise);
  }
  if (rightUpperArm) {
    const counterX = -rightUpperArmLagPitch * effectiveUpperCancel * asymmetry.rightAmpScale;
    const nX = multiSinNoise(time, microNoise.speed, 1.2 + asymmetry.rightPhaseOffset) * THREE.MathUtils.degToRad(microNoise.upperArmDeg * asymmetry.rightAmpScale * effectiveNoiseScale);
    const nY = multiSinNoise(time, microNoise.speed * 0.85, 2.4 + asymmetry.rightPhaseOffset) * THREE.MathUtils.degToRad(microNoise.upperArmDeg * 0.7 * effectiveNoiseScale) + armDriftR;
    const nZ = multiSinNoise(time, microNoise.speed * 0.70, 3.6 + asymmetry.rightPhaseOffset) * THREE.MathUtils.degToRad(microNoise.upperArmDeg * 0.8 * effectiveNoiseScale);
    _eulerNoise.set(nX, nY, nZ);
    _qNoise.setFromEuler(_eulerNoise);
    _qCounter.setFromAxisAngle(VEC_X, counterX);
    rightUpperArm.quaternion.copy(_qCounter).multiply(currentBase.rightUpperArm).multiply(_qNoise);

    // Micro-action: hairTuck (mengangkat lengan kanan ke arah pelipis/telinga)
    if (activeMicroAction?.type === "hairTuck") {
      const env = activeMicroAction.envelope;
      _eulerAction.set(env * 0.48, -env * 0.32, -env * 0.58);
      _qAction.setFromEuler(_eulerAction);
      rightUpperArm.quaternion.multiply(_qAction);
    }
  }

  // --- LOWER ARMS (Elbows): terbawa lengan atas + low-pass micro-noise & twist ---
  const leftLowerArm = humanoid.getNormalizedBoneNode("leftLowerArm");
  const rightLowerArm = humanoid.getNormalizedBoneNode("rightLowerArm");
  if (leftLowerArm) {
    const targetTwistX = multiSinNoise(time, microNoise.speed * 0.8, 3.1) * THREE.MathUtils.degToRad(microNoise.lowerArmTwistDeg * effectiveNoiseScale);
    const targetBendY = multiSinNoise(time, microNoise.speed * 0.9, 4.8) * THREE.MathUtils.degToRad(microNoise.lowerArmDeg * effectiveNoiseScale);
    leftLowerArmLagNoiseX = damp(leftLowerArmLagNoiseX, targetTwistX, followThrough.lowerArmDamping, delta);
    leftLowerArmLagNoiseY = damp(leftLowerArmLagNoiseY, targetBendY, followThrough.lowerArmDamping, delta);
    _eulerNoise.set(leftLowerArmLagNoiseX, leftLowerArmLagNoiseY, 0);
    _qNoise.setFromEuler(_eulerNoise);
    leftLowerArm.quaternion.copy(currentBase.leftLowerArm).multiply(_qNoise);
  }
  if (rightLowerArm) {
    const targetTwistX = multiSinNoise(time, microNoise.speed * 0.8, 3.1 + asymmetry.rightPhaseOffset) * THREE.MathUtils.degToRad(microNoise.lowerArmTwistDeg * asymmetry.rightAmpScale * effectiveNoiseScale);
    const targetBendY = multiSinNoise(time, microNoise.speed * 0.9, 4.8 + asymmetry.rightPhaseOffset) * THREE.MathUtils.degToRad(microNoise.lowerArmDeg * asymmetry.rightAmpScale * effectiveNoiseScale);
    rightLowerArmLagNoiseX = damp(rightLowerArmLagNoiseX, targetTwistX, followThrough.lowerArmDamping, delta);
    rightLowerArmLagNoiseY = damp(rightLowerArmLagNoiseY, targetBendY, followThrough.lowerArmDamping, delta);
    _eulerNoise.set(rightLowerArmLagNoiseX, rightLowerArmLagNoiseY, 0);
    _qNoise.setFromEuler(_eulerNoise);
    rightLowerArm.quaternion.copy(currentBase.rightLowerArm).multiply(_qNoise);

    // Micro-action: hairTuck (menekuk siku kanan ke arah telinga)
    if (activeMicroAction?.type === "hairTuck") {
      const env = activeMicroAction.envelope;
      _eulerAction.set(env * 0.25, env * 0.85, 0);
      _qAction.setFromEuler(_eulerAction);
      rightLowerArm.quaternion.multiply(_qAction);
    }
  }

  // --- HANDS (Wrists): low-pass micro-noise ---
  const leftHand = humanoid.getNormalizedBoneNode("leftHand");
  const rightHand = humanoid.getNormalizedBoneNode("rightHand");
  if (leftHand) {
    const targetHnX = multiSinNoise(time, microNoise.speed * 1.1, 5.5) * THREE.MathUtils.degToRad(microNoise.handDeg * effectiveNoiseScale);
    const targetHnY = multiSinNoise(time, microNoise.speed * 0.75, 6.7) * THREE.MathUtils.degToRad(microNoise.handDeg * 0.8 * effectiveNoiseScale);
    leftHandLagNoiseX = damp(leftHandLagNoiseX, targetHnX, followThrough.handDamping, delta);
    leftHandLagNoiseY = damp(leftHandLagNoiseY, targetHnY, followThrough.handDamping, delta);
    _eulerNoise.set(leftHandLagNoiseX, leftHandLagNoiseY, 0);
    _qNoise.setFromEuler(_eulerNoise);
    leftHand.quaternion.copy(currentBase.leftHand).multiply(_qNoise);

    // Micro-action: sleeveFidget (pergelangan tangan kiri sedikit bergerak memainkan ujung lengan)
    if (activeMicroAction?.type === "sleeveFidget") {
      const env = activeMicroAction.envelope;
      _eulerAction.set(env * 0.08, env * 0.10, 0);
      _qAction.setFromEuler(_eulerAction);
      leftHand.quaternion.multiply(_qAction);
    }
  }
  if (rightHand) {
    const targetHnX = multiSinNoise(time, microNoise.speed * 1.1, 5.5 + asymmetry.rightPhaseOffset) * THREE.MathUtils.degToRad(microNoise.handDeg * asymmetry.rightAmpScale * effectiveNoiseScale);
    const targetHnY = multiSinNoise(time, microNoise.speed * 0.75, 6.7 + asymmetry.rightPhaseOffset) * THREE.MathUtils.degToRad(microNoise.handDeg * 0.8 * effectiveNoiseScale);
    rightHandLagNoiseX = damp(rightHandLagNoiseX, targetHnX, followThrough.handDamping, delta);
    rightHandLagNoiseY = damp(rightHandLagNoiseY, targetHnY, followThrough.handDamping, delta);
    _eulerNoise.set(rightHandLagNoiseX, rightHandLagNoiseY, 0);
    _qNoise.setFromEuler(_eulerNoise);
    rightHand.quaternion.copy(currentBase.rightHand).multiply(_qNoise);

    // Micro-action: hairTuck (jari menyelipkan rambut di belakang telinga)
    if (activeMicroAction?.type === "hairTuck") {
      const env = activeMicroAction.envelope;
      _eulerAction.set(env * 0.15, env * 0.30, 0);
      _qAction.setFromEuler(_eulerAction);
      rightHand.quaternion.multiply(_qAction);
    }
  }

  // --- JARI-JARI (Fingers): interpolasi curl pose aktif + micro noise + action curl ---
  for (let i = 0; i < FINGER_DESCRIPTORS.length; i++) {
    const f = FINGER_DESCRIPTORS[i];
    const node = humanoid.getNormalizedBoneNode(f.bone as any);
    if (node) {
      const curlNoise = multiSinNoise(time, microNoise.speed * f.speed, f.phase) * THREE.MathUtils.degToRad(f.ampDeg * effectiveNoiseScale);
      const sign = f.baseAngle < 0 ? -1 : 1;
      const extraCurl = sign * microFingerCurl;
      _qRise.setFromAxisAngle(VEC_Z, currentFingerBaseAngles[i] + extraCurl + curlNoise);
      node.quaternion.copy(_qRise);
    }
  }

  // ==========================================
  // 3. WEIGHT SHIFT BERKALA (Setiap 5-10 Detik, Easing Halus)
  // ==========================================
  weightShiftTimer += delta;
  if (weightShiftTimer >= nextWeightShiftAt) {
    weightShiftTimer = 0;
    nextWeightShiftAt = 5.0 + Math.random() * 5.0; // 5 - 10s
    startWeightShift = currentWeightShift;
    weightShiftProgress = 0;

    // Pick next target weight: smooth shift to left (-0.85), center (0), or right (0.85)
    const options = [-0.85, 0, 0.85].filter((w) => Math.abs(w - currentWeightShift) > 0.3);
    targetWeightShift = options[Math.floor(Math.random() * options.length)];
  }

  if (weightShiftProgress < 1) {
    weightShiftProgress = Math.min(1, weightShiftProgress + delta * 0.75); // ~1.3s smooth transition
    const ease = easeInOutCubic(weightShiftProgress);
    currentWeightShift = THREE.MathUtils.lerp(startWeightShift, targetWeightShift, ease);
  }

  // Apply weight shift to hips (+ microHipsY saat aksi straighten)
  const hips = humanoid.getNormalizedBoneNode("hips");
  if (hips) {
    hips.position.y = initialHipsY + (breathCtrl.breathCurve * 0.002) + microHipsY;
    hips.position.x = currentWeightShift * 0.007; // lateral displacement onto standing foot
    hips.rotation.z = currentWeightShift * 0.014; // pelvic tilt
    hips.rotation.y = currentWeightShift * 0.005 + hipsSwayYaw; // pelvic yaw drift
  }

  // ==========================================
  // 4. KUUDERE DIAGNOSTIC & GLANCE (Jarang, Presisi)
  // ==========================================
  // Diagnostic Mode (Half-closed analytical eyes)
  if (diagnosticState === "idle") {
    diagnosticTimer += delta;
    if (diagnosticTimer >= nextDiagnosticAt && glanceState === "idle") {
      diagnosticState = "lowering";
      diagnosticHoldTimer = 0;
    }
  } else if (diagnosticState === "lowering") {
    diagnosticWeight = damp(diagnosticWeight, 0.44, 2.8, delta);
    if (diagnosticWeight >= 0.42) {
      diagnosticState = "holding";
    }
  } else if (diagnosticState === "holding") {
    diagnosticHoldTimer += delta;
    if (diagnosticHoldTimer >= diagnosticHoldDuration) {
      diagnosticState = "rising";
    }
  } else if (diagnosticState === "rising") {
    diagnosticWeight = damp(diagnosticWeight, 0, 2.5, delta);
    if (diagnosticWeight <= 0.02) {
      diagnosticWeight = 0;
      diagnosticState = "idle";
      diagnosticTimer = 0;
      nextDiagnosticAt = 24 + Math.random() * 20;
    }
  }

  // Analytical Glance (Mata bergerak lebih dulu, kepala menyusul dengan delay 0.2-0.3s)
  if (glanceState === "idle") {
    glanceTimer += delta;
    if (glanceTimer >= nextGlanceAt && diagnosticState === "idle") {
      glanceState = "turning";
      const dir = Math.random() < 0.5 ? 1 : -1;
      targetGlanceYaw = dir * (0.22 + Math.random() * 0.10);
      glanceHoldDuration = 2.0 + Math.random() * 1.5;
      glanceHoldTimer = 0;
    }
  } else if (glanceState === "turning") {
    currentGlanceYaw = damp(currentGlanceYaw, targetGlanceYaw, 2.0, delta);
    if (Math.abs(currentGlanceYaw - targetGlanceYaw) < 0.02) {
      glanceState = "holding";
    }
  } else if (glanceState === "holding") {
    glanceHoldTimer += delta;
    if (glanceHoldTimer >= glanceHoldDuration) {
      glanceState = "returning";
    }
  } else if (glanceState === "returning") {
    currentGlanceYaw = damp(currentGlanceYaw, 0, 1.8, delta);
    if (Math.abs(currentGlanceYaw) < 0.005) {
      currentGlanceYaw = 0;
      glanceState = "idle";
      glanceTimer = 0;
      nextGlanceAt = getRandomGlanceInterval();
    }
  }

  // ==========================================
  // 5. GERAKAN SEKUNDER (Head Mengikuti Napas & Arah Pandang dengan Delay 0.2-0.3s)
  // ==========================================
  if (activeMicroAction?.type === "hairTuck") {
    microHeadTilt = activeMicroAction.envelope * 0.045; // kepala condong tipis menyambut tangan
  }
  const targetHeadPitch = breathCtrl.chestPitch * 0.22 - diagnosticWeight * 0.04 + microHeadPitch;
  const targetHeadYaw = currentGlanceYaw;
  const targetHeadTilt = Math.sin(time * 0.55) * 0.007 - currentGlanceYaw * 0.07 - currentWeightShift * 0.004 + microHeadTilt;

  // Head merespons pelan dan terkontrol (delay fisik 0.2-0.3s di belakang mata)
  headEuler.x = damp(headEuler.x, targetHeadPitch, 2.8, delta);
  headEuler.y = damp(headEuler.y, targetHeadYaw, 1.8, delta);
  headEuler.z = damp(headEuler.z, targetHeadTilt, 2.8, delta);

  // Neck mengikuti Head dengan delay fisik sekunder
  neckEuler.x = damp(neckEuler.x, headEuler.x * 0.45, 1.4, delta);
  neckEuler.y = damp(neckEuler.y, headEuler.y * 0.40, 1.4, delta);
  neckEuler.z = damp(neckEuler.z, headEuler.z * 0.35, 1.4, delta);

  const head = humanoid.getNormalizedBoneNode("head");
  const neck = humanoid.getNormalizedBoneNode("neck");
  if (head) head.rotation.copy(headEuler);
  if (neck) neck.rotation.copy(neckEuler);

  // ==========================================
  // 6. MATA: BLINK KUUDERE (4-8s) & SACCADES TERKONTROL (3-6s)
  // ==========================================
  // Saccades: interval 3.0 - 6.0s, amplitudo dikurangi 40%
  saccadeTimer += delta;
  if (saccadeTimer >= nextSaccadeAt) {
    saccadeTimer = 0;
    const { saccadeMinInterval, saccadeMaxInterval, saccadeAmpScale } = IDLE_ARM_CONFIG.personality;
    nextSaccadeAt = saccadeMinInterval + Math.random() * (saccadeMaxInterval - saccadeMinInterval);
    targetSaccadeX = (Math.random() - 0.5) * 0.045 * saccadeAmpScale;
    targetSaccadeY = (Math.random() - 0.5) * 0.025 * saccadeAmpScale;
  }
  currentSaccadeX = damp(currentSaccadeX, targetSaccadeX, 18.0, delta);
  currentSaccadeY = damp(currentSaccadeY, targetSaccadeY, 18.0, delta);

  // LookAt target: mata bergerak lebih dulu mengikuti kursor atau pandangan lurus
  if (mouseInside) {
    lookAtTarget.position.x = damp(lookAtTarget.position.x, mousePos.x + currentSaccadeX, 4.2, delta);
    lookAtTarget.position.y = damp(lookAtTarget.position.y, mousePos.y + currentSaccadeY + microLookAtY, 4.2, delta);
  } else {
    const forwardX = currentGlanceYaw * 0.6 + currentSaccadeX;
    const forwardY = cameraLookTarget.y + 0.08 + currentSaccadeY + microLookAtY;
    lookAtTarget.position.x = damp(lookAtTarget.position.x, forwardX, 2.5, delta);
    lookAtTarget.position.y = damp(lookAtTarget.position.y, forwardY, 2.5, delta);
  }
  lookAtTarget.position.z = camera.position.z;

  // Blink acak: 4-8s dengan durasi 0.25s tanpa overshoot
  let activeBlink = 0;
  blinkTimer += delta;
  if (blinkTimer >= nextBlinkAt) {
    const blinkDuration = IDLE_ARM_CONFIG.personality.blinkDuration;
    const progress = (blinkTimer - nextBlinkAt) / blinkDuration;

    if (progress < 1) {
      const p = Math.sin(progress * Math.PI);
      activeBlink = Math.pow(p, 1.25); // snap close, soft ease open
    } else {
      activeBlink = 0;
      blinkTimer = 0;
      nextBlinkAt = getRandomBlinkInterval();
    }
  }

  const combinedBlink = Math.min(1.0, Math.max(activeBlink, diagnosticWeight));
  currentVRM.expressionManager?.setValue("blink", combinedBlink);

  // Ekspresi tenang Kuudere (relaxed naik 0.15 halus saat interaksi, tanpa ekspresi berlebihan)
  currentVRM.expressionManager?.setValue("relaxed", interactionRelaxedWeight);

  // Update Lip-sync visemes (aa, ih, ou, ee, oh)
  lipSyncCtrl.update(delta, currentVRM);

  // Update VRM internal components (springbones physics for hair & coat, lookAt, expressions)
  currentVRM.update(delta);
}

// --- Render Loop ---
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1); // Cap delta to prevent animation jumping
  updateIdleAnimation(delta);
  vrmController.update(delta);
  hud?.update(delta);
  if (currentVRM) {
    currentVRM.scene.rotation.y = baseModelRotationY + userModelRotationY;
  }
  camera.lookAt(cameraLookTarget);
  renderer.render(scene, camera);
}

// Initialize Diagnostic HUD with Thesis Simulation Actions (BB-01..07)
hud = new DiagnosticHUD((action, payload) => {
  switch (action) {
    case "BB-01":
      vrmController.transitionTo("idle");
      hud?.updateTelemetry({ state: "idle", persona: vrmController.persona, detail: "manual_bb01_idle" });
      break;
    case "BB-02":
      vrmController.transitionTo("thinking");
      hud?.updateTelemetry({ state: "thinking", persona: vrmController.persona, detail: "manual_bb02_thinking_250ms" });
      break;
    case "BB-03":
      vrmController.transitionTo("thinking");
      hud?.updateTelemetry({ state: "thinking", persona: vrmController.persona, detail: "bb03_thinking_dwell_start" });
      setTimeout(() => {
        vrmController.transitionTo("speaking");
        hud?.updateTelemetry({ state: "speaking", persona: vrmController.persona, detail: "bb03_speaking_debounced" });
      }, 300);
      break;
    case "BB-04":
      vrmController.transitionTo("thinking");
      hud?.updateTelemetry({ state: "thinking", persona: vrmController.persona, detail: "bb04_prompt" });
      setTimeout(() => {
        vrmController.transitionTo("executing");
        hud?.updateTelemetry({ state: "executing", persona: vrmController.persona, detail: "bb04_readFile_step_1" });
        setTimeout(() => {
          vrmController.transitionTo("thinking");
          hud?.updateTelemetry({ state: "thinking", persona: vrmController.persona, detail: "bb04_eval_result" });
          setTimeout(() => {
            vrmController.transitionTo("speaking");
            hud?.updateTelemetry({ state: "speaking", persona: vrmController.persona, detail: "bb04_answer" });
          }, 300);
        }, 400);
      }, 300);
      break;
    case "BB-05":
      vrmController.transitionTo("success");
      hud?.updateTelemetry({ state: "success", persona: vrmController.persona, detail: "bb05_success_2000ms" });
      setTimeout(() => {
        if (vrmController.state === "success") {
          vrmController.transitionTo("idle");
          hud?.updateTelemetry({ state: "idle", persona: vrmController.persona, detail: "auto_reset_from_success" });
        }
      }, 2000);
      break;
    case "BB-06":
      vrmController.transitionTo("error");
      hud?.updateTelemetry({ state: "error", persona: vrmController.persona, detail: "bb06_fatal_error_150ms" });
      setTimeout(() => {
        if (vrmController.state === "error") {
          vrmController.transitionTo("idle");
          hud?.updateTelemetry({ state: "idle", persona: vrmController.persona, detail: "auto_reset_from_error" });
        }
      }, 2500);
      break;
    case "BB-07":
      vrmController.transitionTo("thinking");
      hud?.updateTelemetry({ state: "thinking", persona: vrmController.persona, detail: "bb07_thinking_start" });
      setTimeout(() => {
        vrmController.transitionTo("error");
        hud?.updateTelemetry({ state: "error", persona: vrmController.persona, detail: "bb07_rapid_preempt_10ms" });
        setTimeout(() => {
          if (vrmController.state === "error") {
            vrmController.transitionTo("idle");
            hud?.updateTelemetry({ state: "idle", persona: vrmController.persona, detail: "auto_reset_from_error" });
          }
        }, 2500);
      }, 10);
      break;
    case "RESET":
      vrmController.transitionTo("idle");
      hud?.updateTelemetry({ state: "idle", persona: vrmController.persona, detail: "reset" });
      break;
    case "SET_PERSONA":
      if (payload) {
        handlePersonaChange(payload as string);
      }
      break;
  }
});

animate();

// --- Window Resize Handling ---
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (currentVRM) {
    frameCameraToModel(currentVRM);
  }
});

// Expose lipSync controller to window for inspection & debug
(window as any).lipSync = lipSyncCtrl;
(window as any).vrmController = vrmController;
(window as any).hud = hud;

// Start listening for CLI voice events via SSE Bridge
initBridgeConnection();

