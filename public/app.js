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
const statusBox = document.querySelector("#status");
const summary = document.querySelector("#summary");
const actions = document.querySelector("#actions");

let currentRows = [];
let currentFileName = "";
let currentPages = [];
let selectedFile = null;

const whatsappFieldDefs = [
  { key: "numero_documento", label: "Documento" },
  { key: "id_viagem", label: "ID viagem" },
  { key: "data_cadastro", label: "Cadastro" },
  { key: "data_embarque", label: "Embarque" },
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

function buildFormDataFromSelection() {
  if (!selectedFile) {
    return null;
  }

  const data = new FormData();
  data.append("pdf", selectedFile);
  return data;
}

function setSelectedFile(file) {
  if (!file) {
    return;
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    setStatus("Selecione um arquivo PDF valido.", "error");
    return;
  }

  selectedFile = file;
  setStatus(`Arquivo selecionado: ${fixMojibake(file.name)}`, "neutral");
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

  tbody.innerHTML = safeRows
    .map(
      (row) => `
        <tr>
          <td>${row.pagina_pdf || ""}</td>
          <td>${row.numero_documento || ""}</td>
          <td>${row.id_viagem || ""}</td>
          <td>${row.data_cadastro || ""}</td>
          <td>${row.data_embarque || ""}</td>
          <td>${row.placa || ""}</td>
          <td>${row.valor_frete || ""}</td>
          <td>${row.valor_adiantamento || ""}</td>
          <td>${row.valor_saldo || ""}</td>
          <td>${row.valor_pedagio || ""}</td>
          <td>${row.valor_total || ""}</td>
        </tr>
      `
    )
    .join("");

  table.classList.toggle("hidden", safeRows.length === 0);
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
  const safeRows = asArray(currentRows);

  if (pageFilter.value === "all") {
    return safeRows;
  }

  return safeRows.filter(
    (row) => String(row.pagina_pdf) === String(pageFilter.value)
  );
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

  if (input.files[0]) {
    setSelectedFile(input.files[0]);
  }

  if (!selectedFile) {
    setStatus("Selecione um PDF antes de continuar.", "error");
    return;
  }

  submitButton.disabled = true;
  actions.classList.add("hidden");
  pageTabs.classList.add("hidden");
  setStatus("Processando o PDF...", "neutral");

  const data = buildFormDataFromSelection();

  try {
    const response = await fetch("/api/parse", {
      method: "POST",
      body: data,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "Falha ao processar o arquivo.");
    }

    currentRows = asArray(payload.rows);
    currentFileName = fixMojibake(payload.fileName || selectedFile.name || "");
    currentPages = asArray(payload.pages);

    if (currentPages.length === 0) {
      currentPages = buildPagesFromRows(currentRows);
    }

    renderPageFilter(currentPages);
    renderPageTabs(currentPages);
    syncPageFilter("all");
    renderSummary(currentFileName, currentRows, currentPages);
    actions.classList.toggle("hidden", currentRows.length === 0);
    whatsappFields.classList.toggle("hidden", currentRows.length === 0);

    const totalRows = payload.totalRows || currentRows.length;
    const totalPages = payload.totalPages || currentPages.length;
    setStatus(
      `PDF processado com ${totalRows} registros em ${totalPages} p\u00e1ginas.`,
      "success"
    );
  } catch (error) {
    currentRows = [];
    currentPages = [];
    renderPageFilter([]);
    renderPageTabs([]);
    renderTable([]);
    summary.classList.add("hidden");
    whatsappFields.classList.add("hidden");
    setStatus(error.message || "Falha ao processar o arquivo.", "error");
  } finally {
    submitButton.disabled = false;
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
  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    return;
  }

  setSelectedFile(file);
});

pageFilter.addEventListener("change", () => {
  renderTable(getVisibleRows());
  renderPageTabs(currentPages);
  const visibleRows = getVisibleRows();
  setStatus(`${visibleRows.length} registros vis\u00edveis.`, "neutral");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch (_error) {
      // PWA offline mode is optional, so failures do not block usage.
    }
  });
}
