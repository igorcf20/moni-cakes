import { useRef, useEffect, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { PRODUCT_3D_PREVIEW_ENABLED } from "@/lib/product3DFeature";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

interface MugPreview3DProps {
  textureDataUrl: string | null;
}

const Mug = ({ textureDataUrl }: { textureDataUrl: string | null }) => {
  const mugRef = useRef<THREE.Group>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (textureDataUrl) {
      const loader = new THREE.TextureLoader();
      loader.load(
        textureDataUrl, 
        (loadedTexture) => {
          loadedTexture.wrapS = THREE.RepeatWrapping;
          loadedTexture.wrapT = THREE.RepeatWrapping;
          loadedTexture.repeat.set(1, 1);
          setTexture(loadedTexture);
        },
        undefined,
        (error) => {
          console.error("Erro ao carregar textura:", error);
        }
      );
    }
  }, [textureDataUrl]);

  return (
    <group ref={mugRef} position={[0, 0, 0]}>
      {/* Corpo da caneca (cilindro) - BRANCO */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[1, 1.1, 2.5, 32]} />
        <meshStandardMaterial
          color="#ffffff"
          map={texture}
          roughness={0.2}
          metalness={0.05}
        />
      </mesh>

      {/* Alça da caneca - BRANCA */}
      <mesh position={[1.2, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.5, 0.1, 16, 32, Math.PI]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} metalness={0.05} />
      </mesh>

      {/* Base interna - BRANCA */}
      <mesh position={[0, -1.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1, 32]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} metalness={0.05} />
      </mesh>

      {/* Borda superior - BRANCA */}
      <mesh position={[0, 1.25, 0]} rotation={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[1.05, 1, 0.1, 32]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} metalness={0.05} />
      </mesh>
    </group>
  );
};

const MugPreview3D = ({ textureDataUrl }: MugPreview3DProps) => {
  if (!PRODUCT_3D_PREVIEW_ENABLED) return null;
  return (
    <div className="w-full h-[500px] bg-gradient-to-br from-background to-muted rounded-xl overflow-hidden border-2 border-border shadow-elegant">
      <Canvas
        key={textureDataUrl || 'mug-3d-canvas'}
        gl={{ 
          preserveDrawingBuffer: true,
          antialias: true,
          alpha: true
        }}
        dpr={[1, 2]}
        camera={{ position: [3, 2, 4], fov: 45 }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <Suspense fallback={null}>
          <OrbitControls
            enableZoom={true}
            enablePan={false}
            minDistance={3}
            maxDistance={8}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 1.5}
          />
          
          {/* Iluminação */}
          <ambientLight intensity={0.7} />
          <directionalLight position={[5, 5, 5]} intensity={1.2} castShadow />
          <directionalLight position={[-5, 3, -5]} intensity={0.5} />
          <pointLight position={[0, 3, 0]} intensity={0.6} />
          <spotLight position={[0, 5, 0]} intensity={0.3} angle={0.3} penumbra={1} />
          
          {/* Caneca */}
          <Mug textureDataUrl={textureDataUrl} />
          
          {/* Plano de fundo */}
          <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[20, 20]} />
            <meshStandardMaterial color="#f0f0f0" />
          </mesh>
        </Suspense>
      </Canvas>
    </div>
  );
};

export default MugPreview3D;
