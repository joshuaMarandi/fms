import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Three detailed cars for the landing turntable, built from code (no model files): an executive
 * saloon, a boxy family SUV and a grand tourer. Generic designs with realistic paint, chrome and
 * lights; no manufacturer logos or badges. Front of the car points to +x; ground is y = 0.
 */

type Spec = {
  length: number;
  /** Half the body width. */
  half: number;
  wheelR: number;
  rimR: number;
  tyreW: number;
  axleF: number;
  axleR: number;
  archR: number;
  sill: number;
  belt: number;
  side: (s: THREE.Shape) => void;
  greenhouse: (s: THREE.Shape) => void;
  paint: string;
  roof?: string;
  rim: string;
  caliper: string;
  spokes: number;
  grille: "slats" | "dots" | "mesh";
  grilleBox: { y: number; h: number; w: number };
  head: "slim" | "strip" | "round";
  headY: number;
  tail: "wedge" | "bar" | "oval";
  tailY: number;
  rails?: boolean;
  darkPillars?: boolean;
  exhaust: "twin" | "hidden" | "oval";
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Bottom edge from rear to front with two wheel arches. */
function bottom(s: THREE.Shape, spec: Spec, x0: number, x1: number) {
  const { axleR, axleF, archR, sill, wheelR } = spec;
  s.lineTo(axleR - archR, sill);
  s.lineTo(axleR - archR, wheelR);
  s.absarc(axleR, wheelR, archR, Math.PI, 0, true);
  s.lineTo(axleR + archR, sill);
  s.lineTo(axleF - archR, sill);
  s.lineTo(axleF - archR, wheelR);
  s.absarc(axleF, wheelR, archR, Math.PI, 0, true);
  s.lineTo(axleF + archR, sill);
  s.lineTo(x1, sill);
  void x0;
}

// ------------------------------------------------------------------ the three cars
export const CARS: Spec[] = [
  {
    // Executive saloon: long bonnet, flowing roof, short boot. Iridium-style silver.
    length: 4.9, half: 0.93, wheelR: 0.35, rimR: 0.24, tyreW: 0.26, axleF: 1.47, axleR: -1.48, archR: 0.41, sill: 0.27, belt: 0.88,
    side(s) {
      s.moveTo(-2.36, 0.27);
      bottom(s, this as Spec, -2.36, 2.3);
      s.quadraticCurveTo(2.46, 0.29, 2.47, 0.45);
      s.quadraticCurveTo(2.48, 0.66, 2.32, 0.72);
      s.quadraticCurveTo(1.7, 0.84, 1.0, 0.88);
      s.lineTo(-1.45, 0.9);
      s.quadraticCurveTo(-2.15, 0.92, -2.38, 0.84);
      s.quadraticCurveTo(-2.47, 0.72, -2.45, 0.5);
      s.quadraticCurveTo(-2.44, 0.29, -2.36, 0.27);
    },
    greenhouse(s) {
      s.moveTo(1.04, 0.85);
      s.quadraticCurveTo(0.62, 1.18, 0.16, 1.38);
      s.quadraticCurveTo(-0.55, 1.47, -1.1, 1.38);
      s.quadraticCurveTo(-1.56, 1.18, -1.8, 0.87);
      s.lineTo(1.04, 0.85);
    },
    paint: "#a9aeb3", rim: "#d4d8db", caliper: "#2b2e30", spokes: 5,
    grille: "slats", grilleBox: { y: 0.5, h: 0.2, w: 0.92 },
    head: "slim", headY: 0.64, tail: "wedge", tailY: 0.74, exhaust: "twin",
  },
  {
    // Family SUV: upright and boxy, two-tone with a black roof and roof rails. Pearl white.
    length: 4.7, half: 0.96, wheelR: 0.39, rimR: 0.27, tyreW: 0.27, axleF: 1.38, axleR: -1.38, archR: 0.46, sill: 0.38, belt: 1.11,
    side(s) {
      s.moveTo(-2.3, 0.38);
      bottom(s, this as Spec, -2.3, 2.25);
      s.quadraticCurveTo(2.36, 0.4, 2.37, 0.6);
      s.lineTo(2.36, 0.9);
      s.quadraticCurveTo(2.33, 1.02, 2.15, 1.05);
      s.quadraticCurveTo(1.6, 1.1, 1.05, 1.12);
      s.lineTo(-2.05, 1.14);
      s.quadraticCurveTo(-2.32, 1.13, -2.34, 0.98);
      s.lineTo(-2.35, 0.55);
      s.quadraticCurveTo(-2.34, 0.38, -2.3, 0.38);
    },
    greenhouse(s) {
      s.moveTo(1.12, 1.09);
      s.quadraticCurveTo(0.78, 1.42, 0.46, 1.67);
      s.lineTo(-1.88, 1.7);
      s.quadraticCurveTo(-2.12, 1.58, -2.2, 1.11);
      s.lineTo(1.12, 1.09);
    },
    paint: "#eceeee", roof: "#141617", rim: "#5b6164", caliper: "#bfc4c6", spokes: 6,
    grille: "dots", grilleBox: { y: 0.7, h: 0.4, w: 1.2 },
    head: "strip", headY: 0.98, tail: "bar", tailY: 1.04, rails: true, darkPillars: true, exhaust: "hidden",
  },
  {
    // Grand tourer: very long bonnet, wheels pushed to the corners, fastback roof. Deep red.
    length: 4.85, half: 0.98, wheelR: 0.37, rimR: 0.275, tyreW: 0.28, axleF: 1.52, axleR: -1.42, archR: 0.43, sill: 0.26, belt: 0.9,
    side(s) {
      s.moveTo(-2.36, 0.26);
      bottom(s, this as Spec, -2.36, 2.32);
      s.quadraticCurveTo(2.45, 0.28, 2.46, 0.46);
      s.quadraticCurveTo(2.46, 0.7, 2.3, 0.76);
      s.quadraticCurveTo(1.6, 0.86, 0.78, 0.9);
      s.lineTo(-1.2, 0.93);
      s.quadraticCurveTo(-2.1, 0.96, -2.38, 0.82);
      s.quadraticCurveTo(-2.46, 0.65, -2.44, 0.45);
      s.quadraticCurveTo(-2.43, 0.27, -2.36, 0.26);
    },
    greenhouse(s) {
      s.moveTo(0.82, 0.87);
      s.quadraticCurveTo(0.36, 1.15, -0.1, 1.3);
      s.quadraticCurveTo(-0.62, 1.36, -1.02, 1.27);
      s.quadraticCurveTo(-1.66, 1.07, -2.06, 0.89);
      s.lineTo(0.82, 0.87);
    },
    paint: "#6e1018", rim: "#dfe2e4", caliper: "#1c1e1f", spokes: 10,
    grille: "mesh", grilleBox: { y: 0.52, h: 0.34, w: 0.8 },
    head: "round", headY: 0.62, tail: "oval", tailY: 0.72, exhaust: "oval",
  },
];

// ------------------------------------------------------------------ materials
function materials(spec: Spec) {
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: spec.paint, metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06 }),
    roof: new THREE.MeshPhysicalMaterial({ color: spec.roof ?? spec.paint, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }),
    glass: new THREE.MeshPhysicalMaterial({ color: "#0b1517", metalness: 0.25, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02 }),
    chrome: new THREE.MeshStandardMaterial({ color: "#e6e9eb", metalness: 1, roughness: 0.12 }),
    black: new THREE.MeshStandardMaterial({ color: "#121516", metalness: 0.2, roughness: 0.55 }),
    trim: new THREE.MeshStandardMaterial({ color: "#1b1f20", metalness: 0.4, roughness: 0.35 }),
    tyre: new THREE.MeshStandardMaterial({ color: "#151818", metalness: 0, roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: spec.rim, metalness: 0.9, roughness: 0.22 }),
    disc: new THREE.MeshStandardMaterial({ color: "#5c6164", metalness: 0.85, roughness: 0.4 }),
    caliper: new THREE.MeshStandardMaterial({ color: spec.caliper, metalness: 0.3, roughness: 0.4 }),
    head: new THREE.MeshStandardMaterial({ color: "#fdfcf5", emissive: "#fff6d8", emissiveIntensity: 1.6, metalness: 0.3, roughness: 0.1 }),
    lens: new THREE.MeshPhysicalMaterial({ color: "#cfd6d8", metalness: 0.6, roughness: 0.05, clearcoat: 1 }),
    tail: new THREE.MeshStandardMaterial({ color: "#a3121a", emissive: "#d1131c", emissiveIntensity: 1.1, roughness: 0.25 }),
    amber: new THREE.MeshStandardMaterial({ color: "#e58e1c", emissive: "#e58e1c", emissiveIntensity: 0.6 }),
  };
}

