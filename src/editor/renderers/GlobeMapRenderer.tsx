import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import type { ComponentRendererProps } from "../../types/editor";
import { useViewportDelegate } from "../hooks/useViewportDelegate";
import type { ViewportDelegate } from "../layers/ComponentLayerAdapter";
import type { CRSType } from "../../types/spatial";
import { useEventDispatcher } from "../context/SceneEditorContext";

const EARTH_RADIUS = 1;
const DEG2RAD = Math.PI / 180;

function vec3ToLatLon(v: THREE.Vector3): { lat: number; lon: number } {
  const r = v.length();
  if (r === 0) return { lat: 0, lon: 0 };
  const lat = 90 - Math.acos(v.y / r) / DEG2RAD;
  const lon = -Math.atan2(v.z, -v.x) / DEG2RAD - 180;
  return { lat, lon: ((lon + 540) % 360) - 180 };
}

export function GlobeMapRenderer({ config, componentId, width, height, spatialContext }: ComponentRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const earthRef = useRef<THREE.Mesh | null>(null);
  const frameIdRef = useRef<number>(0);
  const initRef = useRef(false);
  const setViewportDelegate = useViewportDelegate(componentId);
  const eventDispatcher = useEventDispatcher();
  const [ready, setReady] = useState(false);

  const center = (config.center as [number, number]) || [116.397, 39.908];
  const zoom = (config.zoom as number) ?? 2;
  const autoRotate = (config.autoRotate as boolean) ?? true;
  const rotateSpeed = (config.rotateSpeed as number) ?? 0.2;
  const showGrid = (config.showGrid as boolean) ?? true;
  const showAtmosphere = (config.showAtmosphere as boolean) ?? true;

  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const rotationVelocity = useRef({ x: 0, y: 0 });
  const targetRotation = useRef({ x: (90 - center[1]) * DEG2RAD, y: center[0] * DEG2RAD });
  const currentDistance = useRef(3 / Math.max(0.1, zoom * 0.5));

  const animate = useCallback(() => {
    frameIdRef.current = requestAnimationFrame(animate);

    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const earth = earthRef.current;
    if (!camera || !renderer || !scene || !earth) return;

    if (autoRotate && !isDragging.current) {
      earth.rotation.y += rotateSpeed * 0.005;
    }

    if (!isDragging.current) {
      targetRotation.current.x += rotationVelocity.current.x;
      targetRotation.current.y += rotationVelocity.current.y;
      rotationVelocity.current.x *= 0.95;
      rotationVelocity.current.y *= 0.95;
    }

    camera.position.x = currentDistance.current * Math.sin(targetRotation.current.x) * Math.cos(targetRotation.current.y);
    camera.position.y = currentDistance.current * Math.cos(targetRotation.current.x);
    camera.position.z = currentDistance.current * Math.sin(targetRotation.current.x) * Math.sin(targetRotation.current.y);
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }, [autoRotate, rotateSpeed]);

  useEffect(() => {
    if (!containerRef.current || initRef.current) return;
    initRef.current = true;

    const container = containerRef.current;
    const w = container.clientWidth || width || 800;
    const h = container.clientHeight || height || 600;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000a1e, 1);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
    const earthMat = new THREE.MeshPhongMaterial({
      color: 0x1a4a7a,
      emissive: 0x0a1a3a,
      specular: 0x333333,
      shininess: 15,
    });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    earthRef.current = earth;
    scene.add(earth);

    if (showGrid) {
      const wireGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.001, 36, 18);
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0x2196f3,
        wireframe: true,
        transparent: true,
        opacity: 0.15,
      });
      const wireframe = new THREE.Mesh(wireGeo, wireMat);
      earth.add(wireframe);

      const equatorGeo = new THREE.RingGeometry(EARTH_RADIUS * 1.002, EARTH_RADIUS * 1.008, 64);
      const equatorMat = new THREE.MeshBasicMaterial({
        color: 0x4caf50,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
      });
      const equator = new THREE.Mesh(equatorGeo, equatorMat);
      equator.rotation.x = Math.PI / 2;
      earth.add(equator);
    }

    if (showAtmosphere) {
      const atmosGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.15, 64, 64);
      const atmosMat = new THREE.ShaderMaterial({
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
            gl_FragColor = vec4(0.13, 0.59, 0.95, 1.0) * intensity * 0.8;
          }
        `,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
      });
      const atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
      scene.add(atmosphere);
    }

    const ambientLight = new THREE.AmbientLight(0x404060, 1.5);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);

    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(3000);
    for (let i = 0; i < 3000; i++) {
      starPositions[i] = (Math.random() - 0.5) * 40;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.6 });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    const canvas = renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      rotationVelocity.current = { x: 0, y: 0 };
      canvas.style.cursor = 'grabbing';
      if (eventDispatcher) {
        eventDispatcher.emitToolEvent(`${componentId}:pointerdown`, { screenX: e.clientX, screenY: e.clientY, button: e.button });
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      targetRotation.current.y += dx * 0.005;
      targetRotation.current.x += dy * 0.005;
      targetRotation.current.x = Math.max(0.1, Math.min(Math.PI - 0.1, targetRotation.current.x));
      rotationVelocity.current = { x: dy * 0.002, y: dx * 0.002 };
      lastMouse.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = () => {
      isDragging.current = false;
      canvas.style.cursor = 'grab';
      if (eventDispatcher) {
        eventDispatcher.emitToolEvent(`${componentId}:pointerup`, {});
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      currentDistance.current += e.deltaY * 0.002;
      currentDistance.current = Math.max(1.2, Math.min(10, currentDistance.current));
      if (eventDispatcher) {
        eventDispatcher.emitToolEvent(`${componentId}:zoom`, { deltaY: e.deltaY });
      }
    };

    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    animate();
    setReady(true);

    const delegate: ViewportDelegate = {
      getViewport: () => {
        const cam = cameraRef.current;
        if (!cam) {
          return {
            centerX: center[0], centerY: center[1], zoom,
            bearing: 0, pitch: 0, width: width ?? 0, height: height ?? 0,
            crs: "EPSG:4326" as CRSType,
          };
        }
        const lookDir = new THREE.Vector3();
        cam.getWorldDirection(lookDir);
        const surfacePoint = lookDir.clone().multiplyScalar(-currentDistance.current).add(cam.position);
        const { lat, lon } = vec3ToLatLon(surfacePoint);
        const effectiveZoom = 3 / currentDistance.current * 2;
        return {
          centerX: lon, centerY: lat, zoom: effectiveZoom,
          bearing: 0, pitch: 0, width: width ?? 0, height: height ?? 0,
          crs: "EPSG:4326" as CRSType,
        };
      },
      setViewport: (snapshot) => {
        targetRotation.current.x = (90 - snapshot.centerY) * DEG2RAD;
        targetRotation.current.y = snapshot.centerX * DEG2RAD;
        currentDistance.current = 3 / Math.max(0.1, snapshot.zoom * 0.5);
      },
      onViewportChange: (handler) => {
        let lastCall = 0;
        const onMove = () => {
          const now = Date.now();
          if (now - lastCall < 100) return;
          lastCall = now;
          const cam = cameraRef.current;
          if (!cam) return;
          const lookDir = new THREE.Vector3();
          cam.getWorldDirection(lookDir);
          const surfacePoint = lookDir.clone().multiplyScalar(-currentDistance.current).add(cam.position);
          const { lat, lon } = vec3ToLatLon(surfacePoint);
          const effectiveZoom = 3 / currentDistance.current * 2;
          handler({
            centerX: lon, centerY: lat, zoom: effectiveZoom,
            bearing: 0, pitch: 0, width: width ?? 0, height: height ?? 0,
            crs: "EPSG:4326" as CRSType,
          }, componentId);
        };
        const canvas = rendererRef.current?.domElement;
        if (!canvas) return () => {};
        canvas.addEventListener('pointerup', onMove);
        canvas.addEventListener('wheel', onMove);
        return () => {
          canvas.removeEventListener('pointerup', onMove);
          canvas.removeEventListener('wheel', onMove);
        };
      },
    };
    setViewportDelegate(delegate);

    return () => {
      setViewportDelegate(null);
      cancelAnimationFrame(frameIdRef.current);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      earthRef.current = null;
      initRef.current = false;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !containerRef.current) return;
    const w = width || containerRef.current.clientWidth || 800;
    const h = height || containerRef.current.clientHeight || 600;
    renderer.setSize(w, h);
    if (cameraRef.current) {
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
    }
  }, [width, height]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !containerRef.current) return;
    const observer = new ResizeObserver(() => {
      const w = containerRef.current?.clientWidth || 800;
      const h = containerRef.current?.clientHeight || 600;
      renderer.setSize(w, h);
      if (cameraRef.current) {
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (spatialContext?.clock) {
      const unsub = spatialContext.clock.subscribe((time) => {
        if (earthRef.current && autoRotate) {
          earthRef.current.rotation.y = time.elapsed * rotateSpeed * 0.01;
        }
      });
      return unsub;
    }
  }, [spatialContext?.clock, autoRotate, rotateSpeed]);

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        borderRadius: 1,
        border: "1px solid rgba(33,150,243,0.15)",
        background: "#000a1e",
      }}
    >
      <Box
        ref={containerRef}
        sx={{
          width: "100%",
          height: "100%",
        }}
      />
      {!ready && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,10,30,0.9)",
            gap: 1,
          }}
        >
          <CircularProgress size={24} sx={{ color: "rgba(33,150,243,0.6)" }} />
          <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.5)" }}>
            三维地球加载中...
          </Typography>
        </Box>
      )}
    </Box>
  );
}
