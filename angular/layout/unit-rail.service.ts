import { Injectable, signal } from '@angular/core';

export const UNIT_RAIL_LIMITS = { min: 180, max: 420, initial: 236 };

@Injectable({ providedIn: 'root' })
export class UnitRailService {
  readonly width = signal(UNIT_RAIL_LIMITS.initial);
  readonly limits = UNIT_RAIL_LIMITS;
}
