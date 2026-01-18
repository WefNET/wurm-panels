import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import Projection from 'ol/proj/Projection';
import TileGrid from 'ol/tilegrid/TileGrid';
import MousePosition from 'ol/control/MousePosition';
import { defaults as defaultControls } from 'ol/control';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import { Point, LineString, Geometry } from 'ol/geom';
import { Style, Stroke, Fill, Text, Circle as CircleStyle } from 'ol/style';
import { addUserLayer, toggleUserLayer, getUserLayers, UserLayer, addFeatureToLayer, loadAndRenderUserLayers, setCurrentMapId, removeFeatureFromLayer } from './userLayers';
import { fetchCommunityDeeds, loadCommunityDeeds, saveCommunityDeeds, fetchCommunityGuardTowers, loadCommunityGuardTowers, saveCommunityGuardTowers, fetchCommunityMissionStructures, loadCommunityMissionStructures, saveCommunityMissionStructures, fetchCommunityBridges, loadCommunityBridges, saveCommunityBridges, fetchCommunityMapObjects, loadCommunityMapObjects, saveCommunityMapObjects, CommunityMapObject } from './communityDeeds';
import { Draw } from 'ol/interaction';
import { getMapConfig, getAllMaps } from './mapConfigs';

// Global state
let currentMapId = 'xanadu'; // Default map
let map: Map;
let currentTileLayer: TileLayer<XYZ>;
let drawInteraction: Draw | null = null;
let selectedLayerForDrawing: string | null = null;
let currentFeature: Feature | null = null;
let currentFeatureLayer: string | null = null;
let communityDeedsLayer: VectorLayer<VectorSource> | null = null;
let communityDeedsVisible = true; // Default visible
communityDeedsVisible = localStorage.getItem('communityDeedsVisible') !== 'false';

let communityGuardTowersLayer: VectorLayer<VectorSource> | null = null;
let communityGuardTowersVisible = true; // Default visible
communityGuardTowersVisible = localStorage.getItem('communityGuardTowersVisible') !== 'false';

let communityMissionStructuresLayer: VectorLayer<VectorSource> | null = null;
let communityMissionStructuresVisible = true; // Default visible
communityMissionStructuresVisible = localStorage.getItem('communityMissionStructuresVisible') !== 'false';

let communityBridgesLayer: VectorLayer<VectorSource> | null = null;
let communityMapObjectsLayer: VectorLayer<VectorSource> | null = null;
let communityBridgesVisible = true; // Default visible
let communityMapObjectsVisible = true; // Default visible
communityBridgesVisible = localStorage.getItem('communityBridgesVisible') !== 'false';

// Zoom level threshold for showing labels (only show labels when zoomed in close)
const LABEL_ZOOM_THRESHOLD = 4;

// Helper functions
function getYearsForIsland(island: string) {
    const maps = getAllMaps();
    const map = maps.find(m => m.name === island);
    if (!map) return [];
    return Array.from(new Set(map.tileLayers.map(tl => tl.year))).sort((a, b) => b - a);
}

function getTypesForIslandYear(island: string, year: number) {
    const maps = getAllMaps();
    const map = maps.find(m => m.name === island);
    if (!map) return [];
    return map.tileLayers.filter(tl => tl.year === year).map(tl => tl.mapType);
}

function getTileLayer(map: any, year: number, mapType: string) {
    return map?.tileLayers.find((tl: { year: number; mapType: string; }) => tl.year === year && tl.mapType === mapType);
}

// Local storage helpers for map preferences
function saveMapPreferences(island: string, year: number, type: string) {
    const preferences = { island, year, type };
    localStorage.setItem('wurmMapPreferences', JSON.stringify(preferences));
}

function loadMapPreferences() {
    try {
        const saved = localStorage.getItem('wurmMapPreferences');
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.warn('Failed to load map preferences:', e);
    }
    return null;
}

// Local storage helpers for map view state
function saveMapViewState(mapId: string, center: number[], zoom: number) {
    const viewState = { center, zoom };
    localStorage.setItem(`wurmMapViewState_${mapId}`, JSON.stringify(viewState));
}

function loadMapViewState(mapId: string) {
    try {
        const saved = localStorage.getItem(`wurmMapViewState_${mapId}`);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.warn('Failed to load map view state:', e);
    }
    return null;
}

async function loadCommunityDeedsForMap(mapId: string) {
    const mapConfig = getMapConfig(mapId);
    if (!mapConfig || !mapConfig.communityMapUrl) {
        console.log('No communityMapUrl for map:', mapId);
        return;
    }
    console.log('Loading community deeds for:', mapId);
    showCommunityDeedsLoading();
    try {
        let deeds = await loadCommunityDeeds(mapId);
        console.log('Loaded deeds from file:', deeds?.length ?? 0);
        if (!deeds) {
            // Fetch from URL
            console.log('Fetching deeds from URL');
            deeds = await fetchCommunityDeeds(mapConfig.communityMapUrl);
            console.log('Fetched deeds:', deeds.length);
            await saveCommunityDeeds(mapId, deeds);
        }
        // Create features - filter out unwanted deed types first
        const features = deeds
            .filter(deed => deed.deedType !== 'STA') // Skip STA deeds
            .map(deed => {
                const x = deed.coords[0];
                const y = mapConfig.extent[3] - deed.coords[1]; // Flip Y

                const feature = new Feature({
                    geometry: new Point([x, y]),
                    name: deed.name,
                    type: deed.deedType,
                    extra: deed.extra
                });

                return feature;
            });

        console.log('Created features:', features.length);

        // Create or update layer
        if (communityDeedsLayer) {
            communityDeedsLayer.getSource()?.clear();
            communityDeedsLayer.getSource()?.addFeatures(features);
        } else {
            communityDeedsLayer = new VectorLayer({
                source: new VectorSource({
                    features: features
                }),
                style: (feature) => {
                    const zoom = map!.getView().getZoom() || 0;
                    const shouldShowLabels = zoom >= LABEL_ZOOM_THRESHOLD;
                    const name = feature.get('name') || '';
                    const text = shouldShowLabels ? name : '';

                    // Style based on type
                    let color = 'blue'; // Default
                    if (feature.get('type') === 'MAR') {
                        color = 'green';
                    }

                    return new Style({
                        image: new CircleStyle({
                            radius: 8,
                            fill: new Fill({ color: `rgba(${color === 'blue' ? '0,0,255' : color === 'red' ? '255,0,0' : '0,255,0'}, 0.6)` }),
                            stroke: new Stroke({ color: color, width: 2 })
                        }),
                        text: new Text({
                            text: text,
                            font: '12px Calibri,sans-serif',
                            fill: new Fill({ color: '#fff' }),
                            stroke: new Stroke({
                                color: '#000',
                                width: 2
                            }),
                            offsetY: -15
                        })
                    });
                },
                zIndex: 500, // Position above other community layers but below starting locations
                visible: communityDeedsVisible
            });
            map.addLayer(communityDeedsLayer);
        }
        console.log('Added community deeds layer');
    } catch (e) {
        console.error('Failed to load community deeds:', e);
    } finally {
        hideCommunityDeedsLoading();
    }
}

