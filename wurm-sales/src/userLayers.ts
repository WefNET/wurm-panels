import { Map } from 'ol';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { Feature } from 'ol';
import { Geometry } from 'ol/geom';
import { Style, Stroke, Fill, Circle as CircleStyle, Icon, Text } from 'ol/style';
import { invoke } from '@tauri-apps/api/core';

// Define the structure for a single geographic feature
export interface UserFeature {
    type: 'Point' | 'LineString' | 'Polygon';
    coordinates: any; // GeoJSON coordinates structure varies
    properties: {
        name: string;
        description?: string;
        icon?: string; // URL or identifier for an icon
    };
}

// Define the structure for a GeoJSON Feature, which is what OpenLayers' GeoJSON format parser expects
export interface GeoJSONFeature {
    type: 'Feature';
    geometry: {
        type: 'Point' | 'LineString' | 'Polygon';
        coordinates: any;
    };
    properties: {
        name: string;
        description?: string;
        icon?: string;
    };
}

// Define the structure for a named layer
export interface UserLayer {
    name: string;
    features: UserFeature[];
    visible: boolean;
}

// In-memory store for layers for now. We will integrate with Tauri later.
let userLayers: UserLayer[] = [];

/**
 * Saves all current user layers to disk via Tauri.
 */
async function persistUserLayers() {
    try {
        await invoke('save_user_layers', { layers: userLayers });
        console.log('User layers saved.');
    } catch (error) {
        console.error('Failed to save user layers:', error);
    }
}

// Define styles for different icon types
const iconStyles = {
    default: new Style({
        image: new CircleStyle({
            radius: 7,
            fill: new Fill({ color: 'rgba(255, 0, 0, 0.6)' }),
            stroke: new Stroke({ color: '#ff0000', width: 2 })
        })
    }),
    house: new Style({
        image: new Icon({
            anchor: [0.5, 1],
            src: 'https://api.iconify.design/mdi/home.svg?color=%23ffffff', // White house icon
            scale: 1.5
        })
    }),
    mine: new Style({
        image: new Icon({
            anchor: [0.5, 0.5],
            src: 'https://api.iconify.design/mdi/pickaxe.svg?color=%23ffffff', // White pickaxe icon
            scale: 1.5
        })
    }),
    cave: new Style({
        image: new Icon({
            anchor: [0.5, 0.5],
            src: 'https://api.iconify.design/game-icons/cave-entrance.svg?color=%23ffffff', // White cave icon
            scale: 1.5
        })
    })
};

/**
 * Style function to dynamically apply styles based on feature properties.
 * @param feature The feature to be styled.
 * @returns A Style object.
 */
function featureStyleFunction(feature: Feature<Geometry>): Style {
    const iconType = feature.get('icon') || 'default';
    const name = feature.get('name') || '';

    // Clone the base style to avoid modifying the original
    const baseStyle = iconStyles[iconType as keyof typeof iconStyles] || iconStyles.default;
    const style = baseStyle.clone();

    // Set the text for the label
    style.setText(new Text({
        text: name,
        font: '12px Calibri,sans-serif',
        fill: new Fill({ color: '#fff' }),
        stroke: new Stroke({
            color: '#000',
            width: 3
        }),
        offsetY: -25 // Adjust this value to position the text above the icon
    }));

    return style;
}

/**
 * Creates an OpenLayers VectorLayer from a UserLayer definition.
 * @param layerData The user layer data.
 * @returns An OpenLayers VectorLayer.
 */
function createOLLayer(layerData: UserLayer): VectorLayer<VectorSource<Feature<Geometry>>> {
    const features = new GeoJSON().readFeatures({
        type: 'FeatureCollection',
        features: layerData.features.map(f => ({
            type: 'Feature',
            geometry: {
                type: f.type,
                coordinates: f.coordinates,
            },
            properties: f.properties,
        })),
    }) as Feature<Geometry>[];

    const vectorSource = new VectorSource({
        features: features,
    });

    return new VectorLayer({
        source: vectorSource,
        style: featureStyleFunction as any, // Use the style function here
        visible: layerData.visible,
        // We'll store the name on the layer for easy identification
        properties: {
            name: layerData.name,
            'willReadFrequently': true
        },
    });
}

/**
 * Adds a new feature to a specified user layer.
 * @param map The OpenLayers map instance.
 * @param layerName The name of the layer to add the feature to.
 * @param featureData The feature to add.
 */
export function addFeatureToLayer(map: Map, layerName: string, featureData: UserFeature) {
    const userLayer = userLayers.find(l => l.name === layerName);
    const olLayer = map.getLayers().getArray().find(l => l.get('name') === layerName) as VectorLayer<VectorSource<Feature<Geometry>>>;

    if (!userLayer || !olLayer) {
        console.warn(`Layer "${layerName}" not found.`);
        return;
    }

    // 1. Add to our in-memory store
    userLayer.features.push(featureData);

    // 2. Create an OL Feature and add it to the VectorSource
    const olFeature = new GeoJSON().readFeature({
        type: 'Feature',
        geometry: {
            type: featureData.type,
            coordinates: featureData.coordinates,
        },
        properties: featureData.properties,
    }) as Feature<Geometry>;

    const vectorSource = olLayer.getSource();
    if (vectorSource) {
        vectorSource.addFeature(olFeature);
    }

    // Later, we'll save the updated userLayer to JSON via Tauri here.
    console.log(`Feature added to ${layerName}`, userLayer);
    persistUserLayers();
}


