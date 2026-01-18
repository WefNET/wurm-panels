import { invoke } from '@tauri-apps/api/core';

export interface CommunityDeed {
    name: string;
    coords: [number, number];
    deedType: string;
    extra?: string;
}

export async function fetchCommunityDeeds(url: string): Promise<CommunityDeed[]> {
    console.log('Fetching community deeds from:', url);
    return await invoke('fetch_community_deeds', { url });
}

export async function loadCommunityDeeds(mapId: string): Promise<CommunityDeed[] | null> {
    const result = await invoke('load_community_deeds', { mapId }) as { deeds: CommunityDeed[], fetchedAt: number } | null;
    return result ? result.deeds : null;
}

export async function saveCommunityDeeds(mapId: string, deeds: CommunityDeed[]) {
    await invoke('save_community_deeds', { mapId, deeds });
}

export interface CommunityStructure {
    name: string;
    coords: [number, number];
    structureType: string;
}

export async function fetchCommunityGuardTowers(url: string): Promise<CommunityStructure[]> {
    console.log('Fetching community guard towers from:', url);
    return await invoke('fetch_community_guard_towers', { url });
}

export async function loadCommunityGuardTowers(mapId: string): Promise<CommunityStructure[] | null> {
    const result = await invoke('load_community_guard_towers', { mapId }) as { structures: CommunityStructure[], fetchedAt: number } | null;
    return result ? result.structures : null;
}

export async function saveCommunityGuardTowers(mapId: string, structures: CommunityStructure[]) {
    await invoke('save_community_guard_towers', { mapId, structures });
}

export async function fetchCommunityMissionStructures(url: string): Promise<CommunityStructure[]> {
    console.log('Fetching community mission structures from:', url);
    return await invoke('fetch_community_mission_structures', { url });
}

export async function loadCommunityMissionStructures(mapId: string): Promise<CommunityStructure[] | null> {
    const result = await invoke('load_community_mission_structures', { mapId }) as { structures: CommunityStructure[], fetchedAt: number } | null;
    return result ? result.structures : null;
}

export async function saveCommunityMissionStructures(mapId: string, structures: CommunityStructure[]) {
    await invoke('save_community_mission_structures', { mapId, structures });
}

export interface CommunityBridge {
    name: string;
    coords: [[number, number], [number, number]]; // [start, end] coordinates
}

export async function fetchCommunityBridges(url: string): Promise<CommunityBridge[]> {
    console.log('Fetching community bridges from:', url);
    return await invoke('fetch_community_bridges', { url });
}

export async function loadCommunityBridges(mapId: string): Promise<CommunityBridge[] | null> {
    const result = await invoke('load_community_bridges', { mapId }) as { bridges: CommunityBridge[], fetchedAt: number } | null;
    return result ? result.bridges : null;
}

export async function saveCommunityBridges(mapId: string, bridges: CommunityBridge[]) {
    await invoke('save_community_bridges', { mapId, bridges });
}