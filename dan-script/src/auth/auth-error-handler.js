let invalidSessionHandler = null;
let invalidSessionUIHandler = null;
let getAuthArgsHandler = null;

export function setInvalidSessionHandler(handler) {
  invalidSessionHandler = typeof handler === "function" ? handler : null;
}

export function setInvalidSessionUIHandler(handler) {
  invalidSessionUIHandler = typeof handler === "function" ? handler : null;
}

export function showInvalidSessionUI() {
  invalidSessionUIHandler?.();
}

export function handleInvalidSessionError(error) {
  const message = String(error?.message || error || "");

  if (!message.includes("Authentication required.")) {
    return false;
  }

  invalidSessionHandler?.(error);
  return true;
}

export function setGetAuthArgsHandler(handler) {
  getAuthArgsHandler = typeof handler === "function" ? handler : null;
}

export async function getAuthArgs() {
  if (!getAuthArgsHandler) {
    throw new Error("Authentication required.");
  }

  return await getAuthArgsHandler();
}
