# Apuracao presidencial 2026

Painel em React, TypeScript e Vite para acompanhar votos, percentuais e a evolucao da vantagem entre candidatos no segundo turno presidencial de 2026.

## Executar

Requer Node.js 20.19+ e npm.

```sh
npm install
npm run dev
```

Abra a URL informada no terminal, normalmente http://localhost:5173.

## Historico JSON

- **Baixar historico JSON** exporta todos os registros disponiveis, com votos, percentuais, horarios e metadados.
- **Carregar JSON** abre esse mesmo arquivo em outra execucao local, exibindo o grafico e a timeline sem consultar a fonte nem substituir o historico ao vivo.
- **Voltar ao vivo** retoma as consultas. O arquivo importado vale para a sessao atual; para consulta-lo novamente, basta carrega-lo outra vez.

O historico ao vivo fica no navegador, limitado a 500 atualizacoes. A coleta ocorre a cada 30 segundos com a pagina aberta. Registros anteriores a coleta ou ja descartados nao podem ser recuperados pelo painel. O JSON baixado nao e incluido automaticamente nos commits.

## Verificar

```sh
npm test
npm run build
npm run preview
```

## Fonte e publicacao

Os dados vem do [endpoint informado](https://djwnrcncpvp8z.cloudfront.net/oficial/2026/2t/historical/br/presidente.json). Horarios em America/Sao_Paulo. Lideranca nao representa vitoria oficial; o painel nao faz projecoes.

O build gera `dist/`. A leitura de arquivos JSON e local e nao depende da API; fotos e fontes visuais externas ainda dependem de conexao. O proxy CORS funciona apenas com `npm run dev`: consultas ao vivo no preview ou em hospedagem estatica exigem permissao CORS da fonte ou um proxy de producao.