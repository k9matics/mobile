"use strict";

/*
  K9matics / HARNELYZER — 3D Motion View
  Lädt bevorzugt das GLB-Modell unter ./models/13466_Canaan_Dog_v1_L3.glb.
  Bei Ladefehler wird ein prozeduraler Wireframe-Hund verwendet.
*/
window.Scene3D = (() => {
  const MODEL_URL = "./models/13466_Canaan_Dog_v1_L3.glb";
  const MAX_TRAIL_POINTS = 56;

  const ROLE_POSITIONS = {
    "back-main": { x: 0, y: 0.58, z: 0.32 },
    pelvis: { x: 0, y: 0.5, z: -0.88 },
    neck: { x: 0, y: 0.4, z: 1.18 },
    "front-left": { x: -0.36, y: 0.02, z: 0.82 },
    "front-right": { x: 0.36, y: 0.02, z: 0.82 },
    "hind-left": { x: -0.36, y: 0.02, z: -0.78 },
    "hind-right": { x: 0.36, y: 0.02, z: -0.78 }
  };

  const COLOR_OLIVE_BRIGHT = 0xb1c86b;
  const COLOR_CYAN_BRIGHT = 0x65ffe6;
  const COLOR_BG = 0x070909;

  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let canvasEl = null;
  let bodyGroup = null;
  let markerRoot = null;
  let markerMeshes = {};
  let activeRole = "back-main";
  let trailPoints = [];
  let trailGeometry = null;
  let trailObject = null;
  let ready = false;
  let resizeObserver = null;
  let frameHandle = null;
  let animationMixer = null;
  let modelLoaded = false;

  function available() {
    return typeof window.THREE !== "undefined";
  }

  function buildPlaceholderDog() {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
      color: COLOR_OLIVE_BRIGHT,
      wireframe: true,
      transparent: true,
      opacity: 0.65
    });

    const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), material);
    torso.scale.set(0.62, 0.42, 1.35);
    torso.position.set(0, 0.15, 0);
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), material);
    head.position.set(0, 0.36, 1.28);
    group.add(head);

    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.4, 8), material);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.3, 1.56);
    group.add(snout);

    [
      [-0.34, 0.82],
      [0.34, 0.82],
      [-0.34, -0.78],
      [0.34, -0.78]
    ].forEach(([x, z]) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.095, 1.05, 8),
        material
      );
      leg.position.set(x, -0.35, z);
      group.add(leg);
    });

    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.11, 0.85, 8), material);
    tail.rotation.x = Math.PI / 2.6;
    tail.position.set(0, 0.32, -1.28);
    group.add(tail);

    return group;
  }

  function disposeObject(object) {
    if (!object) return;
    object.traverse?.(child => {
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.filter(Boolean).forEach(material => material.dispose?.());
    });
  }

  function replaceDogModel(nextModel) {
    if (!bodyGroup) return;
    const oldModel = bodyGroup.getObjectByName("dog-model");
    if (oldModel) {
      bodyGroup.remove(oldModel);
      disposeObject(oldModel);
    }

    nextModel.name = "dog-model";
    bodyGroup.add(nextModel);
  }

  function normalizeModel(model) {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const longestSide = Math.max(size.x, size.y, size.z, 0.001);
    const targetLength = 2.7;
    const scale = targetLength / longestSide;

    model.scale.multiplyScalar(scale);
    model.position.sub(center.multiplyScalar(scale));

    const normalizedBox = new THREE.Box3().setFromObject(model);
    const normalizedSize = new THREE.Vector3();
    normalizedBox.getSize(normalizedSize);

    model.position.y -= normalizedBox.min.y;
    model.rotation.y = Math.PI;
  }

  function loadDogModel() {
    if (!window.THREE?.GLTFLoader || !bodyGroup) {
      return;
    }

    const loader = new THREE.GLTFLoader();
    loader.load(
      MODEL_URL,
      gltf => {
        const model = gltf.scene;
        normalizeModel(model);
        replaceDogModel(model);
        modelLoaded = true;

        if (Array.isArray(gltf.animations) && gltf.animations.length > 0) {
          animationMixer = new THREE.AnimationMixer(model);
          const action = animationMixer.clipAction(gltf.animations[0]);
          action.play();
        }
      },
      undefined,
      error => {
        console.warn("CANAAN-DOG-GLB NICHT GELADEN — PLATZHALTER WIRD VERWENDET", error);
      }
    );
  }

  function buildMarker(roleId) {
    const position = ROLE_POSITIONS[roleId];
    if (!position) return null;

    const group = new THREE.Group();
    group.position.set(position.x, position.y, position.z);

    const dotMaterial = new THREE.MeshBasicMaterial({
      color: COLOR_OLIVE_BRIGHT,
      transparent: true,
      opacity: 0.6
    });
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), dotMaterial);
    group.add(dot);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: COLOR_CYAN_BRIGHT,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.12, 20), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    group.userData = { dotMaterial, ringMaterial };
    return group;
  }

  function setActiveRole(roleId) {
    activeRole = ROLE_POSITIONS[roleId] ? roleId : "back-main";

    Object.entries(markerMeshes).forEach(([id, group]) => {
      if (!group?.userData) return;
      const selected = id === activeRole;
      group.userData.dotMaterial.color.setHex(selected ? COLOR_CYAN_BRIGHT : COLOR_OLIVE_BRIGHT);
      group.userData.dotMaterial.opacity = selected ? 1 : 0.55;
      group.userData.ringMaterial.opacity = selected ? 0.9 : 0;
      group.scale.setScalar(selected ? 1.6 : 1);
    });
  }

  function buildTrail() {
    trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(MAX_TRAIL_POINTS * 3), 3)
    );
    trailGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(MAX_TRAIL_POINTS * 3), 3)
    );

    const material = new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    trailObject = new THREE.Points(trailGeometry, material);
    trailObject.frustumCulled = false;
    return trailObject;
  }

  function refreshTrailGeometry() {
    if (!trailGeometry) return;

    const positionAttribute = trailGeometry.getAttribute("position");
    const colorAttribute = trailGeometry.getAttribute("color");
    const cyan = new THREE.Color(COLOR_CYAN_BRIGHT);
    const background = new THREE.Color(COLOR_BG);
    const count = trailPoints.length;

    for (let index = 0; index < MAX_TRAIL_POINTS; index += 1) {
      const point = trailPoints[index];
      const offset = index * 3;

      if (!point) {
        positionAttribute.array[offset] = 0;
        positionAttribute.array[offset + 1] = -999;
        positionAttribute.array[offset + 2] = 0;
        colorAttribute.array[offset] = 0;
        colorAttribute.array[offset + 1] = 0;
        colorAttribute.array[offset + 2] = 0;
        continue;
      }

      const age = count > 1 ? index / (count - 1) : 1;
      const color = background.clone().lerp(cyan, 0.18 + age * 0.82);

      positionAttribute.array[offset] = point.x;
      positionAttribute.array[offset + 1] = point.y;
      positionAttribute.array[offset + 2] = point.z;
      colorAttribute.array[offset] = color.r;
      colorAttribute.array[offset + 1] = color.g;
      colorAttribute.array[offset + 2] = color.b;
    }

    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    trailGeometry.computeBoundingSphere();
  }

  function pushSample(sample) {
    if (!ready || !sample) return;

    const base = ROLE_POSITIONS[sample.role] || ROLE_POSITIONS[activeRole];
    const lateral = THREE.MathUtils.clamp(Number(sample.lateral) || 0, -1.4, 1.4);
    const motion = THREE.MathUtils.clamp(Number(sample.motion) || 0, 0, 2.2);
    const roll = Number(sample.roll) || 0;

    trailPoints.push({
      x: base.x + lateral * 0.32,
      y: base.y + 0.06 + motion * 0.22,
      z: base.z + Math.sin(roll * 0.05) * 0.12
    });

    if (trailPoints.length > MAX_TRAIL_POINTS) trailPoints.shift();
    refreshTrailGeometry();
  }

  function reset() {
    trailPoints = [];
    refreshTrailGeometry();
  }

  function resizeToContainer() {
    if (!renderer || !canvasEl || !camera) return;
    const parent = canvasEl.parentElement;
    if (!parent) return;

    const width = parent.clientWidth || 320;
    const height = parent.clientHeight || 200;
    if (!width || !height) return;

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function attachResizeObserver() {
    resizeObserver?.disconnect();
    resizeObserver = null;

    if (window.ResizeObserver && canvasEl?.parentElement) {
      resizeObserver = new ResizeObserver(resizeToContainer);
      resizeObserver.observe(canvasEl.parentElement);
    }
  }

  function onReparent() {
    if (!ready) return;
    resizeToContainer();
    attachResizeObserver();
  }

  function animate() {
    frameHandle = requestAnimationFrame(animate);
    if (animationMixer) animationMixer.update(1 / 60);
    if (controls) controls.update();
    else if (bodyGroup) bodyGroup.rotation.y += 0.0022;
    renderer?.render(scene, camera);
  }

  function init(canvas) {
    if (ready || !canvas || !available()) return;

    canvasEl = canvas;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 4 / 3, 0.1, 20);
    camera.position.set(1.9, 1.5, 2.6);
    camera.lookAt(0, 0.45, 0);

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    scene.add(new THREE.HemisphereLight(0xeaffdf, 0x07100d, 2.4));

    bodyGroup = new THREE.Group();
    scene.add(bodyGroup);
    replaceDogModel(buildPlaceholderDog());

    markerRoot = new THREE.Group();
    markerMeshes = {};
    Object.keys(ROLE_POSITIONS).forEach(roleId => {
      const marker = buildMarker(roleId);
      if (!marker) return;
      markerMeshes[roleId] = marker;
      markerRoot.add(marker);
    });
    bodyGroup.add(markerRoot);
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
      controls.target.set(0, 0.45, 0);
    }

    ready = true;
    resizeToContainer();
    attachResizeObserver();
    loadDogModel();
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
    resizeObserver?.disconnect();
    controls?.dispose?.();
    renderer?.dispose?.();
    ready = false;
  }

  return {
    init,
    pushSample,
    setActiveRole,
    reset,
    captureSnapshot,
    resizeToContainer,
    onReparent,
    destroy,
    get modelLoaded() {
      return modelLoaded;
    }
  };
})();
