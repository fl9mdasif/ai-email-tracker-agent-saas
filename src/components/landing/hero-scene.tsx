"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  CARD_PIXELS,
  type CardTextures,
  disposeCardTextures,
  getCardTextures,
  getGlowTexture,
} from "./email-textures";
import { PROVIDERS, SAMPLE_MAILS } from "./providers";

const Z_FAR = -46;
const Z_NEAR = 5;
/** Cards switch from "raw mail" to "sorted" once they pass the scan ring. */
const RING_Z = -14;
const LOOP_SECONDS = 15;
const CARD_WIDTH = 3.2;
const CARD_HEIGHT = 2;
const BACKGROUND = "#0a0f23";

/** Fly-in: each card appears in turn, 0.8 s, easing out like cubic-bezier(.16, 1, .3, 1). */
const INTRO_DELAYS = [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8];
const INTRO_SECONDS = 0.8;
/** World units the card starts behind its place (the translateZ(-200px) equivalent). */
const INTRO_DEPTH = 8;
/** Float: each card bobs on its own period (seconds), about 6 px tall. */
const FLOAT_PERIODS = [3, 3.5, 4, 4.2, 3.8];
const FLOAT_AMPLITUDE = 0.14;
/** HOT LEAD glow pulse period in seconds. */
const HOT_PULSE_SECONDS = 2;
/** Orbit ring: one full turn takes this long. */
const ORBIT_SECONDS = 30;

const smoothstep = THREE.MathUtils.smoothstep;
const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));

/** Deterministic pseudo-random in [0, 1) so the scene looks the same on every load. */
function rand(seed: number): number {
  const value = Math.sin(seed * 127.1) * 43758.5453;
  return value - Math.floor(value);
}

/** Soft red glow behind a HOT LEAD chip, in card-local world units. */
type GlowSpec = { x: number; y: number; width: number; height: number; texture: THREE.Texture };

type CardSpec = {
  offset: number;
  x: number;
  y: number;
  roll: number;
  textures: CardTextures;
  introDelay: number;
  floatPeriod: number;
  floatPhase: number;
  glow: GlowSpec | null;
};

function makeCards(count: number): CardSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = i * 2.399963; // golden angle spreads cards evenly around the axis
    const radius = 2.4 + rand(i + 1) * 5.2;
    const mail = SAMPLE_MAILS[(i * 3) % SAMPLE_MAILS.length];
    const textures = getCardTextures(PROVIDERS[i % PROVIDERS.length], mail);
    const chip = textures.chip;
    return {
      offset: i / count,
      x: Math.cos(angle) * radius * 1.35,
      y: Math.sin(angle) * radius * 0.75,
      roll: (rand(i + 50) - 0.5) * 0.24,
      textures,
      introDelay: INTRO_DELAYS[i % INTRO_DELAYS.length],
      floatPeriod: FLOAT_PERIODS[i % FLOAT_PERIODS.length],
      floatPhase: rand(i + 80) * Math.PI * 2,
      glow:
        mail.chip === "HOT LEAD" && chip
          ? {
              x: (chip.cx / CARD_PIXELS.width - 0.5) * CARD_WIDTH,
              y: (0.5 - chip.cy / CARD_PIXELS.height) * CARD_HEIGHT,
              width: (chip.width / CARD_PIXELS.width) * CARD_WIDTH * 2.4,
              height: 1,
              texture: getGlowTexture(),
            }
          : null,
    };
  });
}

function Card({ spec }: { spec: CardSpec }) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const glowMaterial = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const node = mesh.current;
    const mat = material.current;
    if (!node || !mat) return;

    const t = clock.elapsedTime;
    const progress = (t / LOOP_SECONDS + spec.offset) % 1;
    const loopZ = Z_FAR + (Z_NEAR - Z_FAR) * progress;

    // Fly-in: start deeper and smaller, settle into the loop position.
    const intro = easeOutExpo(THREE.MathUtils.clamp((t - spec.introDelay) / INTRO_SECONDS, 0, 1));
    // Float: gentle bob on the card's own period, only once it has arrived.
    const bob = Math.sin((t / spec.floatPeriod) * Math.PI * 2 + spec.floatPhase) * FLOAT_AMPLITUDE * intro;

    node.position.set(spec.x, spec.y + bob, loopZ - (1 - intro) * INTRO_DEPTH);
    node.rotation.set(spec.y * 0.025, spec.x * -0.03, spec.roll);
    node.scale.setScalar(0.5 + 0.5 * intro);

    const fade = smoothstep(progress, 0, 0.1) * (1 - smoothstep(progress, 0.84, 1));
    mat.opacity = fade * intro;

    const map = loopZ > RING_Z ? spec.textures.sorted : spec.textures.raw;
    if (mat.map !== map) mat.map = map;

    // HOT LEAD glow: pulses every 2 s, only once the chip has appeared (past the ring).
    const glow = glowMaterial.current;
    if (glow) {
      const chipVisible = smoothstep(loopZ, RING_Z, RING_Z + 4);
      const pulse = 0.5 + 0.5 * Math.sin((t / HOT_PULSE_SECONDS) * Math.PI * 2);
      glow.opacity = (0.3 + 0.5 * pulse) * chipVisible * mat.opacity;
    }
  });

  return (
    <mesh ref={mesh}>
      <planeGeometry args={[CARD_WIDTH, CARD_HEIGHT]} />
      <meshBasicMaterial
        ref={material}
        map={spec.textures.raw}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
      {spec.glow ? (
        <mesh position={[spec.glow.x, spec.glow.y, 0.02]}>
          <planeGeometry args={[spec.glow.width, spec.glow.height]} />
          <meshBasicMaterial
            ref={glowMaterial}
            map={spec.glow.texture}
            color="#ef4444"
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ) : null}
    </mesh>
  );
}

