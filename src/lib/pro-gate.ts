const STORAGE_KEY = "vocabifyPro";

interface ProData {
  isPro: boolean;
  aiCallsToday: number;
  aiCallsResetDate: string;
}

const FREE_DAILY_LIMIT = 1;
const PRO_DAILY_LIMIT = 10;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readProData(): Promise<ProData> {
  const data = await chrome.storage.local.get(STORAGE_KEY) as Record<string, ProData | undefined>;
  return data[STORAGE_KEY] ?? { isPro: false, aiCallsToday: 0, aiCallsResetDate: todayStr() };
}

async function writeProData(data: ProData): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

export async function getProStatus(): Promise<{ isPro: boolean; aiCallsToday: number }> {
  const data = await readProData();
  // Auto-reset daily counter
  if (data.aiCallsResetDate !== todayStr()) {
    data.aiCallsToday = 0;
    data.aiCallsResetDate = todayStr();
    await writeProData(data);
  }
  return { isPro: data.isPro, aiCallsToday: data.aiCallsToday };
}

export async function canMakeAiCall(): Promise<{ allowed: boolean; remaining: number }> {
  const { isPro, aiCallsToday } = await getProStatus();
  const limit = isPro ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
  const remaining = Math.max(0, limit - aiCallsToday);
  return { allowed: remaining > 0, remaining };
}

export async function incrementAiCalls(): Promise<void> {
  const data = await readProData();
  if (data.aiCallsResetDate !== todayStr()) {
    data.aiCallsToday = 1;
    data.aiCallsResetDate = todayStr();
  } else {
    data.aiCallsToday += 1;
  }
  await writeProData(data);
}

export async function setProStatus(isPro: boolean): Promise<void> {
  const data = await readProData();
  data.isPro = isPro;
  await writeProData(data);
}
