import * as THREE from 'three';

export type MeasureMode = 'distance' | 'area' | 'angle' | 'coordinate';

export interface MeasureResult {
  mode: MeasureMode;
  value: number;
  formatted: string;
  points: Array<{ x: number; y: number }>;
}

export class MeasureTool {
  private _mode: MeasureMode = 'distance';
  private _points: Array<{ x: number; y: number }> = [];
  private _scene: THREE.Scene | null = null;
  private _markers: THREE.Object3D[] = [];
  private _lines: THREE.Object3D[] = [];
  private _camera: THREE.OrthographicCamera | null = null;
  private _canvasWidth = 0;
  private _onResult?: (result: MeasureResult) => void;
  private _onPreview?: (preview: MeasureResult | null) => void;
  private _isActive = false;

  setScene(scene: THREE.Scene): void {
    this._scene = scene;
  }

  setCamera(camera: THREE.OrthographicCamera): void {
    this._camera = camera;
  }

  setCanvasSize(width: number, _height: number): void {
    this._canvasWidth = width;
  }

  setMode(mode: MeasureMode): void {
    this._mode = mode;
    this.clear();
  }

  getMode(): MeasureMode {
    return this._mode;
  }

  setCallbacks(onResult?: (result: MeasureResult) => void, onPreview?: (preview: MeasureResult | null) => void): void {
    this._onResult = onResult;
    this._onPreview = onPreview;
  }

  isActive(): boolean {
    return this._isActive;
  }

  start(): void {
    this._isActive = true;
    this._points = [];
    this.clearVisuals();
  }

  stop(): void {
    this._isActive = false;
    this.clear();
  }

  addPoint(worldX: number, worldY: number): MeasureResult | null {
    this._points.push({ x: worldX, y: worldY });
    this._addMarker(worldX, worldY);

    const requiredPoints = this._getRequiredPoints();
    if (this._points.length >= requiredPoints) {
      const result = this._computeResult();
      if (result) {
        this._onResult?.(result);
        if (this._mode === 'coordinate') {
          this.clear();
        }
      }
      return result;
    }

    if (this._points.length >= 2 && this._mode === 'distance') {
      this._addDistanceLine();
    } else if (this._points.length >= 3 && this._mode === 'area') {
      this._updateAreaVisuals();
    } else if (this._points.length >= 2 && this._mode === 'angle') {
      this._addAngleArc();
    }

    return null;
  }

  updatePreview(worldX: number, worldY: number): void {
    if (this._points.length === 0) return;
    const previewPoints = [...this._points, { x: worldX, y: worldY }];
    const result = this._computeResultFromPoints(previewPoints);
    this._onPreview?.(result);
  }

  clear(): void {
    this._points = [];
    this.clearVisuals();
    this._onPreview?.(null);
  }

  private clearVisuals(): void {
    if (!this._scene) return;
    for (const marker of this._markers) {
      this._scene.remove(marker);
      this._disposeObject3D(marker);
    }
    for (const line of this._lines) {
      this._scene.remove(line);
      this._disposeObject3D(line);
    }
    this._markers = [];
    this._lines = [];
  }

  private _getRequiredPoints(): number {
    switch (this._mode) {
      case 'coordinate': return 1;
      case 'distance': return 2;
      case 'angle': return 3;
      case 'area': return 3;
      default: return 2;
    }
  }

  private _computeResult(): MeasureResult | null {
    return this._computeResultFromPoints(this._points);
  }