function Tunnel() {
  const width = useThree((state) => state.size.width);
  const count = width < 640 ? 12 : 20;
  const cards = useMemo(() => makeCards(count), [count]);

  useEffect(() => () => disposeCardTextures(), []);

  return (
    <>
      {cards.map((spec, i) => (
        <Card key={i} spec={spec} />
      ))}
    </>
  );
}

/** Glowing portal the mail passes through; this is where the AI "reads" it. */
function ScanRing() {
  const ring = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const pulse = Math.sin(clock.elapsedTime * 1.6);
    ring.current?.scale.setScalar(1 + pulse * 0.025);
    const mat = halo.current?.material as THREE.MeshBasicMaterial | undefined;
    if (mat) mat.opacity = 0.16 + pulse * 0.05;
  });

  return (
    <group position={[0, 0, RING_Z]}>
      <mesh ref={ring}>
        <torusGeometry args={[8.6, 0.05, 12, 160]} />
        <meshBasicMaterial color="#a78bfa" toneMapped={false} />
      </mesh>
      <mesh ref={halo}>
        <torusGeometry args={[8.6, 0.5, 12, 160]} />
        <meshBasicMaterial
          color="#7c3aed"
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** Three bright arcs with a bead each, turning slowly around the scan ring. */
function Orbit() {
  const group = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.z += delta * ((Math.PI * 2) / ORBIT_SECONDS);
  });

  return (
    <group ref={group} position={[0, 0, RING_Z]}>
      {[0, 1, 2].map((i) => (
        <group key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]}>
          <mesh>
            <torusGeometry args={[9.5, 0.045, 8, 120, Math.PI * 0.55]} />
            <meshBasicMaterial color="#c4b5fd" transparent opacity={0.85} toneMapped={false} />
          </mesh>
          <mesh position={[9.5, 0, 0]}>
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshBasicMaterial color="#f5f3ff" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const DUST_COUNT = 140;
const DUST_SPEED = 6;

/** Fine light dust streaming toward the camera, faster than the cards, for extra depth. */
function Dust() {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const data = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i++) {
      data[i * 3] = (rand(i + 100) - 0.5) * 30;
      data[i * 3 + 1] = (rand(i + 300) - 0.5) * 18;
      data[i * 3 + 2] = Z_FAR + rand(i + 500) * (Z_NEAR - Z_FAR);
    }
    return data;
  }, []);

  useFrame((_, delta) => {
    const geometry = points.current?.geometry;
    if (!geometry) return;
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let i = 0; i < DUST_COUNT; i++) {
      const index = i * 3 + 2;
      array[index] += delta * DUST_SPEED;
      if (array[index] > Z_NEAR) array[index] = Z_FAR;
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#c4b5fd"
        size={0.09}
        sizeAttenuation
        transparent
        opacity={0.8}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}

/** Gentle camera parallax that follows the pointer. */
function CameraRig() {
  useFrame(({ camera, pointer }) => {
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointer.x * 0.9, 0.04);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, pointer.y * 0.6, 0.04);
    camera.lookAt(0, 0, -20);
  });
  return null;
}

export default function HeroScene({ active }: { active: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 10], fov: 50, near: 0.1, far: 120 }}
      frameloop={active ? "always" : "never"}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      aria-hidden
    >
      <fog attach="fog" args={[BACKGROUND, 14, 60]} />
      <Dust />
      <ScanRing />
      <Orbit />
      <Tunnel />
      <CameraRig />
    </Canvas>
  );
}
