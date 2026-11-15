"use client";

import * as React from "react";
import * as THREE from "three";

/** Progress through the landing story, 0 to 1, written by the page and read every frame. */
export type ProgressRef = React.RefObject<number>;

const BODY = "#eef1ed";
const STRIPE = "#d98b1f";
const GLASS = "#0f2a24";
const TYRE = "#16201d";
const RIM = "#b9c2be";

/** The car body seen from the side: wheel arches cut out, short bonnet, long cabin (a fleet estate). */
function bodyShape() {
  const s = new THREE.Shape();
  s.moveTo(-2.2, 0.32);
  s.lineTo(-1.86, 0.32);
  s.absarc(-1.38, 0.32, 0.48, Math.PI, 0, true);
  s.lineTo(0.9, 0.32);
  s.absarc(1.38, 0.32, 0.48, Math.PI, 0, true);
  s.lineTo(2.2, 0.32);
  s.lineTo(2.26, 0.7);
  s.lineTo(2.05, 0.92);
  s.lineTo(0.75, 1.04);
  s.lineTo(-1.95, 1.06);
  s.lineTo(-2.24, 0.92);
  s.lineTo(-2.2, 0.32);
  return s;
}

function cabinShape() {
  const s = new THREE.Shape();
  s.moveTo(0.72, 1.02);
  s.lineTo(0.12, 1.56);
  s.lineTo(-1.62, 1.6);
  s.lineTo(-1.92, 1.02);
  s.lineTo(0.72, 1.02);
  return s;
}

function buildCar() {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: BODY, metalness: 0.35, roughness: 0.32 });
  const glass = new THREE.MeshStandardMaterial({ color: GLASS, metalness: 0.6, roughness: 0.12 });
  const dark = new THREE.MeshStandardMaterial({ color: "#1d2a26", roughness: 0.7 });
  const stripe = new THREE.MeshStandardMaterial({ color: STRIPE, roughness: 0.45 });

  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(bodyShape(), { depth: 1.7, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 4, curveSegments: 28 }), paint);
  body.geometry.translate(0, 0, -0.85);
  body.castShadow = true;
  car.add(body);

  const cabin = new THREE.Mesh(new THREE.ExtrudeGeometry(cabinShape(), { depth: 1.46, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 }), glass);
  cabin.geometry.translate(0, 0, -0.73);
  cabin.castShadow = true;
  car.add(cabin);

  // Roof panel and pillars in body colour so the glass reads as windows.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.06, 1.5), paint);
  roof.position.set(-0.74, 1.62, 0);
  car.add(roof);
  // Windscreen pillar (leans back), middle pillar (upright), rear pillar (leans forward).
  const pillars = [
    { x: 0.42, y: 1.29, len: 0.81, tilt: 0.84 },
    { x: -0.75, y: 1.31, len: 0.58, tilt: 0 },
    { x: -1.77, y: 1.31, len: 0.66, tilt: -0.48 },
  ];
  for (const pl of pillars) {
    for (const z of [-0.745, 0.745]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, pl.len, 0.04), paint);
      pillar.position.set(pl.x, pl.y, z);
      pillar.rotation.z = pl.tilt;
      car.add(pillar);
    }
  }

  // Amber fleet stripe along both sides.
  for (const z of [-0.93, 0.93]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 0.02), stripe);
    s.position.set(-0.05, 0.7, z);
    car.add(s);
  }

  // Grille, bumpers, lights.
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 1.0), dark);
  grille.position.set(2.31, 0.58, 0);
  car.add(grille);
  for (const x of [2.3, -2.28]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1.8), dark);
    bumper.position.set(x, 0.4, 0);
    car.add(bumper);
  }
  const head = new THREE.MeshStandardMaterial({ color: "#fffbe8", emissive: "#fff3c4", emissiveIntensity: 1.4 });
  const tail = new THREE.MeshStandardMaterial({ color: "#b3261e", emissive: "#b3261e", emissiveIntensity: 0.9 });
  for (const z of [-0.62, 0.62]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.34), head);
    h.position.set(2.29, 0.76, z);
    car.add(h);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.3), tail);
    tl.position.set(-2.29, 0.8, z);
    car.add(tl);
  }

  // Wheels: tyre, rim and five spokes, so the turning shows.
  const wheels: THREE.Group[] = [];
  const tyreGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 40);
  const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.32, 32);
  const spokeGeo = new THREE.BoxGeometry(0.06, 0.44, 0.33);
  const tyreMat = new THREE.MeshStandardMaterial({ color: TYRE, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: RIM, metalness: 0.8, roughness: 0.25 });
  for (const x of [-1.38, 1.38]) {
    for (const z of [-0.8, 0.8]) {
      const w = new THREE.Group();
      const tyre = new THREE.Mesh(tyreGeo, tyreMat);
      tyre.rotation.x = Math.PI / 2;
      tyre.castShadow = true;
      w.add(tyre);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.x = Math.PI / 2;
      w.add(rim);
      for (let i = 0; i < 5; i++) {
        const spoke = new THREE.Mesh(spokeGeo, dark);
        spoke.rotation.z = (i / 5) * Math.PI;
        w.add(spoke);
      }
      w.position.set(x, 0.42, z);
      car.add(w);
      wheels.push(w);
    }
  }
  return { car, wheels };
}

