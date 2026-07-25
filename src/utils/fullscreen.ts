export interface ScreenOrientationController {
  type?: string;
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
}

export interface FullscreenToggleOptions {
  orientation?: ScreenOrientationController;
  preferLandscape?: boolean;
}

export async function toggleElementFullscreen(
  target: HTMLElement,
  fullscreenElement: Element | null,
  exitFullscreen: () => Promise<void>,
  options: FullscreenToggleOptions = {}
): Promise<void> {
  if (fullscreenElement === target) {
    await exitFullscreen();
    unlockScreenOrientation(options.orientation);
    return;
  }
  await target.requestFullscreen();
  if (options.preferLandscape && options.orientation?.lock) {
    try {
      await options.orientation.lock("landscape");
    } catch {
      // Fullscreen remains useful when a browser declines orientation locking.
    }
  }
}

export function unlockScreenOrientation(orientation?: ScreenOrientationController): void {
  try {
    orientation?.unlock?.();
  } catch {
    // Orientation unlock is best-effort across browsers.
  }
}