function toggleCommunityDeeds() {
    communityDeedsVisible = !communityDeedsVisible;
    if (communityDeedsLayer) {
        communityDeedsLayer.setVisible(communityDeedsVisible);
    }
    // Save to localStorage
    localStorage.setItem('communityDeedsVisible', communityDeedsVisible.toString());
}

function showCommunityDeedsLoading() {
    const indicator = document.getElementById('community-deeds-loading');
    if (indicator) indicator.style.display = 'inline';
}

function hideCommunityDeedsLoading() {
    const indicator = document.getElementById('community-deeds-loading');
    if (indicator) indicator.style.display = 'none';
}

function showCommunityGuardTowersLoading() {
    const indicator = document.getElementById('community-guard-towers-loading');
    if (indicator) indicator.style.display = 'inline';
}

function hideCommunityGuardTowersLoading() {
    const indicator = document.getElementById('community-guard-towers-loading');
    if (indicator) indicator.style.display = 'none';
}

function showCommunityMissionStructuresLoading() {
    const indicator = document.getElementById('community-mission-structures-loading');
    if (indicator) indicator.style.display = 'inline';
}

function hideCommunityMissionStructuresLoading() {
    const indicator = document.getElementById('community-mission-structures-loading');
    if (indicator) indicator.style.display = 'none';
}

function showCommunityBridgesLoading() {
    const indicator = document.getElementById('community-bridges-loading');
    if (indicator) indicator.style.display = 'inline';
}

function hideCommunityBridgesLoading() {
    const indicator = document.getElementById('community-bridges-loading');
    if (indicator) indicator.style.display = 'none';
}

function showCommunityMapObjectsLoading() {
    const indicator = document.getElementById('community-map-objects-loading');
    if (indicator) indicator.style.display = 'inline';
}

function hideCommunityMapObjectsLoading() {
    const indicator = document.getElementById('community-map-objects-loading');
    if (indicator) indicator.style.display = 'none';
}

async function loadCommunityGuardTowersForMap(mapId: string) {
    const mapConfig = getMapConfig(mapId);
    if (!mapConfig || !mapConfig.communityMapUrl) {
        console.log('No communityMapUrl for map:', mapId);
        return;
    }
    console.log('Loading community guard towers for:', mapId);
    showCommunityGuardTowersLoading();
    try {
        let structures = await loadCommunityGuardTowers(mapId);
        console.log('Loaded guard towers from file:', structures?.length ?? 0);
        if (!structures) {
            // Fetch from URL
            console.log('Fetching guard towers from URL');
            structures = await fetchCommunityGuardTowers(mapConfig.communityMapUrl);
            console.log('Fetched guard towers:', structures.length);
            await saveCommunityGuardTowers(mapId, structures);
        }
        // Create features
        const features = structures.map(structure => {
            const x = structure.coords[0];
            const y = mapConfig.extent[3] - structure.coords[1]; // Flip Y

            const feature = new Feature({
                geometry: new Point([x, y]),
                name: structure.name,
                type: structure.structureType
            });

            return feature;
        });

        console.log('Created guard tower features:', features.length);

        // Create or update layer
        if (communityGuardTowersLayer) {
            communityGuardTowersLayer.getSource()?.clear();
            communityGuardTowersLayer.getSource()?.addFeatures(features);
        } else {
            communityGuardTowersLayer = new VectorLayer({
                source: new VectorSource({
                    features: features
                }),
                style: (feature) => {
                    const zoom = map!.getView().getZoom() || 0;
                    const shouldShowLabels = zoom >= LABEL_ZOOM_THRESHOLD;
                    const name = feature.get('name') || '';
                    const text = shouldShowLabels ? name : '';

                    return new Style({
                        image: new CircleStyle({
                            radius: 8,
                            fill: new Fill({ color: 'rgba(255, 140, 0, 0.6)' }), // Orange
                            stroke: new Stroke({ color: '#FF8C00', width: 2 })
                        }),
                        text: new Text({
                            text: text,
                            font: '12px Calibri,sans-serif',
                            fill: new Fill({ color: '#fff' }),
                            stroke: new Stroke({
                                color: '#000',
                                width: 2
                            }),
                            offsetY: -18
                        })
                    });
                },
                zIndex: 300, // Above mission structures
                visible: communityGuardTowersVisible
            });
            map.addLayer(communityGuardTowersLayer);
        }
        console.log('Added community guard towers layer');
    } catch (e) {
        console.error('Failed to load community guard towers:', e);
    } finally {
        hideCommunityGuardTowersLoading();
    }
}

