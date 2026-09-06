"use strict";

/**
 * Scene3D — leichte Three.js-Ansicht als Platzhalter für das spätere
 * echte 3D-Hundemodell. Zeigt eine schematische Silhouette (Wireframe),
 * Marker für die Sensorrollen und eine Bewegungs-Punktwolke, die live aus
 * den Sensordaten gespeist wird. Wird sowohl in der Live-App als auch als
 * Schnappschuss im PDF-Bericht verwendet.
 */
window.Scene3D = (() => {
  const MAX_TRAIL_POINTS = 56;

  const ROLE_POSITIONS = {
    "back-main": { x: 0, y: 0.58, z: 0.32 },
    "pelvis": { x: 0, y: 0.5, z: -0.88 },
    "neck": { x: 0, y: 0.4, z: 1.18 },
    "front-left": { x: -0.36, y: 0.02, z: 0.82 },
    "front-right": { x: 0.36, y: 0.02, z: 0.82 }
  };

  const COLOR_OLIVE = 0x859a48;
  const COLOR_OLIVE_BRIGHT = 0xb1c86b;
  const COLOR_CYAN = 0x00e4c6;
  const COLOR_CYAN_BRIGHT = 0x65ffe6;
  const COLOR_BG = 0x070909;

  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let canvasEl = null;
  let bodyGroup = null;
  let markerMeshes = {};
  let activeRole = "back-main";
  let trailPoints = [];
  let trailGeometry = null;
  let trailMaterial = null;
  let trailObject = null;
  let ready = false;
  let resizeObserver = null;
  let frameHandle = null;

  function available() {
    return typeof window.THREE !== "undefined";
  }

  function buildPlaceholderDog() {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshBasicMaterial({
      color: COLOR_OLIVE_BRIGHT,
      wireframe: true,
      transparent: true,
      opacity: 0.65
    });

    const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), bodyMat);
    torso.scale.set(0.62, 0.42, 1.35);
    torso.position.set(0, 0.15, 0);
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), bodyMat);
    head.position.set(0, 0.36, 1.28);
    group.add(head);

    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.4, 8), bodyMat);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.3, 1.56);
    group.add(snout);

    const legPositions = [
      [-0.34, 0.82],
      [0.34, 0.82],
      [-0.34, -0.78],
      [0.34, -0.78]
    ];

    legPositions.forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 1.05, 8), bodyMat);
      leg.position.set(x, -0.35, z);
      group.add(leg);
    });

    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.11, 0.85, 8), bodyMat);
    tail.rotation.x = Math.PI / 2.6;
    tail.position.set(0, 0.32, -1.28);
    group.add(tail);

    return group;
  }

  function buildMarker(roleId, isRequired) {
    const pos = ROLE_POSITIONS[roleId];
    if (!pos) return null;

    const group = new THREE.Group();
    group.position.set(pos.x, pos.y, pos.z);

    const dotMat = new THREE.MeshBasicMaterial({
      color: isRequired ? COLOR_OLIVE_BRIGHT : 0x4a5240,
      transparent: true,
      opacity: 0.85
    });
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), dotMat);
    group.add(dot);

    const ringMat = new THREE.MeshBasicMaterial({
      color: COLOR_CYAN_BRIGHT,
      transparent: true,
      opacity: 0
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.12, 20), ringMat);
    ring.lookAt(new THREE.Vector3(0, 5, 3));
    group.add(ring);

    group.userData = { dot, ring, dotMat, ringMat };
    return group;
  }

  function setActiveRole(roleId) {
    activeRole = ROLE_POSITIONS[roleId] ? roleId : "back-main";

    Object.entries(markerMeshes).forEach(([roleId2, group]) => {
      if (!group || !group.userData) return;
      const isActive = roleId2 === activeRole;
      group.userData.dotMat.color.setHex(isActive ? COLOR_CYAN_BRIGHT : COLOR_OLIVE_BRIGHT);
      group.userData.dotMat.opacity = isActive ? 1 : 0.55;
      group.userData.ringMat.opacity = isActive ? 0.9 : 0;
      const scale = isActive ? 1.6 : 1;
      group.scale.set(scale, scale, scale);
    });
  }

  function buildTrail() {
    trailGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_TRAIL_POINTS * 3);
    const colors = new Float32Array(MAX_TRAIL_POINTS * 3);
    trailGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    trailGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    trailMaterial = new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    trailObject = new THREE.Points(trailGeometry, trailMaterial);
    trailObject.frustumCulled = false;
    return trailObject;
  }

  function refreshTrailGeometry() {
    if (!trailGeometry) return;

    const posAttr = trailGeometry.getAttribute("position");
    const colorAttr = trailGeometry.getAttribute("color");
    const cyan = new THREE.Color(COLOR_CYAN_BRIGHT);
    const bg = new THREE.Color(COLOR_BG);
    const count = trailPoints.length;

    for (let i = 0; i < MAX_TRAIL_POINTS; i += 1) {
      const point = trailPoints[i];
      const idx = i * 3;

      if (!point) {
        posAttr.array[idx] = 0;
        posAttr.array[idx + 1] = -999;
        posAttr.array[idx + 2] = 0;
        colorAttr.array[idx] = 0;
        colorAttr.array[idx + 1] = 0;
        colorAttr.array[idx + 2] = 0;
        continue;
      }

      const age = count > 1 ? i / (count - 1) : 1;
      const mixed = bg.clone().lerp(cyan, 0.18 + age * 0.82);

      posAttr.array[idx] = point.x;
      posAttr.array[idx + 1] = point.y;
      posAttr.array[idx + 2] = point.z;
      colorAttr.array[idx] = mixed.r;
      colorAttr.array[idx + 1] = mixed.g;
      colorAttr.array[idx + 2] = mixed.b;
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  }

  function pushSample(sample) {
    if (!ready || !sample) return;

    const base = ROLE_POSITIONS[sample.role] || ROLE_POSITIONS[activeRole] || ROLE_POSITIONS["back-main"];
    const lateral = Math.max(-1.4, Math.min(1.4, Number(sample.lateral) || 0));
    const motion = Math.max(0, Math.min(2.2, Number(sample.motion) || 0));
    const roll = Number(sample.roll) || 0;

    const point = {
      x: base.x + lateral * 0.32,
      y: base.y + 0.06 + motion * 0.22,
      z: base.z + Math.sin(roll * 0.05) * 0.12
    };

    trailPoints.push(point);
    if (trailPoints.length > MAX_TRAIL_POINTS) {
      trailPoints.shift();
    }

    refreshTrailGeometry();
  }

  function reset() {
    trailPoints = [];
    if (trailGeometry) refreshTrailGeometry();
  }

  function resizeToContainer() {
    if (!renderer || !canvasEl) return;
    const parent = canvasEl.parentElement;
    if (!parent) return;

    const width = parent.clientWidth || 320;
    const height = parent.clientHeight || 200;
    if (width === 0 || height === 0) return;

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function animate() {
    frameHandle = requestAnimationFrame(animate);
    if (controls) controls.update();
    else if (bodyGroup) bodyGroup.rotation.y += 0.0022;
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  function init(canvas) {
    if (ready || !canvas || !available()) return;

    canvasEl = canvas;
    scene = new THREE.Scene();
    scene.background = null;

    camera = new THREE.PerspectiveCamera(38, 4 / 3, 0.1, 20);
    camera.position.set(1.9, 1.5, 2.6);
    camera.lookAt(0, 0.2, 0);

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambient);

    bodyGroup = buildPlaceholderDog();
    scene.add(bodyGroup);

    markerMeshes = {};
    Object.keys(ROLE_POSITIONS).forEach(roleId => {
      const isRequired = roleId === "back-main" || roleId === "pelvis" || roleId === "front-left";
      const marker = buildMarker(roleId, isRequired);
      if (marker) {
        markerMeshes[roleId] = marker;
        bodyGroup.add(marker);
      }
    });

    bodyGroup.add(buildTrail());
    setActiveRole(activeRole);

    if (window.THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.enableZoom = true;
      controls.minDistance = 1.6;
      controls.maxDistance = 5;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.6;
      controls.target.set(0, 0.2, 0);
    }

    ready = true;
    resizeToContainer();

    if (window.ResizeObserver && canvas.parentElement) {
      resizeObserver = new ResizeObserver(() => resizeToContainer());
      resizeObserver.observe(canvas.parentElement);
    }

    animate();
  }

  function captureSnapshot() {
    if (!ready || !renderer || !scene || !camera) return null;
    try {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL("image/png");
    } catch (error) {
      console.warn("SCENE3D SNAPSHOT FEHLER", error);
      return null;
    }
  }

  function destroy() {
    if (frameHandle) cancelAnimationFrame(frameHandle);
    if (resizeObserver) resizeObserver.disconnect();
    ready = false;
  }

  return {
    init,
    pushSample,
    setActiveRole,
    reset,
    captureSnapshot,
    resizeToContainer,
    destroy
  };
})();
