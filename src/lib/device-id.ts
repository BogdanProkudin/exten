const STORAGE_KEY = "vocabify_device_id";

function generateUUID(): string {
  return crypto.randomUUID();
}

export async function getDeviceId(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEY) as Record<string, string>;
  if (result[STORAGE_KEY]) {
    return result[STORAGE_KEY];
  }
  const id = generateUUID();
  await chrome.storage.local.set({ [STORAGE_KEY]: id });
  return id;
}
