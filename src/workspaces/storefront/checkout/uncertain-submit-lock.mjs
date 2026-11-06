export function uncertainSubmitLockKey(flow) {
  return `whitebird.checkout.${flow}.outcome-uncertain.v1`;
}

export function hasUncertainSubmit(flow, storage = globalThis.localStorage) {
  try {
    return storage?.getItem(uncertainSubmitLockKey(flow)) === "1";
  } catch {
    return false;
  }
}

export function setUncertainSubmit(flow, storage = globalThis.localStorage) {
  try {
    storage?.setItem(uncertainSubmitLockKey(flow), "1");
    return true;
  } catch {
    return false;
  }
}

export function clearUncertainSubmit(flow, storage = globalThis.localStorage) {
  try {
    storage?.removeItem(uncertainSubmitLockKey(flow));
  } catch {
    // The UI still prevents another submit while this mounted form is active.
  }
}
