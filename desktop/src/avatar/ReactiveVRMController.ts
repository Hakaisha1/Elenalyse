export type AvatarInteractionState =
  | "idle"
  | "thinking"
  | "speaking"
  | "executing"
  | "success"
  | "error";

export type PersonaId = "eli" | "rei" | "sora" | "rin";

export const PERSONA_MODEL_MAP: Record<PersonaId, string> = {
  eli: "/models/ELI_Model.vrm",
  rei: "/models/REI_Model.vrm",
  sora: "/models/SORA_Model.vrm", // Dedicated SORA model
  rin: "/models/RIN_Model.vrm",  // Dedicated RIN model
};

/**
 * Resolves the static VRM asset path for a given persona with graceful fallback.
 */
export function resolveModelPath(persona: PersonaId): string {
  return PERSONA_MODEL_MAP[persona] || "/models/ELI_Model.vrm";
}

/**
 * Determines whether switching between two personas necessitates reloading the 3D VRM model.
 * If both personas map to the same .vrm file (e.g. eli <-> sora or rei <-> rin), returns false.
 */
export function shouldReloadModel(
  currentPersona: PersonaId,
  nextPersona: PersonaId
): boolean {
  return resolveModelPath(currentPersona) !== resolveModelPath(nextPersona);
}

export interface MockRotation {
  x: number;
  y: number;
  z: number;
}

export interface MockBoneNode {
  rotation: MockRotation;
}

export interface MockExpressionManager {
  setValue: (expressionName: string, value: number) => void;
  getValue?: (expressionName: string) => number | null;
}

export interface VRMLike {
  humanoid?: {
    getNormalizedBoneNode?: (boneName: any) => MockBoneNode | null | undefined;
    getRawBoneNode?: (boneName: any) => MockBoneNode | null | undefined;
  };
  expressionManager?: MockExpressionManager;
}

export interface PoseStateValues {
  head: MockRotation;
  neck: MockRotation;
  spine: MockRotation;
  chest: MockRotation;
  upperChest: MockRotation;
  leftUpperArm: MockRotation;
  rightUpperArm: MockRotation;
  leftLowerArm: MockRotation;
  rightLowerArm: MockRotation;
  expressions: Record<string, number>;
}

export interface ControllerOptions {
  initialPersona?: PersonaId;
  initialState?: AvatarInteractionState;
}

/**
 * Frame-rate-independent exponential damping.
 * damp(current, target, lambda, dt) = target + (current - target) * Math.exp(-lambda * dt)
 */
export function damp(
  current: number,
  target: number,
  lambda: number,
  dt: number
): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

export interface ThinkingSubPose {
  neck: MockRotation;
  head: MockRotation;
  upperChest: MockRotation;
  chest: MockRotation;
  spine: MockRotation;
  rightUpperArm: MockRotation;
  rightLowerArm: MockRotation;
}

export const THINKING_PHASE_A: ThinkingSubPose = {
  neck: { x: -0.04, y: 0.05, z: 0.07 },
  head: { x: -0.06, y: 0.08, z: 0.14 },
  upperChest: { x: 0.01, y: 0.04, z: -0.03 },
  chest: { x: 0.01, y: 0.02, z: -0.015 },
  spine: { x: 0.01, y: 0, z: 0 },
  rightUpperArm: { x: 0.06, y: 0.12, z: 1.15 },
  rightLowerArm: { x: 0.38, y: 0.28, z: 0.06 },
};

export const THINKING_PHASE_B: ThinkingSubPose = {
  neck: { x: -0.01, y: -0.02, z: 0.02 },
  head: { x: 0.02, y: -0.03, z: 0.04 },
  upperChest: { x: 0.01, y: -0.02, z: 0.01 },
  chest: { x: 0.015, y: -0.01, z: 0.005 },
  spine: { x: 0.02, y: 0, z: 0 },
  rightUpperArm: { x: 0.04, y: 0.08, z: 1.18 },
  rightLowerArm: { x: 0.30, y: 0.22, z: 0.04 },
};

export const THINKING_PHASE_C: ThinkingSubPose = {
  neck: { x: -0.03, y: -0.04, z: -0.04 },
  head: { x: -0.04, y: -0.06, z: -0.06 },
  upperChest: { x: 0.01, y: -0.03, z: 0.02 },
  chest: { x: 0.01, y: -0.015, z: 0.01 },
  spine: { x: 0.01, y: 0, z: 0 },
  rightUpperArm: { x: 0.03, y: 0.06, z: 1.20 },
  rightLowerArm: { x: 0.26, y: 0.18, z: 0.02 },
};

