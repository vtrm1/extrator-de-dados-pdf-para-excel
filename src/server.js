const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");

const { extractTripsFromPdf, fixMojibake } = require("./parser");
const {
  parseTransportRows,
  parseExtratoPdf,
  parseExcelFile,
  reconcileData,
} = require("./reconcile");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const port = process.env.PORT || 3000;

function decodeFileName(name) {
  const decoded = fixMojibake(name || "");
  return decoded || "arquivo.pdf";
}

function buildExportRows(rows) {
  return rows.map((row) => ({
    "Pagina PDF": row.pagina_pdf || "",
    Documento: row.numero_documento || "",
    "ID da viagem": row.id_viagem || "",
    Placa: row.placa || "",
    Frete: row.valor_frete || "",
    Adiantamento: row.valor_adiantamento || "",
    Saldo: row.valor_saldo || "",
    Pedagio: row.valor_pedagio || "",
    Total: row.valor_total || "",
    Origem: row.origem || "",
  }));
}

function safeSheetName(name, fallback) {
  const cleaned = String(name || fallback)
    .replace(/[\\/?*\[\]:]/g, " ")
    .trim()
    .slice(0, 31);
  return cleaned || fallback;
}

function appendSheet(workbook, name, rows) {
  const worksheet = XLSX.utils.json_to_sheet(buildExportRows(rows));
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(name, "Dados"));
}

app.use(express.json({ limit: "5mb" }));
app.use((req, res, next) => {
  if (
    req.path === "/" ||
    req.path.endsWith(".js") ||
    req.path.endsWith(".css") ||
    req.path.endsWith(".webmanifest")
  ) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});
app.get("/favicon.ico", (_req, res) => {
  res.status(204).end();
});
app.use(express.static(path.join(__dirname, "..", "public")));

app.post("/api/parse", upload.array("pdf"), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "Envie pelo menos um arquivo PDF." });
  }

  const password = req.body.password || "";

  try {
    const results = await Promise.all(
      req.files.map(async (file) => {
        const parsed = await extractTripsFromPdf(file.buffer, password);
        const fileName = decodeFileName(file.originalname);
        // Marcamos a origem de cada linha para facilitar rastreamento em multi-upload
        parsed.rows.forEach(row => row.origem = fileName);
        return { ...parsed, fileName };
      })
    );

    const combinedRows = results.flatMap(r => r.rows);
    const combinedPages = results.flatMap((r, fileIdx) => 
      r.pages.map(p => ({
        ...p,
        page_number: `${fileIdx + 1}-${p.page_number}` 
      }))
    );

    return res.json({
      fileName: results.length === 1 ? results[0].fileName : "Múltiplos Arquivos",
      totalRows: combinedRows.length,
      totalPages: combinedPages.length,
      rows: combinedRows,
      pages: combinedPages.map(p => ({
        page_number: p.page_number,
        totalRows: p.rows.length
      }))
    });
  } catch (error) {
    if (error.message === "ENCRYPTED") {
      return res.status(401).json({ error: "Password required", code: "ENCRYPTED" });
    }
    return res.status(500).json({
      error: "Nao foi possivel processar os PDFs.",
      details: error.message
    });
  }
});

app.post("/api/export", (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const mode = req.body?.mode || "all";

  if (rows.length === 0) {
    return res.status(400).json({ error: "Nenhum dado para exportar." });
  }

  const workbook = XLSX.utils.book_new();

  if (mode === "by-page") {
    const grouped = rows.reduce((acc, row) => {
      const key = String(row.pagina_pdf || "Sem pagina");
      acc[key] = acc[key] || [];
      acc[key].push(row);
      return acc;
    }, {});

    Object.entries(grouped).forEach(([page, groupedRows]) => {
      appendSheet(workbook, `Pagina ${page}`, groupedRows);
    });
  } else if (mode === "by-document") {
    const grouped = rows.reduce((acc, row) => {
      const key = row.numero_documento || `Pagina ${row.pagina_pdf || "Sem pagina"}`;
      acc[key] = acc[key] || [];
      acc[key].push(row);
      return acc;
    }, {});

    Object.entries(grouped).forEach(([documento, groupedRows]) => {
      appendSheet(workbook, `Doc ${documento}`, groupedRows);
    });
  } else {
    appendSheet(workbook, "Extracao", rows);
  }

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="extracao-pdf.xlsx"'
  );
  res.type(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  return res.send(buffer);
});

app.post(
  "/api/reconcile",
  upload.fields([
    { name: "extratoPdf", maxCount: 1 },
    { name: "excelFile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const extratoFile = req.files?.extratoPdf?.[0];
      const excelFile = req.files?.excelFile?.[0];
      const transportRows = JSON.parse(req.body?.transportRows || "[]");
      const password = req.body?.password || "";

      if (!extratoFile) {
        return res.status(400).json({
          error: "Envie o PDF do extrato.",
        });
      }

      const parsedTransport = parseTransportRows(transportRows);
      const parsedExtrato = await parseExtratoPdf(extratoFile.buffer, "2026", password);
      const parsedExcel = excelFile ? parseExcelFile(excelFile.buffer) : [];
      const result = reconcileData(parsedTransport, parsedExtrato, parsedExcel);

      return res.json({
        summary: result.summary,
        rows: result.rows,
        rawExcel: result.rawExcel || [],
        excelDebug: result.excelDebug,
        sourceCounts: {
          transport: parsedTransport.length,
          extrato: parsedExtrato.length,
          excel: parsedExcel.rows ? parsedExcel.rows.length : 0,
        },
      });
    } catch (error) {
      if (error.message === "ENCRYPTED") {
        return res.status(401).json({ error: "Password required", code: "ENCRYPTED" });
      }
      return res.status(500).json({
        error: "Falha ao conciliar dados.",
        details: error.message,
      });
    }
  }
);

app.post("/api/export-reconcile", (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows)) return res.status(400).json({ error: "Dados invalidos." });
    const exportRows = rows.map((r) => ({
      Valor: r.amount,
      Status: r.status,
      "PDF?": r.transport > 0 ? "Sim" : "Nao",
      "Extrato?": r.extrato > 0 ? "Sim" : "Nao",
      "Excel?": r.excel > 0 ? "Sim" : "Nao",
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Conferencia");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", 'attachment; filename="conferencia.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Servidor ativo em http://localhost:${port}`);
  });
}

module.exports = app;
