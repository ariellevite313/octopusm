/** Durées Up/Down en pause (5 min à 1 h) : visibles mais sans paris, « Bientôt disponible ». */
export const PAUSED_DURATIONS = [5, 15, 30, 60];
export const isPausedDuration = (minutes: number) => PAUSED_DURATIONS.includes(minutes);
