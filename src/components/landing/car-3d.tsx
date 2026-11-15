"use client";

import * as React from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CARS, buildCar } from "./car-models";

/** Progress through the landing story, 0 to 1, written by the page and read every frame. */
export type ProgressRef = React.RefObject<number>;

const RING = "#d98b1f";

/**
 * Three cars on a turntable: they turn as the page scrolls, the wheels roll with the movement, and
 * the car changes (saloon, SUV, grand tourer) as the story moves on. A studio light set gives the
 * paint and chrome real reflections. Rendering stops when off screen; `fallback` shows without WebGL.
 */
export function Car3D({
  progress,
  carIndex,
  className,
  fallback,
  raiseFrom,
}: {
  progress: ProgressRef;
  /** Which car to show (0 saloon, 1 SUV, 2 grand tourer), written by the page. */
  carIndex: React.RefObject<number>;
  className?: string;
  fallback?: React.ReactNode;
  /** Progress from which the car moves up to make room for a card below it. */
  raiseFrom?: number;
}) {
  const host = React.useRef<HTMLDivElement>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
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
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    // Absolutely placed so the canvas never makes its box (or the page) wider.
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";

    const scene = new THREE.Scene();
    // Studio reflections for clear coat, chrome and glass.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.9;

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight("#e6efec", "#0f3d34", 0.6));
    const sun = new THREE.DirectionalLight("#ffffff", 2.2);
    sun.position.set(4, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -4;
    sun.shadow.camera.right = 4;
    sun.shadow.camera.top = 4;
    sun.shadow.camera.bottom = -4;
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    const rim = new THREE.DirectionalLight("#7fc3b2", 1.2);
    rim.position.set(-5, 3, -4);
    scene.add(rim);

    // Turntable: dark green disc with an amber ring, and a soft shadow under the car.
    const table = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.95, 96), new THREE.MeshBasicMaterial({ color: "#14493e", toneMapped: false }));
    disc.rotation.x = -Math.PI / 2;
    disc.receiveShadow = true;
    table.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.95, 3.04, 128), new THREE.MeshBasicMaterial({ color: RING }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    table.add(ring);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(2.95, 96), new THREE.ShadowMaterial({ opacity: 0.45 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.004;
    shadow.receiveShadow = true;
    table.add(shadow);
    scene.add(table);

    const cars = CARS.map((spec) => buildCar(spec));
    const scales = cars.map((_, i) => (i === 0 ? 1 : 0));
    for (const [i, c] of cars.entries()) {
      c.car.scale.setScalar(Math.max(scales[i]!, 0.0001));
      c.car.visible = i === 0;
      table.add(c.car);
    }

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
      camera.userData.dist = Math.max(3.2 / halfH, 2.4 / halfV);
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
    let raise = 0;
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
      const roll = (yaw - prev) * 6;
      const t = clock.getElapsedTime();
      const active = Math.min(cars.length - 1, Math.max(0, carIndex.current ?? 0));
      for (const [i, c] of cars.entries()) {
        // The outgoing car shrinks away while the next one grows in.
        const want = i === active ? 1 : 0;
        scales[i]! += (want - scales[i]!) * (reduce ? 1 : 0.12);
        const s = scales[i]!;
        c.car.visible = s > 0.01;
        c.car.scale.setScalar(Math.max(s, 0.0001));
        c.car.position.y = reduce ? 0 : Math.sin(t * 1.6) * 0.02;
        for (const w of c.wheels) w.rotation.z -= roll;
      }
      const dist = (camera.userData.dist as number) ?? 9.5;
      const lift = 2.2 + Math.sin(p * Math.PI) * 1.3;
      const wantRaise = raiseFrom !== undefined && p >= raiseFrom * 0.85 ? 1 : 0;
      raise += (wantRaise - raise) * 0.06;
      camera.position.set(0, lift, dist + raise * 1.2);
      camera.lookAt(0, 0.75 - raise * 1.25, 0);
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
        const mat = m.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] | undefined;
        for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          x.map?.dispose();
          x.dispose();
        }
      });
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [progress, carIndex, raiseFrom]);

  if (failed) return <>{fallback}</>;
  return <div ref={host} className={className} style={{ position: "relative", overflow: "hidden" }} />;
}
