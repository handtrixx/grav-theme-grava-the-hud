// HUD gutter head — wireframe WebGL illustration in the About page gutter.
// Real scanned head mesh (LeePerrySmith, from three.js examples), rendered as
// wireframe only over the page background: teal wireframe + theme-aware ghost
// wireframe (white on dark, ink on light) + vertex points, like the
// webgl_materials_wireframe example. Scroll orbits it front -> lateral ->
// top; a vertex-colour scan band sweeps the mesh. Pauses off-screen/hidden.
(() => {
  const stage = document.querySelector('.sketch-stage');
  if (!stage) return;
  const sketch = stage.closest('.hud-sketch') || stage;
  const hide = () => { sketch.style.display = 'none'; };
  let started = false;

  const start = () => {
    if (started) return;
    started = true;
    const canvas = stage.querySelector('canvas');
    if (!canvas) return;

    const caps = {
      front: stage.querySelector('.cap-front'),
      side: stage.querySelector('.cap-side'),
      top: stage.querySelector('.cap-top'),
    };
    const readout = stage.querySelector('.sketch-readout');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    Promise.all([
      import('three'),
      import('three/addons/loaders/GLTFLoader.js'),
    ]).then(([THREE, { GLTFLoader }]) => {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (e) {
      hide();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);

    const ACCENT = new THREE.Color(0x18a98a);
    const head = new THREE.Group();
    scene.add(head);

    let wireGeo = null;
    let wireColors = null;
    let loaded = false;

    new GLTFLoader().load(
      '/user/themes/grava-the-hud/js/models/LeePerrySmith.402b8a8ac9.glb',
      (gltf) => {
        const src = gltf.scene;
        src.updateMatrixWorld(true);
        const mesh = src.children.find((c) => c.isMesh);
        if (!mesh) return hide();

        const geo = mesh.geometry.clone();
        geo.applyMatrix4(mesh.matrixWorld);
        // crop the bust below the neck: keep only head + neck triangles
        geo.computeBoundingBox();
        const bb0 = geo.boundingBox;
        const h0 = bb0.getSize(new THREE.Vector3()).y;
        if (geo.index) {
          const cropY = bb0.min.y + h0 * 0.3;
          const src = geo.index;
          const pa = geo.attributes.position;
          const keep = [];
          for (let i = 0; i < src.count; i += 3) {
            const a = src.getX(i), b = src.getX(i + 1), c = src.getX(i + 2);
            if ((pa.getY(a) + pa.getY(b) + pa.getY(c)) / 3 > cropY) keep.push(a, b, c);
          }
          geo.setIndex(keep);
        }
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        const size = bb.getSize(new THREE.Vector3());
        const center = bb.getCenter(new THREE.Vector3());
        geo.translate(-center.x, -center.y, -center.z);
        const scale = 2.0 / size.y;
        geo.scale(scale, scale, scale);

        // wireframe only — no solid shell, the mesh floats over the page background
        // raw wireframe: draw only ~80% of the mesh's unique edges, chosen
        // deterministically (fixed seed) so gaps are stable, not flickering
        function sparseEdges(src, ratio) {
          const pos = src.attributes.position;
          const idx = src.index;
          let state = 0x9e3779b9;
          const rnd = () => {
            state |= 0;
            state = (state + 0x6d2b79f5) | 0;
            let x = Math.imul(state ^ (state >>> 15), 1 | state);
            x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
          };
          const seen = new Set();
          const verts = [];
          for (let t = 0; t < idx.count; t += 3) {
            const tri = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
            for (let e = 0; e < 3; e++) {
              const a = tri[e], b = tri[(e + 1) % 3];
              const key = a < b ? a + '_' + b : b + '_' + a;
              if (seen.has(key)) continue;
              seen.add(key);
              if (rnd() > ratio) continue;
              verts.push(pos.getX(a), pos.getY(a), pos.getZ(a));
              verts.push(pos.getX(b), pos.getY(b), pos.getZ(b));
            }
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
          return g;
        }
        wireGeo = sparseEdges(geo, 0.8);
        wireColors = new Float32Array(wireGeo.attributes.position.count * 3);
        wireGeo.setAttribute('color', new THREE.BufferAttribute(wireColors, 3));
        const wire = new THREE.LineSegments(
          wireGeo,
          new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 })
        );
        head.add(wire);

        const ghost = new THREE.LineSegments(
          wireGeo,
          new THREE.LineBasicMaterial({ transparent: true, opacity: 0.28 })
        );
        ghost.scale.setScalar(1.016);
        ghost.position.x = 0.03;
        head.add(ghost);

        const pts = new THREE.Points(
          wireGeo,
          new THREE.PointsMaterial({ color: ACCENT, size: 0.02, transparent: true, opacity: 0.5 })
        );
        pts.scale.setScalar(1.01);
        head.add(pts);

        function applyTheme() {
          const light = document.documentElement.getAttribute('data-theme') === 'light';
          ghost.material.color.set(light ? 0x1d2426 : 0xf2f5f4);
          ghost.material.opacity = light ? 0.3 : 0.28;
        }
        applyTheme();
        new MutationObserver(applyTheme)
          .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        loaded = true;
      },
      undefined,
      () => hide()
    );

    const smooth = (a, b, x) => {
      const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
      return t * t * (3 - 2 * t);
    };
    const scrollProgress = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;
    };
    const fade = (el, v) => { el.style.opacity = v.toFixed(2); };
    const bell = (p, a, b) => smooth(a, a + (b - a) * 0.4, p) * (1 - smooth(a + (b - a) * 0.6, b, p));

    let visible = true;
    new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { threshold: 0 })
      .observe(stage);

    function resize() {
      const w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    const start = performance.now();
    renderer.setAnimationLoop(() => {
      if (!visible || document.hidden || !loaded) return;
      const t = (performance.now() - start) / 1000;
      const p = scrollProgress();

      // starts turned to the left (~55 deg), orbits through front to lateral
      head.rotation.y = -0.96 + p * 2.95 + (reduced ? 0 : Math.sin(t * 0.3) * 0.07);
      head.rotation.z = reduced ? 0 : Math.sin(t * 0.35) * 0.03;
      camera.position.set(0, 0.15 + smooth(0.6, 1, p) * 1.25, 3.4);
      camera.lookAt(0, 0, 0);

      // scan band sweeping the head in vertex colours
      const scanY = reduced ? 0.4 : Math.sin(t * 0.55) * 1.1;
      const pos = wireGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const b = 0.3 + 0.8 * Math.exp(-((y - scanY) ** 2) / 0.03);
        wireColors[i * 3] = ACCENT.r * b;
        wireColors[i * 3 + 1] = ACCENT.g * b;
        wireColors[i * 3 + 2] = ACCENT.b * b;
      }
      wireGeo.attributes.color.needsUpdate = true;

      fade(caps.front, bell(p, 0.12, 0.5));
      fade(caps.side, bell(p, 0.5, 0.82));
      fade(caps.top, smooth(0.72, 0.88, p));
      if (readout) {
        const yaw = (head.rotation.y * 180 / Math.PI).toFixed(0);
        const elev = (camera.position.y * 36).toFixed(0);
        readout.textContent = `YAW ${yaw}\u00b0  ELEV ${elev}\u00b0  \u25b8 ${p.toFixed(2)}`;
      }
      renderer.render(scene, camera);
    });
    }).catch(hide);
  };

  // Below 1180px .hud-sketch is display:none (css/custom.css) - never fetch the
  // ~1.1 MB of three.js + head model for a viewport that cannot show it; load
  // on demand if the window is resized to desktop width (tracker #84).
  if (getComputedStyle(sketch).display === 'none') {
    window.addEventListener('resize', () => {
      if (getComputedStyle(sketch).display !== 'none') start();
    });
    return;
  }
  // Desktop: still keep the deps out of the critical path until the stage is
  // about to enter the viewport.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
    }, { rootMargin: '300px' });
    io.observe(stage);
  } else {
    start();
  }
})();
