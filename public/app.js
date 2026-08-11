console.log("PDF Sis: Script iniciando...");

// ─── History Management ───
const HISTORY_KEY = "pdf_sis_history";
const MAX_HISTORY = 10;
const PANEL_WIDTHS_KEY = "pdf_sis_panel_widths";

function saveToHistory(payload) {
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
    const updated = [newItem, ...history.filter(h => h.fileName !== newItem.fileName)].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch (e) { console.error("History save failed", e); }
}

function updateHistoryWithReconcile(fileName, reconcileData) {
  try {
    const history = getHistory();
    const index = history.findIndex(h => h.fileName === fileName);
    if (index !== -1) {
      history[index].reconcile = reconcileData;
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }
  } catch (e) { console.error("Update history failed", e); }
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch (e) { return []; }
}

const form = document.querySelector("#upload-form");
const input = document.querySelector("#pdf-input");
const submitButton = document.querySelector("#submit-button");
const exportButton = document.querySelector("#export-button");
const whatsappButton = document.querySelector("#whatsapp-button");
const exportMode = document.querySelector("#export-mode");
const pageFilter = document.querySelector("#page-filter");
const pageTabs = document.querySelector("#page-tabs");
const dropZone = document.querySelector("#drop-zone");
const whatsappFields = document.querySelector("#whatsapp-fields");
const table = document.querySelector("#results-table");
const tbody = table.querySelector("tbody");
const reconcileForm = document.querySelector("#reconcile-form");
const extratoInput = document.querySelector("#extrato-input");
const excelInput = document.querySelector("#excel-input");
const reconcileFilter = document.querySelector("#reconcile-filter");
const globalSourceFilter = document.querySelector("#global-source-filter");
const reconcileStart = document.querySelector("#reconcile-start");
const reconcileEnd = document.querySelector("#reconcile-end");
const reconcileWhatsAppBtn = document.querySelector("#reconcile-whatsapp");
const reconcileExportBtn = document.querySelector("#reconcile-export");
const pendingCard = document.querySelector("#pending-card");
const totalPendingValue = document.querySelector("#total-pending-value");
const reconcileStatus = document.querySelector("#reconcile-status");
const reconcileSummary = document.querySelector("#reconcile-summary");
const reconcileTable = document.querySelector("#reconcile-table");
const reconcileTbody = reconcileTable.querySelector("tbody");

// NEW: Excel Table elements
const excelTable = document.querySelector("#excel-table");
const excelTbody = excelTable.querySelector("tbody");

const statusBox = document.querySelector("#status");
const summary = document.querySelector("#summary");
const actions = document.querySelector("#actions");
const historyBtn = document.querySelector("#history-btn");
const tableSearch = document.querySelector("#table-search");
const pdfSearchField = document.querySelector("#pdf-search-field");
const hidePedagioFilter = document.querySelector("#hide-pedagio-filter");
const compareGrid = document.querySelector(".compare-grid");

// Table Footer Elements
const footerFrete = document.querySelector("#footer-frete");
const footerAdt = document.querySelector("#footer-adt");
const footerSdo = document.querySelector("#footer-sdo");
const footerTotal = document.querySelector("#footer-total");
const tableFooter = document.querySelector("#table-footer");

// History Modal Elements
const historyModalOverlay = document.querySelector("#history-modal-overlay");
const historyModalBody = document.querySelector("#history-modal-body");
const historyModalClose = document.querySelector("#history-modal-close");
const historyModalFooterClose = historyModalOverlay.querySelector(".secondary-btn");
const clearHistoryBtn = document.querySelector("#clear-history-btn");

// Dashboard Elements
const dashboardBtn = document.querySelector("#dashboard-btn");
const dashboardOverlay = document.querySelector("#dashboard-overlay");
const dashboardClose = document.querySelector("#dashboard-close");
const dbTotalPdf = document.querySelector("#db-total-pdf");
const dbTotalMatch = document.querySelector("#db-total-match");
const dbTotalPending = document.querySelector("#db-total-pending");
const dbPendingTbody = document.querySelector("#db-pending-table tbody");

let chartPlatesInstance = null;
let chartStatusInstance = null;

let currentRows = [];
let currentFileName = "";
let currentPages = [];
let selectedFile = null;
let currentReconcileRows = [];
let currentExcelRows = []; // Raw rows from backend
let selectedReconcileKey = null;
let selectedCheckboxAmounts = new Set();
let selectedTripIds = new Set();
let reconcileTypeFilter = "ALL";
let globalSourceFilterValue = "all";

let currentPassword = "";
let pendingPasswordAction = null;

// Password Modal Elements
const passwordModalOverlay = document.querySelector("#password-modal-overlay");
const passwordModalClose = document.querySelector("#password-modal-close");
const passwordModalCancel = document.querySelector("#password-modal-cancel");
const passwordModalSubmit = document.querySelector("#password-modal-submit");
const pdfPasswordInput = document.querySelector("#pdf-password-input");

function openPasswordModal() {
  pdfPasswordInput.value = "";
  passwordModalOverlay.classList.remove("hidden");
  setTimeout(() => pdfPasswordInput.focus(), 100);
}

function closePasswordModal() {
  passwordModalOverlay.classList.add("hidden");
}

function handlePasswordCancel() {
  currentPassword = "";
  closePasswordModal();
  setStatus("A\u00e7\u00e3o cancelada (senha n\u00e3o informada).", "error");
  setReconcileStatus("Confer\u00eancia cancelada (senha n\u00e3o informada).", "error");
}

if (passwordModalClose) passwordModalClose.addEventListener("click", handlePasswordCancel);
if (passwordModalCancel) passwordModalCancel.addEventListener("click", handlePasswordCancel);
if (passwordModalSubmit) {
  passwordModalSubmit.addEventListener("click", () => {
    currentPassword = pdfPasswordInput.value;
    closePasswordModal();
    if (pendingPasswordAction) pendingPasswordAction();
  });
  pdfPasswordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") passwordModalSubmit.click();
  });
}

// Record count badges
const countPdf = document.querySelector("#count-pdf");
const countReconcile = document.querySelector("#count-reconcile");
const countExcel = document.querySelector("#count-excel");

// Empty states
const emptyPdf = document.querySelector("#empty-pdf");
const emptyReconcile = document.querySelector("#empty-reconcile");
const emptyExcel = document.querySelector("#empty-excel");

function setLoading(btn, loading) {
  btn.classList.toggle("loading", loading);
  btn.disabled = loading;
}

function setReconcileStatus(message, type = "neutral") {
  reconcileStatus.textContent = fixMojibake(message);
  reconcileStatus.dataset.type = type;
}