function toggleCommunityGuardTowers() {
    communityGuardTowersVisible = !communityGuardTowersVisible;
    if (communityGuardTowersLayer) {
        communityGuardTowersLayer.setVisible(communityGuardTowersVisible);
    }
    // Save to localStorage
    localStorage.setItem('communityGuardTowersVisible', communityGuardTowersVisible.toString());
}

async function loadCommunityMissionStructuresForMap(mapId: string) {
    const mapConfig = getMapConfig(mapId);
    if (!mapConfig || !mapConfig.communityMapUrl) {
        console.log('No communityMapUrl for map:', mapId);
        return;
    }
    console.log('Loading community mission structures for:', mapId);
    showCommunityMissionStructuresLoading();
    try {
        let structures = await loadCommunityMissionStructures(mapId);
        console.log('Loaded mission structures from file:', structures?.length ?? 0);
        if (!structures) {
            // Fetch from URL
            console.log('Fetching mission structures from URL');
            structures = await fetchCommunityMissionStructures(mapConfig.communityMapUrl);
            console.log('Fetched mission structures:', structures.length);
            await saveCommunityMissionStructures(mapId, structures);
        }
        // Create features
        const features = structures.map(structure => {
            const x = structure.coords[0];
            const y = mapConfig.extent[3] - structure.coords[1]; // Flip Y

            const feature = new Feature({
                geometry: new Point([x, y]),
                name: structure.name,
                type: structure.structureType
            });

            return feature;
        });

        console.log('Created mission structure features:', features.length);

        // Create or update layer
        if (communityMissionStructuresLayer) {
            communityMissionStructuresLayer.getSource()?.clear();
            communityMissionStructuresLayer.getSource()?.addFeatures(features);
        } else {
            communityMissionStructuresLayer = new VectorLayer({
                source: new VectorSource({
                    features: features
                }),
                style: (feature) => {
                    const zoom = map!.getView().getZoom() || 0;
                    const shouldShowLabels = zoom >= LABEL_ZOOM_THRESHOLD;
                    const name = feature.get('name') || '';
                    const text = shouldShowLabels ? name : '';

                    return new Style({
                        image: new CircleStyle({
                            radius: 7,
                            fill: new Fill({ color: 'rgba(255, 0, 255, 0.6)' }), // Magenta
                            stroke: new Stroke({ color: '#FF00FF', width: 2 })
                        }),
                        text: new Text({
                            text: text,
                            font: '12px Calibri,sans-serif',
                            fill: new Fill({ color: '#fff' }),
                            stroke: new Stroke({
                                color: '#000',
                                width: 2
                            }),
                            offsetY: -16
                        })
                    });
                },
                zIndex: 200, // Above tunnels/canals but below guard towers
                visible: communityMissionStructuresVisible
            });
            map.addLayer(communityMissionStructuresLayer);
        }
        console.log('Added community mission structures layer');
    } catch (e) {
        console.error('Failed to load community mission structures:', e);
    } finally {
        hideCommunityMissionStructuresLoading();
    }
}

function toggleCommunityMissionStructures() {
    communityMissionStructuresVisible = !communityMissionStructuresVisible;
    if (communityMissionStructuresLayer) {
        communityMissionStructuresLayer.setVisible(communityMissionStructuresVisible);
    }
    // Save to localStorage
    localStorage.setItem('communityMissionStructuresVisible', communityMissionStructuresVisible.toString());
}

async function loadCommunityBridgesForMap(mapId: string) {
    const mapConfig = getMapConfig(mapId);
    if (!mapConfig || !mapConfig.communityMapUrl) {
        console.log('No communityMapUrl for map:', mapId);
        return;
    }
    console.log('Loading community bridges for:', mapId);
    showCommunityBridgesLoading();
    try {
        let bridges = await loadCommunityBridges(mapId);
        console.log('Loaded bridges from file:', bridges?.length ?? 0);
        if (!bridges) {
            // Fetch from URL
            console.log('Fetching bridges from URL');
            bridges = await fetchCommunityBridges(mapConfig.communityMapUrl);
            console.log('Fetched bridges:', bridges.length);
            await saveCommunityBridges(mapId, bridges);
        }
        // Create features
        const features = bridges.map(bridge => {
            const startX = bridge.coords[0][0];
            const startY = mapConfig.extent[3] - bridge.coords[0][1]; // Flip Y
            const endX = bridge.coords[1][0];
            const endY = mapConfig.extent[3] - bridge.coords[1][1]; // Flip Y

            const feature = new Feature({
                geometry: new LineString([[startX, startY], [endX, endY]]),
                name: bridge.name
            });

            return feature;
        });

        console.log('Created bridge features:', features.length);

        // Create or update layer
        if (communityBridgesLayer) {
            communityBridgesLayer.getSource()?.clear();
            communityBridgesLayer.getSource()?.addFeatures(features);
        } else {
            communityBridgesLayer = new VectorLayer({
                source: new VectorSource({
                    features: features
                }),
                style: (feature) => {
                    const zoom = map!.getView().getZoom() || 0;
                    const shouldShowLabels = zoom >= LABEL_ZOOM_THRESHOLD;
                    const name = feature.get('name') || '';
                    const text = shouldShowLabels && name ? name : '';

                    return new Style({
                        stroke: new Stroke({
                            color: 'rgba(139, 69, 19, 0.7)', // Brown color for bridges
                            width: 6
                        }),
                        text: new Text({
                            text: text,
                            font: '12px Calibri,sans-serif',
                            fill: new Fill({ color: '#fff' }),
                            stroke: new Stroke({
                                color: '#000',
                                width: 2
                            }),
                            offsetY: -10
                        })
                    });
                },
                zIndex: 50, // Above tile layers but below all community layers
                visible: communityBridgesVisible
            });
            map.addLayer(communityBridgesLayer);
        }
        console.log('Added community bridges layer');
    } catch (e) {
        console.error('Failed to load community bridges:', e);
    } finally {
        hideCommunityBridgesLoading();
    }
}

