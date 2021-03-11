export declare function collectPayouts({ url, seed, stashes, sessionSlots, eraDepth, }: {
    url: string;
    seed: string;
    stashes: string[];
    sessionSlots: number;
    eraDepth: number;
}): Promise<void>;
