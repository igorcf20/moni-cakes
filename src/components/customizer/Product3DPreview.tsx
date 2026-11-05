import { Suspense, useMemo, useRef, useEffect, useState, Component, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree, createPortal, type ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  Decal,
  useTexture,
  Html,
  ContactShadows,
  useGLTF,
  Center,
  Resize,
} from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import tshirtModelAsset from "@/assets/tshirt-model.glb.asset.json";
import { PRODUCT_3D_PREVIEW_ENABLED } from "@/lib/product3DFeature";

const TSHIRT_MODEL_URL = tshirtModelAsset.url;

export type ModelKind = "tshirt" | "mug" | "tote" | "backpack" | "sticker" | "box";
export type CameraView = "front" | "back" | "left" | "right" | "top" | "iso";

export type AreaDecal = {
  key: string;
  imageUrl: string;
  anchor: {
    x?: number;
    y?: number;
    z?: number;
    rot?: number;
    rotX?: number;
    rotY?: number;
    rotZ?: number;
    scale?: number;
    // User adjustments applied on top of the base anchor
    offsetX?: number; // horizontal shift along the decal's local X
    offsetY?: number; // vertical shift along the decal's local Y
    scaleMul?: number; // 0.5..1.5
    rotAdd?: number; // radians added on decal's projection axis
    // Aspect ratio of the uploaded design (w/h) — keeps the decal proportional
    aspect?: number;
    // Physical safe-area bounds projected onto the model. The artwork is
    // fitted and moved inside these dimensions, never beyond their edges.
    boundsWidth?: number;
    boundsHeight?: number;
  };
  highlighted?: boolean;
};

type Anchor = { pos: [number, number, number]; rotation: [number, number, number]; size: number };

function fitDecalInsideBounds(aspect: number, boundsWidth: number, boundsHeight: number, scaleMul: number) {
  const safeAspect = Math.max(0.1, aspect);
  let width = boundsWidth;
  let height = boundsHeight;
  if (safeAspect > boundsWidth / boundsHeight) height = boundsWidth / safeAspect;
  else width = boundsHeight * safeAspect;
  const scale = THREE.MathUtils.clamp(scaleMul, 0.05, 1);
  return { width: width * scale, height: height * scale };
}

// Archetype defaults, never product-specific. The administrator can override a
// position for each area in product_print_areas.
// eslint-disable-next-line react-refresh/only-export-components -- shared with the admin placement preview
export function defaultAreaAnchor(kind: ModelKind, key: string): Anchor {
  const name = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_");
  const back = /back|costas|verso|rear/.test(name);
  const left = /left|esquerda|esq/.test(name);
  const right = /right|direita|dir/.test(name);
  const lower = /lower|inferior|baixo/.test(name);
  const sleeve = /sleeve|manga/.test(name);
  const top = /top|tampa|cima/.test(name);
  if (kind === "tshirt") {
    // Coordinates of the bundled garment GLB. They remain generic by area
    // meaning; product-specific overrides still come from product_print_areas.
    // Left/right follow the wearer's perspective. Seen from the front, the
    // wearer's left is on the viewer's right.
    if (sleeve) return { pos: [left ? 0.3 : -0.3, 1.48, 0.03], rotation: [0, left ? Math.PI / 2 : -Math.PI / 2, 0], size: 0.1 };
    if (back) return { pos: [0, lower ? 1.08 : 1.32, -0.16], rotation: [0, Math.PI, 0], size: lower ? 0.2 : 0.32 };
    if (left || right) return { pos: [left ? 0.14 : -0.14, 1.4, 0.16], rotation: [0, 0, 0], size: 0.13 };
    return { pos: [0, 1.32, 0.16], rotation: [0, 0, 0], size: 0.32 };
  }
  if (kind === "mug") return { pos: [0, 0, back ? -0.555 : 0.555], rotation: [0, back ? Math.PI : 0, 0], size: 0.48 };
  if (kind === "tote") return { pos: [0, 0, back ? -0.065 : 0.065], rotation: [0, back ? Math.PI : 0, 0], size: 0.52 };
  if (kind === "backpack") return { pos: [0, 0, 0.04], rotation: [0, 0, 0], size: 0.35 };
  if (kind === "sticker") return { pos: [0, 0, 0.01], rotation: [0, 0, 0], size: 1.1 };
  if (top) return { pos: [0, 0.335, 0], rotation: [-Math.PI / 2, 0, 0], size: 0.45 };
  return { pos: [0, 0, back ? -0.335 : 0.335], rotation: [0, back ? Math.PI : 0, 0], size: 0.45 };
}

