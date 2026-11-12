/**
 * A job's approximate place (D148): what a provider sees on the map before the award, a shaded area whose centre is
 * moved from the real pin, so the centre never gives the address away. The centre is drawn once when the pin is set
 * and stored on the job (`approxPoint`): drawn again on every view, repeated looks would average out the real spot.
 */

/** Radius of the area shown, in metres; larger than the largest shift, so the real pin always lies inside. */
export const JOB_AREA_RADIUS_M = 600;
const SHIFT_MIN_M = 100;
const SHIFT_MAX_M = 500;
const METRES_PER_DEGREE = 111320;

/** A point 100–500 m from the pin in a random direction, rounded to about a metre. */
export function approximatePoint(latitude: number, longitude: number, random: () => number = Math.random): {latitude: number; longitude: number} {
    const distance = SHIFT_MIN_M + random() * (SHIFT_MAX_M - SHIFT_MIN_M);
    const bearing = random() * 2 * Math.PI;
    const dLat = (distance * Math.cos(bearing)) / METRES_PER_DEGREE;
    const dLng = (distance * Math.sin(bearing)) / (METRES_PER_DEGREE * Math.cos((latitude * Math.PI) / 180));
    const round = (value: number) => Math.round(value * 1e5) / 1e5;
    return {latitude: round(latitude + dLat), longitude: round(longitude + dLng)};
}

/** The stored approximate point for a job's pin, or none for a job without one (remote work). */
export function jobApproxPoint(address: {latitude?: unknown; longitude?: unknown} | null | undefined): {latitude: number; longitude: number} | undefined {
    const latitude = Number(address?.latitude);
    const longitude = Number(address?.longitude);
    if (address?.latitude == null || address?.longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
    return approximatePoint(latitude, longitude);
}