const whatsappFieldDefs = [
  { key: "numero_documento", label: "CT-e" },
  { key: "id_viagem", label: "ID viagem" },
  { key: "placa", label: "Placa" },
  { key: "valor_frete", label: "Frete" },
  { key: "valor_adiantamento", label: "Adiantamento" },
  { key: "valor_saldo", label: "Saldo" },
  { key: "valor_pedagio", label: "Pedagio" },
  { key: "valor_total", label: "Total" },
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasExcelReconcileSource() {
  return currentExcelRows.length > 0 ||
    asArray(currentReconcileRows).some((row) => row.excelSourceEnabled);
}

function sourceDeficit(row, source) {
  const counts = [Number(row.transport || 0), Number(row.extrato || 0)];
  const hasExcel = row.excelSourceEnabled ?? hasExcelReconcileSource();
  if (hasExcel) counts.push(Number(row.excel || 0));
  return Number(row[source] || 0) < Math.max(...counts);
}

function matchesGlobalSourceFilter(row, filterValue = globalSourceFilterValue) {
  if (filterValue === "all") return true;

  const hasExcel = row.excelSourceEnabled ?? hasExcelReconcileSource();
  if (filterValue === "three-way") {
    return hasExcel && row.status === "CONCILIADO_3_FONTES";
  }
  if (filterValue === "value-difference") {
    return hasExcel && Number(row.excelValueMismatchCount || 0) > 0;
  }
  if (filterValue === "pending") {
    return hasExcel
      ? row.status !== "CONCILIADO_3_FONTES"
      : row.status !== "MATCH_PDF_EXTRATO";
  }
  if (filterValue === "missing-pdf") return sourceDeficit(row, "transport");
  if (filterValue === "missing-extrato") return sourceDeficit(row, "extrato");
  if (filterValue === "missing-excel") {
    return hasExcel && sourceDeficit(row, "excel");
  }
  return true;
}

function getGlobalFilteredAmountKeys() {
  if (globalSourceFilterValue === "all") return null;
  return new Set(
    asArray(currentReconcileRows)
      .filter((row) => matchesGlobalSourceFilter(row))
      .map((row) => Number(row.amount || 0).toFixed(2))
  );
}

function normalizeCteValue(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? (digits.replace(/^0+/, "") || "0") : "";
}

function getGlobalFilteredExcelCriteria() {
  if (globalSourceFilterValue === "all") return null;

  const amountKeys = new Set();
  const cteKeys = new Set();
  asArray(currentReconcileRows)
    .filter((row) => matchesGlobalSourceFilter(row))
    .forEach((row) => {
      const matchedCtes = asArray(row.excelMatchedCtes).map(normalizeCteValue).filter(Boolean);
      if (matchedCtes.length > 0) {
        matchedCtes.forEach((cte) => cteKeys.add(cte));
        return;
      }

      amountKeys.add(Number(row.amount || 0).toFixed(2));
      asArray(row.tripTotals).forEach((total) => {
        const numericTotal = Number(total);
        if (Number.isFinite(numericTotal) && numericTotal > 0) {
          amountKeys.add(numericTotal.toFixed(2));
        }
      });
      asArray(row.excelMatchedAmounts).forEach((amount) => {
        const numericAmount = Number(amount);
        if (Number.isFinite(numericAmount) && numericAmount > 0) {
          amountKeys.add(numericAmount.toFixed(2));
        }
      });
    });

  return { amountKeys, cteKeys };
}

function updateGlobalSourceFilterOptions() {
  if (!globalSourceFilter) return;

  const hasExcel = hasExcelReconcileSource();
  const labels = {
    all: "Todos os resultados",
    "three-way": "Conciliados nas 3 fontes",
    "value-difference": "Diferença de valor no Excel",
    pending: "Todas as pendências",
    "missing-pdf": "Falta no PDF",
    "missing-extrato": "Falta no Extrato",
    "missing-excel": "Falta no Excel",
  };

  [...globalSourceFilter.options].forEach((option) => {
    const requiresExcel = ["three-way", "value-difference", "missing-excel"].includes(option.value);
    option.hidden = requiresExcel && !hasExcel;
    option.disabled = requiresExcel && !hasExcel;
    const count = asArray(currentReconcileRows).filter((row) =>
      matchesGlobalSourceFilter(row, option.value)
    ).length;
    option.textContent = `${labels[option.value]} (${count})`;
  });

  if (!hasExcel && ["three-way", "value-difference", "missing-excel"].includes(globalSourceFilterValue)) {
    globalSourceFilterValue = "all";
    globalSourceFilter.value = "all";
  }
}

function applyPanelSizeRatios(ratios) {
  if (!compareGrid || !Array.isArray(ratios) || ratios.length !== 3) return;
  const safeRatios = ratios.map((value) => Math.max(0.1, Number(value) || 1));
  compareGrid.style.setProperty("--pdf-panel-size", `${safeRatios[0]}fr`);
  compareGrid.style.setProperty("--reconcile-panel-size", `${safeRatios[1]}fr`);
  compareGrid.style.setProperty("--excel-panel-size", `${safeRatios[2]}fr`);
}

function resetPanelSizes() {
  if (!compareGrid) return;
  compareGrid.style.removeProperty("--pdf-panel-size");
  compareGrid.style.removeProperty("--reconcile-panel-size");
  compareGrid.style.removeProperty("--excel-panel-size");
  localStorage.removeItem(PANEL_WIDTHS_KEY);
}

function setupPanelResizers() {
  if (!compareGrid) return;

  try {
    const savedRatios = JSON.parse(localStorage.getItem(PANEL_WIDTHS_KEY) || "null");
    if (Array.isArray(savedRatios)) applyPanelSizeRatios(savedRatios);
  } catch (_error) {
    localStorage.removeItem(PANEL_WIDTHS_KEY);
  }

  const panelPdf = document.querySelector("#panel-pdf");
  const panelReconcile = document.querySelector("#panel-reconcile");
  const panelExcel = document.querySelector("#panel-excel");
  const handles = [...compareGrid.querySelectorAll(".panel-resizer")];
  const minimums = [280, 220, 260];

  handles.forEach((handle) => {
    handle.addEventListener("dblclick", resetPanelSizes);
    handle.addEventListener("pointerdown", (event) => {
      if (window.matchMedia("(max-width: 1400px)").matches) return;
      event.preventDefault();

      const startX = event.clientX;
      const startWidths = [panelPdf, panelReconcile, panelExcel].map(
        (panel) => panel.getBoundingClientRect().width
      );
      handle.classList.add("dragging");
      document.body.classList.add("resizing-panels");

      const onPointerMove = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        const nextWidths = [...startWidths];

        if (handle.dataset.resizer === "pdf-reconcile") {
          const pairTotal = startWidths[0] + startWidths[1];
          nextWidths[0] = Math.min(
            pairTotal - minimums[1],
            Math.max(minimums[0], startWidths[0] + delta)
          );
          nextWidths[1] = pairTotal - nextWidths[0];
        } else {
          const pairTotal = startWidths[1] + startWidths[2];
          nextWidths[1] = Math.min(
            pairTotal - minimums[2],
            Math.max(minimums[1], startWidths[1] + delta)
          );
          nextWidths[2] = pairTotal - nextWidths[1];
        }

        applyPanelSizeRatios(nextWidths);
      };

      const onPointerUp = () => {
        handle.classList.remove("dragging");
        document.body.classList.remove("resizing-panels");
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);

        const finalWidths = [panelPdf, panelReconcile, panelExcel].map(
          (panel) => panel.getBoundingClientRect().width
        );
        const total = finalWidths.reduce((sum, width) => sum + width, 0) || 1;
        localStorage.setItem(
          PANEL_WIDTHS_KEY,
          JSON.stringify(finalWidths.map((width) => width / total))
        );
        applyPanelSizeRatios(finalWidths.map((width) => width / total));
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
    });
  });
}

function fixMojibake(value) {
  const safeValue = String(value || "");
  const pairs = [
    ["\u00c3\u00a1", "\u00e1"],
    ["\u00c3\u00a2", "\u00e2"],
    ["\u00c3\u00a3", "\u00e3"],
    ["\u00c3\u00a9", "\u00e9"],
    ["\u00c3\u00aa", "\u00ea"],
    ["\u00c3\u00ad", "\u00ed"],
    ["\u00c3\u00b3", "\u00f3"],
    ["\u00c3\u00b4", "\u00f4"],
    ["\u00c3\u00b5", "\u00f5"],
    ["\u00c3\u00ba", "\u00fa"],
    ["\u00c3\u2022", "\u00d5"],
    ["\u00c3\u00a7", "\u00e7"],
    ["\u00c3\u0087", "\u00c7"],
    ["\u00c2", ""],
  ];

  return pairs.reduce((acc, [from, to]) => acc.replaceAll(from, to), safeValue);
}

function setStatus(message, type = "neutral") {
  statusBox.textContent = fixMojibake(message);
  statusBox.dataset.type = type;
}

function parseBrCurrencyToNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const clean = String(value)
    .replace(/[R$\s]/g, "")
    .replace(/\u00a0/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const number = Number(clean);
  return Number.isFinite(number) ? number : null;
}

function parseFlexibleCurrencySearch(value) {
  let clean = String(value || "")
    .replace(/[R$\s]/g, "")
    .replace(/[^\d,.-]/g, "");
  if (!clean || !/\d/.test(clean)) return null;

  if (clean.includes(",")) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else {
    const dotCount = (clean.match(/\./g) || []).length;
    if (dotCount > 1 || (dotCount === 1 && !/\.\d{2}$/.test(clean))) {
      clean = clean.replace(/\./g, "");
    }
  }

  const number = Number(clean);
  return Number.isFinite(number) ? number : null;
}

