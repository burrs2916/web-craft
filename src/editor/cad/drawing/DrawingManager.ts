import * as THREE from 'three';

export type DrawMode = 'draw_line' | 'draw_circle' | 'draw_text' | 'draw_arc' | 'draw_polyline' | 'draw_rect' | 'draw_dimension';

export interface DrawState {
  isDrawing: boolean;
  mode: DrawMode;
  startPoint: THREE.Vector2 | null;
  previewMesh: THREE.Object3D | null;
  polylinePoints: Array<{ x: number; y: number }>;
  arcStep: number;
  arcCenter: THREE.Vector2 | null;
  dimStep: number;
  dimP1: THREE.Vector2 | null;
  dimP2: THREE.Vector2 | null;
}

export interface DrawPreviewUpdate {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  mode: DrawMode;
}

export interface TextDrawParams {
  content: string;
  height: number;
  layer: string;
  color: number;
}

export class DrawingManager {
  private _drawState: DrawState;
  private _scene: THREE.Scene | null = null;
  private _onDrawComplete?: (entityJson: string) => void;
  private _onDrawPreview?: (preview: DrawPreviewUpdate) => void;
  private _textParams: TextDrawParams | null = null;
  private _textPreviewMesh: THREE.Mesh | null = null;

  constructor() {
    this._drawState = {
      isDrawing: false,
      mode: 'draw_line',
      startPoint: null,
      previewMesh: null,
      polylinePoints: [],
      arcStep: 0,
      arcCenter: null,
      dimStep: 0,
      dimP1: null,
      dimP2: null,
    };
  }

  setScene(scene: THREE.Scene): void {
    this._scene = scene;
  }

  setOnDrawComplete(callback: (entityJson: string) => void): void {
    this._onDrawComplete = callback;
  }

  setOnDrawPreview(callback: (preview: DrawPreviewUpdate) => void): void {
    this._onDrawPreview = callback;
  }

  setTextParams(params: TextDrawParams): void {
    this._textParams = params;
  }

  getDrawState(): DrawState {
    return { ...this._drawState };
  }

  isDrawing(): boolean {
    return this._drawState.isDrawing;
  }

  isTextPlacing(): boolean {
    return this._drawState.mode === 'draw_text' && this._textParams !== null;
  }

  startDrawing(mode: DrawMode): void {
    this._drawState.isDrawing = false;
    this._drawState.mode = mode;
    this._drawState.startPoint = null;
    this._clearPreview();
  }

  handleMouseDown(worldX: number, worldY: number): void {
    if (this._drawState.mode === 'draw_text') {
      this._completeTextDraw(worldX, worldY);
      return;
    }

    if (this._drawState.mode === 'draw_polyline') {
      this._drawState.polylinePoints.push({ x: worldX, y: worldY });
      this._drawState.isDrawing = true;
      return;
    }

    if (this._drawState.mode === 'draw_arc') {
      if (this._drawState.arcStep === 0) {
        this._drawState.arcCenter = new THREE.Vector2(worldX, worldY);
        this._drawState.arcStep = 1;
        this._drawState.isDrawing = true;
      } else if (this._drawState.arcStep === 1) {
        this._drawState.startPoint = new THREE.Vector2(worldX, worldY);
        this._drawState.arcStep = 2;
      } else {
        this._completeArcDraw(worldX, worldY);
      }
      return;
    }

    if (this._drawState.mode === 'draw_dimension') {
      if (this._drawState.dimStep === 0) {
        this._drawState.dimP1 = new THREE.Vector2(worldX, worldY);
        this._drawState.dimStep = 1;
        this._drawState.isDrawing = true;
      } else if (this._drawState.dimStep === 1) {
        this._drawState.dimP2 = new THREE.Vector2(worldX, worldY);
        this._drawState.dimStep = 2;
      } else {
        this._completeDimensionDraw(worldX, worldY);
      }
      return;
    }

    if (!this._drawState.isDrawing) {
      this._drawState.isDrawing = true;
      this._drawState.startPoint = new THREE.Vector2(worldX, worldY);
      this._showStartPointMarker(worldX, worldY);
    } else {
      if (this._drawState.startPoint) {
        this._completeDraw(worldX, worldY);
      }
    }
  }

