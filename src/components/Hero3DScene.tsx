import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Stars } from "@react-three/drei";
import * as THREE from "three";

/* ── Candlestick Bar ── */
function CandlestickBar({ position, height, bodyHeight, color, delay }: {
  position: [number, number, number]; height: number; bodyHeight: number; color: string; delay: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = position[1] + Math.sin((clock.elapsedTime + delay) * 0.6) * 0.15;
    ref.current.rotation.y = Math.sin((clock.elapsedTime + delay) * 0.3) * 0.05;
  });
  return (
    <group ref={ref} position={position}>
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[0.04, height, 0.04]} />
        <meshStandardMaterial color={color} transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, bodyHeight / 2, 0]}>
        <boxGeometry args={[0.22, bodyHeight, 0.18]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.2} metalness={0.6} />
      </mesh>
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.6, 0.6]} />
        <meshBasicMaterial color={color} transparent opacity={0.1} />
      </mesh>
    </group>
  );
}

/* ── Floating Coin ── */
function FloatingCoin({ position, radius, color }: {
  position: [number, number, number]; radius: number; color: string;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.5;
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.3) * 0.2;
  });
  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.5}>
      <mesh ref={ref} position={position}>
        <cylinderGeometry args={[radius, radius, radius * 0.15, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} roughness={0.15} metalness={0.85} />
      </mesh>
    </Float>
  );
}

/* ── Grid ── */
function GridPlane() {
  const ref = useRef<THREE.GridHelper>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    (ref.current.material as THREE.Material).opacity = 0.06 + Math.sin(clock.elapsedTime * 0.5) * 0.02;
  });
  return <gridHelper ref={ref} args={[24, 48, "#10b981", "#10b981"]} position={[0, -1.2, 0]} />;
}

/* ── Pulse Line ── */
function PulseLine() {
  const lineRef = useRef<THREE.Line>(null);
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 80; i++) {
      const x = (i / 80) * 8 - 4;
      const y = Math.sin(i * 0.4) * 0.4 + Math.sin(i * 0.15) * 0.6;
      pts.push(new THREE.Vector3(x, y + 0.5, 0.5));
    }
    return pts;
  }, []);
  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);
  const material = useMemo(() => new THREE.LineBasicMaterial({ color: "#6eff9f", transparent: true, opacity: 0.5 }), []);

  useFrame(({ clock }) => {
    if (!lineRef.current) return;
    const pos = (lineRef.current.geometry as THREE.BufferGeometry).attributes.position;
    for (let i = 0; i <= 80; i++) {
      const y = Math.sin(i * 0.4 + clock.elapsedTime * 1.2) * 0.4 + Math.sin(i * 0.15 + clock.elapsedTime * 0.6) * 0.6;
      pos.setY(i, y + 0.5);
    }
    pos.needsUpdate = true;
  });

  return <primitive ref={lineRef} object={new THREE.Line(geometry, material)} />;
}

/* ── 3D Bar Chart ── */
function BarChart3D() {
  const ref = useRef<THREE.Group>(null);
  const bars = [
    { h: 0.8, color: "#10b981" },
    { h: 1.4, color: "#10b981" },
    { h: 1.0, color: "#ff6b6b" },
    { h: 1.8, color: "#10b981" },
    { h: 2.2, color: "#10b981" },
    { h: 1.5, color: "#ff6b6b" },
    { h: 2.6, color: "#10b981" },
  ];
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.15) * 0.3 + 0.4;
  });
  return (
    <Float speed={0.8} floatIntensity={0.3}>
      <group ref={ref} position={[3.5, 1.5, -1.5]} scale={0.6}>
        {bars.map((bar, i) => (
          <mesh key={i} position={[(i - 3) * 0.45, bar.h / 2, 0]}>
            <boxGeometry args={[0.3, bar.h, 0.3]} />
            <meshStandardMaterial
              color={bar.color}
              emissive={bar.color}
              emissiveIntensity={0.3}
              roughness={0.2}
              metalness={0.7}
              transparent
              opacity={0.85}
            />
          </mesh>
        ))}
        {/* Base platform */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[3.6, 0.06, 0.5]} />
          <meshStandardMaterial color="#10b981" transparent opacity={0.15} />
        </mesh>
      </group>
    </Float>
  );
}