export type PreviewBox = {
  position: [number, number, number];
  rotationEuler: [number, number, number];
  width: number;
  height: number;
  color?: string;
};

type Props = {
  modelKind: ModelKind;
  baseColor?: string;
  decals?: AreaDecal[];
  autoRotate?: boolean;
  view?: CameraView;
  className?: string;
  /** When set, clicking on the model reports the point + surface normal in local mesh space. */
  onPickPoint?: (info: { point: [number, number, number]; normalEuler: [number, number, number] }) => void;
  /** Optional overlay showing the current allowed area as a translucent rectangle on the surface. */
  previewBox?: PreviewBox | null;
  modelUrl?: string | null;
  fallbackImageUrl?: string | null;
};

// Distance chosen so full silhouette fits with fov 42
const D = 3.2;
const VIEW_TARGETS: Record<CameraView, [number, number, number]> = {
  front: [0, 0, D],
  back: [0, 0, -D],
  left: [-D, 0, 0],
  right: [D, 0, 0],
  top: [0, D, 0.001],
  iso: [D * 0.65, D * 0.5, D * 0.75],
};

/* ---------- Geometry builders ---------- */

// A proper t-shirt silhouette (body + sleeves + neckline)
function useTshirtGeometry() {
  return useMemo(() => {
    const s = new THREE.Shape();
    // start at bottom-left hem, go clockwise
    s.moveTo(-0.55, -0.9);
    s.lineTo(-0.55, 0.35);              // left side up
    s.lineTo(-0.95, 0.55);              // out to left sleeve
    s.lineTo(-1.05, 0.75);              // sleeve outer top
    s.lineTo(-0.7, 0.9);                // sleeve inner top
    s.lineTo(-0.38, 0.7);               // left shoulder
    // neckline dip
    s.quadraticCurveTo(-0.2, 0.55, 0, 0.58);
    s.quadraticCurveTo(0.2, 0.55, 0.38, 0.7);
    s.lineTo(0.7, 0.9);
    s.lineTo(1.05, 0.75);
    s.lineTo(0.95, 0.55);
    s.lineTo(0.55, 0.35);
    s.lineTo(0.55, -0.9);
    s.lineTo(-0.55, -0.9);
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 4,
      curveSegments: 32,
    });
    geo.translate(0, 0, -0.09);
    geo.computeVertexNormals();
    return geo;
  }, []);
}

function useToteGeometry() {
  return useMemo(() => {
    const s = new THREE.Shape();
    const w = 0.55;
    const h = 0.7;
    s.moveTo(-w, -h);
    s.lineTo(w, -h);
    s.lineTo(w, h);
    s.lineTo(-w, h);
    s.lineTo(-w, -h);
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
    });
    geo.translate(0, 0, -0.04);
    return geo;
  }, []);
}

/* ---------- Camera control ---------- */

function CameraRig({ view, controlsRef }: { view: CameraView; controlsRef: RefObject<OrbitControlsImpl> }) {
  const { camera } = useThree();
  useEffect(() => {
    // A lerp from front to back passes through the model. OrbitControls then
    // clamps the camera at its minimum distance, causing the huge close-up.
    camera.position.set(...VIEW_TARGETS[view]);
    camera.lookAt(0, 0, 0);
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
  }, [camera, controlsRef, view]);
  return null;
}

/* ---------- Optional product-specific GLB ---------- */

