export async function toggleElementFullscreen(
  target: HTMLElement,
  fullscreenElement: Element | null,
  exitFullscreen: () => Promise<void>
): Promise<void> {
  if (fullscreenElement === target) {
    await exitFullscreen();
    return;
  }
  await target.requestFullscreen();
}