/* ── Currency Coin with embossed ring ── */
function CurrencyCoin({ position, color, size = 0.3 }: {
  position: [number, number, number]; color: string; size?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.4;
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.2) * 0.15;
  });
  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.8}>
      <group ref={ref} position={position}>
        {/* Main coin disc */}
        <mesh>
          <cylinderGeometry args={[size, size, size * 0.12, 32]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} metalness={0.9} roughness={0.1} />
        </mesh>
        {/* Inner ring detail */}
        <mesh>
          <torusGeometry args={[size * 0.7, size * 0.04, 8, 32]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} metalness={0.95} roughness={0.05} transparent opacity={0.8} />
        </mesh>
      </group>
    </Float>
  );
}

/* ── Pie Chart Segment ── */
function PieChart3D({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.2;
    ref.current.rotation.x = 0.4;
  });

  const segments = [
    { start: 0, end: Math.PI * 0.8, color: "#10b981" },
    { start: Math.PI * 0.8, end: Math.PI * 1.3, color: "#f59e0b" },
    { start: Math.PI * 1.3, end: Math.PI * 1.7, color: "#6366f1" },
    { start: Math.PI * 1.7, end: Math.PI * 2, color: "#ec4899" },
  ];

  return (
    <Float speed={1} floatIntensity={0.4}>
      <group ref={ref} position={position} scale={0.5}>
        {segments.map((seg, i) => {
          const shape = new THREE.Shape();
          shape.moveTo(0, 0);
          const steps = 20;
          for (let s = 0; s <= steps; s++) {
            const angle = seg.start + (seg.end - seg.start) * (s / steps);
            shape.lineTo(Math.cos(angle) * 1.2, Math.sin(angle) * 1.2);
          }
          shape.lineTo(0, 0);
          return (
            <mesh key={i} position={[0, 0, -0.08 * i]}>
              <extrudeGeometry args={[shape, { depth: 0.15, bevelEnabled: false }]} />
              <meshStandardMaterial
                color={seg.color}
                emissive={seg.color}
                emissiveIntensity={0.25}
                roughness={0.2}
                metalness={0.7}
                transparent
                opacity={0.8}
              />
            </mesh>
          );
        })}
      </group>
    </Float>
  );
}

/* ── Upward Arrow ── */
function GrowthArrow({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = position[1] + Math.sin(clock.elapsedTime * 0.8) * 0.2;
  });
  return (
    <Float speed={1.2} floatIntensity={0.5}>
      <group ref={ref} position={position} rotation={[0, 0, 0]}>
        {/* Shaft */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.08, 0.8, 0.08]} />
          <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.5} metalness={0.8} roughness={0.1} />
        </mesh>
        {/* Head */}
        <mesh position={[0, 0.55, 0]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.18, 0.3, 4]} />
          <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.5} metalness={0.8} roughness={0.1} />
        </mesh>
      </group>
    </Float>
  );
}

/* ── Glow Orb ── */
function GlowOrb({ position, color, scale = 1 }: { position: [number, number, number]; color: string; scale?: number }) {
  return (
    <Float speed={2} rotationIntensity={0} floatIntensity={1}>
      <mesh position={position} scale={scale}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
      <mesh position={position} scale={scale * 2.8}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.06} />
      </mesh>
    </Float>
  );
}

/* ── Scene ── */
function useCompactHeroScene() {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setIsCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isCompact;
}

