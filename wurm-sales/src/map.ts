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
import Point from 'ol/geom/Point';
import { Style, Stroke, Fill, Text, Circle as CircleStyle } from 'ol/style';

const xanaduStartingTowns = [
    {
        "Name": "Summerholt",
        "Coords": [6602, 2252]
    },
    {
        "Name": "Greymead",
        "Coords": [4701, 3051]
    },
    {
        "Name": "Whitefay",
        "Coords": [5651, 3051]
    },
    {
        "Name": "Glasshollow",
        "Coords": [1580, 787]
    },
    {
        "Name": "Newspring",
        "Coords": [883, 7229]
    },
    {
        "Name": "Esteron",
        "Coords": [7410, 6434]
    },
    {
        "Name": "Linton",
        "Coords": [1825, 4166]
    },
    {
        "Name": "Lormere",
        "Coords": [3481, 6437]
    },
    {
        "Name": "Vrock Landing",
        "Coords": [2722, 2241]
    }
];

// The extent matches your full image size
const extent: [number, number, number, number] = [0, 0, 8192, 8192];

const projection = new Projection({
    code: 'XANADU',
    units: 'pixels',
    extent: extent
});

// Define resolutions for both TileGrid and View
const resolutions = [
    32, // z0: 8192 / 256 = 32 map units per pixel (Map is 256px wide)
    16, // z1
    8,  // z2
    4,  // z3
    2,  // z4
    1,  // z5: native resolution (1 map unit = 1 pixel)
    0.5, // z6: virtual
    0.25, // z7: virtual
    0.125 // z8: virtual
];

const tileGrid = new TileGrid({
    extent: extent,
    origin: [0, 8192], // Top-left origin
    tileSize: 256,
    resolutions: resolutions.slice(0, 6) // Only up to z5 exist as tiles
});

const layer = new TileLayer({
    source: new XYZ({
        projection: projection,
        tileGrid: tileGrid,
        tileUrlFunction: (tileCoord) => {
            if (!tileCoord) return undefined;

            const z = tileCoord[0];
            const x = tileCoord[1];
            const y = tileCoord[2];

            // OpenLayers with Top-Left origin gives y=0 at top.
            // If your tiles are TMS (gdal2tiles default sometimes), 0.png is at the bottom.
            // We need to flip the Y coordinate to match the file structure.

            // Calculate how many tiles high the map is at this zoom level
            // For z=0 (res 32): 8192 / (32 * 256) = 1 tile high
            // For z=5 (res 1): 8192 / (1 * 256) = 32 tiles high
            const res = tileGrid.getResolution(z);
            if (res === undefined) return undefined;

            const matrixHeight = Math.ceil(8192 / (res * 256));

            // If y=0 (Top in OL), we want the highest file index (Top in TMS) -> MatrixHeight - 1
            // If y=Max (Bottom in OL), we want 0 (Bottom in TMS)
            const yFlipped = matrixHeight - 1 - y;

            const url = `https://pub-6192353739be4c3191140ad893e309f2.r2.dev/xanadu/2025/terrain/${z}/${x}/${yFlipped}.png`;
            return url;
        },
        crossOrigin: 'anonymous',
        tileSize: 256
    })
});

// Transform starting towns (pixels) to map coordinates
// OpenLayers (top-left origin 0,0) needs Y to be unmodified if we want (x, y) to match the expected location on the grid
// However, the coordinate format function earlier used `8192 - coord` to display "Game Coordinates"
// If xanaduStartingTowns are in "Game Coordinates", we need to flip Y for OpenLayers rendering

const startingTownsFeatures = xanaduStartingTowns.map(town => {
    // Convert game coordinates (Y up) to map coordinates (Y down from top-left, which is 0)
    // Game Y 2231 -> Map Y is 2231 if we assume origin matches?
    // Wait, earlier we said:
    // coordinateFormat: y = 8192 - coord[1]
    // So coord[1] (OpenLayers Y) = 8192 - y (Game Y)

    const x = town.Coords[0];
    const y = 8192 - town.Coords[1];

    const feature = new Feature({
        geometry: new Point([x, y]),
        name: town.Name
    });

    feature.setStyle(new Style({
        image: new CircleStyle({
            radius: 8,
            fill: new Fill({ color: 'rgba(255, 215, 0, 0.6)' }),
            stroke: new Stroke({ color: '#FFD700', width: 2 })
        }),
        text: new Text({
            text: town.Name,
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
        features: startingTownsFeatures
    })
});

const map = new Map({
    target: 'map',  // id of your HTML element
    layers: [layer, vectorLayer],
    controls: defaultControls().extend([
        new MousePosition({
            coordinateFormat: (coord) => {
                if (!coord) return '';
                const x = Math.max(0, Math.min(8192, Math.round(coord[0])));
                const y = Math.max(0, Math.min(8192, Math.round(8192 - coord[1])));
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

console.log('Xanadu map initialized', map);
