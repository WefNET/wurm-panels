/**
 * Configuration for tile layers within a map.
 */
export interface TileLayerConfig {
    urlTemplate: string; // e.g., "https://.../{z}/{x}/{y}.png"
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
    zoomLevels: number; // Number of tile zoom levels used by this map (e.g., 5)
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
    cadence: {
        id: 'cadence',
        name: 'Cadence',
        extent: [0, 0, 4096, 4096],
        zoomLevels: 5,
        resolutions: [16, 8, 4, 2, 1, 0.5, 0.25], // 7 zoom levels with virtual zooming
        tileLayers: [
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/cadence/2025-02/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2025
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/cadence/2025-02/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2025
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/cadence/2024-02/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2024
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/cadence/2024-02/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2024
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/cadence/2023-02/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2023
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/cadence/2023-02/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2023
            }
        ],
        startingLocations: [
            // Add starting locations for Independence
        ],
        communityMapUrl: "https://cadence.yaga.host"
    },
    celebration: {
        id: 'celebration',
        name: 'Celebration',
        zoomLevels: 4,
        extent: [0, 0, 2048, 2048], // Example: smaller map
        resolutions: [8, 4, 2, 1, 0.5, 0.25], // 6 zoom levels with virtual zooming
        tileLayers: [
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/celebration/2025/terrain/{z}/{x}/{y}.png',
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
        zoomLevels: 4,
        extent: [0, 0, 2048, 2048], // Example: smaller map
        resolutions: [8, 4, 2, 1, 0.5, 0.25], // 6 zoom levels with virtual zooming
        tileLayers: [
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/deliverance/2025/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2025
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/deliverance/2025/topo/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2025
            }
        ],
        startingLocations: [],
        communityMapUrl: "https://deliverance.yaga.host"
    },
    harmony: {
        id: 'harmony',
        name: 'Harmony',
        zoomLevels: 5,
        extent: [0, 0, 4096, 4096], // Example: smaller map
        resolutions: [16, 8, 4, 2, 1, 0.5, 0.25], // 7 zoom levels with virtual zooming
        tileLayers: [
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/harmony/2025-02/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2025
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/harmony/2025-02/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2025
            }
        ],
        startingLocations: [
            { name: 'Harmony Bay', coords: [2345, 2478] },
            { name: 'Heartland', coords: [1560, 1279] },
        ],
        communityMapUrl: "https://harmony.yaga.host"
    },
    independence: {
        id: 'independence',
        name: 'Independence',
        zoomLevels: 5,
        extent: [0, 0, 4096, 4096],
        resolutions: [16, 8, 4, 2, 1, 0.5, 0.25], // 7 zoom levels with virtual zooming
        tileLayers: [
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/independence/2025/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2025
            }
        ],
        startingLocations: [
            // Add starting locations for Independence
        ],
        communityMapUrl: "https://independence.yaga.host"
    },
    release: {
        id: 'release',
        name: 'Release',
        zoomLevels: 4,
        extent: [0, 0, 2048, 2048], // Example: smaller map
        resolutions: [8, 4, 2, 1, 0.5, 0.25], // 6 zoom levels with virtual zooming
        tileLayers: [
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2025-02/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2025
            },

            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2025-02/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2025
            },

            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2024-02/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2024
            },

            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2024-02/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2024
            },

            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2023-01/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2023
            },

            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2023-01/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2023
            },

            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2022-02/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2022
            },

            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2022-02/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2022
            },

            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2021-01/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2021
            },

            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2021-01/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2021
            },

            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2020-02/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2020
            },

            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2020-02/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2020
            },

            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2019-01/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2019
            },

            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2019-01/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2019
            },

            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2017-12/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2018
            },

            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2017-12/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2018
            },

            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2016-11/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2017
            },

            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/release/2016-11/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2017
            }
        ],
        startingLocations: [
            // Add starting locations for Release
        ],
        communityMapUrl: "https://release.yaga.host"
    },
    xanadu: {
        id: 'xanadu',
        name: 'Xanadu',
        extent: [0, 0, 8192, 8192],
        resolutions: [32, 16, 8, 4, 2, 1, 0.5, 0.25], // 8 zoom levels with virtual zooming
        zoomLevels: 6,
        tileLayers: [
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/xanadu/2025/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2025
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/xanadu/2025-02/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2025
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/xanadu/2024-02/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2024
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/xanadu/2024-02/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2024
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/xanadu/2023-02/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2023
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/xanadu/2023-02/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2023
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/xanadu/2022-01/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2022
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/xanadu/2022-01/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2022
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/xanadu/2021-01/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2021
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/xanadu/2021-01/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2021
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/xanadu/2020-01/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2020
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/xanadu/2020-01/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2020
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/xanadu/2018-12/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2019
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/xanadu/2018-12/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2019
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/xanadu/2016-11/terrain/{z}/{x}/{y}.png',
                mapType: "terrain",
                year: 2017
            },
            {
                urlTemplate: 'https://red-river-af03.wurm-tiles.workers.dev/tiles/xanadu/2016-11/topographical/{z}/{x}/{y}.png',
                mapType: "topological",
                year: 2017
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
