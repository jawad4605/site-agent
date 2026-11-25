// Project history, saved in the browser's IndexedDB (large storage, survives refresh).
// Every step the agent takes is auto-saved, so nothing is lost if you reload the page.
export type Project = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  convo: { messages: any[]; files: Record<string, string>; siteId?: string };
  items: any[];
  url: string;
  images: { url: string; name: string }[];
  activePage: string;
  provider?: string;
};

const DB = "siteagent";
const STORE = "projects";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const saveProject = (p: Project) => tx("readwrite", (s) => s.put(p)).catch(() => undefined);
export const getProject = (id: string) => tx<Project | undefined>("readonly", (s) => s.get(id)).catch(() => undefined);
export const deleteProject = (id: string) => tx("readwrite", (s) => s.delete(id)).catch(() => undefined);
export async function listProjects(): Promise<Project[]> {
  const all = await tx<Project[]>("readonly", (s) => s.getAll()).catch(() => [] as Project[]);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}
export const newProjectId = () => `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