/**
 * Smoothstep easing function for natural animation crossfading.
 */
function smoothstep(min: number, max: number, value: number): number {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
}

/**
 * Three.js + VRM Reactive Animation & Expression Controller.
 * Manages procedural bone poses, expressions, and crossfades across the 6 deterministic states.
 */
export class ReactiveVRMController {
  private _vrm: VRMLike | null = null;
  private _currentState: AvatarInteractionState = "idle";
  private _previousState: AvatarInteractionState | null = null;
  private _persona: PersonaId = "eli";
  private _dampedValues: PoseStateValues | null = null;

  // Transition & Crossfade timing
  private _transitionProgress = 1.0; // 0.0 to 1.0
  private _crossfadeDuration = 0.25; // seconds
  private _stateElapsedTime = 0.0;   // seconds in currentState
  private _globalElapsedTime = 0.0;  // seconds total

  // Procedural Blink Timer
  private _blinkTimer = 0.0;
  private _nextBlinkInterval = 3.5;

  constructor(vrm?: VRMLike | null, options?: ControllerOptions) {
    this._vrm = vrm ?? null;
    this._persona = options?.initialPersona ?? "eli";
    this._currentState = options?.initialState ?? "idle";
  }

  public get state(): AvatarInteractionState {
    return this._currentState;
  }

  public get previousState(): AvatarInteractionState | null {
    return this._previousState;
  }

  public get persona(): PersonaId {
    return this._persona;
  }

  public get dampedValues(): PoseStateValues | null {
    return this._dampedValues;
  }

  public get transitionProgress(): number {
    return this._transitionProgress;
  }

  public get isCrossfading(): boolean {
    return this._transitionProgress < 1.0;
  }

  public get crossfadeDuration(): number {
    return this._crossfadeDuration;
  }

  public get vrm(): VRMLike | null {
    return this._vrm;
  }

  public setVRM(vrm: VRMLike | null): void {
    this._vrm = vrm;
  }

  public setPersona(persona: PersonaId): void {
    this._persona = persona;
  }

  /**
   * Request transition to a new avatar interaction state.
   */
  public transitionTo(
    targetState: AvatarInteractionState,
    options?: { crossfadeDurationMs?: number }
  ): boolean {
    if (this._currentState === targetState) {
      return true;
    }

    this._previousState = this._currentState;
    this._currentState = targetState;
    this._stateElapsedTime = 0.0;
    this._transitionProgress = 0.0;

    // Crossfade duration: 150ms (0.15s) for error preemption, 250ms (0.25s) for other transitions
    if (options?.crossfadeDurationMs !== undefined) {
      this._crossfadeDuration = Math.max(0.01, options.crossfadeDurationMs / 1000);
    } else {
      this._crossfadeDuration = targetState === "error" ? 0.15 : 0.25;
    }

    return true;
  }