function CustomGLB({
  url,
  kind,
  color,
  decals,
  onPickPoint,
  previewBox,
}: {
  url: string;
  kind: ModelKind;
  color: string;
  decals: AreaDecal[];
  onPickPoint?: Props["onPickPoint"];
  previewBox?: Props["previewBox"];
}) {
  const { scene } = useGLTF(url);
  // useGLTF caches scenes. Each preview needs its own instance: changing one
  // product's colour or decals must never mutate another preview.
  const instance = useMemo(() => {
    const clonedScene = scene.clone(true);
    clonedScene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const tint = (source: THREE.Material) => {
        const clonedMaterial = source.clone();
        if ("color" in clonedMaterial && clonedMaterial.color instanceof THREE.Color) {
          clonedMaterial.color.set(color);
        }
        if (kind === "tshirt" && "map" in clonedMaterial) {
          // A dark albedo would keep multiplying light variation colours back
          // to black. T-shirt colour is controlled by the selected variation.
          (clonedMaterial as THREE.MeshStandardMaterial).map = null;
        }
        clonedMaterial.needsUpdate = true;
        return clonedMaterial;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(tint)
        : tint(mesh.material);
    });
    return clonedScene;
  }, [color, kind, scene]);
  useEffect(
    () => () => {
      instance.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((entry) => entry.dispose());
      });
    },
    [instance],
  );
  const primaryMesh = useMemo(() => {
    let found: THREE.Mesh | null = null;
    let largest = 0;
    instance.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const mesh = o as THREE.Mesh;
      mesh.geometry.computeBoundingBox();
      const size = mesh.geometry.boundingBox?.getSize(new THREE.Vector3());
      const area = size ? size.x * size.y + size.y * size.z + size.x * size.z : 0;
      if (!found || area > largest) { found = mesh; largest = area; }
    });
    return found;
  }, [instance]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!onPickPoint) return;
    e.stopPropagation();
    const inv = new THREE.Matrix4().copy(e.object.matrixWorld).invert();
    const localPoint = e.point.clone().applyMatrix4(inv);
    const face = e.face;
    let euler: [number, number, number] = [0, 0, 0];
    if (face) {
      const wn = face.normal.clone().transformDirection(e.object.matrixWorld).normalize();
      const yaw = Math.atan2(wn.x, wn.z);
      const pitch = -Math.asin(THREE.MathUtils.clamp(wn.y, -1, 1));
      euler = [pitch, yaw, 0];
    }
    onPickPoint({ point: [localPoint.x, localPoint.y, localPoint.z], normalEuler: euler });
  };

  return (
    <group scale={1.8}>
      <Center>
      <Resize>
      <group>
        <primitive object={instance} onClick={onPickPoint ? handleClick : undefined} />
        {primaryMesh &&
          createPortal(
            <>
              {decals.map((d) => (
                <DecalNode key={d.key} decal={d} kind={kind} />
              ))}
              {previewBox && <PreviewBoxOverlay box={previewBox} />}
            </>,
            primaryMesh,
          )}
      </group>
      </Resize>
      </Center>
    </group>
  );
}

function TshirtDecalNode({ decal }: { decal: AreaDecal }) {
  const texture = useTexture(decal.imageUrl);
  const configured = decal.anchor ?? {};
  const fallback = defaultAreaAnchor("tshirt", decal.key);
  const hasPosition = configured.x != null || configured.y != null || configured.z != null;
  const position = hasPosition
    ? [
        configured.x ?? fallback.pos[0],
        configured.y ?? fallback.pos[1],
        configured.z ?? fallback.pos[2],
      ] as [number, number, number]
    : fallback.pos;
  const rotation: [number, number, number] = [
    configured.rotX ?? fallback.rotation[0],
    configured.rotY ?? fallback.rotation[1],
    (configured.rotZ ?? fallback.rotation[2]) + (configured.rotAdd ?? 0),
  ];
  const displayTexture = useMemo(() => {
    // useTexture caches its result. Clone it so local colour-space settings do
    // not mutate another area that happens to use the same uploaded artwork.
    // DecalGeometry already accounts for a back-facing projector; flipping the
    // texture here would mirror text for the customer.
    const nextTexture = texture.clone();
    nextTexture.colorSpace = THREE.SRGBColorSpace;
    nextTexture.anisotropy = 8;
    nextTexture.needsUpdate = true;
    return nextTexture;
  }, [texture]);
  useEffect(() => () => displayTexture.dispose(), [displayTexture]);

  const boundsWidth = Math.max(0.04, configured.boundsWidth ?? configured.scale ?? fallback.size);
  const boundsHeight = Math.max(0.04, configured.boundsHeight ?? configured.scale ?? fallback.size);
  const aspect = Math.max(0.1, configured.aspect ?? 1);
  const { width, height } = fitDecalInsideBounds(aspect, boundsWidth, boundsHeight, configured.scaleMul ?? 1);
  const localX = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(...rotation));
  const localY = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(...rotation));
  const moveX = THREE.MathUtils.clamp(configured.offsetX ?? 0, -1, 1) * Math.max(0, (boundsWidth - width) / 2);
  const moveY = THREE.MathUtils.clamp(configured.offsetY ?? 0, -1, 1) * Math.max(0, (boundsHeight - height) / 2);
  const adjustedPosition = new THREE.Vector3(...position)
    .addScaledVector(localX, moveX)
    .addScaledVector(localY, moveY);
  // The garment surface sits roughly 4 cm behind the authored front/back
  // anchors. DecalGeometry uses half of this depth on each side, so 14 cm
  // reaches the selected face without crossing the full garment thickness.
  const projectionDepth = Math.max(0.12, Math.min(0.16, Math.max(width, height) * 0.45));

  return (
    <Decal
      position={[adjustedPosition.x, adjustedPosition.y, adjustedPosition.z]}
      rotation={rotation}
      scale={[width, height, projectionDepth]}
      map={displayTexture}
      depthTest
    />
  );
}

