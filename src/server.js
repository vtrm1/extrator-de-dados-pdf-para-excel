const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");

const { extractTripsFromPdf, fixMojibake } = require("./parser");

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
    "Data do cadastro": row.data_cadastro || "",
    "Data do embarque": row.data_embarque || "",
    Placa: row.placa || "",
    Frete: row.valor_frete || "",
    Adiantamento: row.valor_adiantamento || "",
    Saldo: row.valor_saldo || "",
    Pedagio: row.valor_pedagio || "",
    Total: row.valor_total || "",
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
app.use(express.static(path.join(__dirname, "..", "public")));

app.post("/api/parse", upload.single("pdf"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Envie um arquivo PDF." });
  }

  try {
    const parsed = await extractTripsFromPdf(req.file.buffer);
    return res.json({
      fileName: decodeFileName(req.file.originalname),
      totalRows: parsed.rows.length,
      totalPages: parsed.totalPages,
      rows: parsed.rows,
      pages: parsed.pages.map((page) => ({
        page_number: page.page_number,
        totalRows: page.rows.length,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      error: "Nao foi possivel processar o PDF.",
      details: error.message,
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

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Servidor ativo em http://localhost:${port}`);
  });
}

module.exports = app;
