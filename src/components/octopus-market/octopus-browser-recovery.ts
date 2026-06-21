const bootPendingKey = "octopus-market-boot-pending";
const recoveredKey = "octopus-market-boot-recovered-v1";
const registryDatabaseName = "octopus-market-central-registry";

function getWindowSafely() {
  if (typeof window === "undefined") {
    return null;
  }

  return window;
}

function clearOctopusLocalStorage(win: Window) {
  try {
    const keysToRemove: string[] = [];

    for (let index = 0; index < win.localStorage.length; index += 1) {
      const key = win.localStorage.key(index);

      if (key?.startsWith("octopus-market-")) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      win.localStorage.removeItem(key);
    });
  } catch {
    return;
  }
}

function deleteCentralRegistryDatabase(win: Window) {
  if (typeof win.indexedDB === "undefined") {
    return;
  }

  try {
    win.indexedDB.deleteDatabase(registryDatabaseName);
  } catch {
    return;
  }
}

export function prepareOctopusBrowserRecovery() {
  const win = getWindowSafely();

  if (!win) {
    return;
  }

  try {
    const previousBootPending = win.sessionStorage.getItem(bootPendingKey) === "1";
    const alreadyRecovered = win.sessionStorage.getItem(recoveredKey) === "1";

    if (previousBootPending && !alreadyRecovered) {
      clearOctopusLocalStorage(win);
      deleteCentralRegistryDatabase(win);
      win.sessionStorage.setItem(recoveredKey, "1");
    }

    win.sessionStorage.setItem(bootPendingKey, "1");
  } catch {
    return;
  }
}

export function finalizeOctopusBrowserRecovery() {
  const win = getWindowSafely();

  if (!win) {
    return;
  }

  try {
    win.sessionStorage.removeItem(bootPendingKey);
  } catch {
    return;
  }
}
