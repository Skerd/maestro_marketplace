import {describe, expect, it} from "vitest";
import {approximatePoint, JOB_AREA_RADIUS_M} from "@marketplaceModule/utilities/services/jobLocation";

/** Metres between two points (equirectangular; exact enough at these distances). */
function metres(a: {latitude: number; longitude: number}, b: {latitude: number; longitude: number}): number {
    const x = (b.longitude - a.longitude) * 111320 * Math.cos((a.latitude * Math.PI) / 180);
    const y = (b.latitude - a.latitude) * 111320;
    return Math.hypot(x, y);
}

describe("a job's approximate place (D148)", () => {
    it("moves the centre 100-500 m from the pin, so the area always holds the pin but never centres on it", () => {
        const pin = {latitude: 41.32, longitude: 19.45};
        for (const [distance, bearing] of [[0, 0], [1, 0.25], [0.5, 0.5], [0.999, 0.75]]) {
            const draws = [distance, bearing];
            const point = approximatePoint(pin.latitude, pin.longitude, () => draws.shift()!);
            const away = metres(pin, point);
            expect(away).toBeGreaterThan(99);
            expect(away).toBeLessThan(501);
            expect(away).toBeLessThan(JOB_AREA_RADIUS_M);
        }
    });
});
