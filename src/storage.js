let connection;
let remote;
export function configureRemote(get) {
  remote = get;
}
function db() {
  return (connection ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('thumbs-studio-files', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
export async function getFile(id) {
  const database = await db();
  const file = await new Promise((resolve, reject) => {
    const req = database.transaction('files').objectStore('files').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return file || remote?.(id);
}
export async function putFiles(entries) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('files', 'readwrite');
    for (const [id, blob] of entries) tx.objectStore('files').put(blob, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function removeFiles(ids) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('files', 'readwrite');
    for (const id of ids) tx.objectStore('files').delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export function toDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