  /**
   * Per-frame animation tick.
   * @param deltaTime Elapsed frame time in seconds (e.g. 0.016 for 60fps)
   */
  public update(deltaTime: number): void {
    const dt = Math.max(0, deltaTime);
    this._globalElapsedTime += dt;
    this._stateElapsedTime += dt;

    // Advance crossfade progress
    if (this._transitionProgress < 1.0) {
      this._transitionProgress += dt / this._crossfadeDuration;
      if (this._transitionProgress >= 1.0) {
        this._transitionProgress = 1.0;
      }
    }

    // Update periodic blink in idle
    this._updateBlink(dt);

    // Compute pose & expressions for current state
    const currentValues = this._evaluateState(
      this._currentState,
      this._stateElapsedTime,
      this._globalElapsedTime
    );

    let finalValues: PoseStateValues;

    if (this._transitionProgress < 1.0 && this._previousState) {
      const prevValues = this._evaluateState(
        this._previousState,
        this._stateElapsedTime,
        this._globalElapsedTime
      );
      const t = smoothstep(0, 1, this._transitionProgress);
      finalValues = this._lerpPoseValues(prevValues, currentValues, t);
    } else {
      finalValues = currentValues;
    }

    // Staggered exponential bone damping pass
    if (!this._dampedValues) {
      this._dampedValues = this._clonePoseValues(finalValues);
    } else {
      const lambdaHead = this._currentState === "error" ? 8.5 : 4.5;
      const lambdaNeck = this._currentState === "error" ? 8.5 : 4.5;
      const lambdaTorso = 3.0;
      const lambdaArms = 3.0;
      const lambdaExpressions = this._currentState === "error" ? 10.0 : 5.0;

      // Damp Head & Neck
      this._dampRotation(this._dampedValues.head, finalValues.head, lambdaHead, dt);
      this._dampRotation(this._dampedValues.neck, finalValues.neck, lambdaNeck, dt);

      // Damp Torso (Spine, Chest, UpperChest)
      this._dampRotation(this._dampedValues.spine, finalValues.spine, lambdaTorso, dt);
      this._dampRotation(this._dampedValues.chest, finalValues.chest, lambdaTorso, dt);
      this._dampRotation(this._dampedValues.upperChest, finalValues.upperChest, lambdaTorso, dt);

      // Damp Arms
      this._dampRotation(this._dampedValues.leftUpperArm, finalValues.leftUpperArm, lambdaArms, dt);
      this._dampRotation(this._dampedValues.rightUpperArm, finalValues.rightUpperArm, lambdaArms, dt);
      this._dampRotation(this._dampedValues.leftLowerArm, finalValues.leftLowerArm, lambdaArms, dt);
      this._dampRotation(this._dampedValues.rightLowerArm, finalValues.rightLowerArm, lambdaArms, dt);

      // Damp Expressions
      const allExprKeys = new Set([
        ...Object.keys(this._dampedValues.expressions),
        ...Object.keys(finalValues.expressions),
      ]);
      for (const key of allExprKeys) {
        const curr = this._dampedValues.expressions[key] ?? 0;
        const target = finalValues.expressions[key] ?? 0;
        this._dampedValues.expressions[key] = damp(curr, target, lambdaExpressions, dt);
      }
    }

    if (!this._vrm) return;

    // Apply damped values to VRM bones and expressions
    this._applyPoseValues(this._dampedValues);
  }

  private _dampRotation(
    current: MockRotation,
    target: MockRotation,
    lambda: number,
    dt: number
  ): void {
    current.x = damp(current.x, target.x, lambda, dt);
    current.y = damp(current.y, target.y, lambda, dt);
    current.z = damp(current.z, target.z, lambda, dt);
  }

  private _clonePoseValues(src: PoseStateValues): PoseStateValues {
    return {
      head: { ...src.head },
      neck: { ...src.neck },
      spine: { ...src.spine },
      chest: { ...src.chest },
      upperChest: { ...src.upperChest },
      leftUpperArm: { ...src.leftUpperArm },
      rightUpperArm: { ...src.rightUpperArm },
      leftLowerArm: { ...src.leftLowerArm },
      rightLowerArm: { ...src.rightLowerArm },
      expressions: { ...src.expressions },
    };
  }

  private _evaluateThinkingChoreography(
    stateTime: number,
    globalTime: number
  ): ThinkingSubPose {
    const cycleDuration = 10.5;
    const phaseDuration = 3.5;
    const cycleTime =
      ((stateTime % cycleDuration) + cycleDuration) % cycleDuration;
    const phaseIndex = Math.floor(cycleTime / phaseDuration);
    const phaseProgress = (cycleTime % phaseDuration) / phaseDuration;
    const t = smoothstep(0, 1, phaseProgress);

    const lerpRot = (
      a: MockRotation,
      b: MockRotation,
      factor: number
    ): MockRotation => ({
      x: a.x + (b.x - a.x) * factor,
      y: a.y + (b.y - a.y) * factor,
      z: a.z + (b.z - a.z) * factor,
    });

    let fromPose: ThinkingSubPose;
    let toPose: ThinkingSubPose;

    if (phaseIndex === 0) {
      fromPose = THINKING_PHASE_A;
      toPose = THINKING_PHASE_B;
    } else if (phaseIndex === 1) {
      fromPose = THINKING_PHASE_B;
      toPose = THINKING_PHASE_C;
    } else {
      fromPose = THINKING_PHASE_C;
      toPose = THINKING_PHASE_A;
    }

    const neck = lerpRot(fromPose.neck, toPose.neck, t);
    const head = lerpRot(fromPose.head, toPose.head, t);
    const upperChest = lerpRot(fromPose.upperChest, toPose.upperChest, t);
    const chest = lerpRot(fromPose.chest, toPose.chest, t);
    const spine = lerpRot(fromPose.spine, toPose.spine, t);
    const rightUpperArm = lerpRot(fromPose.rightUpperArm, toPose.rightUpperArm, t);
    const rightLowerArm = lerpRot(fromPose.rightLowerArm, toPose.rightLowerArm, t);

    // Continuous calm breathing layer (0.35–0.45 rad/s frequency)
    const calmBreath = Math.sin(globalTime * 0.40 * Math.PI * 2) * 0.008;
    chest.x += calmBreath;
    spine.x += calmBreath * 0.7;

    // Subtle sway micro-motion
    head.z += Math.sin(globalTime * 1.0) * 0.015;

    return {
      neck,
      head,
      upperChest,
      chest,
      spine,
      rightUpperArm,
      rightLowerArm,
    };
  }