function BundledTshirtGLB({
  color,
  decals,
  onPickPoint,
  previewBox,
}: {
  color: string;
  decals: AreaDecal[];
  onPickPoint?: Props["onPickPoint"];
  previewBox?: Props["previewBox"];
}) {
  const { scene } = useGLTF(TSHIRT_MODEL_URL);
  const sourceMesh = useMemo(() => {
    let found: THREE.Mesh | null = null;
    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!found && mesh.isMesh) found = mesh;
    });
    return found;
  }, [scene]);

  // Bake the GLB node translation/rotation/scale into the geometry. Admin area
  // coordinates and the bundled defaults are expressed in this visual space;
  // making it the mesh's local space lets DecalGeometry project reliably.
  const geometry = useMemo(() => {
    if (!sourceMesh) return null;
    const baked = sourceMesh.geometry.clone();
    // The GLB quantizes position (Int16), normal and tangent (Int8). Baking a
    // matrix into those integer buffers clips coordinates and collapses most
    // transformed lighting vectors to zero. Expand every transformed attribute
    // first; UVs stay compressed because a node matrix never changes them.
    (["position", "normal", "tangent"] as const).forEach((attributeName) => {
      const sourceAttribute = baked.getAttribute(attributeName);
      if (!sourceAttribute || (sourceAttribute.array instanceof Float32Array && !sourceAttribute.normalized)) return;
      const values = new Float32Array(sourceAttribute.count * sourceAttribute.itemSize);
      for (let index = 0; index < sourceAttribute.count; index += 1) {
        const offset = index * sourceAttribute.itemSize;
        values[offset] = sourceAttribute.getX(index);
        if (sourceAttribute.itemSize > 1) values[offset + 1] = sourceAttribute.getY(index);
        if (sourceAttribute.itemSize > 2) values[offset + 2] = sourceAttribute.getZ(index);
        if (sourceAttribute.itemSize > 3) values[offset + 3] = sourceAttribute.getW(index);
      }
      baked.setAttribute(attributeName, new THREE.Float32BufferAttribute(values, sourceAttribute.itemSize));
    });
    baked.applyMatrix4(sourceMesh.matrixWorld);
    baked.computeBoundingBox();
    baked.computeBoundingSphere();
    baked.computeVertexNormals();
    return baked;
  }, [sourceMesh]);

  const material = useMemo(() => {
    if (!sourceMesh) return null;
    const source = Array.isArray(sourceMesh.material) ? sourceMesh.material[0] : sourceMesh.material;
    const cloned = source.clone() as THREE.MeshStandardMaterial;
    // The bundled GLB has a dark base-colour texture. A material colour is
    // multiplied by that texture, so even white remained black. Remove only
    // the albedo map and keep the normal/roughness maps that model the fabric.
    cloned.map = null;
    cloned.color.set(color);
    cloned.roughness = 0.88;
    cloned.metalness = 0;
    cloned.needsUpdate = true;
    return cloned;
  }, [sourceMesh, color]);
  const handlePick = (event: ThreeEvent<MouseEvent>) => {
    if (!onPickPoint) return;
    event.stopPropagation();
    const inverse = new THREE.Matrix4().copy(event.object.matrixWorld).invert();
    const localPoint = event.point.clone().applyMatrix4(inverse);
    const normal = event.face?.normal.clone().transformDirection(event.object.matrixWorld).normalize();
    onPickPoint({
      point: [localPoint.x, localPoint.y, localPoint.z],
      normalEuler: normal
        ? [-Math.asin(THREE.MathUtils.clamp(normal.y, -1, 1)), Math.atan2(normal.x, normal.z), 0]
        : [0, 0, 0],
    });
  };

  return (
    <Center>
      <group scale={2.4}>
        {geometry && material && (
          <mesh
            geometry={geometry}
            material={material}
            castShadow
            receiveShadow
            onClick={onPickPoint ? handlePick : undefined}
          >
            {decals.map((decal) => <TshirtDecalNode key={decal.key} decal={decal} />)}
            {previewBox && <PreviewBoxOverlay box={previewBox} />}
          </mesh>
        )}
      </group>
    </Center>
  );
}

class ModelErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function PreviewBoxOverlay({ box }: { box: NonNullable<Props["previewBox"]> }) {
  const color = box.color ?? "#0057B8";
  return (
    <group position={box.position} rotation={box.rotationEuler}>
      {/* Filled translucent plane */}
      <mesh position={[0, 0, 0.006]}>
        <planeGeometry args={[box.width, box.height]} />
        <meshBasicMaterial color={color} transparent opacity={0.16} depthTest depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      {/* Outline */}
      <lineSegments position={[0, 0, 0.008]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(box.width, box.height)]} />
        <lineBasicMaterial color={color} transparent opacity={0.95} depthTest />
      </lineSegments>
      {/* Corner handles */}
      {([
        [-box.width / 2, -box.height / 2, 0],
        [box.width / 2, -box.height / 2, 0],
        [-box.width / 2, box.height / 2, 0],
        [box.width / 2, box.height / 2, 0],
      ] as [number, number, number][]).map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[Math.min(box.width, box.height) * 0.045, 12, 12]} />
          <meshBasicMaterial color={color} depthTest={false} />
        </mesh>
      ))}
    </group>
  );
}

function ProductMesh({
  modelKind,
  color,
  decals,
  spinning,
  onPickPoint,
  previewBox,
  modelUrl,
}: {
  modelKind: ModelKind;
  color: string;
  decals: AreaDecal[];
  spinning: boolean;
  onPickPoint?: Props["onPickPoint"];
  previewBox?: Props["previewBox"];
  modelUrl?: string | null;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (group.current && spinning) group.current.rotation.y += dt * 0.35;
  });

  const tshirtGeo = useTshirtGeometry();
  const toteGeo = useToteGeometry();

  const handlePick = (e: ThreeEvent<MouseEvent>) => {
    if (!onPickPoint) return;
    e.stopPropagation();
    const local = e.object.worldToLocal(e.point.clone());
    const normal = e.face?.normal.clone().transformDirection(e.object.matrixWorld).normalize() ?? new THREE.Vector3(0, 0, 1);
    onPickPoint({
      point: [local.x, local.y, local.z],
      normalEuler: [-Math.asin(THREE.MathUtils.clamp(normal.y, -1, 1)), Math.atan2(normal.x, normal.z), 0],
    });
  };

  const material = (
    <meshStandardMaterial
      color={color}
      roughness={modelKind === "mug" ? 0.28 : 0.85}
      metalness={modelKind === "mug" ? 0.18 : 0.02}
    />
  );

  return (
    <group ref={group}>
      {modelUrl ? (
        <ModelErrorBoundary fallback={<ProductMesh modelKind={modelKind} color={color} decals={decals} spinning={false} onPickPoint={onPickPoint} previewBox={previewBox} />}>
          <CustomGLB url={modelUrl} kind={modelKind} color={color} decals={decals} onPickPoint={onPickPoint} previewBox={previewBox} />
        </ModelErrorBoundary>
      ) : (
        <>
      {modelKind === "tshirt" && (
        <ModelErrorBoundary
          fallback={
            <mesh geometry={tshirtGeo} castShadow receiveShadow onClick={handlePick}>
              {material}
              {decals.map((d) => <DecalNode key={d.key} decal={d} kind="tshirt" />)}
            </mesh>
          }
        >
          <BundledTshirtGLB color={color} decals={decals} onPickPoint={onPickPoint} previewBox={previewBox} />
        </ModelErrorBoundary>
      )}

      {modelKind === "mug" && (
        <>
          <mesh castShadow receiveShadow onClick={handlePick}>
            <cylinderGeometry args={[0.55, 0.55, 0.85, 64, 1, false]} />
            {material}
            {decals.map((d) => (
              <DecalNode key={d.key} decal={d} kind="mug" />
            ))}
          </mesh>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.5, 0.5, 0.78, 48, 1, true]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.9} side={THREE.BackSide} />
          </mesh>
          <mesh position={[0, 0.425, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.5, 0.55, 48]} />
            <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0.63, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <torusGeometry args={[0.19, 0.045, 16, 40]} />
            {material}
          </mesh>
        </>
      )}

      {modelKind === "tote" && (
        <>
          <mesh geometry={toteGeo} castShadow receiveShadow onClick={handlePick}>
            {material}
            {decals.map((d) => (
              <DecalNode key={d.key} decal={d} kind="tote" />
            ))}
          </mesh>
          <mesh position={[-0.28, 0.88, 0]}>
            <torusGeometry args={[0.2, 0.028, 14, 32, Math.PI]} />
            {material}
          </mesh>
          <mesh position={[0.28, 0.88, 0]}>
            <torusGeometry args={[0.2, 0.028, 14, 32, Math.PI]} />
            {material}
          </mesh>
        </>
      )}

      {modelKind === "backpack" && (
        <>
          <mesh castShadow receiveShadow onClick={handlePick}>
            <boxGeometry args={[0.9, 1.15, 0.5]} />
            {material}
          </mesh>
          <mesh position={[0, -0.18, 0.27]} onClick={handlePick}>
            <boxGeometry args={[0.65, 0.5, 0.06]} />
            <meshStandardMaterial color={color} roughness={0.9} />
            {decals.map((d) => <DecalNode key={d.key} decal={d} kind="backpack" />)}
            {previewBox && <PreviewBoxOverlay box={previewBox} />}
          </mesh>
          <mesh position={[-0.27, 0.68, 0.27]} rotation={[0.2, 0, 0.05]}>
            <boxGeometry args={[0.1, 0.65, 0.06]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
          <mesh position={[0.27, 0.68, 0.27]} rotation={[0.2, 0, -0.05]}>
            <boxGeometry args={[0.1, 0.65, 0.06]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
        </>
      )}

      {modelKind === "sticker" && (
        <mesh castShadow receiveShadow onClick={handlePick}>
          <circleGeometry args={[0.8, 64]} />
          <meshStandardMaterial color={color} roughness={0.4} />
          {decals.map((d) => (
            <DecalNode key={d.key} decal={d} kind="sticker" />
          ))}
        </mesh>
      )}

      {modelKind === "box" && (
        <mesh castShadow receiveShadow onClick={handlePick}>
          <boxGeometry args={[1.2, 0.65, 0.65]} />
          {material}
          {decals.map((d) => (
            <DecalNode key={d.key} decal={d} kind="box" />
          ))}
        </mesh>
      )}
      {previewBox && modelKind !== "backpack" && modelKind !== "tshirt" && <PreviewBoxOverlay box={previewBox} />}
        </>
      )}
    </group>
  );
}

