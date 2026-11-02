"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { type CardTextures, disposeCardTextures, getCardTextures } from "./email-textures";
import { PROVIDERS, SAMPLE_MAILS } from "./providers";

const Z_FAR = -46;
const Z_NEAR = 5;
/** Cards switch from "raw mail" to "sorted" once they pass the scan ring. */
const RING_Z = -14;
const LOOP_SECONDS = 15;
const CARD_WIDTH = 3.2;
const CARD_HEIGHT = 2;
const BACKGROUND = "#0a0f23";

const smoothstep = THREE.MathUtils.smoothstep;

/** Deterministic pseudo-random in [0, 1) so the scene looks the same on every load. */
function rand(seed: number): number {
  const value = Math.sin(seed * 127.1) * 43758.5453;
  return value - Math.floor(value);
}

type CardSpec = {
  offset: number;
  x: number;
  y: number;
  roll: number;
  textures: CardTextures;
};

function makeCards(count: number): CardSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = i * 2.399963; // golden angle spreads cards evenly around the axis
    const radius = 2.4 + rand(i + 1) * 5.2;
    return {
      offset: i / count,
      x: Math.cos(angle) * radius * 1.35,
      y: Math.sin(angle) * radius * 0.75,
      roll: (rand(i + 50) - 0.5) * 0.24,
      textures: getCardTextures(
        PROVIDERS[i % PROVIDERS.length],
        SAMPLE_MAILS[(i * 3) % SAMPLE_MAILS.length],
      ),
    };
  });
}

function Card({ spec }: { spec: CardSpec }) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const node = mesh.current;
    const mat = material.current;
    if (!node || !mat) return;

    const t = clock.elapsedTime;
    const progress = (t / LOOP_SECONDS + spec.offset) % 1;
    const z = Z_FAR + (Z_NEAR - Z_FAR) * progress;
    const drift = Math.sin(t * 0.5 + spec.offset * 12) * 0.18;

    node.position.set(spec.x, spec.y + drift, z);
    node.rotation.set(spec.y * 0.025, spec.x * -0.03, spec.roll);
    mat.opacity = smoothstep(progress, 0, 0.1) * (1 - smoothstep(progress, 0.84, 1));

    const map = z > RING_Z ? spec.textures.sorted : spec.textures.raw;
    if (mat.map !== map) mat.map = map;
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
      <Tunnel />
      <CameraRig />
    </Canvas>
  );
}
