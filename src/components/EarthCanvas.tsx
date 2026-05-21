import { useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";

declare global {
  interface Window {
    THREE: any;
  }
}

// ─── SHOOTING STAR (METEORITE) ──────────────────────────────────────────────
export const ShootingStar = ({ delay = 0 }: { delay?: number }) => {
  const startX = useMemo(() => Math.random() * 100 + 20, []);
  const startY = useMemo(() => Math.random() * 50 - 20, []);
  const repeatDelay = useMemo(() => Math.random() * 7 + 3, []);

  return (
    <motion.div
      className="absolute pointer-events-none z-0 flex items-center justify-end"
      style={{
        top: `${startY}vh`,
        left: `${startX}vw`,
        width: "180px",
        height: "2px",
        background:
          "linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.6) 50%, rgba(255,255,255,1) 100%)",
        transformOrigin: "right",
      }}
      initial={{ x: 0, y: 0, opacity: 0, rotate: -45 }}
      animate={{ x: -1500, y: 1500, opacity: [0, 1, 1, 0] }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        delay: delay,
        ease: "linear",
        repeatDelay: repeatDelay,
      }}
    >
      <div className="w-[4px] h-[4px] bg-white rounded-full shadow-[0_0_15px_4px_rgba(255,255,255,0.8)]" />
    </motion.div>
  );
};

