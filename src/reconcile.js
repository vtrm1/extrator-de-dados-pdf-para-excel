const { PDFParse } = require("pdf-parse");
const XLSX = require("xlsx");

function parseBrCurrencyToNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  // If already a number (from XLSX), just return it
  if (typeof value === "number") {
    return value;
  }

  const text = String(value).trim();
  
  // Remove currency symbols and whitespace
  let clean = text.replace(/[R$\s]/g, "").replace(/\u00a0/g, "");

  // Heuristic for BR vs US/Logic formatting
  // If it has a comma, it's definitely BR (or similar) where , is decimal or thousands.
  // In BR: 1.234,56
  if (clean.includes(",")) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  } 
  // If no comma, but has a dot, could be 1.234 or 1234.56
  // Usually from XLSX if it's a string it's already "clean" or specifically formatted.
  // But if the user is seeing 3061,6 in the sheet and it's coming as "3061.6" from the library,
  // we SHOULD NOT remove that dot.
  
  const number = Number(clean);
  return Number.isFinite(number) ? number : null;
}

function parseExtratoCurrencyToNumber(text) {
  if (!text) {
    return null;
  }

  const match = String(text).match(/([+-])\s*([0-9]+(?:[.,][0-9]{2}))$/);
  if (!match) {
    return null;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const number = Number(match[2].replace(",", "."));
  return Number.isFinite(number) ? number * sign : null;
}

function dateToISO(dateText) {
  const match = String(dateText || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) {
    return "";
  }
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function excelDateToISO(value) {
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) {
      return "";
    }
    const yyyy = String(date.y).padStart(4, "0");
    const mm = String(date.m).padStart(2, "0");
    const dd = String(date.d).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}`;
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  return "";
}

function keyFrom(dateIso, amount) {
  return `${dateIso}|${Number(amount).toFixed(2)}`;
}

function groupByKey(rows, source) {
  const map = new Map();
  rows.forEach((row) => {
    if (!row.date || row.amount == null) {
      return;
    }
    const key = keyFrom(row.date, row.amount);
    if (!map.has(key)) {
      map.set(key, {
        key,
        date: row.date,
        amount: row.amount,
        transport: 0,
        extrato: 0,
        excel: 0,
      });
    }
    map.get(key)[source] += 1;
  });
  return map;
}

function parseTransportRows(rows) {
  const out = [];

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const date = dateToISO(row.data_cadastro || row.data_embarque);
    if (!date) {
      return;
    }

    const adiantamento =
      row.valor_adiantamento_num != null
        ? Number(row.valor_adiantamento_num)
        : parseBrCurrencyToNumber(row.valor_adiantamento);
    const saldo =
      row.valor_saldo_num != null
        ? Number(row.valor_saldo_num)
        : parseBrCurrencyToNumber(row.valor_saldo);
    const frete =
      row.valor_frete_num != null
        ? Number(row.valor_frete_num)
        : parseBrCurrencyToNumber(row.valor_frete);

    const hasParcelas = (adiantamento != null && adiantamento > 0) || (saldo != null && saldo > 0);

    // Extrato normalmente vem por parcelas (ADT/SDO). Quando existir, prioriza essa comparacao.
    if (hasParcelas) {
      if (adiantamento != null && adiantamento > 0) {
        out.push({ date, amount: adiantamento, origem: "ADT" });
      }
      if (saldo != null && saldo > 0) {
        out.push({ date, amount: saldo, origem: "SDO" });
      }
      return;
    }

    if (frete != null && frete > 0) {
      out.push({ date, amount: frete, origem: "FRETE" });
    }
  });

  return out;
}

async function parseExtratoPdf(buffer, yearFallback) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = result.text.replace(/\r/g, "");
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);

    let currentDay = "";
    let currentMonth = "";
    const monthMap = {
      "jan.": "01",
      "fev.": "02",
      "mar.": "03",
      "abr.": "04",
      "mai.": "05",
      "jun.": "06",
      "jul.": "07",
      "ago.": "08",
      "set.": "09",
      "out.": "10",
      "nov.": "11",
      "dez.": "12",
    };

    const rows = [];

    lines.forEach((line) => {
      const dayMonthInline = line.match(
        /^(\d{1,2})\s+(jan\.|fev\.|mar\.|abr\.|mai\.|jun\.|jul\.|ago\.|set\.|out\.|nov\.|dez\.)\s+/i
      );
      if (dayMonthInline) {
        currentDay = String(dayMonthInline[1]).padStart(2, "0");
        currentMonth = monthMap[dayMonthInline[2].toLowerCase()] || currentMonth;
      }

      const dayOnly = line.match(/^(\d{1,2})$/);
      if (dayOnly) {
        currentDay = String(dayOnly[1]).padStart(2, "0");
        return;
      }

      const monthInline = line.match(
        /^(jan\.|fev\.|mar\.|abr\.|mai\.|jun\.|jul\.|ago\.|set\.|out\.|nov\.|dez\.)\s+/i
      );
      if (monthInline) {
        currentMonth = monthMap[monthInline[1].toLowerCase()] || "";
      }

      if (!/AUTH PAGAMENTO\*\*/i.test(line)) {
        return;
      }

      const valueMatch = line.match(/R\$\s*([+-]\d+(?:[.,]\d{2}))$/);
      if (!valueMatch) {
        return;
      }

      const amount = parseExtratoCurrencyToNumber(valueMatch[0]);
      if (amount == null || amount <= 0) {
        return;
      }

      if (!currentDay || !currentMonth) {
        return;
      }

      const date = `${yearFallback}-${currentMonth}-${currentDay}`;
      rows.push({ date, amount });
    });

    return rows;
  } finally {
    await parser.destroy();
  }
}

function parseExcelFile(buffer) {
  try {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const sheetNames = wb.SheetNames;
    console.log("Excel Sheets found:", sheetNames);
    
    const targetIndexes = [
      sheetNames.findIndex((n) => n.toLowerCase().includes("detalhes")),
      sheetNames.findIndex((n) => n.toLowerCase().includes("dados")),
      sheetNames[1] ? 1 : -1,
      0
    ].filter(i => i >= 0);

    const uniqueIndexes = [...new Set(targetIndexes)];
    const allPossibleIndexes = [...uniqueIndexes, ...sheetNames.map((_, i) => i).filter(i => !uniqueIndexes.includes(i))];

    for (const idx of allPossibleIndexes) {
      const sheetName = sheetNames[idx];
      const ws = wb.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      if (rawData.length === 0) continue;

      let headerRowIndex = -1;
      let dateColIdx = -1;
      let freteColIdx = -1;

      for (let i = 0; i < Math.min(rawData.length, 50); i++) {
        const row = rawData[i];
        if (!Array.isArray(row)) continue;

        const dIdx = row.findIndex((cell) => {
          const c = String(cell || "").toLowerCase().trim();
          return ["data", "dt", "vencimento", "emissao", "dta"].includes(c) || /^(data|dt|venc)/i.test(c);
        });

        const fIdx = row.findIndex((cell) => {
          const c = String(cell || "").toLowerCase().trim();
          return ["frete", "vlr frete", "valor frete", "vlr", "valor", "total", "mecanico", "frete (r$)"].includes(c) || 
                 /^frete/i.test(c) || 
                 (/valor/i.test(c) && !/tonel/i.test(c) && !/unit/i.test(c));
        });

        if (dIdx >= 0 && fIdx >= 0) {
          headerRowIndex = i;
          dateColIdx = dIdx;
          freteColIdx = fIdx;
          break;
        }
      }

      if (headerRowIndex >= 0) {
        const parsedRows = [];
        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.length <= Math.max(dateColIdx, freteColIdx)) continue;
          
          const date = excelDateToISO(row[dateColIdx]);
          const amount = parseBrCurrencyToNumber(row[freteColIdx]);
          
          if (date && amount != null && amount > 0) {
            parsedRows.push({ date, amount, originalRow: row });
          }
        }

        console.log(`Success on sheet ${sheetName}: found ${parsedRows.length} rows`);
        return { 
          rows: parsedRows, 
          debug: { 
            success: true, 
            sheet: sheetName, 
            headerRow: headerRowIndex + 1,
            dateCol: String(rawData[headerRowIndex][dateColIdx]),
            freteCol: String(rawData[headerRowIndex][freteColIdx]),
            rowCount: parsedRows.length
          } 
        };
      }
    }

    return { 
      rows: [], 
      debug: { 
        error: "Colunas Data/Frete nao encontradas", 
        sheetsSearched: sheetNames,
        firstRowSample: rawData[0] ? rawData[0].slice(0, 5) : []
      } 
    };
  } catch (err) {
    console.error("Excel parse error:", err);
    return { rows: [], debug: { error: "Erro fatal: " + err.message } };
  }
}

function reconcileData(transportRows, extratoRows, excelResult) {
  const excelRows = excelResult?.rows || [];
  const hasExcelSource = excelRows.length > 0;
  const map = new Map();
  [groupByKey(transportRows, "transport"), groupByKey(extratoRows, "extrato"), groupByKey(excelRows, "excel")].forEach((sourceMap) => {
    sourceMap.forEach((value, key) => {
      if (!map.has(key)) {
        map.set(key, { ...value });
      } else {
        const current = map.get(key);
        current.transport += value.transport;
        current.extrato += value.extrato;
        current.excel += value.excel;
      }
    });
  });

  const rows = [...map.values()]
    .map((row) => {
      let status = "DIVERGENTE";
      const hasTransport = row.transport > 0;
      const hasExtrato = row.extrato > 0;
      const hasExcel = row.excel > 0;

      if (!hasExcelSource) {
        if (hasTransport && hasExtrato && row.transport === row.extrato) {
          status = "MATCH_PDF_EXTRATO";
        } else if (hasTransport && hasExtrato) {
          status = "MATCH_PARCIAL_PDF_EXTRATO";
        } else if (hasTransport && !hasExtrato) {
          status = "SEM_EXTRATO";
        } else if (!hasTransport && hasExtrato) {
          status = "SEM_PDF_VIAGEM";
        }
      } else if (hasTransport && hasExtrato && hasExcel) {
        status =
          row.transport === row.extrato && row.extrato === row.excel
            ? "CONCILIADO_3_FONTES"
            : "MATCH_3_FONTES_PARCIAL";
      } else if (hasTransport && hasExtrato && !hasExcel) {
        status = "MATCH_PDF_EXTRATO_SEM_EXCEL";
      } else if (hasTransport && hasExcel && !hasExtrato) {
        status = "MATCH_PDF_EXCEL_SEM_EXTRATO";
      } else if (!hasTransport && hasExtrato && hasExcel) {
        status = "MATCH_EXTRATO_EXCEL_SEM_PDF";
      } else if (hasTransport && !hasExtrato && !hasExcel) {
        status = "SO_PDF_VIAGEM";
      } else if (!hasTransport && hasExtrato && !hasExcel) {
        status = "SO_EXTRATO";
      } else if (!hasTransport && !hasExtrato && hasExcel) {
        status = "SO_EXCEL";
      }
      return { ...row, status };
    })
    .sort((a, b) => (a.date === b.date ? a.amount - b.amount : a.date.localeCompare(b.date)));

  const summary = rows.reduce(
    (acc, row) => {
      acc.totalKeys += 1;
      if (row.status.startsWith("MATCH") || row.status.startsWith("CONCILIADO")) {
        acc.conciliados += 1;
      } else {
        acc.divergentes += 1;
      }
      return acc;
    },
    { totalKeys: 0, conciliados: 0, divergentes: 0 }
  );

  return { summary, rows, rawExcel: excelRows, excelDebug: excelResult?.debug };
}

module.exports = {
  parseTransportRows,
  parseExtratoPdf,
  parseExcelFile,
  reconcileData,
};