  private _updateBlink(dt: number): void {
    this._blinkTimer += dt;
    if (this._blinkTimer > this._nextBlinkInterval + 0.2) {
      this._blinkTimer = 0.0;
      this._nextBlinkInterval = 2.5 + Math.random() * 3.0; // Random interval 2.5s - 5.5s
    }
  }

  /**
   * Evaluates discrete procedural bone rotations and expression blendshapes for a given state.
   */
  private _evaluateState(
    state: AvatarInteractionState,
    stateTime: number,
    globalTime: number
  ): PoseStateValues {
    const head: MockRotation = { x: 0, y: 0, z: 0 };
    const neck: MockRotation = { x: 0, y: 0, z: 0 };
    const spine: MockRotation = { x: 0, y: 0, z: 0 };
    const chest: MockRotation = { x: 0, y: 0, z: 0 };
    const upperChest: MockRotation = { x: 0, y: 0, z: 0 };

    // Natural Relaxed Arm Posture (downward along torso with slight asymmetry to eliminate stiff A-pose)
    const leftUpperArm: MockRotation = { x: 0.02, y: -0.06, z: -1.33 };
    const rightUpperArm: MockRotation = { x: -0.02, y: 0.08, z: 1.30 };
    const leftLowerArm: MockRotation = { x: -0.35, y: -0.22, z: -0.03 };
    const rightLowerArm: MockRotation = { x: 0.32, y: 0.25, z: 0.04 };

    const expressions: Record<string, number> = {
      blink: 0,
      happy: 0,
      sad: 0,
      surprised: 0,
      relaxed: 0,
      aa: 0,
      ih: 0,
      ou: 0,
      ee: 0,
      oh: 0,
    };

    switch (state) {
      case "idle": {
        // Subtle breathing oscillation on chest and spine
        chest.x = Math.sin(globalTime * 1.8) * 0.015;
        spine.x = Math.sin(globalTime * 1.8) * 0.01;
        // Gentle resting head sway
        head.y = Math.sin(globalTime * 0.5) * 0.02;
        head.z = Math.cos(globalTime * 0.4) * 0.01;
        // Natural blink pulse
        if (this._blinkTimer >= this._nextBlinkInterval) {
          const blinkProgress = (this._blinkTimer - this._nextBlinkInterval) / 0.2;
          expressions.blink = Math.sin(blinkProgress * Math.PI);
        }
        expressions.relaxed = 0.3;
        break;
      }

      case "thinking": {
        // Dynamic ~10.5s cyclic contemplative choreography across Phase A, B, and C
        const choreo = this._evaluateThinkingChoreography(stateTime, globalTime);

        neck.x = choreo.neck.x;
        neck.y = choreo.neck.y;
        neck.z = choreo.neck.z;

        head.x = choreo.head.x;
        head.y = choreo.head.y;
        head.z = choreo.head.z;

        upperChest.x = choreo.upperChest.x;
        upperChest.y = choreo.upperChest.y;
        upperChest.z = choreo.upperChest.z;

        chest.x = choreo.chest.x;
        chest.y = choreo.chest.y;
        chest.z = choreo.chest.z;

        spine.x = choreo.spine.x;
        spine.y = choreo.spine.y;
        spine.z = choreo.spine.z;

        rightUpperArm.x = choreo.rightUpperArm.x;
        rightUpperArm.y = choreo.rightUpperArm.y;
        rightUpperArm.z = choreo.rightUpperArm.z;

        rightLowerArm.x = choreo.rightLowerArm.x;
        rightLowerArm.y = choreo.rightLowerArm.y;
        rightLowerArm.z = choreo.rightLowerArm.z;

        leftUpperArm.x = 0.02;
        leftUpperArm.y = -0.06;
        leftUpperArm.z = -1.33;

        leftLowerArm.x = -0.35;
        leftLowerArm.y = -0.22;
        leftLowerArm.z = -0.03;

        expressions.relaxed = 0.25;
        break;
      }

      case "executing": {
        // Attentive forward lean + horizontal scanning micro-motion
        spine.x = 0.035;
        head.x = 0.03;
        head.y = Math.sin(globalTime * 4.0) * 0.035; // Scanning inspection rhythm
        break;
      }

      case "speaking": {
        // Rhythmic conversational head nod & inflection
        head.x = Math.sin(globalTime * 5.0) * 0.03;
        head.y = Math.sin(globalTime * 2.5) * 0.02;
        // Conversational vowel oscillation rhythm
        expressions.aa = Math.max(0, Math.sin(globalTime * 10.0) * 0.55);
        expressions.oh = Math.max(0, Math.cos(globalTime * 8.0) * 0.3);
        expressions.happy = 0.35;
        break;
      }

      case "success": {
        // Affirmative head nod gesture with ease-out curve + subtle tilt
        const nodProgress = Math.min(stateTime, 1.2);
        const easeOutFactor = 1.0 - Math.min(1.0, stateTime / 1.5);
        head.x = Math.sin(nodProgress * Math.PI * 2.0) * 0.07 * easeOutFactor;
        head.z = 0.06; // Subtle head tilt
        // Warm subtle smile (calibrated happy ~0.40 blended with relaxed ~0.55 instead of wide mouth open)
        expressions.happy = 0.40;
        expressions.relaxed = 0.55;
        break;
      }

      case "error": {
        // Startled slight pullback + head shake
        head.x = -0.05;
        head.y = Math.sin(Math.min(stateTime, 1.2) * 8.0) * 0.07; // Rapid head shake
        expressions.surprised = 0.7;
        expressions.sad = 0.5;
        break;
      }
    }

    return {
      head,
      neck,
      spine,
      chest,
      upperChest,
      leftUpperArm,
      rightUpperArm,
      leftLowerArm,
      rightLowerArm,
      expressions,
    };
  }

