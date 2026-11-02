"use client";

import { Html, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useTheme } from "next-themes";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const LANES = [
  { label: "Reply", color: "#7c6cff", y: 1.5 },
  { label: "Follow-up", color: "#f5a524", y: 0.5 },
  { label: "Hot lead", color: "#ef4444", y: -0.5 },
  { label: "FYI", color: "#38bdf8", y: -1.5 },
] as const;

const EMAIL_COUNT = 20;
const LOOP_SECONDS = 9;
const START_X = -4.4;
const END_X = 4.0;

const smooth = (u: number) => u * u * (3 - 2 * u);
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));

type EmailSpec = { offset: number; startY: number; startZ: number; lane: number; tilt: number };

function makeEmails(): EmailSpec[] {
  return Array.from({ length: EMAIL_COUNT }, (_, i) => ({
    offset: i / EMAIL_COUNT,
    // Deterministic spread so the scene looks the same on every load.
    startY: Math.sin(i * 2.399) * 1.7,
    startZ: Math.cos(i * 1.7) * 0.9,
    lane: (i * 7) % LANES.length,
    tilt: Math.sin(i * 1.3) * 0.25,
  }));
}

function Email({ spec, baseColor }: { spec: EmailSpec; baseColor: THREE.Color }) {
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const laneColor = useMemo(() => new THREE.Color(LANES[spec.lane].color), [spec.lane]);

  useFrame(({ clock }) => {
    const node = group.current;
    const mat = material.current;
    if (!node || !mat) return;

    const t = (clock.elapsedTime / LOOP_SECONDS + spec.offset) % 1;
    const laneY = LANES[spec.lane].y;

    if (t < 0.5) {
      // Inbound: drift from the left into the AI core.
      const u = smooth(t / 0.5);
      node.position.set(
        THREE.MathUtils.lerp(START_X, 0, u),
        THREE.MathUtils.lerp(spec.startY, 0, u) + Math.sin(t * 14 + spec.offset * 9) * 0.06,
        THREE.MathUtils.lerp(spec.startZ, 0, u),
      );
      node.scale.setScalar(1 - 0.75 * smooth(clamp01((u - 0.7) / 0.3)));
      mat.color.copy(baseColor);
      mat.emissive.set("#000000");
    } else {
      // Outbound: leave the core, take on the lane colour, settle in the lane.
      const u = smooth((t - 0.5) / 0.5);
      node.position.set(
        THREE.MathUtils.lerp(0, END_X, u),
        THREE.MathUtils.lerp(0, laneY, u),
        THREE.MathUtils.lerp(0, 0, u),
      );
      node.scale.setScalar(0.25 + 0.75 * smooth(clamp01(u / 0.25)));
      mat.color.copy(laneColor);
      mat.emissive.copy(laneColor).multiplyScalar(0.35);
    }
    node.rotation.z = spec.tilt * (t < 0.5 ? 1 - t * 2 : 0);
  });

  return (
    <group ref={group}>
      <RoundedBox args={[0.62, 0.42, 0.05]} radius={0.05} smoothness={3}>
        <meshStandardMaterial ref={material} roughness={0.45} metalness={0.1} />
      </RoundedBox>
      {/* envelope flap */}
      <mesh position={[-0.15, 0.06, 0.03]} rotation={[0, 0, -0.45]}>
        <boxGeometry args={[0.36, 0.022, 0.01]} />
        <meshBasicMaterial color="#1a1a2e" transparent opacity={0.35} />
      </mesh>
      <mesh position={[0.15, 0.06, 0.03]} rotation={[0, 0, 0.45]}>
        <boxGeometry args={[0.36, 0.022, 0.01]} />
        <meshBasicMaterial color="#1a1a2e" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

function AiCore() {
  const shell = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);

  useFrame(({ clock }, delta) => {
    if (shell.current) {
      shell.current.rotation.y += delta * 0.5;
      shell.current.rotation.x += delta * 0.2;
    }
    if (ring.current) ring.current.rotation.z += delta * 0.8;
    if (glow.current) glow.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 2.2) * 0.08);
  });

  return (
    <group>
      <mesh ref={glow}>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshStandardMaterial color="#6d5efc" emissive="#6d5efc" emissiveIntensity={1.4} />
      </mesh>
      <mesh ref={shell}>
        <icosahedronGeometry args={[0.95, 1]} />
        <meshBasicMaterial color="#9a8cff" wireframe transparent opacity={0.55} />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[1.25, 0.012, 8, 96]} />
        <meshBasicMaterial color="#c4baff" transparent opacity={0.8} />
      </mesh>
      <pointLight color="#8b7dff" intensity={14} distance={8} />
    </group>
  );
}

function LaneMarkers() {
  return (
    <>
      {LANES.map((lane) => (
        <group key={lane.label} position={[END_X + 0.75, lane.y, 0]}>
          <mesh>
            <boxGeometry args={[0.07, 0.62, 0.07]} />
            <meshBasicMaterial color={lane.color} />
          </mesh>
          <Html position={[0.55, 0, 0]} center style={{ pointerEvents: "none" }}>
            <span
              className="rounded-full border bg-background/80 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-foreground backdrop-blur"
              style={{ borderColor: lane.color }}
            >
              {lane.label}
            </span>
          </Html>
        </group>
      ))}
    </>
  );
}

/** Gentle camera parallax that follows the pointer. */
function CameraRig() {
  useFrame(({ camera, pointer }) => {
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointer.x * 0.6, 0.04);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, pointer.y * 0.4, 0.04);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function HeroScene({ active }: { active: boolean }) {
  const { resolvedTheme } = useTheme();
  const emails = useMemo(() => makeEmails(), []);
  const baseColor = useMemo(
    () => new THREE.Color(resolvedTheme === "dark" ? "#e3e6ff" : "#9aa0c8"),
    [resolvedTheme],
  );

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 9], fov: 42 }}
      frameloop={active ? "always" : "never"}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      aria-hidden
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 4, 5]} intensity={1.2} />
      <group rotation={[0, -0.28, 0]} scale={0.95}>
        <AiCore />
        {emails.map((spec, i) => (
          <Email key={i} spec={spec} baseColor={baseColor} />
        ))}
        <LaneMarkers />
      </group>
      <CameraRig />
    </Canvas>
  );
}