function toggleCommunityBridges() {
    communityBridgesVisible = !communityBridgesVisible;
    if (communityBridgesLayer) {
        communityBridgesLayer.setVisible(communityBridgesVisible);
    }
    // Save to localStorage
    localStorage.setItem('communityBridgesVisible', communityBridgesVisible.toString());
}

function toggleCommunityMapObjects() {
    communityMapObjectsVisible = !communityMapObjectsVisible;
    if (communityMapObjectsLayer) {
        communityMapObjectsLayer.setVisible(communityMapObjectsVisible);
    }
    // Save to localStorage
    localStorage.setItem('communityMapObjectsVisible', communityMapObjectsVisible.toString());
}

async function loadCommunityMapObjectsForMap(mapId: string) {
    const mapConfig = getMapConfig(mapId);
    if (!mapConfig || !mapConfig.communityMapUrl) {
        console.log('No communityMapUrl for map:', mapId);
        return;
    }
    console.log('Loading community map objects for:', mapId);
    showCommunityMapObjectsLoading();
    try {
        let objects: CommunityMapObject[] | null = await loadCommunityMapObjects(mapId);
        console.log('Loaded map objects from file:', objects?.length ?? 0);
        if (!objects) {
            // Fetch from URL
            console.log('Fetching map objects from URL');
            objects = await fetchCommunityMapObjects(mapConfig.communityMapUrl);
            console.log('Fetched map objects:', objects.length);
            await saveCommunityMapObjects(mapId, objects);
        }
        // Create features
        const features = objects.map((obj: CommunityMapObject) => {
            const startX = obj.startCoords[0];
            const startY = mapConfig.extent[3] - obj.startCoords[1]; // Flip Y
            const endX = obj.endCoords[0];
            const endY = mapConfig.extent[3] - obj.endCoords[1]; // Flip Y

            const feature = new Feature({
                geometry: new LineString([[startX, startY], [endX, endY]]),
                name: obj.name
            });

            return feature;
        });

        console.log('Created map object features:', features.length);

        // Create or update layer
        if (communityMapObjectsLayer) {
            communityMapObjectsLayer.getSource()?.clear();
            communityMapObjectsLayer.getSource()?.addFeatures(features);
        } else {
            communityMapObjectsLayer = new VectorLayer({
                source: new VectorSource({
                    features: features
                }),
                style: (feature) => {
                    const zoom = map!.getView().getZoom() || 0;
                    const shouldShowLabels = zoom >= LABEL_ZOOM_THRESHOLD;
                    const name = feature.get('name') || '';
                    const text = shouldShowLabels && name ? name : '';

                    // Find the object to get its properties
                    const obj = objects!.find((o: CommunityMapObject) => o.name === name);
                    if (!obj) return [];

                    let strokeColor = '#0000FF'; // Default blue for canals
                    let lineDash: number[] | undefined = undefined;

                    if (obj.isTunnel && obj.isCanal) {
                        // Both: dashed red and blue (alternating)
                        strokeColor = '#FF0000'; // Red base
                        lineDash = [10, 10]; // Dashed pattern
                    } else if (obj.isTunnel) {
                        strokeColor = '#FF0000'; // Red for tunnels
                    } else if (obj.isCanal) {
                        strokeColor = '#0000FF'; // Blue for canals
                    }

                    return new Style({
                        stroke: new Stroke({
                            color: strokeColor,
                            width: 6,
                            lineDash: lineDash
                        }),
                        text: new Text({
                            text: text,
                            font: '12px Calibri,sans-serif',
                            fill: new Fill({ color: '#fff' }),
                            stroke: new Stroke({
                                color: '#000',
                                width: 2
                            }),
                            offsetY: -15
                        })
                    });
                },
                zIndex: 50, // Same as bridges layer
                visible: communityMapObjectsVisible
            });
            map.addLayer(communityMapObjectsLayer);
        }
        console.log('Added community map objects layer');
    } catch (e) {
        console.error('Failed to load community map objects:', e);
    } finally {
        hideCommunityMapObjectsLoading();
    }
}

/**
 * Initialize the map with a specific configuration
 */