  private _computeResultFromPoints(points: Array<{ x: number; y: number }>): MeasureResult | null {
    switch (this._mode) {
      case 'coordinate': {
        if (points.length < 1) return null;
        const p = points[0];
        return {
          mode: 'coordinate',
          value: 0,
          formatted: `X: ${p.x.toFixed(4)}, Y: ${p.y.toFixed(4)}`,
          points: [p],
        };
      }
      case 'distance': {
        if (points.length < 2) return null;
        const [a, b] = points;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        return {
          mode: 'distance',
          value: dist,
          formatted: `距离: ${dist.toFixed(4)}  角度: ${angle.toFixed(2)}°  ΔX: ${dx.toFixed(4)}  ΔY: ${dy.toFixed(4)}`,
          points: [a, b],
        };
      }
      case 'angle': {
        if (points.length < 3) return null;
        const [p1, vertex, p3] = points;
        const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
        const v2 = { x: p3.x - vertex.x, y: p3.y - vertex.y };
        const dot = v1.x * v2.x + v1.y * v2.y;
        const cross = v1.x * v2.y - v1.y * v2.x;
        const angle = Math.atan2(Math.abs(cross), dot) * 180 / Math.PI;
        return {
          mode: 'angle',
          value: angle,
          formatted: `角度: ${angle.toFixed(4)}°`,
          points: [p1, vertex, p3],
        };
      }
      case 'area': {
        if (points.length < 3) return null;
        let area = 0;
        const n = points.length;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          area += points[i].x * points[j].y;
          area -= points[j].x * points[i].y;
        }
        area = Math.abs(area) / 2;
        let perimeter = 0;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const dx = points[j].x - points[i].x;
          const dy = points[j].y - points[i].y;
          perimeter += Math.sqrt(dx * dx + dy * dy);
        }
        return {
          mode: 'area',
          value: area,
          formatted: `面积: ${area.toFixed(4)}  周长: ${perimeter.toFixed(4)}`,
          points: [...points],
        };
      }
    }
  }

  private _addMarker(x: number, y: number): void {
    if (!this._scene || !this._camera) return;
    const size = (this._camera.right - this._camera.left) / this._canvasWidth * 6;
    const geometry = new THREE.BufferGeometry();
    const verts = [
      x - size, y, 0.2, x + size, y, 0.2,
      x, y - size, 0.2, x, y + size, 0.2,
    ];
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffff00, depthTest: false });
    const marker = new THREE.LineSegments(geometry, material);
    marker.renderOrder = 9998;
    this._scene.add(marker);
    this._markers.push(marker);
  }

  private _addDistanceLine(): void {
    if (!this._scene || this._points.length < 2) return;
    const [a, b] = this._points;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      a.x, a.y, 0.15, b.x, b.y, 0.15,
    ]), 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffff00, depthTest: false, linewidth: 2 });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 9997;
    this._scene.add(line);
    this._lines.push(line);
  }

  private _updateAreaVisuals(): void {
    this._lines = this._lines.filter(l => {
      this._scene?.remove(l);
      this._disposeObject3D(l);
      return false;
    });
    if (!this._scene || this._points.length < 3) return;
    const positions: number[] = [];
    for (let i = 0; i < this._points.length; i++) {
      const p = this._points[i];
      const next = this._points[(i + 1) % this._points.length];
      positions.push(p.x, p.y, 0.15, next.x, next.y, 0.15);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffff00, depthTest: false });
    const line = new THREE.LineSegments(geometry, material);
    line.renderOrder = 9997;
    this._scene.add(line);
    this._lines.push(line);

    const fillPositions: number[] = [];
    for (let i = 1; i < this._points.length - 1; i++) {
      fillPositions.push(
        this._points[0].x, this._points[0].y, 0.1,
        this._points[i].x, this._points[i].y, 0.1,
        this._points[i + 1].x, this._points[i + 1].y, 0.1,
      );
    }
    if (fillPositions.length > 0) {
      const fillGeo = new THREE.BufferGeometry();
      fillGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fillPositions), 3));
      const fillMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.1, depthTest: false, side: THREE.DoubleSide });
      const fill = new THREE.Mesh(fillGeo, fillMat);
      fill.renderOrder = 9996;
      this._scene.add(fill);
      this._lines.push(fill);
    }
  }

  private _addAngleArc(): void {
    if (!this._scene || this._points.length < 3) return;
    const [p1, vertex, p3] = this._points;
    const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
    const v2 = { x: p3.x - vertex.x, y: p3.y - vertex.y };
    const angle1 = Math.atan2(v1.y, v1.x);
    const angle2 = Math.atan2(v2.y, v2.x);
    const radius = Math.min(Math.sqrt(v1.x * v1.x + v1.y * v1.y), Math.sqrt(v2.x * v2.x + v2.y * v2.y)) * 0.3;
    const segments = 32;
    const positions: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a1 = angle1 + (i / segments) * (angle2 - angle1);
      const a2 = angle1 + ((i + 1) / segments) * (angle2 - angle1);
      positions.push(
        vertex.x + Math.cos(a1) * radius, vertex.y + Math.sin(a1) * radius, 0.15,
        vertex.x + Math.cos(a2) * radius, vertex.y + Math.sin(a2) * radius, 0.15,
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffff00, depthTest: false });
    const arc = new THREE.LineSegments(geometry, material);
    arc.renderOrder = 9997;
    this._scene.add(arc);
    this._lines.push(arc);
  }

  private _disposeObject3D(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    });
  }
}
