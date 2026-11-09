// F3 ② 고로 3D: 층을 모두 보여주고, 층을 고르면 그 층을 2D 도면 또는 3D로 본다
// 스타일: 클레이(점토) 느낌, 구역별 색, 저사양 PC에 맞춘 단순 도형(원기둥·원뿔)
// 담당: 3D·프론트. TODO: 2D 도면 전환, 시간 슬라이더, 위아래 겹침 세로선, 주변 설비
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useState } from "react";
import type { Grade } from "@/types";

// 노 내부 수직 공동 (zones.csv). 높이·반지름은 시각화용 가정값
const LEVELS = [
  { id: "HEARTH", label: "노상·노저", y: 0.5, h: 1.0, rTop: 2.0, rBottom: 2.0, color: "#c9b79c" },
  { id: "TUYERE", label: "풍구 레벨", y: 1.35, h: 0.7, rTop: 2.2, rBottom: 2.0, color: "#b8c4b0" },
  { id: "BELLY_BOSH", label: "노복·조안", y: 2.3, h: 1.2, rTop: 2.4, rBottom: 2.2, color: "#d6c3b8" },
  { id: "STACK", label: "노흉", y: 4.0, h: 2.2, rTop: 1.6, rBottom: 2.4, color: "#c4bfd1" },
  { id: "TOP", label: "노정", y: 5.5, h: 0.8, rTop: 1.2, rBottom: 1.6, color: "#b9cbd6" },
] as const;

const GRADE_COLOR: Record<Grade, string> = { 금지: "#d9534f", 조건부: "#f0a04b", 결함: "#8a6fb3" };

interface Props {
  highlights?: Partial<Record<string, Grade>>;
  selected?: string | null;
  onSelect?: (zoneId: string) => void;
}

export function FurnaceScene({ highlights = {}, selected = null, onSelect }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <Canvas camera={{ position: [7, 5, 7], fov: 40 }} dpr={[1, 1.5]}>
      <color attach="background" args={["#efece6"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 10, 5]} intensity={1.1} />
      <group position={[0, -3, 0]}>
        {LEVELS.map((lv) => {
          const grade = highlights[lv.id];
          const color = grade ? GRADE_COLOR[grade] : lv.color;
          const active = selected === lv.id || hovered === lv.id;
          return (
            <mesh
              key={lv.id}
              position={[0, lv.y, 0]}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(lv.id);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHovered(lv.id);
              }}
              onPointerOut={() => setHovered(null)}
            >
              <cylinderGeometry args={[lv.rTop, lv.rBottom, lv.h * 0.96, 48]} />
              <meshStandardMaterial
                color={color}
                roughness={0.95}
                metalness={0}
                emissive={active ? "#ffffff" : "#000000"}
                emissiveIntensity={active ? 0.12 : 0}
              />
            </mesh>
          );
        })}
      </group>
      <OrbitControls enablePan={false} minDistance={6} maxDistance={18} />
    </Canvas>
  );
}

export const FURNACE_LEVELS = LEVELS;