/**
 * Adds a new user layer to the map.
 * @param map The OpenLayers map instance.
 * @param layerData The data for the new layer.
 */
export function addUserLayer(map: Map, layerData: UserLayer) {
    if (userLayers.find(l => l.name === layerData.name)) {
        console.warn(`Layer with name "${layerData.name}" already exists.`);
        return;
    }

    userLayers.push(layerData);
    const olLayer = createOLLayer(layerData);
    map.addLayer(olLayer);
    // Later, we'll save to JSON via Tauri here.
    persistUserLayers();
}

/**
 * Toggles the visibility of a user layer.
 * @param map The OpenLayers map instance.
 * @param layerName The name of the layer to toggle.
 */
export function toggleUserLayer(map: Map, layerName: string) {
    const layer = map.getLayers().getArray().find(l => l.get('name') === layerName);
    if (layer) {
        const isVisible = layer.getVisible();
        layer.setVisible(!isVisible);

        const storeLayer = userLayers.find(l => l.name === layerName);
        if (storeLayer) {
            storeLayer.visible = !isVisible;
            // Later, we'll save to JSON via Tauri here.
            persistUserLayers();
        }
    }
}

/**
 * Gets all user layers.
 * @returns An array of user layers.
 */
export function getUserLayers(): UserLayer[] {
    return userLayers;
}

/**
 * Removes a feature from a user layer.
 * @param map The OpenLayers map instance.
 * @param layerName The name of the layer.
 * @param featureId The ID of the feature to remove.
 */
export function removeFeatureFromLayer(map: Map, layerName: string, featureId: string) {
    const userLayer = userLayers.find(l => l.name === layerName);
    const olLayer = map.getLayers().getArray().find(l => l.get('name') === layerName) as VectorLayer<VectorSource<Feature<Geometry>>>;

    if (!userLayer || !olLayer) {
        console.warn(`Layer "${layerName}" not found.`);
        return;
    }

    // 1. Remove from in-memory store
    userLayer.features = userLayer.features.filter(f => f.properties.name !== featureId);

    // 2. Remove from OpenLayers layer
    const vectorSource = olLayer.getSource();
    if (vectorSource) {
        const featureToRemove = vectorSource.getFeatures().find(f => f.get('name') === featureId);
        if (featureToRemove) {
            vectorSource.removeFeature(featureToRemove);
        }
    }

    // Later, we'll save the updated userLayer to JSON via Tauri here.
    console.log(`Feature removed from ${layerName}`, userLayer);
    persistUserLayers();
}

/**
 * Exports the user layers to a GeoJSON string.
 * @returns A GeoJSON string representing the user layers.
 */
export function exportUserLayers(): string {
    const featureCollections = userLayers.map(layer => ({
        type: 'FeatureCollection',
        features: layer.features.map(f => ({
            type: 'Feature',
            geometry: {
                type: f.type,
                coordinates: f.coordinates,
            },
            properties: f.properties,
        })),
    }));

    return JSON.stringify(featureCollections);
}

/**
 * Imports user layers from a GeoJSON string.
 * @param geojson A GeoJSON string representing the user layers.
 */
export function importUserLayers(geojson: string) {
    const featureCollections = JSON.parse(geojson);

    featureCollections.forEach((collection: any) => {
        const layerName = collection.name || 'Imported Layer';
        const features = collection.features.map((f: any) => ({
            type: f.geometry.type,
            coordinates: f.geometry.coordinates,
            properties: f.properties,
        }));

        const userLayer: UserLayer = {
            name: layerName,
            features: features,
            visible: true,
        };

        userLayers.push(userLayer);
    });

    // For now, just log the imported layers
    console.log('Imported user layers', userLayers);
    persistUserLayers();
}

/**
 * Loads user layers from disk via Tauri and adds them to the map.
 * @param map The OpenLayers map instance.
 */
export async function loadAndRenderUserLayers(map: Map) {
    try {
        const loadedLayers = await invoke('load_user_layers') as UserLayer[];
        userLayers = loadedLayers; // Overwrite the in-memory store
        console.log('Loaded user layers:', userLayers);

        // Clear existing user layers from the map before adding new ones
        map.getLayers().getArray()
            .filter(layer => layer.get('name') && userLayers.some(ul => ul.name === layer.get('name')))
            .forEach(layer => map.removeLayer(layer));
        
        // Add the loaded layers to the map
        userLayers.forEach(layerData => {
            const olLayer = createOLLayer(layerData);
            map.addLayer(olLayer);
        });

    } catch (error) {
        console.error('Failed to load user layers:', error);
        userLayers = []; // Ensure we start with a clean slate on error
    }
}