/**
 * A white fleet car on a turntable. It turns as the page scrolls (one full turn across the story),
 * its wheels roll with the movement, and it floats a little when the page is still. Rendering stops
 * when it is off screen. Shows `fallback` when WebGL is not available.
 */
export function Car3D({ progress, className, fallback }: { progress: ProgressRef; className?: string; fallback?: React.ReactNode }) {
  const host = React.useRef<HTMLDivElement>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      // No WebGL (old phone, blocked GPU): show the picture instead.
      const id = requestAnimationFrame(() => setFailed(true));
      return () => cancelAnimationFrame(id);
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    // Absolutely placed so the canvas never makes its box (or the page) wider.
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

    scene.add(new THREE.HemisphereLight("#e6efec", "#0f3d34", 1.4));
    const sun = new THREE.DirectionalLight("#ffffff", 2.4);
    sun.position.set(4, 7, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -4;
    sun.shadow.camera.right = 4;
    sun.shadow.camera.top = 4;
    sun.shadow.camera.bottom = -4;
    scene.add(sun);
    const rim = new THREE.DirectionalLight("#7fc3b2", 1.6);
    rim.position.set(-5, 3, -4);
    scene.add(rim);

    // Turntable: a flat disc with an amber ring, and a soft shadow under the car.
    const table = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.75, 64), new THREE.MeshStandardMaterial({ color: "#1b5a4c", roughness: 0.85 }));
    disc.rotation.x = -Math.PI / 2;
    disc.receiveShadow = true;
    table.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.75, 2.84, 96), new THREE.MeshBasicMaterial({ color: STRIPE }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    table.add(ring);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.35 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.004;
    shadow.receiveShadow = true;
    table.add(shadow);
    scene.add(table);

    const { car, wheels } = buildCar();
    table.add(car);

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      // Far enough that the whole turntable fits across and the car fits from top to bottom.
      const halfV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const halfH = halfV * camera.aspect;
      camera.userData.dist = Math.max(3.05 / halfH, 2.3 / halfV);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
    });
    io.observe(el);

    let yaw = -0.55;
    let raf = 0;
    const clock = new THREE.Clock();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) return;
      const p = Math.min(1, Math.max(0, progress.current ?? 0));
      const target = reduce ? -0.55 : -0.55 + p * Math.PI * 2;
      const prev = yaw;
      yaw += (target - yaw) * 0.08;
      table.rotation.y = yaw;
      // Wheels roll forward with the turn.
      const roll = (yaw - prev) * 6;
      for (const w of wheels) w.rotation.z -= roll;
      const t = clock.getElapsedTime();
      car.position.y = reduce ? 0 : Math.sin(t * 1.6) * 0.025;
      // The camera rises over the middle of the story and comes down at the end.
      const dist = (camera.userData.dist as number) ?? 9.2;
      const lift = 2.4 + Math.sin(p * Math.PI) * 1.4;
      camera.position.set(0, lift, dist);
      camera.lookAt(0, 0.75, 0);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [progress]);

  if (failed) return <>{fallback}</>;
  return <div ref={host} className={className} style={{ position: "relative", overflow: "hidden" }} />;
}
