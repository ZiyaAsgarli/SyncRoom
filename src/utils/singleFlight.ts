export function createSingleFlight<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  let inFlight: Promise<TResult> | null = null;
  return (...args) => {
    if (inFlight) return inFlight;
    inFlight = action(...args).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
