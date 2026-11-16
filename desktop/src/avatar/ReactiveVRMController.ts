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
  sora: "/models/ELI_Model.vrm", // Fallback to ELI
  rin: "/models/REI_Model.vrm",  // Fallback to REI
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
  spine: MockRotation;
  chest: MockRotation;
  expressions: Record<string, number>;
}

export interface ControllerOptions {
  initialPersona?: PersonaId;
  initialState?: AvatarInteractionState;
}

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

    if (!this._vrm) return;

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

    // Apply to VRM bones and expressions
    this._applyPoseValues(finalValues);
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
    const spine: MockRotation = { x: 0, y: 0, z: 0 };
    const chest: MockRotation = { x: 0, y: 0, z: 0 };
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
        // Contemplative slight head tilt & pitch (looking slightly up/aside)
        head.z = 0.07 + Math.sin(globalTime * 1.2) * 0.01;
        head.x = -0.05;
        head.y = 0.04;
        expressions.relaxed = 0.1;
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
        // Affirmative head nod gesture
        head.x = Math.sin(Math.min(stateTime, 1.5) * 4.0) * 0.08;
        expressions.happy = 0.85;
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

    return { head, spine, chest, expressions };
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

    return { head, spine, chest, expressions };
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

    if (expressionManager) {
      for (const [name, val] of Object.entries(values.expressions)) {
        expressionManager.setValue(name, val);
      }
    }
  }
}