function initializeMap(mapId: string) {
    const mapConfig = getMapConfig(mapId);

    if (!mapConfig) {
        throw new Error(`Map configuration not found for: ${mapId}`);
    }

    currentMapId = mapId;
    setCurrentMapId(mapId);

    // Use configuration values
    const extent = mapConfig.extent;
    const resolutions = mapConfig.resolutions;

    const projection = new Projection({
        code: mapConfig.id.toUpperCase(),
        units: 'pixels',
        extent: extent
    });

    const tileGrid = new TileGrid({
        extent: extent,
        origin: [0, extent[3]], // Top-left origin (dynamic based on extent)
        tileSize: 256,
        resolutions: resolutions.slice(0, mapConfig.tileLayers[0].zoomLevels)
    });

    // Create tile layers from configuration
    // Find the correct tile layer based on selected year and type
    const terrainLayer = mapConfig.tileLayers.find(tl => tl.year === selectedYear && tl.mapType === selectedType) || mapConfig.tileLayers[0]; // Fallback to first layer
    const layer = new TileLayer({
        source: new XYZ({
            projection: projection,
            tileGrid: tileGrid,
            tileUrlFunction: (tileCoord) => {
                if (!tileCoord) return undefined;

                const z = tileCoord[0];
                const x = tileCoord[1];
                const y = tileCoord[2];

                // XYZ tiles: Y=0 is at the top, which matches OpenLayers' top-left origin
                // No flipping needed!

                const url = terrainLayer.urlTemplate
                    .replace('{z}', z.toString())
                    .replace('{x}', x.toString())
                    .replace('{y}', y.toString());
                return url;
            },
            crossOrigin: 'anonymous',
            tileSize: 256
        }),
        opacity: terrainLayer.opacity || 1.0,
        visible: terrainLayer.enabled
    });

    // Store reference to current tile layer for switching
    currentTileLayer = layer;

    // Create starting location features from config
    const startingLocationFeatures = (mapConfig.startingLocations || []).map(location => {
        // Convert game coordinates (Y up) to map coordinates (Y down from top-left)
        const x = location.coords[0];
        const y = extent[3] - location.coords[1]; // Use extent height for flipping

        const feature = new Feature({
            geometry: new Point([x, y]),
            name: location.name
        });

        feature.setStyle(new Style({
            image: new CircleStyle({
                radius: 8,
                fill: new Fill({ color: 'rgba(255, 215, 0, 0.6)' }),
                stroke: new Stroke({ color: '#FFD700', width: 2 })
            }),
            text: new Text({
                text: location.name,
                font: '14px Calibri,sans-serif',
                fill: new Fill({ color: '#fff' }),
                stroke: new Stroke({
                    color: '#000',
                    width: 3
                }),
                offsetY: -20
            })
        }));

        return feature;
    });

    const vectorLayer = new VectorLayer({
        source: new VectorSource({
            features: startingLocationFeatures
        }),
        zIndex: 1000, // Ensure starting locations render on top of all other layers
        properties: {
            'willReadFrequently': true
        }
    });

    // Load saved view state or use defaults
    const savedViewState = loadMapViewState(mapId);
    const defaultCenter = [extent[2] / 2, extent[3] / 2]; // Center of the map extent
    const defaultZoom = 2;

    const map = new Map({
        target: 'map',  // id of your HTML element
        layers: [layer, vectorLayer],
        controls: defaultControls().extend([
            new MousePosition({
                coordinateFormat: (coord) => {
                    if (!coord) return '';
                    const x = Math.max(extent[0], Math.min(extent[2], Math.round(coord[0])));
                    const y = Math.max(extent[1], Math.min(extent[3], Math.round(extent[3] - coord[1])));
                    return `${x}, ${y}`;
                },
                className: 'custom-mouse-position',
            })
        ]),
        view: new View({
            projection: projection,
            center: savedViewState?.center || defaultCenter,
            resolutions: resolutions, // Use explicit resolutions for z0-z8
            zoom: savedViewState?.zoom || defaultZoom,
            constrainResolution: true, // Snap to integer zoom levels
            // extent: extent // Removed to allow zooming out to see margin
        })
    });

    // Add view change listeners to save state
    let viewChangeTimeout: ReturnType<typeof setTimeout>;
    map.getView().on('change:center', () => {
        clearTimeout(viewChangeTimeout);
        viewChangeTimeout = setTimeout(() => {
            const center = map.getView().getCenter();
            const zoom = map.getView().getZoom();
            if (center && zoom !== undefined) {
                saveMapViewState(mapId, center, zoom);
            }
        }, 500); // Debounce saves to avoid excessive localStorage writes
    });

    map.getView().on('change:resolution', () => {
        clearTimeout(viewChangeTimeout);
        viewChangeTimeout = setTimeout(() => {
            const center = map.getView().getCenter();
            const zoom = map.getView().getZoom();
            if (center && zoom !== undefined) {
                saveMapViewState(mapId, center, zoom);
            }
        }, 500);
    });

    // Only fit to extent if no saved view state (first time user)
    if (!savedViewState) {
        // Fit map to window initially
        map.getView().fit(extent, { padding: [50, 50, 50, 50] });
        // Zoom in one level from the "fit" view
        const currentZoom = map.getView().getZoom();
        if (currentZoom !== undefined) {
            map.getView().setZoom(currentZoom + 1);
        }
    }

    console.log(`${mapConfig.name} map initialized`, map);

    // Load saved user layers from disk
    loadAndRenderUserLayers(map, currentMapId).then(() => {
        console.log('User layers loaded from disk');
        renderLayerList(); // Update the layer list UI after loading
    }).catch(err => {
        console.error('Failed to load user layers:', err);
    });

    // Set up UI event handlers
    setupUIHandlers(map);

    return map;
}

// --- UI Elements ---
const layerList = document.getElementById('layer-list') as HTMLUListElement;
const newLayerNameInput = document.getElementById('new-layer-name') as HTMLInputElement;
const addLayerBtn = document.getElementById('add-layer-btn') as HTMLButtonElement;
const drawPointBtn = document.getElementById('draw-point-btn') as HTMLButtonElement;

// --- Feature Info Box ---
const featureInfoBox = document.getElementById('feature-info') as HTMLDivElement;
const featureInfoName = document.getElementById('feature-info-name') as HTMLHeadingElement;
const featureInfoDesc = document.getElementById('feature-info-desc') as HTMLParagraphElement;
const featureInfoType = document.getElementById('feature-info-type') as HTMLSpanElement;
const featureInfoCoords = document.getElementById('feature-info-coords') as HTMLSpanElement;
const featureInfoCloseBtn = document.getElementById('feature-info-close') as HTMLButtonElement;
const featureInfoRemoveBtn = document.getElementById('feature-info-remove') as HTMLButtonElement;

// --- Add Feature Modal ---
const addFeatureModal = document.getElementById('add-feature-modal') as HTMLDivElement;
const featureNameInput = document.getElementById('feature-name') as HTMLInputElement;
const featureDescTextarea = document.getElementById('feature-desc') as HTMLTextAreaElement;
const featureIconSelect = document.getElementById('feature-icon-type') as HTMLSelectElement;
const saveFeatureBtn = document.getElementById('save-feature-btn') as HTMLButtonElement;
const cancelFeatureBtn = document.getElementById('cancel-feature-btn') as HTMLButtonElement;