function dateToIso(value) {
  const text = String(value || "");
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) {
    return "";
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function getTransportAmountsForMatch(row) {
  const adt = row.valor_adiantamento_num ?? parseBrCurrencyToNumber(row.valor_adiantamento);
  const sdo = row.valor_saldo_num ?? parseBrCurrencyToNumber(row.valor_saldo);
  const frete = row.valor_frete_num ?? parseBrCurrencyToNumber(row.valor_frete);
  const hasParcelas = (adt != null && adt > 0) || (sdo != null && sdo > 0);

  if (hasParcelas) {
    return [adt, sdo].filter((n) => n != null && n > 0);
  }
  return [frete].filter((n) => n != null && n > 0);
}

function getRelatedParcelAmountsFromPdf(clickedAmount) {
  const target = Number(clickedAmount).toFixed(2);
  const related = new Map();

  asArray(currentRows).forEach((row) => {
    const adt = row.valor_adiantamento_num ?? parseBrCurrencyToNumber(row.valor_adiantamento);
    const sdo = row.valor_saldo_num ?? parseBrCurrencyToNumber(row.valor_saldo);
    const adtKey = adt != null && adt > 0 ? Number(adt).toFixed(2) : "";
    const sdoKey = sdo != null && sdo > 0 ? Number(sdo).toFixed(2) : "";

    if (adtKey === target && sdoKey && sdoKey !== target) {
      related.set(sdoKey, Number(sdo));
    }
    if (sdoKey === target && adtKey && adtKey !== target) {
      related.set(adtKey, Number(adt));
    }
  });

  return [...related.values()];
}

function isRowLinkedToReconcile(row) {
  if (!selectedReconcileKey) {
    return false;
  }
  const rowDate = dateToIso(row.data_cadastro || row.data_embarque);
  return rowDate === selectedReconcileKey.date;
}

// NEW: Excel link check
function isExcelRowLinkedToReconcile(row) {
  if (!selectedReconcileKey) return false;
  return row.date === selectedReconcileKey.date;
}

function buildFormDataFromSelection() {
  if (!input.files || input.files.length === 0) {
    return null;
  }

  const data = new FormData();
  for (const file of input.files) {
    data.append("pdf", file);
  }
  if (currentPassword) {
    data.append("password", currentPassword);
  }
  return data;
}

function setSelectedFile(files) {
  if (!files || files.length === 0) return;

  const count = files.length;
  if (count === 1) {
    const file = files[0];
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setStatus("Selecione um arquivo PDF valido.", "error");
      return;
    }
    selectedFile = file; // Backward compatibility
    setStatus(`Arquivo selecionado: ${fixMojibake(file.name)}`, "neutral");
  } else {
    selectedFile = files[0];
    setStatus(`${count} arquivos selecionados para processamento.`, "neutral");
  }
}

function getSelectedWhatsappFields() {
  const checks = [...whatsappFields.querySelectorAll("input[data-wa-field]:checked")];
  return checks.map((check) => check.dataset.waField);
}

function buildWhatsappMessage(rows) {
  const fields = getSelectedWhatsappFields();
  if (fields.length === 0) {
    throw new Error("Selecione ao menos um campo para enviar no WhatsApp.");
  }

  const visibleRows = asArray(rows);
  if (visibleRows.length === 0) {
    throw new Error("Nao ha registros para enviar no WhatsApp.");
  }

  const lines = [];
  lines.push(`Arquivo: ${fixMojibake(currentFileName)}`);
  lines.push(`Registros: ${visibleRows.length}`);
  lines.push("");

  visibleRows.forEach((row, idx) => {
    lines.push(`${idx + 1}.`);
    fields.forEach((fieldKey) => {
      const fieldMeta = whatsappFieldDefs.find((field) => field.key === fieldKey);
      const label = fieldMeta ? fieldMeta.label : fieldKey;
      const value = row[fieldKey] || "-";
      lines.push(`${label}: ${value}`);
    });
    lines.push("");
  });

  return lines.join("\n").trim();
}

function renderTable(rows) {
  const safeRows = asArray(rows);
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  let totalFrete = 0, totalAdt = 0, totalSdo = 0, totalGeral = 0;

  tbody.innerHTML = safeRows
    .map(
      (row) => {
        let rowClass = "";
        
        // ADT/SDO mismatch validation
        const adtVal = parseBrCurrencyToNumber(row.valor_adiantamento);
        const sdoVal = parseBrCurrencyToNumber(row.valor_saldo);
        const isMismatch = (adtVal > 0 && !sdoVal) || (sdoVal > 0 && !adtVal);
        if (isMismatch) rowClass = "row-warning";

        if (selectedReconcileKey) {
          const rowAmounts = getTransportAmountsForMatch(row);
          const matchesAmount = rowAmounts.some(amt => Number(amt).toFixed(2) === selectedReconcileKey.amount);
          if (matchesAmount) {
            rowClass = "linked-row-match";
          }
        }

        // Totals accumulation
        totalFrete += parseBrCurrencyToNumber(row.valor_frete) || 0;
        totalAdt += adtVal || 0;
        totalSdo += sdoVal || 0;
        totalGeral += parseBrCurrencyToNumber(row.valor_total) || 0;

        const isTripSelected = typeof selectedTripIds !== "undefined" && selectedTripIds.has(row.id_viagem);

        return `
        <tr class="${rowClass}" data-adt="${adtVal || 0}" data-sdo="${sdoVal || 0}" data-frete="${parseBrCurrencyToNumber(row.valor_frete) || 0}" data-trip-id="${row.id_viagem}">
          <td style="text-align: center;"><input type="checkbox" class="row-checkbox" ${isTripSelected ? 'checked' : ''}></td>
          <td>${row.data_cadastro || row.data_embarque || ""}</td>
          <td>${row.pagina_pdf || ""}</td>
          <td>${row.numero_documento || ""}</td>
          <td>${row.id_viagem || ""}</td>
          <td>${row.placa || ""}</td>
          <td>${row.valor_frete || ""}</td>
          <td>${row.valor_adiantamento || ""}${isMismatch ? '<span class="warning-icon" title="Parcela faltando?">\u26a0\ufe0f</span>' : ''}</td>
          <td>${row.valor_saldo || ""}</td>
          <td class="pedagio-column">${row.valor_pedagio || ""}</td>
          <td>${row.valor_total || ""}</td>
        </tr>
      `;
      }
    )
    .join("");

  table.classList.toggle("hidden", safeRows.length === 0);
  if (tableFooter) tableFooter.classList.toggle("hidden", safeRows.length === 0);
  if (emptyPdf) emptyPdf.classList.toggle("hidden", safeRows.length > 0);
  if (countPdf) countPdf.textContent = safeRows.length > 0 ? safeRows.length : "";

  // Update Footer Totals
  if (footerFrete) footerFrete.textContent = currency.format(totalFrete);
  if (footerAdt) footerAdt.textContent = currency.format(totalAdt);
  if (footerSdo) footerSdo.textContent = currency.format(totalSdo);
  if (footerTotal) footerTotal.textContent = currency.format(totalGeral);

  // Setup Checkboxes logic
  const checkAll = document.querySelector("#select-all-pdf");
  const checkboxes = tbody.querySelectorAll(".row-checkbox");

  function updateSelection() {
    selectedCheckboxAmounts.clear();
    selectedTripIds.clear();
    let sum = 0;
    let anyChecked = false;

    checkboxes.forEach(chk => {
      if (chk.checked) {
        anyChecked = true;
        const tr = chk.closest("tr");
        const tripId = tr.dataset.tripId;
        if (tripId) selectedTripIds.add(tripId);

        const adt = Number(tr.dataset.adt) || 0;
        const sdo = Number(tr.dataset.sdo) || 0;
        const frete = Number(tr.dataset.frete) || 0;
        
        if (adt > 0 || sdo > 0) {
          sum += adt + sdo;
          if (adt > 0) selectedCheckboxAmounts.add(adt.toFixed(2));
          if (sdo > 0) selectedCheckboxAmounts.add(sdo.toFixed(2));
        } else {
          sum += frete;
          if (frete > 0) selectedCheckboxAmounts.add(frete.toFixed(2));
        }
      }
    });

    // Set target amount for search (sum)
    if (anyChecked) {
      selectedReconcileKey = { amount: sum.toFixed(2) };
    } else {
      selectedReconcileKey = null;
    }

    // NEW: Filter reconcile table based on selection
    renderReconcileTable(currentReconcileRows);
  }

  if (checkAll) {
    checkAll.addEventListener("change", (e) => {
      checkboxes.forEach(chk => chk.checked = e.target.checked);
      updateSelection();
    });
  }

  checkboxes.forEach(chk => chk.addEventListener("change", updateSelection));
}

