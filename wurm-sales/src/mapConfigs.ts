/**
 * Configuration for tile layers within a map.
 */
/**
 * Configuration for tile layers within a map.
 */
export interface TileLayerConfig {
    id: string;
    name: string;
    urlTemplate: string; // e.g., "https://.../{z}/{x}/{y}.png"
    zoomLevels: number; // Number of zoom levels (e.g., 7 for z0-z6)
    enabled: boolean; // Default visibility
    opacity?: number; // Optional opacity (0-1)
    mapType: 'terrain' | 'topological';
    year: number;
}

/**
 * Configuration for a single map (island).
 */
export interface MapConfig {
    id: string;
    name: string;
    extent: [number, number, number, number]; // [minX, minY, maxX, maxY]
    resolutions: number[]; // Zoom level resolutions
    tileLayers: TileLayerConfig[];
    startingLocations?: Array<{
        name: string;
        coords: [number, number]; // Game coordinates
    }>;
    communityMapUrl?: string;
}

/**
 * All available maps in the application.
 */
export const MAPS: Record<string, MapConfig> = {
    celebration: {
        id: 'celebration',
        name: 'Celebration',
        extent: [0, 0, 2048, 2048], // Example: smaller map
        resolutions: [8, 4, 2, 1, 0.5, 0.25], // 6 zoom levels with virtual zooming
        tileLayers: [
            {
                id: 'terrain',
                name: 'Terrain',
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/celebration/2025/terrain/{z}/{x}/{y}.png',
                zoomLevels: 4, // Max zoom level 3 for real tiles, higher levels scale z=3
                enabled: true,
                opacity: 1.0,
                mapType: "terrain",
                year: 2025
            }
        ],
        startingLocations: [],
        communityMapUrl: "https://celebration.yaga.host"
    },
    deliverance: {
        id: 'deliverance',
        name: 'Deliverance',
        extent: [0, 0, 2048, 2048], // Example: smaller map
        resolutions: [8, 4, 2, 1, 0.5, 0.25], // 6 zoom levels with virtual zooming
        tileLayers: [
            {
                id: 'terrain-2025',
                name: 'Terrain (2025)',
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/deliverance/2025/terrain/{z}/{x}/{y}.png',
                zoomLevels: 4, // Max zoom level 3 for real tiles, higher levels scale z=3
                enabled: true,
                opacity: 1.0,
                mapType: "terrain",
                year: 2025
            },
            {
                id: 'topological-2025',
                name: 'Topological (2025)',
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/deliverance/2025/topo/{z}/{x}/{y}.png',
                zoomLevels: 4, // Max zoom level 3 for real tiles, higher levels scale z=3
                enabled: true,
                opacity: 1.0,
                mapType: "topological",
                year: 2025
            },
            {
                id: 'terrain-2016',
                name: 'Terrain (2016)',
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/deliverance/2016/terrain/{z}/{x}/{y}.png',
                zoomLevels: 4, // Max zoom level 3 for real tiles, higher levels scale z=3
                enabled: false,
                opacity: 1.0,
                mapType: "terrain",
                year: 2016
            }
        ],
        startingLocations: [],
        communityMapUrl: "https://deliverance.yaga.host"
    },
    independence: {
        id: 'independence',
        name: 'Independence',
        extent: [0, 0, 4096, 4096],
        resolutions: [16, 8, 4, 2, 1, 0.5, 0.25], // 7 zoom levels with virtual zooming
        tileLayers: [
            {
                id: 'terrain',
                name: 'Terrain',
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/independence/2025/terrain/{z}/{x}/{y}.png',
                zoomLevels: 5, // Max zoom level 4 for real tiles, higher levels scale z=4
                enabled: true,
                opacity: 1.0,
                mapType: "terrain",
                year: 2025
            }
        ],
        startingLocations: [
            // Add starting locations for Independence
        ],
        communityMapUrl: "https://independence.yaga.host"
    },
    xanadu: {
        id: 'xanadu',
        name: 'Xanadu',
        extent: [0, 0, 8192, 8192],
        resolutions: [32, 16, 8, 4, 2, 1, 0.5, 0.25], // 8 zoom levels with virtual zooming
        tileLayers: [
            {
                id: 'terrain',
                name: 'Terrain',
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/xanadu/2025/terrain/{z}/{x}/{y}.png',
                zoomLevels: 6, // Max zoom level 5 for real tiles, higher levels scale z=5
                enabled: true,
                opacity: 1.0,
                mapType: "terrain",
                year: 2025
            },
        ],
        startingLocations: [
            { name: 'Summerholt', coords: [6602, 2252] },
            { name: 'Greymead', coords: [4701, 3051] },
            { name: 'Whitefay', coords: [5651, 3051] },
            { name: 'Glasshollow', coords: [1580, 787] },
            { name: 'Newspring', coords: [883, 7229] },
            { name: 'Esteron', coords: [7410, 6434] },
            { name: 'Linton', coords: [1825, 4166] },
            { name: 'Lormere', coords: [3481, 6437] },
            { name: 'Vrock Landing', coords: [2722, 2241] }
        ],
        communityMapUrl: "https://xanadu.yaga.host"
    }
};

/**
 * Get a map configuration by ID.
 * @param mapId The map identifier
 * @returns The map configuration or undefined if not found
 */
export function getMapConfig(mapId: string): MapConfig | undefined {
    return MAPS[mapId];
}

/**
 * Get all available map IDs.
 * @returns Array of map identifiers
 */
export function getAllMapIds(): string[] {
    return Object.keys(MAPS);
}

/**
 * Get all available maps as an array.
 * @returns Array of map configurations
 */
export function getAllMaps(): MapConfig[] {
    return Object.values(MAPS);
}