function setupUIHandlers(mapInstance: Map) {
    // Set up layer manager event handlers
    addLayerBtn.addEventListener('click', () => {
        const name = newLayerNameInput.value.trim();
        if (name) {
            const newLayer: UserLayer = {
                name: name,
                visible: true,
                features: []
            };
            addUserLayer(mapInstance, newLayer);
            newLayerNameInput.value = '';
            renderLayerList();
        }
    });

    drawPointBtn.addEventListener('click', () => {
        if (!selectedLayerForDrawing) {
            // Just return without showing a message - user will learn to select a layer
            return;
        }
        startDrawing('Point', mapInstance);
    });

    // Feature info close button
    featureInfoCloseBtn.addEventListener('click', () => {
        featureInfoBox.style.display = 'none';
        currentFeature = null;
        currentFeatureLayer = null;
    });

    // Feature info remove button
    featureInfoRemoveBtn.addEventListener('click', () => {
        if (currentFeature && currentFeatureLayer) {
            const featureName = currentFeature.get('name') || 'Unnamed Feature';
            if (confirm(`Are you sure you want to remove the feature "${featureName}"?`)) {
                removeFeatureFromLayer(mapInstance, currentFeatureLayer, featureName);
                featureInfoBox.style.display = 'none';
                currentFeature = null;
                currentFeatureLayer = null;
            }
        }
    });

    // Map click handler for feature info
    mapInstance.on('click', function (evt) {
        if (drawInteraction) return;

        const feature = mapInstance.forEachFeatureAtPixel(evt.pixel, function (feature) {
            return feature;
        });

        if (feature) {
            // Store reference to current feature for removal (only if it's a real Feature, not RenderFeature)
            currentFeature = feature instanceof Feature ? feature : null;

            // Determine which layer this feature belongs to
            currentFeatureLayer = null;
            if (currentFeature) {
                const layers = mapInstance.getLayers().getArray();
                for (const layer of layers) {
                    if (layer instanceof VectorLayer) {
                        const source = layer.getSource();
                        if (source && source.getFeatures().includes(currentFeature)) {
                            currentFeatureLayer = layer.get('name');
                            break;
                        }
                    }
                }
            }

            const properties = feature.getProperties();
            const geometry = feature.getGeometry();
            const mapConfig = getMapConfig(currentMapId);
            if (!mapConfig) return;
            const extent = mapConfig.extent;

            featureInfoName.textContent = properties.name || 'Unnamed Feature';
            featureInfoDesc.textContent = properties.description || '';
            featureInfoType.textContent = properties.icon || 'default';

            if (geometry && geometry.getType() === 'Point') {
                const coords = (geometry as Point).getCoordinates();
                const gameX = Math.round(coords[0]);
                const gameY = Math.round(extent[3] - coords[1]);
                featureInfoCoords.textContent = `${gameX}, ${gameY}`;
            } else {
                featureInfoCoords.textContent = 'N/A';
            }

            featureInfoBox.style.display = 'block';
        } else {
            featureInfoBox.style.display = 'none';
            currentFeature = null;
            currentFeatureLayer = null;
        }
    });
}

function renderLayerList() {
    if (!layerList) return;
    layerList.innerHTML = ''; // Clear existing list

    const layers = getUserLayers();
    layers.forEach((layer: UserLayer) => {
        const listItem = document.createElement('li');

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'selected-layer';
        radio.value = layer.name;
        radio.id = `radio-${layer.name}`;
        radio.addEventListener('change', () => {
            selectedLayerForDrawing = layer.name;
        });


        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = layer.visible;
        checkbox.dataset.layerName = layer.name;
        checkbox.addEventListener('change', () => {
            toggleUserLayer(map, layer.name);
        });

        const label = document.createElement('label');
        label.htmlFor = `radio-${layer.name}`;
        label.textContent = layer.name;

        listItem.appendChild(radio);
        listItem.appendChild(checkbox);
        listItem.appendChild(label);
        layerList.appendChild(listItem);
    });
}

function startDrawing(type: 'Point' | 'LineString' | 'Polygon', mapInstance: Map) {
    if (drawInteraction) {
        mapInstance.removeInteraction(drawInteraction);
    }

    const targetLayerName = selectedLayerForDrawing;
    if (!targetLayerName) return;

    const olLayer = mapInstance.getLayers().getArray().find(l => l.get('name') === targetLayerName) as VectorLayer<VectorSource<Feature<Geometry>>>;
    const source = olLayer.getSource();
    if (!source) return;

    // Create draw interaction without a source to prevent automatic feature addition
    drawInteraction = new Draw({
        type: type,
    });

    drawInteraction.on('drawend', (event) => {
        const feature = event.feature;
        const geometry = feature.getGeometry();
        if (geometry) {
            // Set temporary properties for the feature so it doesn't show as "unknown"
            feature.set('name', 'New Feature (unsaved)');
            feature.set('description', '');
            feature.set('icon', 'default');

            // Add the feature temporarily to the source for visual feedback
            source.addFeature(feature);

            addFeatureModal.style.display = 'block';

            const saveHandler = () => {
                const coords = (geometry as Point).getCoordinates();
                const featureName = featureNameInput.value || 'New Point';
                const featureDesc = featureDescTextarea.value;
                const iconType = featureIconSelect.value;

                // Remove the temporary feature
                source.removeFeature(feature);

                // Add the properly configured feature
                addFeatureToLayer(mapInstance, targetLayerName, {
                    type: 'Point',
                    coordinates: coords,
                    properties: {
                        name: featureName,
                        description: featureDesc,
                        icon: iconType,
                    },
                });

                addFeatureModal.style.display = 'none';
                featureNameInput.value = '';
                featureDescTextarea.value = '';
                featureIconSelect.value = 'default';
                saveFeatureBtn.removeEventListener('click', saveHandler);
            };

            const cancelHandler = () => {
                // Remove the temporary feature
                source.removeFeature(feature);
                addFeatureModal.style.display = 'none';
                cancelFeatureBtn.removeEventListener('click', cancelHandler);
            };

            saveFeatureBtn.addEventListener('click', saveHandler, { once: true });
            cancelFeatureBtn.addEventListener('click', cancelHandler, { once: true });
        }
        mapInstance.removeInteraction(drawInteraction!);
        drawInteraction = null;
    });

    mapInstance.addInteraction(drawInteraction);
}

