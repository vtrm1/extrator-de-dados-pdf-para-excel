# Extrator de PDF

MVP interno para enviar um PDF, extrair os dados principais do relatorio e exportar uma planilha Excel.

## Rodar

```bash
npm.cmd install
npm.cmd start
```

Abra `http://localhost:3000`.

## Deploy no Render (Free)

1. Suba este projeto para um repositório no GitHub.
2. No Render, clique em `New +` > `Blueprint`.
3. Conecte o repositório e confirme o deploy do arquivo `render.yaml`.
4. Aguarde o build e abra a URL gerada pelo Render.

Notas:
- O plano free pode entrar em sleep quando fica sem uso.
- No primeiro acesso apos sleep, pode demorar alguns segundos para responder.

## Campos extraidos neste primeiro modelo

- Pagina do PDF
- Numero do documento (`CONHECIMENTO`)
- ID da viagem
- Data do cadastro
- Data do embarque
- Placa
- Valor do frete (`Total das Parcelas`)
- Valor do adiantamento (`Tipo = ADT`)
- Valor do saldo (`Tipo = SDO`)
- Valor do pedagio
- Valor total da viagem

## Observacao

Este parser foi ajustado para o layout do PDF `Detalhado de Transacao - CNPJ`.
Agora a exportacao pode sair em uma unica aba, separada por pagina ou separada por documento.
