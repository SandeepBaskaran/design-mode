let guard: () => boolean = () => true;

export function setRouteEditGuard(check: () => boolean): void { guard = check; }
export function canEditRoute(): boolean { return guard(); }
