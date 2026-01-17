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