// Populate map selector dropdown
function populateMapSelector() {
    const islandSelect = document.getElementById('island-select') as HTMLSelectElement;
    const yearSelect = document.getElementById('year-select') as HTMLSelectElement;
    const typeSelect = document.getElementById('type-select') as HTMLSelectElement;
    if (!islandSelect || !yearSelect || !typeSelect) return;

    const maps = getAllMaps();
    // Get unique islands
    const islands = Array.from(new Set(maps.map(m => m.name)));
    islandSelect.innerHTML = '';
    islands.forEach(island => {
        const option = document.createElement('option');
        option.value = island;
        option.textContent = island;
        islandSelect.appendChild(option);
    });

    // Helper functions moved outside

    // Set initial selection
    // (moved outside function)

    function updateYearSelect() {
        const availableYears = getYearsForIsland(selectedIsland);
        yearSelect.innerHTML = '';
        availableYears.forEach((year: number) => {
            const option = document.createElement('option');
            option.value = year.toString();
            option.textContent = year.toString();
            yearSelect.appendChild(option);
        });
        // Don't override selectedYear here, just populate the dropdown
    }
    function updateTypeSelect() {
        const availableTypes = getTypesForIslandYear(selectedIsland, selectedYear);
        typeSelect.innerHTML = '';
        availableTypes.forEach((type: string) => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
            typeSelect.appendChild(option);
        });
        // Don't override selectedType here, just populate the dropdown
    }

    // Initial population
    updateYearSelect();
    updateTypeSelect();

    // Set current selection from saved preferences or current map
    islandSelect.value = selectedIsland;
    updateYearSelect();
    yearSelect.value = selectedYear.toString();
    updateTypeSelect();
    typeSelect.value = selectedType;

    islandSelect.addEventListener('change', () => {
        selectedIsland = islandSelect.value;
        updateYearSelect();
        selectedYear = parseInt(yearSelect.value, 10);
        updateTypeSelect();
        selectedType = typeSelect.value as "terrain" | "topological";
        saveMapPreferences(selectedIsland, selectedYear, selectedType);
        switchToSelectedMap();
    });
    yearSelect.addEventListener('change', () => {
        selectedYear = parseInt(yearSelect.value, 10);
        updateTypeSelect();
        selectedType = typeSelect.value as "terrain" | "topological";
        saveMapPreferences(selectedIsland, selectedYear, selectedType);
        switchToSelectedMap();
    });
    typeSelect.addEventListener('change', () => {
        selectedType = typeSelect.value as "terrain" | "topological";
        saveMapPreferences(selectedIsland, selectedYear, selectedType);
        switchToSelectedMap();
    });

    function switchToSelectedMap() {
        const map = maps.find(m => m.name === selectedIsland);
        const tileLayer = getTileLayer(map, selectedYear, selectedType);
        if (map && tileLayer) {
            // If the map is not already loaded, switch
            if (map.id !== currentMapId) {
                switchMap(map.id);
            } else {
                // If the map is already loaded, just switch tile layer
                if (currentTileLayer && tileLayer) {
                    const source = currentTileLayer.getSource() as XYZ;
                    if (source) {
                        // Update the tile URL function to use the new tile layer
                        source.setTileUrlFunction((tileCoord) => {
                            if (!tileCoord) return undefined;

                            const z = tileCoord[0];
                            const x = tileCoord[1];
                            const y = tileCoord[2];

                            const url = tileLayer.urlTemplate
                                .replace('{z}', z.toString())
                                .replace('{x}', x.toString())
                                .replace('{y}', y.toString());
                            return url;
                        });
                        // Clear the tile cache to force reload of tiles
                        source.refresh();
                    }
                }
            }
        }
    }
}

// Switch to a different map
function switchMap(newMapId: string) {
    // Dispose of current map
    if (map) {
        map.setTarget(undefined);
        map.dispose();
    }

    // Remove draw interaction if active
    if (drawInteraction) {
        map.removeInteraction(drawInteraction);
        drawInteraction = null;
    }

    // Reset selected layer
    selectedLayerForDrawing = null;

    // Clear the layer list UI
    if (layerList) {
        layerList.innerHTML = '';
    }

    // Hide feature info box
    if (featureInfoBox) {
        featureInfoBox.style.display = 'none';
    }

    // Clear current feature references
    currentFeature = null;
    currentFeatureLayer = null;

    // Reset community layer references when switching maps
    communityDeedsLayer = null;
    communityGuardTowersLayer = null;
    communityMissionStructuresLayer = null;
    communityBridgesLayer = null;

    // Initialize new map
    map = initializeMap(newMapId);

    // Load community deeds
    loadCommunityDeedsForMap(newMapId);

    // Load community guard towers
    loadCommunityGuardTowersForMap(newMapId);

    // Load community mission structures
    loadCommunityMissionStructuresForMap(newMapId);

    // Load community bridges
    loadCommunityBridgesForMap(newMapId);

    // Load community map objects
    loadCommunityMapObjectsForMap(newMapId);
}

// Initialize on page load
// Set initial selection before initializing map
const maps = getAllMaps();
const islands = [...new Set(maps.map(m => m.name))];

// Load saved preferences or use defaults
const savedPrefs = loadMapPreferences();
let selectedIsland = savedPrefs?.island || islands[0];
let selectedYear = savedPrefs?.year || (getYearsForIsland(selectedIsland)[0] || 2025);
let selectedType = savedPrefs?.type || (getTypesForIslandYear(selectedIsland, selectedYear)[0] || 'terrain');

// Ensure the saved island still exists, fallback to first available
if (!islands.includes(selectedIsland)) {
    selectedIsland = islands[0];
    selectedYear = getYearsForIsland(selectedIsland)[0] || 2025;
    selectedType = getTypesForIslandYear(selectedIsland, selectedYear)[0] || 'terrain';
}