function renderExcelTable(rows) {
  let safeRows = asArray(rows);
  const globalCriteria = getGlobalFilteredExcelCriteria();
  if (globalCriteria) {
    safeRows = safeRows.filter((row) => {
      const cte = normalizeCteValue(row.cte);
      return (cte && globalCriteria.cteKeys.has(cte)) ||
        globalCriteria.amountKeys.has(Number(row.amount || 0).toFixed(2));
    });
  }
  console.log("Rendering Excel Table, rows:", safeRows.length, "SelectedKey:", selectedReconcileKey);
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  excelTbody.innerHTML = safeRows
    .map(
      (row) => {
        let rowClass = "";
        if (selectedReconcileKey) {
          const amountNum = Number(row.amount || 0);
          const cteTargets = asArray(selectedReconcileKey.excelMatchedCtes)
            .map(normalizeCteValue)
            .filter(Boolean);
          const matchesLinkedCte = cteTargets.includes(normalizeCteValue(row.cte));
          const matchesAmount = amountNum.toFixed(2) === selectedReconcileKey.amount;
          
          // NEW: Match with tripTotals if clicking on a reconcile parcel
          const matchesTripTotal = selectedReconcileKey.tripTotals && 
                                  selectedReconcileKey.tripTotals.some(t => Number(t).toFixed(2) === amountNum.toFixed(2));
          const matchesLinkedExcelAmount = selectedReconcileKey.excelMatchedAmounts &&
            selectedReconcileKey.excelMatchedAmounts.some(
              (value) => Number(value).toFixed(2) === amountNum.toFixed(2)
            );

          const matchesSelection = cteTargets.length > 0
            ? matchesLinkedCte
            : (matchesAmount || matchesTripTotal || matchesLinkedExcelAmount);
          if (matchesSelection) {
            rowClass = "linked-row-match";
            console.log("Excel match found!", row.amount, rowClass);
          }
        }
        return `
        <tr class="${rowClass}">
          <td>${row.cteDisplay || row.cte || ""}</td>
          <td>${row.placa || ""}</td>
          <td>${currency.format(row.amount || 0)}</td>
        </tr>
      `;
      }
    )
    .join("");

  excelTable.classList.toggle("hidden", safeRows.length === 0);
  if (emptyExcel) emptyExcel.classList.toggle("hidden", safeRows.length > 0);
  if (countExcel) countExcel.textContent = safeRows.length > 0 ? safeRows.length : "";
}

function renderSummary(fileName, rows, pages) {
  const safeRows = asArray(rows);
  const safePages = asArray(pages);
  const totalGeral = safeRows.reduce(
    (acc, row) => acc + (Number(row.valor_total_num) || 0),
    0
  );

  const moeda = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  summary.innerHTML = `
    <article class="summary-card">
      <strong>Arquivo</strong>
      <span>${fixMojibake(fileName)}</span>
    </article>
    <article class="summary-card">
      <strong>Registros</strong>
      <span>${safeRows.length}</span>
    </article>
    <article class="summary-card">
      <strong>P\u00e1ginas</strong>
      <span>${safePages.length}</span>
    </article>
    <article class="summary-card">
      <strong>Total somado</strong>
      <span>${moeda.format(totalGeral)}</span>
    </article>
  `;

  summary.classList.remove("hidden");
}

function renderReconcileSummary(summaryData, sourceCounts) {
  reconcileSummary.innerHTML = `
    <article class="summary-card">
      <strong>Chaves comparadas</strong>
      <span>${summaryData.totalKeys}</span>
    </article>
    <article class="summary-card">
      <strong>Conciliados</strong>
      <span>${summaryData.conciliados}</span>
    </article>
    <article class="summary-card">
      <strong>Divergentes</strong>
      <span>${summaryData.divergentes}</span>
    </article>
    <article class="summary-card">
      <strong>Itens fonte</strong>
      <span>PDF ${sourceCounts.transport} | Extrato ${sourceCounts.extrato} | Excel ${sourceCounts.excel}</span>
    </article>
  `;
  reconcileSummary.classList.remove("hidden");
}

function reconcileStatusMeta(status) {
  const labels = {
    CONCILIADO_3_FONTES: "Conciliado (3 fontes)",
    MATCH_3_FONTES_PARCIAL: "Match parcial (3 fontes)",
    MATCH_PDF_EXTRATO: "Match PDF x Extrato",
    MATCH_PARCIAL_PDF_EXTRATO: "Match parcial PDF x Extrato",
    MATCH_PDF_EXTRATO_SEM_EXCEL: "Match PDF x Extrato (sem Excel)",
    MATCH_PDF_EXCEL_SEM_EXTRATO: "Match PDF x Excel (sem Extrato)",
    MATCH_EXTRATO_EXCEL_SEM_PDF: "Match Extrato x Excel (sem PDF)",
    SEM_EXCEL: "Sem Excel",
    SEM_EXTRATO: "Sem Extrato",
    SEM_PDF_VIAGEM: "Sem PDF Viagem",
    SO_PDF_VIAGEM: "Somente PDF Viagem",
    SO_EXTRATO: "Somente Extrato",
    SO_EXCEL: "Somente Excel",
    QUANTIDADE_DIVERGENTE: "Quantidade divergente",
    VALOR_EXCEL_DIVERGENTE: "Valor Excel divergente",
    DIVERGENTE: "Divergente",
  };

  if (/^CONCILIADO|^MATCH_/.test(status)) {
    return {
      rowClass: "match",
      badgeClass: "match",
      label: labels[status] || status.replaceAll("_", " "),
    };
  }
  if (/^SEM_/.test(status)) {
    return {
      rowClass: "warn",
      badgeClass: "warn",
      label: labels[status] || status.replaceAll("_", " "),
    };
  }
  return {
    rowClass: "error",
    badgeClass: "error",
    label: labels[status] || status.replaceAll("_", " "),
  };
}

function reconcileObservation(row) {
  if (Number(row.excelValueMismatchCount || 0) > 0) {
    const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    const difference = Number(row.excelValueDifference || 0);
    const sign = difference > 0 ? "+" : "";
    const cteLabel = Number(row.excelValueMismatchCount) === 1 ? "CT-e" : "CT-es";
    return `Diferença Excel x PDF: ${sign}${currency.format(difference)} (${row.excelValueMismatchCount} ${cteLabel})`;
  }
  if (row.occurrenceResult) {
    return row.occurrenceResult;
  }
  if (row.status === "MATCH_PDF_EXTRATO" || row.status === "MATCH_PARCIAL_PDF_EXTRATO") {
    return "PDF e extrato conferem";
  }
  if (row.status === "CONCILIADO_3_FONTES") {
    return "PDF, extrato e Excel conferem";
  }
  if (row.status.startsWith("MATCH_")) {
    return "Conferencia parcial entre fontes";
  }
  if (row.status === "SEM_EXTRATO" || row.status === "SO_PDF_VIAGEM") {
    return "Nao encontrado no extrato";
  }
  if (row.status === "SEM_PDF_VIAGEM" || row.status === "SO_EXTRATO") {
    return "Nao encontrado no PDF de viagem";
  }
  if (row.status === "SO_EXCEL" || row.status === "SEM_EXCEL") {
    return "Sem correspondencia no Excel";
  }
  return "Divergencia de conferencia";
}

function summarizeReconcileForWhatsApp(rows) {
  const filtered = rows.filter(r => !r.status.startsWith("MATCH") && !r.status.startsWith("CONCILIADO"));
  if (filtered.length === 0) return "Toda a conferencia bateu! ✅";

  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  let msg = "*Pendencias de Frete*\n\n";
  
  filtered.slice(0, 20).forEach(r => {
    const status = reconcileStatusMeta(r.status).label;
    msg += `\u2022 ${r.date}: ${currency.format(r.amount)} (${status}) - ${reconcileObservation(r)}\n`;
  });

  if (filtered.length > 20) msg += `\n... e mais ${filtered.length - 20} itens.`;
  return msg;
}

