import { getUsableDriveAccessToken } from "./driveAuth";
import { isValidDriveFileId } from "./driveMetadata";

const SERVICE_WORKER_URL = "/syncroom-drive-sw.js";
const SERVICE_WORKER_SCOPE = "/";
const CONTROLLER_WAIT_MS = 5_000;
const BIND_ACK_TIMEOUT_MS = 5_000;

export interface DriveMediaSessionOptions {
  mimeType: "video/mp4" | "video/webm";
  fileSizeBytes: number;
}

export interface DriveMediaBinding extends DriveMediaSessionOptions {
  generation: number;
  fileId: string;
}

interface PrivateDriveMediaBinding extends DriveMediaBinding {
  accessToken: string;
  controller: ServiceWorker;
}

interface DriveWorkerAck {
  type: "DRIVE_MEDIA_SESSION_BOUND" | "DRIVE_MEDIA_SESSION_CLEARED";
  requestId: string;
  generation: number;
  fileId?: string;
  cleared?: boolean;
}

let activeBinding: PrivateDriveMediaBinding | null = null;
let bindInFlight: { identity: string; promise: Promise<DriveMediaBinding> } | null = null;
let lifecycleListenerInstalled = false;
const clearedGenerations = new Set<number>();

export async function registerDriveServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) throw new Error("Secure Drive streaming is not supported in this browser/session.");
  installControllerChangeRebinding();
  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE });
  const readyRegistration = await navigator.serviceWorker.ready;
  logDriveServiceWorkerDiagnostics(readyRegistration);
  await waitForDriveServiceWorkerController();
  return registration;
}

export async function bindDriveMediaSession(
  generation: number,
  fileId: string,
  accessToken: string,
  options: DriveMediaSessionOptions,
  force = false
): Promise<DriveMediaBinding> {
  validateMediaSession(generation, fileId, options);
  clearedGenerations.delete(generation);
  await registerDriveServiceWorker();
  const controller = await waitForDriveServiceWorkerController();
  const identity = bindingIdentity({ generation, fileId, accessToken, controller, ...options });
  if (!force && activeBinding && bindingIdentity(activeBinding) === identity) return publicBinding(activeBinding);
  if (bindInFlight?.identity === identity) return bindInFlight.promise;

  const nextBinding: PrivateDriveMediaBinding = { generation, fileId, accessToken, controller, ...options };
  const promise = bindWithAcknowledgement(nextBinding).finally(() => {
    if (bindInFlight?.promise === promise) bindInFlight = null;
  });
  bindInFlight = { identity, promise };
  return promise;
}

export async function rebindDriveMediaSession(): Promise<boolean> {
  const accessToken = getUsableDriveAccessToken();
  const current = activeBinding;
  if (!current || !accessToken) return false;
  await bindDriveMediaSession(current.generation, current.fileId, accessToken, current);
  logDriveLifecycle(current, "rebind-ack", "controller-or-token-replaced");
  return true;
}

export function getBoundDriveMediaSession(): DriveMediaBinding | null {
  return activeBinding ? publicBinding(activeBinding) : null;
}

export async function clearDriveMediaSession(expectedGeneration: number): Promise<boolean> {
  const current = activeBinding;
  clearedGenerations.add(expectedGeneration);
  const controller = current?.controller ?? navigator.serviceWorker?.controller;
  if (!controller) return false;
  if (current && current.generation !== expectedGeneration) {
    logDriveLifecycle(current, "stale-operation-ignored", "clear-generation-mismatch");
  }
  if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration <= 0) {
    return false;
  }
  const requestId = crypto.randomUUID();
  const ack = await postCommandWithAck(controller, {
    type: "CLEAR_DRIVE_MEDIA_SESSION",
    requestId,
    expectedGeneration
  }, BIND_ACK_TIMEOUT_MS);
  if (ack.type !== "DRIVE_MEDIA_SESSION_CLEARED" || ack.requestId !== requestId || ack.generation !== expectedGeneration) {
    throw new Error("Drive media session clear acknowledgement was invalid.");
  }
  if (activeBinding?.generation === expectedGeneration) activeBinding = null;
  return Boolean(ack.cleared);
}

export function driveMediaUrl(fileId: string, generation: number): string {
  if (!isValidDriveFileId(fileId)) throw new Error("Invalid Drive file id.");
  if (!Number.isSafeInteger(generation) || generation <= 0) throw new Error("Invalid Drive media generation.");
  return `/__syncroom_drive_media__/${encodeURIComponent(fileId)}?generation=${generation}`;
}

export function hasDriveServiceWorkerController(): boolean {
  return Boolean(navigator.serviceWorker?.controller);
}