function DecalNode({ decal, kind }: { decal: AreaDecal; kind: ModelKind }) {
  const texture = useTexture(decal.imageUrl);
  useEffect(() => {
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);
  const a = decal.anchor || {};
  const fallback = defaultAreaAnchor(kind, decal.key);
  const explicit = a.x != null || a.y != null || a.z != null;
  const base = explicit ? [a.x ?? fallback.pos[0], a.y ?? fallback.pos[1], a.z ?? fallback.pos[2]] : fallback.pos;
  const boundsWidth = Math.max(0.04, a.boundsWidth ?? a.scale ?? fallback.size);
  const boundsHeight = Math.max(0.04, a.boundsHeight ?? a.scale ?? fallback.size);
  const aspect = Math.max(0.1, a.aspect ?? 1);
  const { width: sx, height: sy } = fitDecalInsideBounds(aspect, boundsWidth, boundsHeight, a.scaleMul ?? 1);
  const rotation: [number, number, number] = [
    a.rotX ?? fallback.rotation[0],
    a.rotY ?? fallback.rotation[1],
    (a.rotZ ?? fallback.rotation[2]) + (a.rotAdd ?? 0),
  ];
  const euler = new THREE.Euler(...rotation);
  const normal = new THREE.Vector3(0, 0, 1).applyEuler(euler);
  const localX = new THREE.Vector3(1, 0, 0).applyEuler(euler);
  const localY = new THREE.Vector3(0, 1, 0).applyEuler(euler);
  const posVector = new THREE.Vector3(...base)
    .addScaledVector(localX, THREE.MathUtils.clamp(a.offsetX ?? 0, -1, 1) * Math.max(0, (boundsWidth - sx) / 2))
    .addScaledVector(localY, THREE.MathUtils.clamp(a.offsetY ?? 0, -1, 1) * Math.max(0, (boundsHeight - sy) / 2))
    .addScaledVector(normal, 0.008);
  const pos: [number, number, number] = [posVector.x, posVector.y, posVector.z];
  return (
    <Decal position={pos} rotation={rotation} scale={[sx, sy, Math.min(0.09, Math.max(sx, sy) * 0.35)]} map={texture} />
  );
}

export default function Product3DPreview({
  modelKind,
  baseColor = "#0F172A",
  decals = [],
  autoRotate = false,
  view = "front",
  className,
  onPickPoint,
  previewBox,
  modelUrl,
  fallbackImageUrl,
}: Props) {
  const [canvasFailed, setCanvasFailed] = useState(false);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  if (!PRODUCT_3D_PREVIEW_ENABLED) return null;
  if (canvasFailed) {
    return <div className={className ?? "aspect-square w-full rounded-2xl border bg-muted/30"} role="img" aria-label="Pré-visualização 3D indisponível">
      {fallbackImageUrl ? <img src={fallbackImageUrl} alt="Pré-visualização do produto" className="h-full w-full object-contain" /> : <p className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">Pré-visualização 3D indisponível neste dispositivo.</p>}
    </div>;
  }
  return (
    <div
      className={
        className ??
        "relative w-full aspect-square rounded-2xl overflow-hidden bg-gradient-to-br from-brand-navy/8 via-primary/5 to-transparent border border-border/40"
      }
    >
      <ModelErrorBoundary fallback={<div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">Pré-visualização 3D indisponível.</div>}>
      <Canvas
        camera={{ position: VIEW_TARGETS[view], fov: 42 }}
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", () => setCanvasFailed(true), { once: true });
        }}
      >
        <color attach="background" args={["#f8fafc"]} />
        <fog attach="fog" args={["#f8fafc", 6, 14]} />

        <hemisphereLight args={["#ffffff", "#64748b", 0.9]} />
        <ambientLight intensity={0.72} />
        <directionalLight position={[3, 4.5, 4]} intensity={1.35} castShadow shadow-mapSize={[1024, 1024]}>
          <orthographicCamera attach="shadow-camera" args={[-2.5, 2.5, 2.5, -2.5, 0.1, 20]} />
        </directionalLight>
        <directionalLight position={[-3, 2, -2]} intensity={0.55} color="#dbeafe" />
        <directionalLight position={[0, 3, -4]} intensity={0.45} color="#ffffff" />

        <Suspense
          fallback={
            <Html center>
              <div className="text-xs text-muted-foreground">A carregar pré-visualização…</div>
            </Html>
          }
        >
          <ProductMesh
            key={`${modelUrl ?? modelKind}:${baseColor}`}
            modelKind={modelKind}
            color={baseColor}
            decals={decals}
            spinning={autoRotate}
            onPickPoint={onPickPoint}
            previewBox={previewBox}
            modelUrl={modelUrl}
          />
        </Suspense>

        <ContactShadows position={[0, -1.05, 0]} opacity={0.4} scale={6} blur={2.6} far={2.5} />

        <CameraRig view={view} controlsRef={controlsRef} />
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          minDistance={3.1}
          maxDistance={5}
          minPolarAngle={Math.PI / 2 - 0.48}
          maxPolarAngle={Math.PI / 2 + 0.48}
          autoRotate={false}
          enableDamping
          dampingFactor={0.08}
          target={[0, 0, 0]}
        />
      </Canvas>
      </ModelErrorBoundary>
    </div>
  );
}
