import {LngLat} from '../geo/lng_lat';

import type Point from '@mapbox/point-geometry';
import type {IReadonlyTransform} from '../geo/transform_interface';

/**
 * Given a LngLat, prior projected position, and a transform, return a new LngLat shifted
 * n × 360° east or west for some n ≥ 0 such that:
 *
 * * the projected location of the result is on screen, if possible, and secondarily:
 * * the difference between the projected location of the result and the prior position
 *   is minimized.
 *
 * The object is to preserve perceived object constancy for Popups and Markers as much as
 * possible; they should avoid shifting large distances across the screen, even when the
 * map center changes by ±360° due to automatic wrapping, and when about to go off screen,
 * should wrap just enough to avoid doing so.
 */
export function smartWrap(lngLat: LngLat, priorPos: Point, transform: IReadonlyTransform, useNormalWrap: boolean = false): LngLat {
    if (useNormalWrap || !transform.getCoveringTilesDetailsProvider().allowWorldCopies()) {
        return lngLat?.wrap();
    }
    const originalLngLat = new LngLat(lngLat.lng, lngLat.lat);
    lngLat = new LngLat(lngLat.lng, lngLat.lat);

    // First, try shifting one world in either direction, and see if either is closer to the
    // prior position. This preserves object constancy when the map center is auto-wrapped
    // during animations.
    if (priorPos) {
        const left  = new LngLat(lngLat.lng - 360, lngLat.lat);
        const right = new LngLat(lngLat.lng + 360, lngLat.lat);
        const delta = transform.locationToScreenPoint(lngLat).distSqr(priorPos);
        if (transform.locationToScreenPoint(left).distSqr(priorPos) < delta) {
            lngLat = left;
        } else if (transform.locationToScreenPoint(right).distSqr(priorPos) < delta) {
            lngLat = right;
        }
    }

    // Second, wrap toward the center until the new position is on screen, or we can't get
    // any closer.
    while (Math.abs(lngLat.lng - transform.center.lng) > 180) {
        const pos = transform.locationToScreenPoint(lngLat);
        if (pos.x >= 0 && pos.y >= 0 && pos.x <= transform.width && pos.y <= transform.height) {
            break;
        }
        if (lngLat.lng > transform.center.lng) {
            lngLat.lng -= 360;
        } else {
            lngLat.lng += 360;
        }
    }

    // Apply the change only if new coord is below horizon
    if (lngLat.lng !== originalLngLat.lng && transform.isPointOnMapSurface(transform.locationToScreenPoint(lngLat))) {
        return lngLat;
    }

    return originalLngLat;
}