export function waitForDriveServiceWorkerController(timeoutMs = CONTROLLER_WAIT_MS): Promise<ServiceWorker> {
  const controller = navigator.serviceWorker?.controller;
  if (controller) return Promise.resolve(controller);
  if (!navigator.serviceWorker) return Promise.reject(new Error("Secure Drive streaming is not supported in this browser/session."));

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.clearTimeout(timeout);
    };
    const settle = (nextController: ServiceWorker | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (nextController) resolve(nextController);
      else reject(new Error("Secure Drive streaming is not ready yet."));
    };
    const onControllerChange = () => {
      logDriveServiceWorkerDiagnostics(null);
      settle(navigator.serviceWorker.controller);
    };
    const timeout = window.setTimeout(() => settle(navigator.serviceWorker.controller), timeoutMs);
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange, { once: true });
  });
}

async function bindWithAcknowledgement(nextBinding: PrivateDriveMediaBinding): Promise<DriveMediaBinding> {
  const requestId = crypto.randomUUID();
  logDriveLifecycle(nextBinding, "bind-start", activeBinding?.generation === nextBinding.generation ? "atomic-replacement" : "source-active");
  const ack = await postCommandWithAck(nextBinding.controller, {
    type: "BIND_DRIVE_MEDIA_SESSION",
    requestId,
    generation: nextBinding.generation,
    fileId: nextBinding.fileId,
    accessToken: nextBinding.accessToken,
    mimeType: nextBinding.mimeType,
    fileSizeBytes: nextBinding.fileSizeBytes
  }, BIND_ACK_TIMEOUT_MS);
  if (
    ack.type !== "DRIVE_MEDIA_SESSION_BOUND" ||
    ack.requestId !== requestId ||
    ack.generation !== nextBinding.generation ||
    ack.fileId !== nextBinding.fileId
  ) {
    throw new Error("Drive media session binding acknowledgement was invalid.");
  }
  if (clearedGenerations.has(nextBinding.generation)) {
    logDriveLifecycle(nextBinding, "stale-operation-ignored", "bind-ack-after-clear");
    return publicBinding(nextBinding);
  }
  if (activeBinding && activeBinding.generation > nextBinding.generation) {
    logDriveLifecycle(nextBinding, "stale-operation-ignored", "bind-ack-generation");
    return publicBinding(activeBinding);
  }
  activeBinding = nextBinding;
  logDriveLifecycle(nextBinding, "bind-ack", "worker-confirmed");
  return publicBinding(nextBinding);
}

function postCommandWithAck(controller: ServiceWorker, message: Record<string, unknown>, timeoutMs: number): Promise<DriveWorkerAck> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      channel.port1.close();
      callback();
    };
    channel.port1.onmessage = (event: MessageEvent<DriveWorkerAck>) => finish(() => resolve(event.data));
    channel.port1.onmessageerror = () => finish(() => reject(new Error("Drive media session acknowledgement could not be read.")));
    const timeout = window.setTimeout(() => finish(() => reject(new Error("Drive media session acknowledgement timed out."))), timeoutMs);
    controller.postMessage(message, [channel.port2]);
  });
}

function installControllerChangeRebinding(): void {
  if (lifecycleListenerInstalled || !navigator.serviceWorker) return;
  lifecycleListenerInstalled = true;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    void rebindDriveMediaSession().catch(() => undefined);
  });
}

function validateMediaSession(generation: number, fileId: string, options: DriveMediaSessionOptions): void {
  if (!Number.isSafeInteger(generation) || generation <= 0) throw new Error("Invalid Drive media generation.");
  if (!isValidDriveFileId(fileId)) throw new Error("Invalid Drive file id.");
  if (!Number.isSafeInteger(options.fileSizeBytes) || options.fileSizeBytes <= 0) throw new Error("Drive file size is required for media streaming.");
}

function bindingIdentity(binding: PrivateDriveMediaBinding): string {
  return [binding.generation, binding.fileId, binding.mimeType, binding.fileSizeBytes, binding.accessToken, binding.controller.scriptURL].join(":");
}

function publicBinding(binding: PrivateDriveMediaBinding): DriveMediaBinding {
  return {
    generation: binding.generation,
    fileId: binding.fileId,
    mimeType: binding.mimeType,
    fileSizeBytes: binding.fileSizeBytes
  };
}

function maskedFileId(fileId: string): string {
  return `${fileId.slice(0, 4)}...${fileId.slice(-4)}`;
}

function logDriveLifecycle(binding: DriveMediaBinding, state: string, reason: string): void {
  if (!import.meta.env.DEV) return;
  console.debug("[SyncRoom Drive lifecycle]", {
    generation: binding.generation,
    fileIdMasked: maskedFileId(binding.fileId),
    state,
    reason
  });
}

function logDriveServiceWorkerDiagnostics(registration: ServiceWorkerRegistration | null): void {
  if (!import.meta.env.DEV) return;
  console.debug("[SyncRoom Drive SW]", {
    registrationScope: registration?.scope ?? null,
    activeScriptUrl: registration?.active?.scriptURL ?? null,
    controllerScriptUrl: navigator.serviceWorker?.controller?.scriptURL ?? null
  });
}