  private _lerpPoseValues(
    a: PoseStateValues,
    b: PoseStateValues,
    t: number
  ): PoseStateValues {
    const lerp = (start: number, end: number) => start + (end - start) * t;

    const head: MockRotation = {
      x: lerp(a.head.x, b.head.x),
      y: lerp(a.head.y, b.head.y),
      z: lerp(a.head.z, b.head.z),
    };
    const neck: MockRotation = {
      x: lerp(a.neck.x, b.neck.x),
      y: lerp(a.neck.y, b.neck.y),
      z: lerp(a.neck.z, b.neck.z),
    };
    const spine: MockRotation = {
      x: lerp(a.spine.x, b.spine.x),
      y: lerp(a.spine.y, b.spine.y),
      z: lerp(a.spine.z, b.spine.z),
    };
    const chest: MockRotation = {
      x: lerp(a.chest.x, b.chest.x),
      y: lerp(a.chest.y, b.chest.y),
      z: lerp(a.chest.z, b.chest.z),
    };
    const upperChest: MockRotation = {
      x: lerp(a.upperChest.x, b.upperChest.x),
      y: lerp(a.upperChest.y, b.upperChest.y),
      z: lerp(a.upperChest.z, b.upperChest.z),
    };
    const leftUpperArm: MockRotation = {
      x: lerp(a.leftUpperArm.x, b.leftUpperArm.x),
      y: lerp(a.leftUpperArm.y, b.leftUpperArm.y),
      z: lerp(a.leftUpperArm.z, b.leftUpperArm.z),
    };
    const rightUpperArm: MockRotation = {
      x: lerp(a.rightUpperArm.x, b.rightUpperArm.x),
      y: lerp(a.rightUpperArm.y, b.rightUpperArm.y),
      z: lerp(a.rightUpperArm.z, b.rightUpperArm.z),
    };
    const leftLowerArm: MockRotation = {
      x: lerp(a.leftLowerArm.x, b.leftLowerArm.x),
      y: lerp(a.leftLowerArm.y, b.leftLowerArm.y),
      z: lerp(a.leftLowerArm.z, b.leftLowerArm.z),
    };
    const rightLowerArm: MockRotation = {
      x: lerp(a.rightLowerArm.x, b.rightLowerArm.x),
      y: lerp(a.rightLowerArm.y, b.rightLowerArm.y),
      z: lerp(a.rightLowerArm.z, b.rightLowerArm.z),
    };

    const expressions: Record<string, number> = {};
    const allKeys = new Set([
      ...Object.keys(a.expressions),
      ...Object.keys(b.expressions),
    ]);

    for (const key of allKeys) {
      const valA = a.expressions[key] ?? 0;
      const valB = b.expressions[key] ?? 0;
      expressions[key] = lerp(valA, valB);
    }

    return {
      head,
      neck,
      spine,
      chest,
      upperChest,
      leftUpperArm,
      rightUpperArm,
      leftLowerArm,
      rightLowerArm,
      expressions,
    };
  }

