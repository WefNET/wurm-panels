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
}

/**
 * All available maps in the application.
 */
export const MAPS: Record<string, MapConfig> = {
    xanadu: {
        id: 'xanadu',
        name: 'Xanadu',
        extent: [0, 0, 8192, 8192],
        resolutions: [32, 16, 8, 4, 2, 1, 0.5, 0.25], // 9 zoom levels, but only 7 real tile levels
        tileLayers: [
            {
                id: 'terrain',
                name: 'Terrain',
                urlTemplate: 'https://pub-6192353739be4c3191140ad893e309f2.r2.dev/xanadu/2025/terrain/{z}/{x}/{y}.png',
                zoomLevels: 7, // Only tiles 0-6 exist, z7/z8 will scale z6 tiles
                enabled: true,
                opacity: 1.0,
                mapType: "terrain",
                year: 2025
            },
            // Add more tile layers here as they become available
            // {
            //     id: 'roads',
            //     name: 'Roads Overlay',
            //     urlTemplate: 'https://.../{z}/{x}/{y}.png',
            //     zoomLevels: 7,
            //     enabled: false,
            //     opacity: 0.8
            // },
            // {
            //     id: 'deeds',
            //     name: 'Deeds',
            //     urlTemplate: 'https://.../{z}/{x}/{y}.png',
            //     zoomLevels: 7,
            //     enabled: false,
            //     opacity: 0.7
            // }
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
        ]
    },
    // Template for adding more maps:
    independence: {
        id: 'independence',
        name: 'Independence',
        extent: [0, 0, 4096, 4096],
        resolutions: [16, 8, 4, 2, 1, 0.5, 0.25], // 7 zoom levels total
        tileLayers: [
            {
                id: 'terrain',
                name: 'Terrain',
                urlTemplate: 'https://pub-6192353739be4c3191140ad893e309f2.r2.dev/independence/2025/terrain/{z}/{x}/{y}.png',
                zoomLevels: 6, // Only tiles 0-5 exist, z6 will scale z5 tiles
                enabled: true,
                opacity: 1.0,
                mapType: "terrain",
                year: 2025
            }
        ],
        startingLocations: [
            // Add starting locations for Independence
        ]
    },
    celebration: {
        id: 'celebration',
        name: 'Celebration',
        extent: [0, 0, 2048, 2048], // Example: smaller map
        resolutions: [8, 4, 2, 1, 0.5, 0.25],
        tileLayers: [
            {
                id: 'terrain',
                name: 'Terrain',
                urlTemplate: 'https://pub-6192353739be4c3191140ad893e309f2.r2.dev/celebration/2025/terrain/{z}/{x}/{y}.png',
                zoomLevels: 5,
                enabled: true,
                opacity: 1.0,
                mapType: "terrain",
                year: 2025
            }
        ],
        startingLocations: []
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