/** A number plate as a small texture (white at the front, yellow at the back, as in Tanzania). */
function plate(text: string, back: boolean) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = back ? "#f4c21b" : "#f7f7f2";
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = "#111";
  g.lineWidth = 4;
  g.strokeRect(3, 3, 250, 58);
  g.fillStyle = "#111";
  g.font = "bold 40px Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.13), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }));
}

/** Extrude a side profile across the car and round it: narrower towards the top and at both ends. */
function shell(shape: THREE.Shape, half: number, shape2: (x: number, y: number) => number, bevel = 0.06) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: half * 2 - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 36 });
  geo.translate(0, 0, -(half - bevel));
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * shape2(pos.getX(i), pos.getY(i)));
  return toCreasedNormals(geo, Math.PI / 4);
}

function wheel(spec: Spec, m: ReturnType<typeof materials>, outward: 1 | -1) {
  const R = spec.wheelR;
  const r = spec.rimR;
  const w = spec.tyreW;
  const spin = new THREE.Group();
  // Tyre with rounded shoulders, turned around the axle.
  const prof = [
    [r * 0.98, -w / 2],
    [R - 0.05, -w / 2],
    [R - 0.012, -w / 2 + 0.025],
    [R, -w / 2 + 0.07],
    [R, w / 2 - 0.07],
    [R - 0.012, w / 2 - 0.025],
    [R - 0.05, w / 2],
    [r * 0.98, w / 2],
  ].map(([a, b]) => new THREE.Vector2(a, b));
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(prof, 56), m.tyre);
  tyre.rotation.x = Math.PI / 2;
  tyre.castShadow = true;
  spin.add(tyre);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w * 0.9, 48, 1, true), m.disc);
  barrel.rotation.x = Math.PI / 2;
  spin.add(barrel);
  const face = outward * (w / 2 - 0.03);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(r - 0.012, 0.014, 10, 56), m.rim);
  lip.position.z = face;
  spin.add(lip);
  // Spokes: pairs for the saloon, Y shapes for the SUV, many thin ones for the grand tourer.
  const len = r - 0.06;
  for (let i = 0; i < spec.spokes; i++) {
    const a = (i / spec.spokes) * Math.PI * 2;
    const pair = spec.spokes === 5 ? [-0.09, 0.09] : spec.spokes === 6 ? [-0.12, 0, 0.12] : [0];
    for (const off of pair) {
      const thick = spec.spokes >= 10 ? 0.022 : 0.03;
      const sp = new THREE.Mesh(new THREE.BoxGeometry(thick, len, 0.035), m.rim);
      const ang = a + off;
      const d = len / 2 + 0.05;
      sp.position.set(Math.cos(ang) * d, Math.sin(ang) * d, face - outward * 0.012);
      // The box runs along its own y axis; turn it to point out from the hub.
      sp.rotation.z = ang - Math.PI / 2;
      spin.add(sp);
    }
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.05, 24), m.rim);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = face;
  spin.add(hub);
  for (let i = 0; i < 5; i++) {
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 8), m.chrome);
    const a = (i / 5) * Math.PI * 2;
    nut.rotation.x = Math.PI / 2;
    nut.position.set(Math.cos(a) * 0.035, Math.sin(a) * 0.035, face + outward * 0.03);
    spin.add(nut);
  }

  const still = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.028, 40), m.disc);
  disc.rotation.x = Math.PI / 2;
  disc.position.z = -outward * 0.02;
  still.add(disc);
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.17, 0.07), m.caliper);
  caliper.position.set(-r * 0.62, r * 0.42, outward * 0.02);
  caliper.rotation.z = -0.6;
  still.add(caliper);

  const g = new THREE.Group();
  g.add(still, spin);
  return { group: g, spin };
}