  private _applyPoseValues(values: PoseStateValues): void {
    if (!this._vrm) return;

    const humanoid = this._vrm.humanoid;
    const expressionManager = this._vrm.expressionManager;

    const getBone = (name: string): MockBoneNode | null | undefined => {
      if (!humanoid) return null;
      return (
        humanoid.getNormalizedBoneNode?.(name) ??
        humanoid.getRawBoneNode?.(name)
      );
    };

    const headBone = getBone("head");
    if (headBone) {
      headBone.rotation.x = values.head.x;
      headBone.rotation.y = values.head.y;
      headBone.rotation.z = values.head.z;
    }

    const neckBone = getBone("neck");
    if (neckBone) {
      neckBone.rotation.x = values.neck.x;
      neckBone.rotation.y = values.neck.y;
      neckBone.rotation.z = values.neck.z;
    }

    const spineBone = getBone("spine");
    if (spineBone) {
      spineBone.rotation.x = values.spine.x;
      spineBone.rotation.y = values.spine.y;
      spineBone.rotation.z = values.spine.z;
    }

    const chestBone = getBone("chest");
    if (chestBone) {
      chestBone.rotation.x = values.chest.x;
      chestBone.rotation.y = values.chest.y;
      chestBone.rotation.z = values.chest.z;
    }

    const upperChestBone = getBone("upperChest");
    if (upperChestBone) {
      upperChestBone.rotation.x = values.upperChest.x;
      upperChestBone.rotation.y = values.upperChest.y;
      upperChestBone.rotation.z = values.upperChest.z;
    }

    const leftUpperArmBone = getBone("leftUpperArm");
    if (leftUpperArmBone) {
      leftUpperArmBone.rotation.x = values.leftUpperArm.x;
      leftUpperArmBone.rotation.y = values.leftUpperArm.y;
      leftUpperArmBone.rotation.z = values.leftUpperArm.z;
    }

    const rightUpperArmBone = getBone("rightUpperArm");
    if (rightUpperArmBone) {
      rightUpperArmBone.rotation.x = values.rightUpperArm.x;
      rightUpperArmBone.rotation.y = values.rightUpperArm.y;
      rightUpperArmBone.rotation.z = values.rightUpperArm.z;
    }

    const leftLowerArmBone = getBone("leftLowerArm");
    if (leftLowerArmBone) {
      leftLowerArmBone.rotation.x = values.leftLowerArm.x;
      leftLowerArmBone.rotation.y = values.leftLowerArm.y;
      leftLowerArmBone.rotation.z = values.leftLowerArm.z;
    }

    const rightLowerArmBone = getBone("rightLowerArm");
    if (rightLowerArmBone) {
      rightLowerArmBone.rotation.x = values.rightLowerArm.x;
      rightLowerArmBone.rotation.y = values.rightLowerArm.y;
      rightLowerArmBone.rotation.z = values.rightLowerArm.z;
    }

    if (expressionManager) {
      for (const [name, val] of Object.entries(values.expressions)) {
        expressionManager.setValue(name, val);
      }
    }
  }
}
