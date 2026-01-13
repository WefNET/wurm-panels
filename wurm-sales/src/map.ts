import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import TileImage from 'ol/source/TileImage';
import Projection from 'ol/proj/Projection';
import TileGrid from 'ol/tilegrid/TileGrid';

// The extent matches your full image size
const extent: [number, number, number, number] = [0, 0, 8192, 8192];

const projection = new Projection({
    code: 'XANADU',
    units: 'pixels',
    extent: extent
});

const tileGrid = new TileGrid({
    extent: extent,
    origin: [0, 8192], // Top-left origin
    tileSize: 256,
    resolutions: [
        32, // z0
        16,
        8,
        4,
        2,
        1   // z5
    ]
});

const layer = new TileLayer({
    source: new TileImage({
        projection: projection,
        tileGrid: tileGrid,
        crossOrigin: 'anonymous',
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
        }
    })
});


const map = new Map({
    target: 'map',  // id of your HTML element
    layers: [layer],
    view: new View({
        projection: projection,
        center: [4096, 4096],  // center of your image
        zoom: 2,
        maxZoom: 5,
        extent: extent
    })
});

console.log('Xanadu map initialized', map);
