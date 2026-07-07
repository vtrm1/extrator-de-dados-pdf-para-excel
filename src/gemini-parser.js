const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

// Recomendação para produção: usar dotenv para ler processos do .env
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("AVISO: GEMINI_API_KEY não definida nas variáveis de ambiente!");
}
const genAI = new GoogleGenerativeAI(apiKey);

async function extractTripsWithGemini(buffer) {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
    Você é um extrator de dados de relatórios de transporte.
    Analise este PDF e extraia os dados de TODAS as viagens de forma estruturada.
    Liste todas as viagens que encontrar (cada viagem costuma ter um número de CONHECIMENTO e ID).

    Preencha as seguintes chaves no JSON para cada viagem encontrada:
    - "conhecimento" (número do CONHECIMENTO)
    - "id_viagem" (ID da Viagem)
    - "data_cadastro" (Data do Cadastro)
    - "data_embarque" (Data do Embarque)
    - "placa" (Placa)
    - "valor_frete" (Total das Parcelas)
    - "valor_adiantamento" (Soma das parcelas marcadas como ADT)
    - "valor_saldo" (Soma das parcelas marcadas como SDO)
    - "valor_pedagio" (Valor total do pedágio)
    - "valor_total" (Total da Viagem)
    
    Retorne EXATAMENTE UM JSON no formato:
    {
      "viagens": [
        {
           "conhecimento": "123",
           "id_viagem": "456",
           "data_cadastro": "10/05/2026",
           "data_embarque": "10/05/2026",
           "placa": "ABC1234",
           "valor_frete": "1000,00",
           "valor_adiantamento": "500,00",
           "valor_saldo": "500,00",
           "valor_pedagio": "0,00",
           "valor_total": "1000,00"
        }
      ]
    }
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: buffer.toString("base64"),
          mimeType: "application/pdf"
        }
      }
    ]);

    const text = result.response.text();
    const data = JSON.parse(text);
    
    // Converte e normaliza o formato de saída do Gemini para o esperado pelo sistema (parser.js)
    if (!data || !data.viagens || !Array.isArray(data.viagens)) {
      return { totalPages: 1, pages: [{ page_number: 1, rows: [] }], rows: [] };
    }

    const rows = data.viagens.map((v, index) => {
      // Como o Gemini retorna os valores em string pt-BR ("1.000,00"), vamos converter para número.
      const parseBrCurrency = (val) => {
        if (!val) return 0;
        const num = Number(val.replace(/\./g, "").replace(",", "."));
        return isNaN(num) ? 0 : num;
      };

      const frete = parseBrCurrency(v.valor_frete);
      const adiantamento = parseBrCurrency(v.valor_adiantamento);
      const saldo = parseBrCurrency(v.valor_saldo);
      const pedagio = parseBrCurrency(v.valor_pedagio);
      const total = parseBrCurrency(v.valor_total);

      const formatCurrency = (n) => {
        return new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(n);
      };

      return {
        pagina_pdf: "OCR", // Marcador indicando que veio da IA, não sabemos a página exata de forma trivial
        numero_documento: v.conhecimento || "",
        id_viagem: v.id_viagem || "",
        data_cadastro: v.data_cadastro || "",
        data_embarque: v.data_embarque || "",
        placa: v.placa || "",
        valor_frete: formatCurrency(frete),
        valor_adiantamento: formatCurrency(adiantamento),
        valor_saldo: formatCurrency(saldo),
        valor_pedagio: formatCurrency(pedagio),
        valor_total: formatCurrency(total),
        valor_frete_num: frete,
        valor_adiantamento_num: adiantamento,
        valor_saldo_num: saldo,
        valor_pedagio_num: pedagio,
        valor_total_num: total,
      };
    });

    return {
      totalPages: 1,
      pages: [{ page_number: "OCR", rows }],
      rows
    };

  } catch (error) {
    console.error("Erro no extrator Gemini:", error);
    if (error.message && error.message.includes("503")) {
      throw new Error("A Inteligência Artificial do Google está com alta demanda no momento. Aguarde alguns minutos e tente novamente.");
    } else if (error.message && error.message.includes("429")) {
      throw new Error("Limite de uso da chave do Gemini atingido. Aguarde ou utilize outra chave.");
    }
    throw new Error("Falha ao processar a imagem do PDF com a IA. Tente novamente.");
  }
}

module.exports = {
  extractTripsWithGemini
};
