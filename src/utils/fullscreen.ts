export interface ScreenOrientationController {
  type?: string;
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
}

export interface FullscreenToggleOptions {
  orientation?: ScreenOrientationController;
  preferLandscape?: boolean;
}

export type FullscreenEntryMode = "standard" | "webkit" | "unsupported";

interface WebkitFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => void | Promise<void>;
}

interface WebkitFullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void | Promise<void>;
}

export async function toggleElementFullscreen(
  target: HTMLElement,
  fullscreenElement: Element | null,
  exitFullscreen: () => Promise<void>,
  options: FullscreenToggleOptions = {}
): Promise<FullscreenEntryMode> {
  if (fullscreenElement === target) {
    await exitFullscreen();
    unlockScreenOrientation(options.orientation);
    return "standard";
  }

  const requestFullscreen = target.requestFullscreen;
  let standardFullscreenError: unknown;
  if (typeof requestFullscreen === "function") {
    try {
      await requestFullscreen.call(target);
      await lockLandscapeOrientation(options);
      return "standard";
    } catch (error) {
      standardFullscreenError = error;
    }
  }

  const webkitRequestFullscreen = (target as WebkitFullscreenElement).webkitRequestFullscreen;
  if (typeof webkitRequestFullscreen === "function") {
    await Promise.resolve(webkitRequestFullscreen.call(target));
    await lockLandscapeOrientation(options);
    return "webkit";
  }

  if (standardFullscreenError) throw standardFullscreenError;
  return "unsupported";
}

export function getBrowserFullscreenElement(fullscreenDocument: Document): Element | null {
  return fullscreenDocument.fullscreenElement
    ?? (fullscreenDocument as WebkitFullscreenDocument).webkitFullscreenElement
    ?? null;
}

export async function exitBrowserFullscreen(fullscreenDocument: Document): Promise<void> {
  if (typeof fullscreenDocument.exitFullscreen === "function") {
    await fullscreenDocument.exitFullscreen();
    return;
  }

  const webkitExitFullscreen = (fullscreenDocument as WebkitFullscreenDocument).webkitExitFullscreen;
  if (typeof webkitExitFullscreen === "function") {
    await Promise.resolve(webkitExitFullscreen.call(fullscreenDocument));
  }
}

async function lockLandscapeOrientation(options: FullscreenToggleOptions): Promise<void> {
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