function renderReconcileTable(rows) {
  const currency = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  const severity = { match: 0, warn: 1, error: 2 };
  const selectedAmount = selectedReconcileKey?.amount || "";
  const relatedAmountKeys = new Set(
    asArray(selectedReconcileKey?.relatedAmounts).map((amount) => Number(amount).toFixed(2))
  );
  const filtered = asArray(rows)
    .filter((row) => {
      if (!matchesGlobalSourceFilter(row)) return false;

      const amountStr = Number(row.amount || 0).toFixed(2);
      const isSelectedOrRelated =
        Boolean(selectedReconcileKey) &&
        (amountStr === selectedAmount || relatedAmountKeys.has(amountStr));

      // Mantém a parcela clicada e suas possíveis ADT/SDO parceiras visíveis,
      // mesmo quando outro filtro da conferência estiver ativo.
      if (isSelectedOrRelated) return true;

      // Type filter (ADT/SDO)
      if (typeof reconcileTypeFilter !== "undefined" && reconcileTypeFilter !== "ALL") {
        const origens = String(row.origens || "").toUpperCase();
        if (!origens.includes(reconcileTypeFilter)) return false;
      }

      // Selection filter (Checkboxes)
      if (typeof selectedCheckboxAmounts !== "undefined" && selectedCheckboxAmounts.size > 0) {
        return selectedCheckboxAmounts.has(amountStr) || amountStr === selectedReconcileKey?.amount;
      }

      // Date Range Filter
      const rDate = String(row.date || "");
      const sDate = reconcileStart.value;
      const eDate = reconcileEnd.value;
      if (sDate && rDate < sDate) return false;
      if (eDate && rDate > eDate) return false;

      const meta = reconcileStatusMeta(row.status || "DIVERGENTE");
      if (reconcileFilter.value === "all") {
        return true;
      }
      return meta.rowClass === reconcileFilter.value;
    })
    .sort((a, b) => {
      const ma = reconcileStatusMeta(a.status || "DIVERGENTE");
      const mb = reconcileStatusMeta(b.status || "DIVERGENTE");
      if (severity[ma.rowClass] !== severity[mb.rowClass]) {
        return severity[ma.rowClass] - severity[mb.rowClass];
      }
      return Number(b.amount || 0) - Number(a.amount || 0); // Sort largest amounts first
    });

  if (selectedReconcileKey && relatedAmountKeys.size > 0) {
    const selectedIndex = filtered.findIndex(
      (row) => Number(row.amount || 0).toFixed(2) === selectedAmount
    );
    if (selectedIndex >= 0) {
      const relatedRows = filtered.filter((row) =>
        relatedAmountKeys.has(Number(row.amount || 0).toFixed(2))
      );
      relatedRows.forEach((relatedRow) => {
        const index = filtered.indexOf(relatedRow);
        if (index >= 0) filtered.splice(index, 1);
      });
      const updatedSelectedIndex = filtered.findIndex(
        (row) => Number(row.amount || 0).toFixed(2) === selectedAmount
      );
      filtered.splice(updatedSelectedIndex + 1, 0, ...relatedRows);
    }
  }

  // Calculate pending total
  const pendingTotal = filtered
    .filter(r => !r.status.startsWith("MATCH") && !r.status.startsWith("CONCILIADO"))
    .reduce((acc, r) => acc + Number(r.amount || 0), 0);
  
  totalPendingValue.textContent = currency.format(pendingTotal);
  pendingCard.classList.toggle("hidden", pendingTotal === 0);

  reconcileTbody.innerHTML = filtered
    .map((row) => {
      const meta = reconcileStatusMeta(row.status || "DIVERGENTE");
      const amountFixed = Number(row.amount || 0).toFixed(2);
      const isSelected =
        selectedReconcileKey && selectedReconcileKey.amount === amountFixed;
      const isRelated = !isSelected && relatedAmountKeys.has(amountFixed);
      const showExcelOccurrences = row.excelSourceEnabled ?? currentExcelRows.length > 0;
        
      const origensTag = row.origens 
        ? `<span style="font-size: 0.75rem; background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--line); margin-left: 8px;">${row.origens}</span>` 
        : "";

      return `
      <tr class="reconcile-row ${meta.rowClass} ${isSelected ? "selected" : ""} ${isRelated ? "related-parcel" : ""}" data-amount="${amountFixed}">
        <td>
          ${currency.format(row.amount || 0)}
          ${origensTag}
        </td>
        <td>
          <div class="occurrence-counts">
            <span>PDF <strong>${row.transport || 0}</strong></span>
            <span>Extrato <strong>${row.extrato || 0}</strong></span>
            ${showExcelOccurrences ? `<span>Excel <strong>${row.excel || 0}</strong></span>` : ""}
          </div>
        </td>
        <td>
          <span class="status-badge ${meta.badgeClass}">${meta.label}</span>
          <small class="occurrence-result">${reconcileObservation(row)}</small>
        </td>
      </tr>
    `;
    })
    .join("");

  reconcileTable.classList.toggle("hidden", filtered.length === 0);
  if (emptyReconcile) emptyReconcile.classList.toggle("hidden", filtered.length > 0);
  if (countReconcile) countReconcile.textContent = filtered.length > 0 ? filtered.length : "";
  reconcileWhatsAppBtn.classList.toggle("hidden", filtered.length === 0);
  reconcileExportBtn.classList.toggle("hidden", filtered.length === 0);

  reconcileTbody.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("click", () => {
      const amount = tr.dataset.amount;
      if (!amount) {
        return;
      }

      if (
        selectedReconcileKey &&
        selectedReconcileKey.amount === amount
      ) {
        selectedReconcileKey = null;
      } else {
        const rowData = filtered.find(r => Number(r.amount).toFixed(2) === amount);
        const relatedFromBackend = asArray(rowData?.relatedAmounts);
        const relatedFromPdf = getRelatedParcelAmountsFromPdf(amount);
        const relatedAmounts = [
          ...new Map(
            [...relatedFromBackend, ...relatedFromPdf].map((value) => [
              Number(value).toFixed(2),
              Number(value),
            ])
          ).values(),
        ];
        selectedReconcileKey = { 
          amount, 
          tripTotals: rowData ? rowData.tripTotals : [],
          excelMatchedAmounts: rowData ? rowData.excelMatchedAmounts : [],
          excelMatchedCtes: rowData ? rowData.excelMatchedCtes : [],
          relatedAmounts
        };
      }

      renderReconcileTable(currentReconcileRows);
      renderTable(getVisibleRows());
      renderExcelTable(currentExcelRows);

      // Auto-scroll to first matching rows in both tables
      if (selectedReconcileKey) {
        setTimeout(() => {
          const firstLinkedPdfRow = tbody.querySelector(".linked-row-match, .linked-row-mismatch");
          if (firstLinkedPdfRow) {
            firstLinkedPdfRow.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          const firstLinkedExcelRow = excelTbody.querySelector(".linked-row-match, .linked-row-mismatch");
          if (firstLinkedExcelRow) {
            firstLinkedExcelRow.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 50);
      }
    });
  });
}

document.addEventListener("click", (event) => {
  if (!selectedReconcileKey || event.target.closest(".reconcile-row")) {
    return;
  }

  selectedReconcileKey = null;
  renderReconcileTable(currentReconcileRows);
  renderTable(getVisibleRows());
  renderExcelTable(currentExcelRows);
});

function buildPagesFromRows(rows) {
  const safeRows = asArray(rows);
  const pageNumbers = [...new Set(safeRows.map((row) => row.pagina_pdf).filter(Boolean))];

  return pageNumbers.map((pageNumber) => ({
    page_number: pageNumber,
    totalRows: safeRows.filter(
      (row) => String(row.pagina_pdf) === String(pageNumber)
    ).length,
  }));
}

function getVisibleRows() {
  let safeRows = asArray(currentRows);

  // Algumas viagens chegam em duas linhas: uma com frete/parcelas e outra
  // exclusivamente com o pedágio. O filtro remove somente a linha de pedágio.
  if (hidePedagioFilter?.checked) {
    safeRows = safeRows.filter((row) => !isPedagioOnlyRow(row));
  }

  // Search Filter
  const query = (tableSearch.value || "").toLowerCase().trim();
  const searchField = pdfSearchField?.value || "all";
  if (query) {
    const searchedAmount = parseFlexibleCurrencySearch(query);
    const normalizedPlateQuery = query.replace(/[^a-z0-9]/g, "");
    safeRows = safeRows.filter((row) => {
      const plate = String(row.placa || "").toLowerCase();
      const matchesPlate = plate.includes(query) || (
        normalizedPlateQuery.length > 0 &&
        plate.replace(/[^a-z0-9]/g, "").includes(normalizedPlateQuery)
      );
      const matchesDocument = String(row.numero_documento || "").toLowerCase().includes(query);
      const matchesTrip = String(row.id_viagem || "").toLowerCase().includes(query);
      const freight = row.valor_frete_num != null
        ? Number(row.valor_frete_num)
        : parseBrCurrencyToNumber(row.valor_frete);
      const matchesFreight =
        (searchedAmount != null && freight != null && Math.abs(freight - searchedAmount) < 0.005) ||
        String(row.valor_frete || "").toLowerCase().includes(query);

      if (searchField === "placa") return matchesPlate;
      if (searchField === "frete") return matchesFreight;
      return matchesPlate || matchesDocument || matchesTrip || matchesFreight;
    });
  }

  const globalAmountKeys = getGlobalFilteredAmountKeys();
  if (globalAmountKeys) {
    safeRows = safeRows.filter((row) =>
      getTransportAmountsForMatch(row).some((amount) =>
        globalAmountKeys.has(Number(amount).toFixed(2))
      )
    );
  }

  if (pageFilter.value === "all") {
    return safeRows;
  }

  return safeRows.filter(
    (row) => String(row.pagina_pdf) === String(pageFilter.value)
  );
}

function isPedagioOnlyRow(row) {
  const pedagio = parseBrCurrencyToNumber(row.valor_pedagio) || 0;
  const frete = parseBrCurrencyToNumber(row.valor_frete) || 0;
  const adiantamento = parseBrCurrencyToNumber(row.valor_adiantamento) || 0;
  const saldo = parseBrCurrencyToNumber(row.valor_saldo) || 0;

  return pedagio > 0 && frete === 0 && adiantamento === 0 && saldo === 0;
}

function syncPageFilter(value) {
  pageFilter.value = value;
  renderTable(getVisibleRows());
}

function renderPageFilter(pages) {
  const safePages = asArray(pages);
  pageFilter.innerHTML = '<option value="all">Todas as p\u00e1ginas</option>';

  safePages.forEach((page) => {
    const option = document.createElement("option");
    option.value = String(page.page_number);
    option.textContent = `P\u00e1gina ${page.page_number} (${page.totalRows || 0} registros)`;
    pageFilter.append(option);
  });
}

function renderPageTabs(pages) {
  const safePages = asArray(pages);

  if (safePages.length === 0) {
    pageTabs.innerHTML = "";
    pageTabs.classList.add("hidden");
    return;
  }

  const currentValue = pageFilter.value || "all";
  const tabs = [
    `<button type="button" class="page-tab${currentValue === "all" ? " active" : ""}" data-page="all">Todas</button>`,
    ...safePages.map(
      (page) =>
        `<button type="button" class="page-tab${String(page.page_number) === currentValue ? " active" : ""}" data-page="${page.page_number}">P\u00e1gina ${page.page_number}</button>`
    ),
  ];

  pageTabs.innerHTML = tabs.join("");
  pageTabs.classList.remove("hidden");

  pageTabs.querySelectorAll(".page-tab").forEach((button) => {
    button.addEventListener("click", () => {
      syncPageFilter(button.dataset.page);
      renderPageTabs(currentPages);
      const visibleRows = getVisibleRows();
      setStatus(`${visibleRows.length} registros vis\u00edveis.`, "neutral");
    });
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (input.files.length > 0) {
    setSelectedFile(input.files);
  }

  if (!selectedFile && input.files.length === 0) {
    setStatus("Selecione um PDF antes de continuar.", "error");
    return;
  }

  setLoading(submitButton, true);
  actions.classList.add("hidden");
  pageTabs.classList.add("hidden");
  
  let elapsed = 0;
  setStatus("Processando...", "neutral");
  
  const timerInterval = setInterval(() => {
    elapsed++;
    if (elapsed > 2) {
      setStatus(`Processando... (Analisando conteúdo, tempo decorrido: ${elapsed}s). Se for um PDF escaneado (imagem), a IA será ativada e pode levar até 60s.`, "neutral");
    }
  }, 1000);

  const data = buildFormDataFromSelection();

  try {
    const response = await fetch("/api/parse", {
      method: "POST",
      body: data,
    });

    clearInterval(timerInterval);

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (payload.code === "ENCRYPTED") throw new Error("ENCRYPTED");
      throw new Error(payload.error || "Falha ao processar.");
    }

    currentRows = asArray(payload.rows);
    currentFileName = fixMojibake(payload.fileName || "Arquivo");
    currentPages = asArray(payload.pages);

    if (currentPages.length === 0) {
      currentPages = buildPagesFromRows(currentRows);
    }

    // SAVE TO HISTORY
    saveToHistory({
      fileName: currentFileName,
      totalRows: currentRows.length,
      rows: currentRows,
      pages: currentPages
    });

    renderPageFilter(currentPages);
    renderPageTabs(currentPages);
    syncPageFilter("all");
    renderSummary(currentFileName, currentRows, currentPages);
    actions.classList.toggle("hidden", currentRows.length === 0);
    whatsappFields.classList.toggle("hidden", currentRows.length === 0);

    const totalRows = payload.totalRows || currentRows.length;
    const totalPages = payload.totalPages || currentPages.length;
    
    let successMsg = `PDF processado com ${totalRows} registros em ${totalPages} páginas.`;
    if (payload.isOcr) {
      successMsg += " (⚠️ Leitura feita por IA via OCR, pois o arquivo não tinha texto nativo)";
    }
    
    setStatus(successMsg, "success");
    setLoading(submitButton, false);
  } catch (error) {
    if (typeof timerInterval !== 'undefined') clearInterval(timerInterval);
    if (error.message === "ENCRYPTED") {
      setLoading(submitButton, false);
      pendingPasswordAction = () => form.dispatchEvent(new Event("submit", { cancelable: true }));
      openPasswordModal();
      return;
    }
    
    currentRows = [];
    currentPages = [];
    renderPageFilter([]);
    renderPageTabs([]);
    renderTable([]);
    summary.classList.add("hidden");
    whatsappFields.classList.add("hidden");
    setStatus(error.message || "Falha ao processar o arquivo.", "error");
    setLoading(submitButton, false);
  }
});

exportButton.addEventListener("click", async () => {
  const rowsToExport = getVisibleRows();

  if (rowsToExport.length === 0) {
    setStatus("Nao ha dados para exportar.", "error");
    return;
  }

  setStatus("Gerando planilha...", "neutral");

  const response = await fetch("/api/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ rows: rowsToExport, mode: exportMode.value }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    setStatus(payload.error || "Falha ao exportar a planilha.", "error");
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "extracao-pdf.xlsx";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Planilha exportada com sucesso.", "success");
});

whatsappButton.addEventListener("click", () => {
  try {
    const message = buildWhatsappMessage(getVisibleRows());
    if (encodeURIComponent(message).length > 6000) {
      setStatus(
        "Mensagem muito grande para WhatsApp. Filtre por pagina ou escolha menos campos.",
        "error"
      );
      return;
    }

    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
    setStatus("WhatsApp aberto com os dados selecionados.", "success");
  } catch (error) {
    setStatus(error.message || "Falha ao gerar mensagem do WhatsApp.", "error");
  }
});

input.addEventListener("change", () => {
  setSelectedFile(input.files[0]);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
});

dropZone.addEventListener("drop", (event) => {
  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return;
  setSelectedFile(files);
});

tableSearch.addEventListener("input", () => {
  renderTable(getVisibleRows());
});

if (pdfSearchField) {
  pdfSearchField.addEventListener("change", () => {
    const placeholders = {
      all: "Buscar por placa, CT-e ou frete...",
      placa: "Digite a placa...",
      frete: "Digite o valor do frete...",
    };
    tableSearch.placeholder = placeholders[pdfSearchField.value] || placeholders.all;
    renderTable(getVisibleRows());
  });
}

if (hidePedagioFilter) {
  hidePedagioFilter.addEventListener("change", () => {
    renderTable(getVisibleRows());
  });
}

function openHistoryModal() {
  renderHistoryList();
  historyModalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeHistoryModal() {
  historyModalOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}

function renderHistoryList() {
  const history = getHistory();
  if (history.length === 0) {
    historyModalBody.innerHTML = '<div class="empty-state"><p>Nenhum hist\u00f3rico encontrado.</p></div>';
    return;
  }

  historyModalBody.innerHTML = history.map(item => `
    <div class="history-item">
      <div class="history-info">
        <span class="history-filename">${item.fileName}</span>
        <span class="history-meta">
          ${item.totalRows} registros &bull; ${new Date(item.timestamp).toLocaleString()}
          ${item.reconcile ? ' &bull; <span style="color:var(--match);font-weight:600">Com Confer&ecirc;ncia</span>' : ''}
        </span>
      </div>
      <div class="history-actions">
        <button class="primary load-history-btn" data-id="${item.id}">Carregar</button>
        <button class="danger-btn delete-history-btn" data-id="${item.id}">Excluir</button>
      </div>
    </div>
  `).join("");

  historyModalBody.querySelectorAll(".load-history-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      const item = getHistory().find(h => h.id === id);
      if (item) {
        currentRows = item.rows;
        currentFileName = item.fileName;
        currentPages = item.pages;
        renderPageFilter(currentPages);
        renderPageTabs(currentPages);
        syncPageFilter("all");
        renderSummary(currentFileName, currentRows, currentPages);
        actions.classList.remove("hidden");
        whatsappFields.classList.remove("hidden");
        
        if (item.reconcile) {
          currentReconcileRows = item.reconcile.rows || [];
          currentExcelRows = item.reconcile.excelRows || [];
          updateGlobalSourceFilterOptions();
          renderTable(getVisibleRows());
          renderReconcileSummary(item.reconcile.summary, item.reconcile.sourceCounts);
          renderReconcileTable(currentReconcileRows);
          renderExcelTable(currentExcelRows);
          setReconcileStatus(`Confer\u00eancia carregada do hist\u00f3rico (${item.reconcile.excelMode}).`, "success");
        } else {
          currentReconcileRows = [];
          currentExcelRows = [];
          updateGlobalSourceFilterOptions();
          reconcileSummary.classList.add("hidden");
          renderReconcileTable([]);
          renderExcelTable([]);
          setReconcileStatus("Nenhuma confer\u00eancia salva para este hist\u00f3rico.", "neutral");
        }

        setStatus(`Hist\u00f3rico carregado: ${currentFileName}`, "success");
        closeHistoryModal();
      }
    });
  });

  historyModalBody.querySelectorAll(".delete-history-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      const updated = getHistory().filter(h => h.id !== id);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      renderHistoryList();
    });
  });
}