function Scene({ isCompact }: { isCompact: boolean }) {
  const candles = [
    { pos: [-2.4, 0, 0] as [number, number, number], h: 1.2, bh: 0.6, d: 0 },
    { pos: [-1.7, 0, 0.3] as [number, number, number], h: 1.6, bh: 0.8, d: 1 },
    { pos: [-1.0, 0, -0.2] as [number, number, number], h: 2.0, bh: 1.0, d: 2 },
    { pos: [-0.3, 0, 0.1] as [number, number, number], h: 2.6, bh: 1.3, d: 0.5 },
    { pos: [0.4, 0, 0.4] as [number, number, number], h: 3.0, bh: 1.5, d: 1.5 },
    { pos: [1.1, 0, -0.1] as [number, number, number], h: 2.4, bh: 1.1, d: 2.5 },
    { pos: [1.8, 0, 0.2] as [number, number, number], h: 3.4, bh: 1.6, d: 0.8 },
    { pos: [2.5, 0, -0.3] as [number, number, number], h: 3.8, bh: 1.8, d: 1.8 },
  ];
  const sceneScale = isCompact ? 0.5 : 1;
  const scenePosition: [number, number, number] = isCompact ? [0, -1.15, -2.4] : [0, 0, 0];

  return (
    <>
      <ambientLight intensity={0.08} />
      <pointLight position={[2, 4, 3]} intensity={0.8} color="#10b981" />
      <pointLight position={[-3, 3, -2]} intensity={0.4} color="#ff9348" />
      <spotLight position={[0, 6, 0]} intensity={0.5} angle={0.5} penumbra={1} color="#6eff9f" />

      <Stars radius={100} depth={50} count={1500} factor={2.5} fade speed={0.3} />
      <group scale={sceneScale} position={scenePosition}>
      <GridPlane />
      <PulseLine />

      {candles.map((c, i) => (
        <CandlestickBar key={i} position={c.pos} height={c.h} bodyHeight={c.bh} color={i % 3 === 0 ? "#ff6b6b" : "#10b981"} delay={c.d} />
      ))}

      {/* Gold & crypto coins */}
      <FloatingCoin position={[-2.8, 2.2, 1]} radius={0.3} color="#f59e0b" />
      <FloatingCoin position={[3, 1.8, -0.5]} radius={0.22} color="#10b981" />
      <FloatingCoin position={[0.5, 2.8, 0.8]} radius={0.18} color="#f59e0b" />
      <FloatingCoin position={[-3.5, 1.2, -1]} radius={0.15} color="#10b981" />

      {/* Currency coins */}
      <CurrencyCoin position={[-4, 2.8, 0.5]} color="#10b981" size={0.35} />
      <CurrencyCoin position={[4.2, 2.2, -0.8]} color="#6366f1" size={0.25} />
      <CurrencyCoin position={[-1.5, 3.5, 1.2]} color="#f59e0b" size={0.3} />
      <CurrencyCoin position={[2.8, 3.2, 1]} color="#ec4899" size={0.2} />

      {/* 3D bar chart */}
      <BarChart3D />

      {/* Pie chart */}
      <PieChart3D position={[-3.8, 1.8, -1.5]} />

      {/* Growth arrows */}
      <GrowthArrow position={[1.5, 2.5, 1.5]} />
      <GrowthArrow position={[-2, 3.0, 0.8]} />

      {/* Ambient glow */}
      <GlowOrb position={[-1.5, 2.5, 0.5]} color="#10b981" scale={1.2} />
      <GlowOrb position={[2.2, 3, -0.3]} color="#6eff9f" scale={0.8} />
      <GlowOrb position={[0, 1.5, 1.2]} color="#f59e0b" scale={0.6} />
      </group>
    </>
  );
}

export function Hero3DScene() {
  const isCompact = useCompactHeroScene();
  const camera = isCompact
    ? { position: [0, 2.3, 9] as [number, number, number], fov: 42 }
    : { position: [0, 2, 6] as [number, number, number], fov: 50 };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[72vh] overflow-hidden opacity-25 sm:inset-0 sm:h-auto sm:opacity-60 lg:opacity-75">
      <Canvas camera={camera} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }} style={{ background: "transparent" }}>
        <Scene isCompact={isCompact} />
      </Canvas>
    </div>
  );
}