export type BuiltCar = { car: THREE.Group; wheels: THREE.Group[] };

export function buildCar(spec: Spec): BuiltCar {
  const m = materials(spec);
  const car = new THREE.Group();
  const H = spec.half;
  const L2 = spec.length / 2;

  // Body: tumblehome above the belt line and rounded corners seen from above.
  const bodyF = (x: number, y: number) => 1 - 0.09 * smooth(spec.belt - 0.3, spec.belt + 0.05, y) - 0.12 * smooth(L2 - 0.5, L2 + 0.05, Math.abs(x)) ** 1.6;
  const bodyShape = new THREE.Shape();
  spec.side.call(spec, bodyShape);
  const body = new THREE.Mesh(shell(bodyShape, H, bodyF, 0.07), m.paint);
  body.castShadow = true;
  car.add(body);
  const halfAt = (x: number, y: number) => H * bodyF(x, y);

  // Glasshouse in tinted glass, narrowing towards the roof.
  const ghShape = new THREE.Shape();
  spec.greenhouse.call(spec, ghShape);
  const ghPts = ghShape.getPoints(16);
  const ghTop = Math.max(...ghPts.map((p) => p.y));
  const ghH = H * 0.9;
  const ghF = (_x: number, y: number) => 1 - 0.26 * smooth(spec.belt, ghTop, y);
  const gh = new THREE.Mesh(shell(ghShape, ghH, ghF, 0.05), m.glass);
  gh.castShadow = true;
  car.add(gh);
  const ghHalf = (y: number) => ghH * ghF(0, y);

  // Roof panel over the crown of the glasshouse (black on the SUV).
  const crown = ghPts.filter((p) => p.y >= ghTop - 0.07).sort((a, b) => a.x - b.x);
  if (crown.length >= 2) {
    const roof = new THREE.Shape();
    roof.moveTo(crown[0]!.x + 0.02, crown[0]!.y - 0.035);
    for (const p of crown) roof.lineTo(p.x, p.y + 0.012);
    for (const p of [...crown].reverse()) roof.lineTo(p.x, p.y - 0.035);
    const roofMesh = new THREE.Mesh(shell(roof, ghHalf(ghTop) * 1.03, () => 1, 0.02), m.roof);
    car.add(roofMesh);
  }

  // Pillars along the windscreen and rear window, and a pillar between the doors.
  const front = ghPts.reduce((a, b) => (b.x > a.x ? b : a));
  const rear = ghPts.reduce((a, b) => (b.x < a.x ? b : a));
  const pillarMat = spec.darkPillars ? m.trim : m.roof;
  const windscreen = ghPts.filter((p) => p.x >= (crown[crown.length - 1]?.x ?? 0) - 0.01 && p.y > spec.belt - 0.02).sort((a, b) => a.y - b.y);
  const backlight = ghPts.filter((p) => p.x <= (crown[0]?.x ?? 0) + 0.01 && p.y > spec.belt - 0.02).sort((a, b) => a.y - b.y);
  for (const side of [-1, 1]) {
    for (const pts of [windscreen, backlight]) {
      if (pts.length < 2) continue;
      const path = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, p.y, side * (ghHalf(p.y) - 0.02))));
      car.add(new THREE.Mesh(new THREE.TubeGeometry(path, 24, 0.036, 8, false), pillarMat));
    }
    const bx = (front.x + rear.x) / 2 + 0.05;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, ghTop - spec.belt - 0.04, 0.02), m.trim);
    b.position.set(bx, (ghTop + spec.belt) / 2 - 0.02, side * (ghHalf((ghTop + spec.belt) / 2) + 0.005));
    car.add(b);

    // Chrome window line along the belt, and around the top of the side windows (not on the SUV).
    const beltPath = new THREE.LineCurve3(new THREE.Vector3(front.x - 0.06, spec.belt + 0.01, side * (ghHalf(spec.belt) + 0.012)), new THREE.Vector3(rear.x + 0.06, spec.belt + 0.01, side * (ghHalf(spec.belt) + 0.012)));
    car.add(new THREE.Mesh(new THREE.TubeGeometry(beltPath, 2, 0.011, 6, false), m.chrome));
    if (!spec.rails) {
      const upper = ghPts.filter((p) => p.y > spec.belt + 0.05).sort((a, b) => b.x - a.x);
      const topPath = new THREE.CatmullRomCurve3(upper.map((p) => new THREE.Vector3(p.x, p.y - 0.03, side * (ghHalf(p.y - 0.03) + 0.006))));
      car.add(new THREE.Mesh(new THREE.TubeGeometry(topPath, 40, 0.009, 6, false), m.chrome));
    }

    // Mirror on a short stalk at the base of the windscreen.
    const mirror = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.13), m.paint);
    housing.position.set(0, 0, side * 0.1);
    const glassM = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), m.lens);
    glassM.position.set(-0.101, 0, side * 0.1);
    glassM.rotation.y = -Math.PI / 2;
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.08), m.black);
    stalk.position.set(0.02, -0.04, side * 0.03);
    const signal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.01), m.amber);
    signal.position.set(0.02, -0.045, side * 0.165);
    mirror.add(housing, glassM, stalk, signal);
    mirror.position.set(front.x - 0.14, spec.belt + 0.08, side * (ghHalf(spec.belt) + 0.04));
    car.add(mirror);

    // Door handles and door gaps.
    const handleY = spec.belt - 0.09;
    for (const hx of [front.x - 0.55, bx - 0.45]) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.026, 0.022), m.chrome);
      handle.position.set(hx, handleY, side * (halfAt(hx, handleY) + 0.008));
      car.add(handle);
    }
    for (const gx of [front.x - 0.02, bx, rear.x + 0.25]) {
      const gapH = spec.belt - spec.sill - 0.06;
      const gap = new THREE.Mesh(new THREE.BoxGeometry(0.006, gapH, 0.004), m.black);
      gap.position.set(gx, spec.sill + 0.03 + gapH / 2, side * (halfAt(gx, spec.sill + 0.3) + 0.002));
      car.add(gap);
    }

    // Side skirt.
    const skirtLen = spec.axleF - spec.axleR - spec.archR * 2 - 0.04;
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(skirtLen, 0.07, 0.03), m.black);
    skirt.position.set((spec.axleF + spec.axleR) / 2, spec.sill + 0.035, side * (halfAt(0, spec.sill + 0.04) + 0.005));
    car.add(skirt);

    // Roof rails on the SUV.
    if (spec.rails) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry((crown[crown.length - 1]!.x - crown[0]!.x) * 0.92, 0.04, 0.05), m.chrome);
      rail.position.set((crown[0]!.x + crown[crown.length - 1]!.x) / 2, ghTop + 0.05, side * (ghHalf(ghTop) * 0.82));
      car.add(rail);
      for (const k of [0.1, 0.9]) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.05), m.black);
        foot.position.set(crown[0]!.x + (crown[crown.length - 1]!.x - crown[0]!.x) * k, ghTop + 0.025, side * (ghHalf(ghTop) * 0.82));
        car.add(foot);
      }
    }
  }

  // ---------------------------------------------------------------- front
  const noseX = L2 + 0.02;
  const gb = spec.grilleBox;
  const grille = new THREE.Group();
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.03, gb.h, gb.w), m.black);
  grille.add(back);
  const frame = [
    [0, gb.h / 2, gb.w + 0.04, 0.025],
    [0, -gb.h / 2, gb.w + 0.04, 0.025],
  ];
  for (const [, y, w, h] of frame) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.035, h!, w!), m.chrome);
    f.position.y = y!;
    grille.add(f);
  }
  for (const zs of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.035, gb.h + 0.025, 0.025), m.chrome);
    f.position.z = (zs * (gb.w + 0.02)) / 2;
    grille.add(f);
  }
  if (spec.grille === "slats") {
    for (let i = 1; i <= 3; i++) {
      const sl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.016, gb.w - 0.03), m.chrome);
      sl.position.set(0.012, -gb.h / 2 + (gb.h / 4) * i, 0);
      grille.add(sl);
    }
  } else if (spec.grille === "dots") {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 16; c++) {
        const d = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.028, 0.028), m.chrome);
        d.position.set(0.012, -gb.h / 2 + 0.05 + r * ((gb.h - 0.1) / 5), -gb.w / 2 + 0.05 + c * ((gb.w - 0.1) / 15) + (r % 2 ? 0.03 : 0));
        grille.add(d);
      }
    }
  } else {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 12; c++) {
        const d = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, 0.022), m.chrome);
        d.rotation.x = Math.PI / 4;
        d.position.set(0.012, -gb.h / 2 + 0.035 + r * ((gb.h - 0.07) / 6), -gb.w / 2 + 0.04 + c * ((gb.w - 0.08) / 11) + (r % 2 ? 0.03 : 0));
        grille.add(d);
      }
    }
  }
  grille.position.set(noseX - 0.01, gb.y, 0);
  car.add(grille);

  // Lower intake and front plate.
  const intake = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, H * 1.3), m.black);
  intake.position.set(noseX - 0.04, spec.sill + 0.08, 0);
  car.add(intake);
  const fp = plate("T 123 DKL", false);
  fp.rotation.y = Math.PI / 2;
  fp.position.set(noseX + 0.005, spec.sill + 0.17 + (spec.grille === "dots" ? 0.03 : 0), 0);
  car.add(fp);

  // Headlights.
  for (const side of [-1, 1]) {
    const z = side * (H * 0.66);
    if (spec.head === "round") {
      for (const [dz, rad] of [
        [0, 0.075],
        [side * -0.17, 0.055],
      ] as [number, number][]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(rad + 0.012, 0.012, 8, 32), m.chrome);
        ring.rotation.y = Math.PI / 2;
        ring.position.set(noseX - 0.06, spec.headY, z + dz);
        const lamp = new THREE.Mesh(new THREE.CircleGeometry(rad, 32), m.head);
        lamp.rotation.y = Math.PI / 2;
        lamp.position.set(noseX - 0.055, spec.headY, z + dz);
        car.add(ring, lamp);
      }
    } else if (spec.head === "strip") {
      const drl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, H * 0.62), m.head);
      drl.position.set(noseX - 0.04, spec.headY, side * H * 0.42);
      const main = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.22), m.lens);
      main.position.set(noseX - 0.04, spec.headY - 0.36, side * H * 0.66);
      const lampIn = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.05, 0.16), m.head);
      lampIn.position.set(noseX - 0.038, spec.headY - 0.36, side * H * 0.66);
      car.add(drl, main, lampIn);
    } else {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.36), m.lens);
      housing.position.set(noseX - 0.1, spec.headY, z);
      housing.rotation.x = side * 0.08;
      const drl = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.014, 0.34), m.head);
      drl.position.set(noseX - 0.098, spec.headY - 0.025, z);
      const proj = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 20), m.head);
      proj.rotation.z = Math.PI / 2;
      proj.position.set(noseX - 0.07, spec.headY + 0.01, z - side * 0.06);
      car.add(housing, drl, proj);
    }
  }

  // ---------------------------------------------------------------- rear
  const tailX = -L2 - 0.02;
  for (const side of [-1, 1]) {
    if (spec.tail === "wedge") {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.42), m.tail);
      t.position.set(tailX + 0.06, spec.tailY, side * H * 0.68);
      t.rotation.x = side * -0.12;
      car.add(t);
    } else if (spec.tail === "oval") {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 28), m.tail);
      t.rotation.z = Math.PI / 2;
      t.scale.set(1, 1, 1.9);
      t.position.set(tailX + 0.05, spec.tailY, side * H * 0.66);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.01, 8, 32), m.chrome);
      ring.rotation.y = Math.PI / 2;
      ring.scale.set(1.9, 1, 1);
      ring.position.set(tailX + 0.035, spec.tailY, side * H * 0.66);
      car.add(t, ring);
    }
  }
  if (spec.tail === "bar") {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, H * 1.7), m.tail);
    bar.position.set(tailX + 0.03, spec.tailY, 0);
    car.add(bar);
  }
  const rp = plate("T 123 DKL", true);
  rp.rotation.y = -Math.PI / 2;
  rp.position.set(tailX - 0.005, spec.tailY - (spec.tail === "bar" ? 0.32 : 0.24), 0);
  car.add(rp);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, H * 1.4), m.black);
  diffuser.position.set(tailX + 0.02, spec.sill + 0.06, 0);
  car.add(diffuser);
  if (spec.exhaust !== "hidden") {
    for (const side of [-1, 1]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 20), m.chrome);
      pipe.rotation.z = Math.PI / 2;
      if (spec.exhaust === "oval") pipe.scale.set(1, 1, 1.6);
      pipe.position.set(tailX - 0.01, spec.sill + 0.06, side * H * 0.55);
      car.add(pipe);
    }
  }

  // ---------------------------------------------------------------- wheels
  const wheels: THREE.Group[] = [];
  for (const x of [spec.axleR, spec.axleF]) {
    for (const side of [-1, 1] as const) {
      const w = wheel(spec, m, side);
      w.group.position.set(x, spec.wheelR, side * (H - spec.tyreW / 2 + 0.01));
      car.add(w.group);
      wheels.push(w.spin);
    }
  }
  car.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
  });
  return { car, wheels };
}
