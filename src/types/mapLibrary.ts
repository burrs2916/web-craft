export type MapLibraryType = "cad" | "tile" | "blueprint" | "globe" | "heatmap";

export type MapLibraryStatus = "draft" | "published" | "archived";

export interface MapLibraryBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface MapLibrary {
  id: string;
  name: string;
  description?: string;
  mapType: MapLibraryType;
  dataDir?: string;
  sourceFile?: string;
  sourceFormat?: string;
  cadbinPath?: string;
  coordinateSystem: string;
  targetCrs: string;
  bounds?: string;
  layers?: string;
  entityCount: number;
  metadata?: string;
  thumbnail?: string;
  groupId?: string;
  status: MapLibraryStatus;
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface MapLibraryGroup {
  id: string;
  name: string;
  description?: string;
  mapType: MapLibraryType;
  parentId?: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export const MAP_LIBRARY_TYPE_LABELS: Record<MapLibraryType, string> = {
  cad: "CAD图纸",
  tile: "瓦片地图",
  blueprint: "图片蓝图",
  globe: "三维地球",
  heatmap: "热力地图",
};

export const MAP_LIBRARY_TYPE_ICONS: Record<MapLibraryType, string> = {
  cad: "architecture",
  tile: "map",
  blueprint: "wallpaper",
  globe: "public",
  heatmap: "whatshot",
};

export const MAP_LIBRARY_STATUS_LABELS: Record<MapLibraryStatus, string> = {
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
};