// ─── 3D EARTH (Three.js) ─────────────────────────────────────────────────
export const EarthCanvas = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!mountRef.current) return;

    const initThree = () => {
      const THREE = window.THREE;
      const container = mountRef.current!;
      const W = container.clientWidth;
      const H = container.clientHeight;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      container.appendChild(renderer.domElement);

      // UX: Make it clear it's draggable
      container.style.cursor = "grab";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
      camera.position.z = 2.8;

      // Create a master group for the Earth and Network so they spin together
      const globeGroup = new THREE.Group();
      scene.add(globeGroup);

      // ── EARTH TEXTURE ──────────────────────────────────────────
      const texCanvas = document.createElement("canvas");
      texCanvas.width = 1024;
      texCanvas.height = 512;
      const ctx = texCanvas.getContext("2d")!;
      const oceanGrad = ctx.createLinearGradient(0, 0, 0, 512);
      oceanGrad.addColorStop(0, "#0d1a3a");
      oceanGrad.addColorStop(0.5, "#0a2050");
      oceanGrad.addColorStop(1, "#061228");
      ctx.fillStyle = oceanGrad;
      ctx.fillRect(0, 0, 1024, 512);

      const landMasses = [
        { x: 200, y: 180, rx: 60, ry: 100, rot: -0.3 },
        { x: 220, y: 320, rx: 45, ry: 80, rot: 0.2 },
        { x: 530, y: 170, rx: 55, ry: 70, rot: 0.1 },
        { x: 545, y: 310, rx: 50, ry: 90, rot: 0 },
        { x: 700, y: 150, rx: 130, ry: 90, rot: -0.1 },
        { x: 790, y: 340, rx: 55, ry: 40, rot: 0.2 },
      ];
      landMasses.forEach(({ x, y, rx, ry, rot }) => {
        ctx.fillStyle = "#1a5c32";
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#217a42";
        ctx.beginPath();
        ctx.ellipse(x - 5, y - 5, rx * 0.75, ry * 0.75, rot, 0, Math.PI * 2);
        ctx.fill();
      });

      const pG = ctx.createRadialGradient(512, 0, 0, 512, 0, 90);
      pG.addColorStop(0, "rgba(200,230,255,0.85)");
      pG.addColorStop(1, "rgba(200,230,255,0)");
      ctx.fillStyle = pG;
      ctx.fillRect(0, 0, 1024, 90);
      const pG2 = ctx.createRadialGradient(512, 512, 0, 512, 512, 80);
      pG2.addColorStop(0, "rgba(200,230,255,0.75)");
      pG2.addColorStop(1, "rgba(200,230,255,0)");
      ctx.fillStyle = pG2;
      ctx.fillRect(0, 430, 1024, 82);
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      for (let i = 0; i < 20; i++) {
        ctx.beginPath();
        ctx.ellipse(
          Math.random() * 1024,
          Math.random() * 512,
          50 + Math.random() * 90,
          10 + Math.random() * 20,
          Math.random() * 0.6,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      const texture = new THREE.CanvasTexture(texCanvas);

      // ── NIGHT LIGHTS ──────────────────────────────────────────
      const nightC = document.createElement("canvas");
      nightC.width = 1024;
      nightC.height = 512;
      const nCtx = nightC.getContext("2d")!;
      nCtx.fillStyle = "#000";
      nCtx.fillRect(0, 0, 1024, 512);
      [
        [200, 170],
        [215, 325],
        [530, 160],
        [700, 145],
        [740, 200],
        [680, 170],
        [790, 340],
        [550, 310],
        [600, 180],
        [460, 175],
      ].forEach(([cx, cy]) => {
        const g = nCtx.createRadialGradient(cx, cy, 0, cx, cy, 45);
        g.addColorStop(0, "rgba(255,210,100,0.9)");
        g.addColorStop(0.4, "rgba(255,170,60,0.3)");
        g.addColorStop(1, "rgba(255,140,30,0)");
        nCtx.fillStyle = g;
        nCtx.beginPath();
        nCtx.arc(cx, cy, 45, 0, Math.PI * 2);
        nCtx.fill();
      });
      const nightTex = new THREE.CanvasTexture(nightC);

      const geo = new THREE.SphereGeometry(1, 64, 64);
      const mat = new THREE.MeshPhongMaterial({
        map: texture,
        emissiveMap: nightTex,
        emissive: new THREE.Color(0xffaa22),
        emissiveIntensity: 0.4,
        specular: new THREE.Color(0x3366ff),
        shininess: 25,
      });
      const earth = new THREE.Mesh(geo, mat);
      globeGroup.add(earth);

      // ── GLOBAL NETWORK OVERLAY ────────────────────────────────
      const networkGroup = new THREE.Group();
      const numNodes = 35;
      const nodes: any[] = [];
      const nodeGeo = new THREE.SphereGeometry(0.012, 8, 8);
      const nodeMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });

      for (let i = 0; i < numNodes; i++) {
        const v = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5,
        )
          .normalize()
          .multiplyScalar(1.01);
        nodes.push(v);
        const mesh = new THREE.Mesh(nodeGeo, nodeMat);
        mesh.position.copy(v);
        networkGroup.add(mesh);
      }

      const lineMat = new THREE.LineBasicMaterial({
        color: 0x8b5cf6,
        transparent: true,
        opacity: 0.3,
      });
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          if (nodes[i].distanceTo(nodes[j]) < 0.75) {
            const mid = nodes[i]
              .clone()
              .add(nodes[j])
              .multiplyScalar(0.5)
              .normalize()
              .multiplyScalar(1.12);
            const curve = new THREE.QuadraticBezierCurve3(
              nodes[i],
              mid,
              nodes[j],
            );
            const points = curve.getPoints(12);
            const curveGeo = new THREE.BufferGeometry().setFromPoints(points);
            networkGroup.add(new THREE.Line(curveGeo, lineMat));
          }
        }
      }
      globeGroup.add(networkGroup);

      // ── ATMOSPHERE ────────────────────────────────────────────
      const atmMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.05, 64, 64),
        new THREE.MeshPhongMaterial({
          color: 0x4488ff,
          transparent: true,
          opacity: 0.08,
        }),
      );
      globeGroup.add(atmMesh);

      scene.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(1.15, 64, 64),
          new THREE.MeshPhongMaterial({
            color: 0x2255cc,
            transparent: true,
            opacity: 0.04,
          }),
        ),
      );

      // ── ORBITAL RING ───────────────────────────────────────────
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.48, 0.004, 2, 120),
        new THREE.MeshBasicMaterial({
          color: 0x6366f1,
          transparent: true,
          opacity: 0.35,
        }),
      );
      ring.rotation.x = Math.PI * 0.35;
      scene.add(ring);

      // ── FIXED & VISIBLE ORBITING TOKEN (₱) ───────────────────
      const tokenC = document.createElement("canvas");
      tokenC.width = 128; // Increased resolution
      tokenC.height = 128;
      const tCtx = tokenC.getContext("2d")!;

      // Outer Glow
      tCtx.shadowColor = "#10B981";
      tCtx.shadowBlur = 15;
      tCtx.fillStyle = "rgba(16,185,129,0.2)";
      tCtx.beginPath();
      tCtx.arc(64, 64, 45, 0, Math.PI * 2);
      tCtx.fill();

      // Ring
      tCtx.strokeStyle = "#10B981";
      tCtx.lineWidth = 4;
      tCtx.stroke();

      // Text Settings
      tCtx.shadowBlur = 0; // Remove shadow for crisp text
      tCtx.fillStyle = "#ffffff";
      tCtx.font = "bold 55px Arial, Helvetica, sans-serif"; // Standard safe font
      tCtx.textAlign = "center";
      tCtx.textBaseline = "middle";
      tCtx.fillText("₱", 64, 68); // Adjusted Y for optical centering

      const tokenTex = new THREE.CanvasTexture(tokenC);
      tokenTex.needsUpdate = true;
      const tokenSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tokenTex, transparent: true }),
      );
      tokenSprite.scale.set(0.4, 0.4, 1); // Increased scale
      scene.add(tokenSprite);

      // ── BACKGROUND STARS ───────────────────────────────────────
      const sv: number[] = [];
      for (let i = 0; i < 2000; i++) {
        const t2 = Math.random() * Math.PI * 2,
          p = Math.acos(2 * Math.random() - 1),
          r = 40 + Math.random() * 20;
        sv.push(
          r * Math.sin(p) * Math.cos(t2),
          r * Math.sin(p) * Math.sin(t2),
          r * Math.cos(p),
        );
      }
      const starsGeo = new THREE.BufferGeometry();
      starsGeo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(sv, 3),
      );
      scene.add(
        new THREE.Points(
          starsGeo,
          new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.07,
            transparent: true,
            opacity: 0.6,
          }),
        ),
      );

      // ── LIGHTING ───────────────────────────────────────────────
      scene.add(new THREE.AmbientLight(0x334466, 0.6));
      const sun = new THREE.DirectionalLight(0xffffff, 1.2);
      sun.position.set(5, 3, 5);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x2244aa, 0.3);
      fill.position.set(-3, -1, -3);
      scene.add(fill);

      // ── DRAG TO ROTATE CONTROLS ───────────────────────────────
      let isDragging = false;
      let previousMousePosition = { x: 0, y: 0 };

      // Mouse Events
      container.addEventListener("mousedown", (e) => {
        isDragging = true;
        container.style.cursor = "grabbing";
        previousMousePosition = { x: e.clientX, y: e.clientY };
      });
      window.addEventListener("mousemove", (e) => {
        if (isDragging) {
          const deltaX = e.clientX - previousMousePosition.x;
          const deltaY = e.clientY - previousMousePosition.y;
          globeGroup.rotation.y += deltaX * 0.005;
          globeGroup.rotation.x += deltaY * 0.005;

          // Clamp vertical rotation so you don't flip the earth upside down
          globeGroup.rotation.x = Math.max(
            -Math.PI / 2,
            Math.min(Math.PI / 2, globeGroup.rotation.x),
          );

          previousMousePosition = { x: e.clientX, y: e.clientY };
        }
      });
      window.addEventListener("mouseup", () => {
        isDragging = false;
        container.style.cursor = "grab";
      });

      // Touch Events (Mobile)
      container.addEventListener(
        "touchstart",
        (e) => {
          isDragging = true;
          previousMousePosition = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
          };
        },
        { passive: true },
      );
      container.addEventListener(
        "touchmove",
        (e) => {
          if (isDragging) {
            e.preventDefault(); // Stop page scrolling when touching the earth
            const deltaX = e.touches[0].clientX - previousMousePosition.x;
            const deltaY = e.touches[0].clientY - previousMousePosition.y;
            globeGroup.rotation.y += deltaX * 0.005;
            globeGroup.rotation.x += deltaY * 0.005;
            globeGroup.rotation.x = Math.max(
              -Math.PI / 2,
              Math.min(Math.PI / 2, globeGroup.rotation.x),
            );
            previousMousePosition = {
              x: e.touches[0].clientX,
              y: e.touches[0].clientY,
            };
          }
        },
        { passive: false },
      );
      window.addEventListener("touchend", () => {
        isDragging = false;
      });

      const onResize = () => {
        const W2 = container.clientWidth,
          H2 = container.clientHeight;
        camera.aspect = W2 / H2;
        camera.updateProjectionMatrix();
        renderer.setSize(W2, H2);
      };
      window.addEventListener("resize", onResize);

      // ── ANIMATION LOOP ─────────────────────────────────────────
      let t = 0;
      const animate = () => {
        animRef.current = requestAnimationFrame(animate);
        t += 0.005;

        // Auto-spin ONLY if the user isn't currently dragging it
        if (!isDragging) {
          globeGroup.rotation.y += 0.0015;
        }

        const orbitTilt = Math.PI * 0.35,
          orbitR = 1.48;
        tokenSprite.position.set(
          orbitR * Math.cos(t),
          orbitR * Math.sin(t) * Math.sin(orbitTilt),
          orbitR * Math.sin(t) * Math.cos(orbitTilt),
        );
        ring.material.opacity = 0.25 + 0.1 * Math.sin(t * 2);

        renderer.render(scene, camera);
      };
      animate();

      (container as any)._cleanup = () => {
        cancelAnimationFrame(animRef.current);
        window.removeEventListener("resize", onResize);
        renderer.dispose();
        if (container.contains(renderer.domElement))
          container.removeChild(renderer.domElement);
      };
    };

    if (window.THREE) {
      initThree();
      return;
    }
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    script.async = true;
    script.onload = initThree;
    document.head.appendChild(script);

    return () => {
      (mountRef.current as any)?._cleanup?.();
    };
  }, []);

  return (
    <div
      className="relative"
      style={{
        width: "min(420px,100%)",
        height: "min(420px,80vw)",
        margin: "0 auto",
      }}
    >
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle,rgba(59,130,246,0.15) 0%,rgba(99,102,241,0.08) 50%,transparent 70%)",
          filter: "blur(20px)",
          transform: "scale(1.2)",
        }}
      />
      <div
        ref={mountRef}
        className="w-full h-full rounded-full overflow-hidden"
      />
      {[
        { top: "20%", left: "25%", color: "#10B981", delay: 0 },
        { top: "55%", left: "65%", color: "#6366f1", delay: 1.5 },
        { top: "75%", left: "35%", color: "#f59e0b", delay: 3 },
      ].map((ping, i) => (
        <motion.div
          key={i}
          className="absolute pointer-events-none"
          style={{ top: ping.top, left: ping.left }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            delay: ping.delay,
            ease: "easeOut",
          }}
        >
          <div
            className="w-3 h-3 rounded-full"
            style={{
              background: ping.color,
              boxShadow: `0 0 12px ${ping.color}`,
            }}
          />
        </motion.div>
      ))}
    </div>
  );
};