historyBtn.addEventListener("click", openHistoryModal);
historyModalClose.addEventListener("click", closeHistoryModal);
historyModalFooterClose.addEventListener("click", closeHistoryModal);

function openDashboard() {
  if (currentRows.length === 0) {
    alert("Processe um PDF primeiro para ver as an\u00e1lises.");
    return;
  }
  
  dashboardOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  
  setTimeout(() => {
    renderDashboardData();
  }, 50);
}

function closeDashboard() {
  dashboardOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}

function renderDashboardData() {
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  
  const totalPdf = currentRows.reduce((acc, row) => acc + (parseBrCurrencyToNumber(row.valor_total) || 0), 0);
  
  let totalMatch = 0;
  let conciliadosCount = 0;
  let pendentesCount = 0;
  
  currentReconcileRows.forEach(r => {
    const isMatch = r.status.startsWith("CONCILIADO") || r.status.startsWith("MATCH");
    if (isMatch) {
      totalMatch += Number(r.amount);
      conciliadosCount++;
    } else {
      pendentesCount++;
    }
  });

  const totalPending = totalPdf - totalMatch;
  
  dbTotalPdf.textContent = currency.format(totalPdf);
  dbTotalMatch.textContent = currency.format(totalMatch);
  dbTotalPending.textContent = currency.format(totalPending);

  const plateGroups = {};
  currentRows.forEach(row => {
    const p = row.placa || "N/I";
    const val = parseBrCurrencyToNumber(row.valor_total) || 0;
    plateGroups[p] = (plateGroups[p] || 0) + val;
  });

  const sortedPlates = Object.entries(plateGroups)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const allPending = currentReconcileRows
    .filter(r => !r.status.startsWith("MATCH") && !r.status.startsWith("CONCILIADO"))
    .sort((a, b) => b.amount - a.amount);

  dbPendingTbody.innerHTML = allPending.map(r => {
    const targetAmt = Number(r.amount).toFixed(2);
    const pdfRow = currentRows.find(pr => {
      const prDate = dateToIso(pr.data_cadastro || pr.data_embarque);
      if (prDate !== r.date) return false;
      const amounts = getTransportAmountsForMatch(pr);
      return amounts.some(a => Number(a).toFixed(2) === targetAmt);
    });
    
    let placaStr = pdfRow ? (pdfRow.placa || "N/I") : "";
    if (!placaStr) {
      placaStr = r.status.includes("EXCEL") ? "Excel" : "Extrato";
    }

    return `
      <tr>
        <td>${r.date}</td>
        <td>${placaStr}</td>
        <td>${currency.format(r.amount)}</td>
        <td><span class="status-badge warn">${reconcileStatusMeta(r.status).label}</span></td>
      </tr>
    `;
  }).join("") || '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted)">Nenhuma pend\u00eancia detectada.</td></tr>';

  renderCharts(sortedPlates, conciliadosCount, pendentesCount);
}