// Get the map ID for the selected island
const initialMap = maps.find(m => m.name === selectedIsland);
const initialMapId = initialMap?.id || 'xanadu';

map = initializeMap(initialMapId);
populateMapSelector();

// Initialize map selector panel
initializeMapSelectorPanel();

// Load community deeds
loadCommunityDeedsForMap(initialMapId);

// Load community guard towers
loadCommunityGuardTowersForMap(initialMapId);

// Load community mission structures
loadCommunityMissionStructuresForMap(initialMapId);

// Load community bridges
loadCommunityBridgesForMap(initialMapId);

// Load community map objects
loadCommunityMapObjectsForMap(initialMapId);

// Initialize layer manager panel
initializeLayerManagerPanel();

// Community deeds toggle setup
const communityDeedsToggle = document.getElementById('community-deeds-toggle') as HTMLInputElement;
if (communityDeedsToggle) {
    communityDeedsToggle.checked = communityDeedsVisible;
    communityDeedsToggle.addEventListener('change', () => {
        toggleCommunityDeeds();
    });
}

// Community guard towers toggle setup
const communityGuardTowersToggle = document.getElementById('community-guard-towers-toggle') as HTMLInputElement;
if (communityGuardTowersToggle) {
    communityGuardTowersToggle.checked = communityGuardTowersVisible;
    communityGuardTowersToggle.addEventListener('change', () => {
        toggleCommunityGuardTowers();
    });
}

// Community mission structures toggle setup
const communityMissionStructuresToggle = document.getElementById('community-mission-structures-toggle') as HTMLInputElement;
if (communityMissionStructuresToggle) {
    communityMissionStructuresToggle.checked = communityMissionStructuresVisible;
    communityMissionStructuresToggle.addEventListener('change', () => {
        toggleCommunityMissionStructures();
    });
}

// Community bridges toggle setup
const communityBridgesToggle = document.getElementById('community-bridges-toggle') as HTMLInputElement;
if (communityBridgesToggle) {
    communityBridgesToggle.checked = communityBridgesVisible;
    communityBridgesToggle.addEventListener('change', () => {
        toggleCommunityBridges();
    });
}

// Community map objects toggle setup
const communityMapObjectsToggle = document.getElementById('community-map-objects-toggle') as HTMLInputElement;
if (communityMapObjectsToggle) {
    communityMapObjectsToggle.checked = communityMapObjectsVisible;
    communityMapObjectsToggle.addEventListener('change', () => {
        toggleCommunityMapObjects();
    });
}

// Panel management functions
function initializeMapSelectorPanel() {
    const panel = document.getElementById('map-selector-panel') as HTMLElement;
    const toggleBtn = document.getElementById('panel-toggle') as HTMLButtonElement;
    const collapseBtn = document.getElementById('panel-collapse') as HTMLButtonElement;
    const layerPanel = document.getElementById('layer-manager-panel') as HTMLElement;

    if (!panel || !toggleBtn || !collapseBtn || !layerPanel) return;

    // Load saved panel state
    const savedState = localStorage.getItem('wurmMapPanelExpanded');
    const isExpanded = savedState === 'true';

    if (isExpanded) {
        panel.classList.remove('collapsed');
        // Ensure layer panel is collapsed when map panel is expanded
        layerPanel.classList.add('collapsed');
        localStorage.setItem('wurmLayerPanelExpanded', 'false');
    } else {
        panel.classList.add('collapsed');
    }

    // Toggle panel visibility
    function togglePanel() {
        const isCollapsed = panel.classList.contains('collapsed');
        if (isCollapsed) {
            panel.classList.remove('collapsed');
            localStorage.setItem('wurmMapPanelExpanded', 'true');
            // Collapse the layer panel when expanding map panel
            layerPanel.classList.add('collapsed');
            localStorage.setItem('wurmLayerPanelExpanded', 'false');
        } else {
            panel.classList.add('collapsed');
            localStorage.setItem('wurmMapPanelExpanded', 'false');
        }
    }

    // Event listeners
    toggleBtn.addEventListener('click', togglePanel);
    collapseBtn.addEventListener('click', togglePanel);
}

// Layer manager panel management functions
function initializeLayerManagerPanel() {
    const panel = document.getElementById('layer-manager-panel') as HTMLElement;
    const toggleBtn = document.getElementById('layer-panel-toggle') as HTMLButtonElement;
    const collapseBtn = document.getElementById('layer-panel-collapse') as HTMLButtonElement;
    const mapPanel = document.getElementById('map-selector-panel') as HTMLElement;

    if (!panel || !toggleBtn || !collapseBtn || !mapPanel) return;

    // Load saved panel state
    const savedState = localStorage.getItem('wurmLayerPanelExpanded');
    const isExpanded = savedState === 'true';

    if (isExpanded) {
        panel.classList.remove('collapsed');
        // Ensure map panel is collapsed when layer panel is expanded
        mapPanel.classList.add('collapsed');
        localStorage.setItem('wurmMapPanelExpanded', 'false');
    } else {
        panel.classList.add('collapsed');
    }

    // Toggle panel visibility
    function togglePanel() {
        const isCollapsed = panel.classList.contains('collapsed');
        if (isCollapsed) {
            panel.classList.remove('collapsed');
            localStorage.setItem('wurmLayerPanelExpanded', 'true');
            // Collapse the map panel when expanding layer panel
            mapPanel.classList.add('collapsed');
            localStorage.setItem('wurmMapPanelExpanded', 'false');
        } else {
            panel.classList.add('collapsed');
            localStorage.setItem('wurmLayerPanelExpanded', 'false');
        }
    }

    // Event listeners
    toggleBtn.addEventListener('click', togglePanel);
    collapseBtn.addEventListener('click', togglePanel);
}
