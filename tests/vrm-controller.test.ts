import { describe, it, expect, beforeEach } from "vitest";
import {
  ReactiveVRMController,
  resolveModelPath,
  shouldReloadModel,
  MockBoneNode,
  VRMLike,
} from "../desktop/src/avatar/ReactiveVRMController.js";

describe("ReactiveVRMController & 3D Avatar Rendering Suite", () => {
  let mockBones: Record<string, MockBoneNode>;
  let mockExpressions: Record<string, number>;
  let mockVRM: VRMLike;
  let controller: ReactiveVRMController;

  beforeEach(() => {
    mockBones = {
      head: { rotation: { x: 0, y: 0, z: 0 } },
      neck: { rotation: { x: 0, y: 0, z: 0 } },
      spine: { rotation: { x: 0, y: 0, z: 0 } },
      chest: { rotation: { x: 0, y: 0, z: 0 } },
      upperChest: { rotation: { x: 0, y: 0, z: 0 } },
      leftUpperArm: { rotation: { x: 0, y: 0, z: 0 } },
      rightUpperArm: { rotation: { x: 0, y: 0, z: 0 } },
      leftLowerArm: { rotation: { x: 0, y: 0, z: 0 } },
      rightLowerArm: { rotation: { x: 0, y: 0, z: 0 } },
    };
    mockExpressions = {};

    mockVRM = {
      humanoid: {
        getNormalizedBoneNode: (name: string) => mockBones[name] || null,
      },
      expressionManager: {
        setValue: (name: string, val: number) => {
          mockExpressions[name] = val;
        },
        getValue: (name: string) => mockExpressions[name] ?? 0,
      },
    };

    controller = new ReactiveVRMController(mockVRM, {
      initialPersona: "eli",
      initialState: "idle",
    });
  });

  // 1. Smart Persona-to-VRM Resolution & Graceful Fallback
  describe("Persona-to-VRM Model Resolution", () => {
    it("resolves exact models for primary personas and fallbacks for secondary personas", () => {
      expect(resolveModelPath("eli")).toBe("/models/ELI_Model.vrm");
      expect(resolveModelPath("rei")).toBe("/models/REI_Model.vrm");
      expect(resolveModelPath("rin")).toBe("/models/RIN_Model.vrm");  // Dedicated RIN model
      expect(resolveModelPath("sora")).toBe("/models/ELI_Model.vrm"); // Fallback to ELI
    });

    it("identifies when VRM model reload is required vs. in-place persona switch", () => {
      // Switching between personas sharing the same underlying model mesh requires NO reload
      expect(shouldReloadModel("eli", "sora")).toBe(false);
      expect(shouldReloadModel("sora", "eli")).toBe(false);

      // Switching between different 3D meshes requires a model reload
      expect(shouldReloadModel("eli", "rei")).toBe(true);
      expect(shouldReloadModel("eli", "rin")).toBe(true);
      expect(shouldReloadModel("rei", "rin")).toBe(true);
      expect(shouldReloadModel("sora", "rin")).toBe(true);
      expect(shouldReloadModel("rei", "sora")).toBe(true);
    });
  });

  // 2. Smooth Crossfade Weight Interpolation
  describe("Crossfade Timing & Weight Interpolation", () => {
    it("applies standard 250ms crossfade duration for normal transitions", () => {
      controller.transitionTo("thinking");
      expect(controller.state).toBe("thinking");
      expect(controller.previousState).toBe("idle");
      expect(controller.crossfadeDuration).toBe(0.25); // 250ms
      expect(controller.isCrossfading).toBe(true);
      expect(controller.transitionProgress).toBe(0.0);

      // Advance halfway (125ms)
      controller.update(0.125);
      expect(controller.transitionProgress).toBeCloseTo(0.5, 2);
      expect(controller.isCrossfading).toBe(true);

      // Advance remaining halfway (125ms)
      controller.update(0.125);
      expect(controller.transitionProgress).toBe(1.0);
      expect(controller.isCrossfading).toBe(false);
    });

    it("applies fast 150ms crossfade duration for preemptive error transitions", () => {
      controller.transitionTo("error");
      expect(controller.state).toBe("error");
      expect(controller.crossfadeDuration).toBe(0.15); // 150ms fast preemption
      expect(controller.isCrossfading).toBe(true);

      // Advance 75ms (halfway)
      controller.update(0.075);
      expect(controller.transitionProgress).toBeCloseTo(0.5, 2);

      // Complete in 150ms total
      controller.update(0.075);
      expect(controller.transitionProgress).toBe(1.0);
      expect(controller.isCrossfading).toBe(false);
    });
  });

  // 3. Discrete Procedural Poses & Blendshapes for all 6 States
  describe("Deterministic Bone Targets & Expression Blendshapes", () => {
    it("idle state activates breathing oscillation and relaxed expression", () => {
      controller.update(0.5); // Advance frame in idle
      expect(mockBones.chest.rotation.x).not.toBe(0); // Breathing oscillation
      expect(mockBones.spine.rotation.x).not.toBe(0);
      expect(mockExpressions.relaxed).toBeCloseTo(0.3, 2);
    });

    it("thinking state activates contemplative head + neck tilt, upper-body asymmetry, and arm poise", () => {
      controller.transitionTo("thinking");
      controller.update(0.25); // Complete crossfade
      controller.update(0.1);

      // Distributed Head + Neck Tilt (total ~11°-14° lateral tilt)
      expect(mockBones.neck.rotation.z).toBeCloseTo(0.07, 2);
      expect(mockBones.neck.rotation.x).toBeCloseTo(-0.04, 2);
      expect(mockBones.neck.rotation.y).toBeCloseTo(0.05, 2);

      expect(mockBones.head.rotation.z).toBeGreaterThan(0.12); // ~0.14 lateral tilt
      expect(mockBones.head.rotation.x).toBeCloseTo(-0.06, 2);
      expect(mockBones.head.rotation.y).toBeCloseTo(0.08, 2);

      // Upper-body asymmetry
      expect(mockBones.upperChest.rotation.z).toBeCloseTo(-0.03, 2);
      expect(mockBones.chest.rotation.z).toBeCloseTo(-0.015, 2);
      expect(mockBones.spine.rotation.x).toBeCloseTo(0.01, 2);

      // Contemplative arm poise
      expect(mockBones.rightUpperArm.rotation.x).toBeCloseTo(0.06, 2);
      expect(mockBones.rightLowerArm.rotation.x).toBeCloseTo(0.38, 2);
      expect(mockBones.leftUpperArm.rotation.z).toBeCloseTo(-1.22, 2);

      // Relaxed blendshape
      expect(mockExpressions.relaxed).toBeCloseTo(0.25, 2);
    });

    it("resets neck and upperChest to default in idle state", () => {
      controller.transitionTo("thinking");
      controller.update(0.25);
      controller.update(0.5);
      expect(mockBones.neck.rotation.z).toBeGreaterThan(0);

      controller.transitionTo("idle");
      controller.update(0.25); // Complete crossfade
      controller.update(0.8);  // Allow physical exponential damping to settle
      expect(mockBones.neck.rotation.z).toBeCloseTo(0, 2);
      expect(mockBones.upperChest.rotation.z).toBeCloseTo(0, 2);
    });

    it("executing state activates forward lean and scanning motion", () => {
      controller.transitionTo("executing");
      controller.update(0.25); // Complete crossfade
      controller.update(0.1);

      // Attentive forward lean (spine x > 0, head x > 0)
      expect(mockBones.spine.rotation.x).toBeGreaterThan(0.02);
      expect(mockBones.head.rotation.x).toBeGreaterThan(0.01);
    });

    it("speaking state activates conversational head motion and dynamic vowel blendshapes", () => {
      controller.transitionTo("speaking");
      controller.update(0.25); // Complete crossfade
      controller.update(0.15);

      // Conversational vowel blendshape activation
      expect(mockExpressions.happy).toBeCloseTo(0.35, 2);
      expect(mockExpressions.aa).toBeGreaterThanOrEqual(0);
      expect(mockExpressions.oh).toBeGreaterThanOrEqual(0);
    });

    it("success state activates affirmative head nod, subtle tilt, and calibrated warm smile", () => {
      controller.transitionTo("success");
      controller.update(0.25); // Complete crossfade
      controller.update(0.1);

      // Calibrated warm subtle smile: happy 0.40 blended with relaxed 0.55
      expect(mockExpressions.happy).toBeCloseTo(0.40, 2);
      expect(mockExpressions.relaxed).toBeCloseTo(0.55, 2);
      // Subtle head tilt
      expect(mockBones.head.rotation.z).toBeCloseTo(0.06, 2);
    });

    it("maintains natural relaxed downward arm posture across states", () => {
      controller.update(0.1); // in idle
      expect(mockBones.leftUpperArm.rotation.z).toBeCloseTo(-1.22, 2);
      expect(mockBones.rightUpperArm.rotation.z).toBeCloseTo(1.20, 2);
      expect(mockBones.leftLowerArm.rotation.x).toBeLessThan(0); // elbow bend

      controller.transitionTo("executing");
      controller.update(0.25);
      expect(mockBones.leftUpperArm.rotation.z).toBeCloseTo(-1.22, 2);
      expect(mockBones.rightUpperArm.rotation.z).toBeCloseTo(1.20, 2);
    });

    it("error state activates pullback, head shake, and surprised/sad expressions", () => {
      controller.transitionTo("error");
      controller.update(0.15); // Complete fast 150ms crossfade
      controller.update(0.1);

      // Startled pullback (head x < 0)
      expect(mockBones.head.rotation.x).toBeLessThan(0);
      expect(mockExpressions.surprised).toBeCloseTo(0.7, 2);
      expect(mockExpressions.sad).toBeCloseTo(0.5, 2);
    });
  });

  // 4. Organic Staggered Damping & Dynamic Motion Polish
  describe("Organic Staggered Damping & Dynamic Motion Polish", () => {
    it("exposes dampedValues and dampens bone trajectories monotonically without NaN or overshoot", () => {
      controller.update(0.016);
      expect(controller.dampedValues).not.toBeNull();

      controller.transitionTo("thinking");
      let prevHeadZ = controller.dampedValues!.head.z;

      for (let i = 0; i < 30; i++) {
        controller.update(0.016);
        const currentHeadZ = controller.dampedValues!.head.z;
        expect(Number.isFinite(currentHeadZ)).toBe(true);
        expect(Number.isNaN(currentHeadZ)).toBe(false);
        // During initial rise to Phase A (head.z target ~0.14), value should monotonically advance
        expect(currentHeadZ).toBeGreaterThanOrEqual(prevHeadZ - 0.001);
        prevHeadZ = currentHeadZ;
      }
    });

    it("smoothly modulates thinking choreography across Phase A, Phase B, and Phase C", () => {
      controller.transitionTo("thinking");

      // Phase A: ~0.0s - 3.5s (Right-Up Ponder)
      controller.update(0.5);
      const phaseAHeadZ = controller.dampedValues!.head.z;
      const phaseAHeadX = controller.dampedValues!.head.x;
      const phaseANeckZ = controller.dampedValues!.neck.z;
      expect(phaseAHeadZ).toBeGreaterThan(0.05); // Positive right lateral tilt
      expect(phaseANeckZ).toBeGreaterThan(0.02);
      expect(phaseAHeadX).toBeLessThan(0); // Looking upward slightly

      // Phase B: ~3.5s - 7.0s (Center-Down Mulling)
      controller.update(3.2); // Now at ~3.7s
      const phaseBHeadZ = controller.dampedValues!.head.z;
      const phaseBHeadX = controller.dampedValues!.head.x;
      expect(phaseBHeadZ).toBeLessThan(phaseAHeadZ); // Lateral tilt reduces towards center
      expect(phaseBHeadX).toBeGreaterThan(phaseAHeadX); // Pitch shifts forward/down

      // Phase C: ~7.0s - 10.5s (Left-Up Re-evaluate)
      controller.update(3.5); // Now at ~7.2s
      const phaseCHeadZ = controller.dampedValues!.head.z;
      const phaseCNeckZ = controller.dampedValues!.neck.z;
      expect(phaseCHeadZ).toBeLessThan(0); // Tilts left (negative z)
      expect(phaseCNeckZ).toBeLessThan(0);

      // Verify all rotations remain strictly bounded within safe ergonomic limits
      for (const z of [phaseAHeadZ, phaseBHeadZ, phaseCHeadZ]) {
        expect(Math.abs(z)).toBeLessThan(0.25);
      }
    });

    it("settles rapid error preemption with higher damping decay rate", () => {
      controller.transitionTo("error");
      // Advance by crossfade duration (0.15s) plus short settling (0.15s) = 0.3s
      controller.update(0.15);
      controller.update(0.15);

      const damped = controller.dampedValues!;
      expect(damped.expressions.surprised).toBeGreaterThanOrEqual(0.60);
      expect(damped.head.x).toBeLessThan(-0.04); // Rapid startled pullback settled
    });
  });

  // 5. VRM Attachment and Persona Updates
  describe("Controller State Management", () => {
    it("handles null VRM gracefully without throwing", () => {
      const nullController = new ReactiveVRMController(null);
      expect(() => {
        nullController.update(0.016);
        nullController.transitionTo("speaking");
      }).not.toThrow();
    });

    it("updates persona cleanly", () => {
      controller.setPersona("sora");
      expect(controller.persona).toBe("sora");
    });
  });
});