function renderCharts(platesData, conciliados, pendentes) {
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  
  const platesContainer = document.getElementById("html-chart-plates");
  if (platesData.length === 0) {
    platesContainer.innerHTML = '<p style="color:var(--muted); font-size: 0.8rem;">Sem dados de frete.</p>';
  } else {
    const maxVal = Math.max(...platesData.map(p => p[1]));
    platesContainer.innerHTML = platesData.map(p => {
      return `
        <div class="hc-item">
          <div class="hc-header">
            <span>${p[0]}</span>
            <span>${currency.format(p[1])}</span>
          </div>
          <div class="hc-bar-track">
            <div class="hc-bar-fill" style="width: 0%"></div>
          </div>
        </div>
      `;
    }).join("");

    setTimeout(() => {
      const fills = platesContainer.querySelectorAll('.hc-bar-fill');
      fills.forEach((fill, idx) => {
        const percentage = maxVal > 0 ? (platesData[idx][1] / maxVal) * 100 : 0;
        fill.style.width = `${percentage}%`;
      });
    }, 50);
  }

  const statusContainer = document.getElementById("html-chart-status");
  const totalItems = conciliados + pendentes;
  
  if (totalItems === 0) {
    statusContainer.innerHTML = '<p style="color:var(--muted); font-size: 0.8rem;">Sem dados de confer\u00eancia.</p>';
  } else {
    const matchPct = (conciliados / totalItems) * 100;
    const pendPct = (pendentes / totalItems) * 100;
    
    statusContainer.innerHTML = `
      <div class="status-dual-bar">
        <div class="status-fill match" style="width: 0%" title="${matchPct.toFixed(1)}% Conciliado"></div>
        <div class="status-fill pending" style="width: 0%" title="${pendPct.toFixed(1)}% Pendente"></div>
      </div>
      <div class="status-legend">
        <div class="sl-item">
          <span><div class="sl-dot match"></div> Conciliados</span>
          <span class="sl-value">${conciliados}</span>
        </div>
        <div class="sl-item">
          <span><div class="sl-dot pending"></div> Pendentes</span>
          <span class="sl-value">${pendentes}</span>
        </div>
      </div>
    `;

    setTimeout(() => {
      statusContainer.querySelector('.status-fill.match').style.width = `${matchPct}%`;
      statusContainer.querySelector('.status-fill.pending').style.width = `${pendPct}%`;
    }, 50);
  }
}

