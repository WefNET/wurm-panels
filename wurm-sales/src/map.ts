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
import { Point, Geometry } from 'ol/geom';
import { Style, Stroke, Fill, Text, Circle as CircleStyle } from 'ol/style';
import { addUserLayer, toggleUserLayer, getUserLayers, UserLayer, addFeatureToLayer, loadAndRenderUserLayers, setCurrentMapId } from './userLayers';
import { Draw } from 'ol/interaction';
import { getMapConfig, getAllMaps } from './mapConfigs';

// Global state
let currentMapId = 'xanadu'; // Default map
let map: Map;
let drawInteraction: Draw | null = null;
let selectedLayerForDrawing: string | null = null;

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
const terrainLayer = mapConfig.tileLayers[0]; // Get the first (terrain) layer
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
    properties: {
        'willReadFrequently': true
    }
});

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
        center: [4096, 4096],  // center of your image
        resolutions: resolutions, // Use explicit resolutions for z0-z8
        zoom: 2,
        constrainResolution: true, // Snap to integer zoom levels
        // extent: extent // Removed to allow zooming out to see margin
    })
    });

    // Fit map to window initially
    map.getView().fit(extent, { padding: [50, 50, 50, 50] });

    // Zoom in one level from the "fit" view
    const currentZoom = map.getView().getZoom();
    if (currentZoom !== undefined) {
        map.getView().setZoom(currentZoom + 1);
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
    });

    // Map click handler for feature info
    mapInstance.on('click', function (evt) {
        if (drawInteraction) return;

        const feature = mapInstance.forEachFeatureAtPixel(evt.pixel, function (feature) {
            return feature;
        });

        if (feature) {
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

    drawInteraction = new Draw({
        source: source,
        type: type,
    });

    drawInteraction.on('drawend', (event) => {
        const feature = event.feature;
        const geometry = feature.getGeometry();
        if (geometry) {
            addFeatureModal.style.display = 'block';

            const saveHandler = () => {
                const coords = (geometry as Point).getCoordinates();
                const featureName = featureNameInput.value || 'New Point';
                const featureDesc = featureDescTextarea.value;
                const iconType = featureIconSelect.value;

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
                addFeatureModal.style.display = 'none';
                cancelFeatureBtn.removeEventListener('click', cancelHandler);
                const source = olLayer.getSource();
                if (source) {
                    source.removeFeature(feature);
                }
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
    const mapSelect = document.getElementById('map-select') as HTMLSelectElement;
    if (!mapSelect) return;

    const maps = getAllMaps();
    mapSelect.innerHTML = '';
    
    maps.forEach(mapConfig => {
        const option = document.createElement('option');
        option.value = mapConfig.id;
        option.textContent = mapConfig.name;
        if (mapConfig.id === currentMapId) {
            option.selected = true;
        }
        mapSelect.appendChild(option);
    });

    mapSelect.addEventListener('change', (e) => {
        const newMapId = (e.target as HTMLSelectElement).value;
        if (newMapId && newMapId !== currentMapId) {
            switchMap(newMapId);
        }
    });
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

    // Initialize new map
    map = initializeMap(newMapId);
}

// Initialize on page load
map = initializeMap('xanadu');
populateMapSelector();