  handleMouseMove(worldX: number, worldY: number): void {
    if (this._drawState.mode === 'draw_text') {
      return;
    }

    if (!this._drawState.isDrawing || !this._drawState.startPoint) return;

    if (this._onDrawPreview) {
      this._onDrawPreview({
        startX: this._drawState.startPoint.x,
        startY: this._drawState.startPoint.y,
        currentX: worldX,
        currentY: worldY,
        mode: this._drawState.mode,
      });
    }

    this._updatePreview(worldX, worldY);
  }

  cancelDrawing(): void {
    this._drawState.isDrawing = false;
    this._drawState.startPoint = null;
    this._textParams = null;
    this._drawState.polylinePoints = [];
    this._drawState.arcStep = 0;
    this._drawState.arcCenter = null;
    this._drawState.dimStep = 0;
    this._drawState.dimP1 = null;
    this._drawState.dimP2 = null;
    this._clearPreview();
    this._clearTextPreview();
  }

  finishPolyline(): void {
    if (this._drawState.mode !== 'draw_polyline' || this._drawState.polylinePoints.length < 2) return;

    const entityJson = JSON.stringify({
      type: 'LwPolyline',
      id: '__new__',
      layer: '0',
      color: 7,
      vertices: this._drawState.polylinePoints.map(p => ({ x: p.x, y: p.y, bulge: 0 })),
      closed: false,
      line_weight: 0.25,
    });

    this._drawState.polylinePoints = [];
    this._drawState.isDrawing = false;
    this._clearPreview();

    if (this._onDrawComplete) {
      this._onDrawComplete(entityJson);
    }
  }

  private _showStartPointMarker(x: number, y: number): void {
    if (!this._scene) return;

    const geometry = new THREE.BoxGeometry(1, 1, 0.1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, 0.01);
    mesh.scale.set(2, 2, 1);
    this._scene.add(mesh);
    this._drawState.previewMesh = mesh;
  }

  private _updatePreview(currentX: number, currentY: number): void {
    this._clearPreview();

    if (!this._scene || !this._drawState.startPoint) return;

    const startX = this._drawState.startPoint.x;
    const startY = this._drawState.startPoint.y;

    switch (this._drawState.mode) {
      case 'draw_line':
        this._showLinePreview(startX, startY, currentX, currentY);
        break;
      case 'draw_circle':
        this._showCirclePreview(startX, startY, currentX, currentY);
        break;
      case 'draw_rect':
        this._showRectPreview(startX, startY, currentX, currentY);
        break;
      case 'draw_arc':
        this._showArcPreview(currentX, currentY);
        break;
      case 'draw_polyline':
        this._showPolylinePreview(currentX, currentY);
        break;
      case 'draw_dimension':
        this._showDimensionPreview(currentX, currentY);
        break;
      case 'draw_text':
        break;
    }
  }

