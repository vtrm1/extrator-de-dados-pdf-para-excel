const HISTORY_KEY = "pdf_sis_history";
const MAX_HISTORY = 10;

export function saveToHistory(payload) {
  try {
    const history = getHistory();
    const newItem = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      fileName: payload.fileName,
      totalRows: payload.totalRows,
      rows: payload.rows,
      pages: payload.pages
    };
    
    // Add to start, limit size
    const updated = [newItem, ...history.filter(h => h.fileName !== newItem.fileName)].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("History save failed", e);
  }
}

export function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}