dashboardBtn.addEventListener("click", openDashboard);
dashboardClose.addEventListener("click", closeDashboard);

historyBtn.addEventListener("click", openHistoryModal);
historyModalClose.addEventListener("click", closeHistoryModal);
historyModalFooterClose.addEventListener("click", closeHistoryModal);

clearHistoryBtn.addEventListener("click", () => {
  if (confirm("Deseja realmente limpar todo o histórico?")) {
    localStorage.removeItem(HISTORY_KEY);
    renderHistoryList();
  }
});

pageFilter.addEventListener("change", () => {
  renderTable(getVisibleRows());
  renderPageTabs(currentPages);
  const visibleRows = getVisibleRows();
  setStatus(`${visibleRows.length} registros vis\u00edveis.`, "neutral");
});

reconcileForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!extratoInput.files[0]) {
    setReconcileStatus("Envie o extrato PDF.", "error");
    return;
  }

  if (!currentRows.length) {
    setReconcileStatus("Processe primeiro o PDF de viagens.", "error");
    return;
  }

  setLoading(document.querySelector("#reconcile-button"), true);
  setReconcileStatus("Conciliando dados...", "neutral");

  const data = new FormData();
  data.append("extratoPdf", extratoInput.files[0]);
  if (excelInput.files[0]) {
    data.append("excelFile", excelInput.files[0]);
  }
  data.append("transportRows", JSON.stringify(currentRows));
  if (currentPassword) {
    data.append("password", currentPassword);
  }

  try {
    const response = await fetch("/api/reconcile", {
      method: "POST",
      body: data,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (payload.code === "ENCRYPTED") throw new Error("ENCRYPTED");
      throw new Error(payload.error || "Falha na conciliacao.");
    }

    renderReconcileSummary(payload.summary, payload.sourceCounts);
    currentReconcileRows = asArray(payload.rows);
    currentExcelRows = asArray(payload.rawExcel); 
    updateGlobalSourceFilterOptions();
    renderTable(getVisibleRows());
    
    renderReconcileTable(currentReconcileRows);
    renderExcelTable(currentExcelRows); 
    
    let modo = "sem Excel";
    if (excelInput.files[0]) {
      if (payload.sourceCounts?.excel > 0) {
        modo = "com Excel";
      } else if (payload.excelDebug) {
        const d = payload.excelDebug;
        modo = `Excel ignorado (${d.error || "Erro no processamento"} | Aba: ${d.sheet || "?"})`;
      } else {
        modo = "Excel ignorado (Erro na integracao do servidor)";
      }
    }

    updateHistoryWithReconcile(currentFileName, {
      rows: currentReconcileRows,
      excelRows: currentExcelRows,
      summary: payload.summary,
      sourceCounts: payload.sourceCounts,
      excelMode: modo
    });

    setReconcileStatus(
      `Conferencia concluida (${modo}): ${payload.summary.conciliados} conciliados, ${payload.summary.divergentes} divergentes.`,
      payload.sourceCounts?.excel === 0 && excelInput.files[0] ? "warn" : "success"
    );
    setLoading(document.querySelector("#reconcile-button"), false);
  } catch (error) {
    if (error.message === "ENCRYPTED") {
      setLoading(document.querySelector("#reconcile-button"), false);
      pendingPasswordAction = () => reconcileForm.dispatchEvent(new Event("submit", { cancelable: true }));
      openPasswordModal();
      return;
    }

    reconcileSummary.classList.add("hidden");
    currentReconcileRows = [];
    currentExcelRows = [];
    selectedReconcileKey = null;
    updateGlobalSourceFilterOptions();
    renderReconcileTable([]);
    renderExcelTable([]);
    setReconcileStatus(error.message || "Falha na conciliacao.", "error");
    setLoading(document.querySelector("#reconcile-button"), false);
  }
});

reconcileFilter.addEventListener("change", () => {
  renderReconcileTable(currentReconcileRows);
  renderTable(getVisibleRows());
  renderExcelTable(currentExcelRows);
});

if (globalSourceFilter) {
  globalSourceFilter.addEventListener("change", () => {
    globalSourceFilterValue = globalSourceFilter.value;
    selectedReconcileKey = null;
    selectedCheckboxAmounts.clear();
    selectedTripIds.clear();
    reconcileFilter.value = "all";
    reconcileTypeFilter = "ALL";
    if (reconcileTypeFilterSelect) reconcileTypeFilterSelect.value = "ALL";
    const checkAll = document.querySelector("#select-all-pdf");
    if (checkAll) checkAll.checked = false;

    renderTable(getVisibleRows());
    renderReconcileTable(currentReconcileRows);
    renderExcelTable(currentExcelRows);
  });
}

[reconcileStart, reconcileEnd].forEach(el => {
  el.addEventListener("change", () => renderReconcileTable(currentReconcileRows));
});

reconcileWhatsAppBtn.addEventListener("click", () => {
  try {
    const message = summarizeReconcileForWhatsApp(
      currentReconcileRows.filter((row) => matchesGlobalSourceFilter(row))
    );
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  } catch (err) {
    alert(err.message);
  }
});

const reconcileTypeFilterSelect = document.querySelector("#reconcile-type-filter");
if (reconcileTypeFilterSelect) {
  reconcileTypeFilterSelect.addEventListener("change", (e) => {
    reconcileTypeFilter = e.target.value;
    renderReconcileTable(currentReconcileRows);
  });
}

const clearReconcileFiltersBtn = document.querySelector("#btn-clear-reconcile-filters");
if (clearReconcileFiltersBtn) {
  clearReconcileFiltersBtn.addEventListener("click", () => {
    selectedCheckboxAmounts.clear();
    selectedTripIds.clear();
    selectedReconcileKey = null;
    reconcileTypeFilter = "ALL";
    globalSourceFilterValue = "all";
    if (reconcileTypeFilterSelect) reconcileTypeFilterSelect.value = "ALL";
    if (globalSourceFilter) globalSourceFilter.value = "all";
    
    // Reset Select All checkbox
    const checkAll = document.querySelector("#select-all-pdf");
    if (checkAll) checkAll.checked = false;

    renderTable(currentRows);
    renderReconcileTable(currentReconcileRows);
    renderExcelTable(currentExcelRows);
  });
}

reconcileExportBtn.addEventListener("click", async () => {
  if (currentReconcileRows.length === 0) return;
  setReconcileStatus("Gerando planilha da conferencia...", "neutral");

  const response = await fetch("/api/export-reconcile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rows: currentReconcileRows.filter((row) => matchesGlobalSourceFilter(row)),
    }),
  });

  if (!response.ok) {
    setReconcileStatus("Falha ao exportar conferencia.", "error");
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "conferencia-fretes.xlsx";
  link.click();
  URL.revokeObjectURL(url);
  setReconcileStatus("Conferencia exportada com sucesso.", "success");
});

// ─── Fullscreen Table Modal ───
const modalOverlay = document.querySelector("#table-modal-overlay");
const modalTitle = document.querySelector("#table-modal-title");
const modalBody = document.querySelector("#table-modal-body");
const modalClose = document.querySelector("#table-modal-close");

function openTableModal(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const titleEl = panel.querySelector(".table-title span");
  const tableWrap = panel.querySelector(".table-wrap");
  if (!titleEl || !tableWrap) return;

  modalTitle.textContent = titleEl.textContent;

  // Clone the table content into the modal
  const tableClone = tableWrap.cloneNode(true);
  modalBody.innerHTML = "";
  modalBody.appendChild(tableClone);

  // Ensure cloned table is visible
  const clonedTable = tableClone.querySelector("table");
  if (clonedTable) {
    clonedTable.classList.remove("hidden");
  }

  modalOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeTableModal() {
  modalOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}

document.querySelectorAll(".expand-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const panelId = btn.dataset.expand;
    openTableModal(panelId);
  });
});

modalClose.addEventListener("click", closeTableModal);

modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) {
    closeTableModal();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalOverlay.classList.contains("hidden")) {
    closeTableModal();
  }
});

updateGlobalSourceFilterOptions();
setupPanelResizers();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch (_error) {
      // PWA offline mode is optional, so failures do not block usage.
    }
  });
}