  private _showLinePreview(x1: number, y1: number, x2: number, y2: number): void {
    if (!this._scene) return;

    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([x1, y1, 0, x2, y2, 0]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    const material = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const line = new THREE.Line(geometry, material);
    this._scene.add(line);
    this._drawState.previewMesh = line;
  }

  private _showCirclePreview(centerX: number, centerY: number, x2: number, y2: number): void {
    if (!this._scene) return;

    const radius = Math.hypot(x2 - centerX, y2 - centerY);
    const geometry = new THREE.CircleGeometry(radius, 32);
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const line = new THREE.LineSegments(geometry, material);
    line.position.set(centerX, centerY, 0);
    this._scene.add(line);
    this._drawState.previewMesh = line;
  }

  private _clearPreview(): void {
    if (this._drawState.previewMesh && this._scene) {
      this._scene.remove(this._drawState.previewMesh);
      this._disposeObject3D(this._drawState.previewMesh);
      this._drawState.previewMesh = null;
    }
  }

  private _clearTextPreview(): void {
    if (this._textPreviewMesh && this._scene) {
      this._scene.remove(this._textPreviewMesh);
      this._disposeObject3D(this._textPreviewMesh);
      this._textPreviewMesh = null;
    }
  }

  private _completeTextDraw(x: number, y: number): void {
    if (!this._textParams) return;

    const entityJson = JSON.stringify({
      type: 'Text',
      id: '__new__',
      layer: this._textParams.layer,
      color: this._textParams.color,
      position: { x, y, z: 0 },
      height: this._textParams.height,
      content: this._textParams.content,
      rotation: 0,
      horizontal_alignment: 0,
      vertical_alignment: 0,
    });

    this._clearTextPreview();

    if (this._onDrawComplete) {
      this._onDrawComplete(entityJson);
    }
  }

  private _completeDraw(endX: number, endY: number): void {
    if (!this._drawState.startPoint) return;

    const startX = this._drawState.startPoint.x;
    const startY = this._drawState.startPoint.y;

    let entityJson: string | null = null;

    switch (this._drawState.mode) {
      case 'draw_line':
        entityJson = JSON.stringify({
          type: 'Line',
          id: '__new__',
          layer: '0',
          color: 7,
          start: { x: startX, y: startY, z: 0 },
          end: { x: endX, y: endY, z: 0 },
          line_weight: 0.25,
        });
        break;

      case 'draw_circle': {
        const radius = Math.hypot(endX - startX, endY - startY);
        entityJson = JSON.stringify({
          type: 'Circle',
          id: '__new__',
          layer: '0',
          color: 7,
          center: { x: startX, y: startY, z: 0 },
          radius: radius,
          line_weight: 0.25,
        });
        break;
      }

      case 'draw_rect': {
        entityJson = JSON.stringify({
          type: 'LwPolyline',
          id: '__new__',
          layer: '0',
          color: 7,
          vertices: [
            { x: startX, y: startY, bulge: 0 },
            { x: endX, y: startY, bulge: 0 },
            { x: endX, y: endY, bulge: 0 },
            { x: startX, y: endY, bulge: 0 },
          ],
          closed: true,
          line_weight: 0.25,
        });
        break;
      }

      case 'draw_text':
        entityJson = JSON.stringify({
          type: 'Text',
          id: '__new__',
          layer: '0',
          color: 7,
          position: { x: startX, y: startY, z: 0 },
          height: 10,
          content: '文字',
          rotation: 0,
          horizontal_alignment: 0,
          vertical_alignment: 0,
        });
        break;

      default:
        break;
    }

    this._clearPreview();
    this._drawState.isDrawing = false;
    this._drawState.startPoint = null;

    if (entityJson && this._onDrawComplete) {
      this._onDrawComplete(entityJson);
    }
  }

  private _completeArcDraw(endX: number, endY: number): void {
    if (!this._drawState.arcCenter || !this._drawState.startPoint) return;

    const cx = this._drawState.arcCenter.x;
    const cy = this._drawState.arcCenter.y;
    const radius = Math.hypot(this._drawState.startPoint.x - cx, this._drawState.startPoint.y - cy);
    const startAngle = Math.atan2(this._drawState.startPoint.y - cy, this._drawState.startPoint.x - cx);
    const endAngle = Math.atan2(endY - cy, endX - cx);

    const entityJson = JSON.stringify({
      type: 'Arc',
      id: '__new__',
      layer: '0',
      color: 7,
      center: { x: cx, y: cy, z: 0 },
      radius,
      start_angle: startAngle,
      end_angle: endAngle,
      line_weight: 0.25,
    });

    this._clearPreview();
    this._drawState.isDrawing = false;
    this._drawState.arcStep = 0;
    this._drawState.arcCenter = null;
    this._drawState.startPoint = null;

    if (this._onDrawComplete) {
      this._onDrawComplete(entityJson);
    }
  }

  private _completeDimensionDraw(worldX: number, worldY: number): void {
    if (!this._drawState.dimP1 || !this._drawState.dimP2) return;

    const p1 = this._drawState.dimP1;
    const p2 = this._drawState.dimP2;
    const midX = (p1.x + p2.x) / 2 + (worldY - p1.y) * 0.2;
    const midY = (p1.y + p2.y) / 2 - (worldX - p1.x) * 0.2;

    const entityJson = JSON.stringify({
      type: 'Dimension',
      id: '__new__',
      layer: '0',
      color: 7,
      defPoint: { x: p2.x, y: p2.y, z: 0 },
      midPoint: { x: midX, y: midY, z: 0 },
      start: { x: p1.x, y: p1.y, z: 0 },
      end: { x: p2.x, y: p2.y, z: 0 },
      rotation: Math.atan2(p2.y - p1.y, p2.x - p1.x),
      line_weight: 0.25,
    });

    this._clearPreview();
    this._drawState.isDrawing = false;
    this._drawState.dimStep = 0;
    this._drawState.dimP1 = null;
    this._drawState.dimP2 = null;

    if (this._onDrawComplete) {
      this._onDrawComplete(entityJson);
    }
  }

  private _showRectPreview(x1: number, y1: number, x2: number, y2: number): void {
    if (!this._scene) return;
    const positions = new Float32Array([
      x1, y1, 0, x2, y1, 0,
      x2, y1, 0, x2, y2, 0,
      x2, y2, 0, x1, y2, 0,
      x1, y2, 0, x1, y1, 0,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const line = new THREE.LineSegments(geo, mat);
    this._scene.add(line);
    this._drawState.previewMesh = line;
  }

  private _showArcPreview(currentX: number, currentY: number): void {
    if (!this._scene) return;
    this._clearPreview();

    if (this._drawState.arcStep === 1 && this._drawState.arcCenter) {
      const cx = this._drawState.arcCenter.x;
      const cy = this._drawState.arcCenter.y;
      const radius = Math.hypot(currentX - cx, currentY - cy);
      if (radius < 0.01) return;
      const segments = 64;
      const positions: number[] = [];
      for (let i = 0; i < segments; i++) {
        const a1 = (i / segments) * Math.PI * 2;
        const a2 = ((i + 1) / segments) * Math.PI * 2;
        positions.push(
          cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, 0,
          cx + Math.cos(a2) * radius, cy + Math.sin(a2) * radius, 0,
        );
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      const mat = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
      const line = new THREE.LineSegments(geo, mat);
      this._scene.add(line);
      this._drawState.previewMesh = line;
    } else if (this._drawState.arcStep === 2 && this._drawState.arcCenter && this._drawState.startPoint) {
      const cx = this._drawState.arcCenter.x;
      const cy = this._drawState.arcCenter.y;
      const radius = Math.hypot(this._drawState.startPoint.x - cx, this._drawState.startPoint.y - cy);
      const startAngle = Math.atan2(this._drawState.startPoint.y - cy, this._drawState.startPoint.x - cx);
      const endAngle = Math.atan2(currentY - cy, currentX - cx);
      const segments = 64;
      const positions: number[] = [];
      for (let i = 0; i < segments; i++) {
        const t1 = startAngle + (endAngle - startAngle) * (i / segments);
        const t2 = startAngle + (endAngle - startAngle) * ((i + 1) / segments);
        positions.push(
          cx + Math.cos(t1) * radius, cy + Math.sin(t1) * radius, 0,
          cx + Math.cos(t2) * radius, cy + Math.sin(t2) * radius, 0,
        );
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      const mat = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
      const line = new THREE.LineSegments(geo, mat);
      this._scene.add(line);
      this._drawState.previewMesh = line;
    }
  }

  private _showPolylinePreview(currentX: number, currentY: number): void {
    if (!this._scene || this._drawState.polylinePoints.length === 0) return;
    this._clearPreview();

    const allPoints = [...this._drawState.polylinePoints, { x: currentX, y: currentY }];
    const positions = new Float32Array(allPoints.length * 3);
    for (let i = 0; i < allPoints.length; i++) {
      positions[i * 3] = allPoints[i].x;
      positions[i * 3 + 1] = allPoints[i].y;
      positions[i * 3 + 2] = 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const line = new THREE.Line(geo, mat);
    this._scene.add(line);
    this._drawState.previewMesh = line;
  }

  private _showDimensionPreview(currentX: number, currentY: number): void {
    if (!this._scene) return;
    this._clearPreview();

    if (this._drawState.dimStep === 1 && this._drawState.dimP1) {
      const p1 = this._drawState.dimP1;
      const positions = new Float32Array([
        p1.x, p1.y, 0, currentX, currentY, 0,
      ]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
      const line = new THREE.Line(geo, mat);
      this._scene.add(line);
      this._drawState.previewMesh = line;
    } else if (this._drawState.dimStep === 2 && this._drawState.dimP1 && this._drawState.dimP2) {
      const p1 = this._drawState.dimP1;
      const p2 = this._drawState.dimP2;
      const midX = (p1.x + p2.x) / 2 + (currentY - p1.y) * 0.2;
      const midY = (p1.y + p2.y) / 2 - (currentX - p1.x) * 0.2;
      const positions = new Float32Array([
        p1.x, p1.y, 0, p2.x, p2.y, 0,
        p1.x, p1.y, 0, midX, midY, 0,
        p2.x, p2.y, 0, midX, midY, 0,
      ]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
      const line = new THREE.LineSegments(geo, mat);
      this._scene.add(line);
      this._drawState.previewMesh = line;
    }
  }

  private _disposeObject3D(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            (child.material as THREE.Material).dispose();
          }
        }
      }
    });
  }
}
