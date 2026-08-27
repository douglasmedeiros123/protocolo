# Analytics — Data Agent

Camada de persistência histórica e normalização de dados do negócio (Protocolo da Resposta
Garantida / campanha "Low - Follow"). Substitui as análises manuais e temporárias feitas em
sessões de conversa por uma coleta reexecutável, com histórico versionado no Git.

**Escopo desta etapa (ver `analytics/README.md` no PR original para o plano completo):** só
coleta, normalização, métricas determinísticas e verificação de qualidade de dado. Nenhuma
automação recorrente (cron), nenhum dashboard, nenhuma ação sobre campanha/oferta/checkout.
Isso é proposital — ver `AVISOS` no fim deste documento.

## Arquitetura

```
analytics/
  data/
    raw/{source}/{date}.json          <- resposta bruta de cada API, redigida de segredos
    normalized/{source}/{date}.json   <- schema normalizado por fonte
    daily/{date}.json                 <- snapshot final do dia (tudo junto + métricas + flags)
  src/
    collectors/    <- 1 arquivo por fonte externa (chama a API, devolve raw)
    normalizers/   <- raw -> schema normalizado (sem opinião, só transformação determinística)
    metrics/       <- normalizado -> métrica calculada (fórmula pura, sem IA)
    utils/         <- datas (BRT), fs, redação de segredo
    collect.js     <- orquestrador / CLI
  config/
    env.js         <- valida variáveis de ambiente necessárias por fonte (nunca contém segredo)
    product.js      <- config de produto (ticket, nomes, compradores de teste conhecidos)
  tests/           <- node:test, sem dependência externa
```

Fluxo por dia: `collector → normalizer → metrics → dataQuality → daily snapshot (escrito em disco)`.

## Fontes de dados

| Fonte | Nível de dado | Limitação real conhecida |
|---|---|---|
| **Meta Ads** | por anúncio (campanha/conjunto/criativo), por dia | nenhuma conhecida além do rate limit padrão da Graph API |
| **Hotmart** | transação individual, por dia | a consulta "sem filtro" não traz REFUNDED/CANCELLED/EXPIRED — o collector já pede os 4 status separadamente e deduplica por `transaction_id` |
| **Microsoft Clarity** | agregado da conta, sem granularidade por anúncio | **a API só cobre os últimos 1-3 dias a partir de HOJE** — não existe parâmetro de data histórica. Por isso `collectClarity(date)` só coleta de verdade quando `date === hoje`; qualquer outra data recebe `available: false` explicitamente (nunca inventamos o dado). Limite de 10 chamadas/dia/projeto — o collector faz só 1 chamada por execução. |
| **GitHub (histórico de LP)** | commit individual, por dia | filtra automaticamente commits de ruído do autopost (`autopost`, `migra calendario`, `stage carousel/test`) |

## Schema normalizado (resumo)

Cada `daily/{date}.json` contém:

- `meta.by_ad[]` — uma linha por anúncio: campanha, conjunto, criativo, gasto, impressões, cliques, LPV, checkout, compra_meta, receita_meta
- `meta.totals` — soma do dia inteiro
- `hotmart.transactions[]` — uma linha por transação real (produto, status, valor bruto, taxa real da Hotmart, valor líquido, se é order bump, se é comprador de teste conhecido)
- `hotmart.totals` — pedidos, order bumps, receita bruta/líquida, reembolsos, cancelamentos
- `clarity` — sessões e comportamento (ou `available:false` com o motivo)
- `github.lp_changes[]` — commits reais de mudança de LP naquele dia
- `metrics.funnel` / `metrics.economics` — ver abaixo
- `tracking_flags[]` — ver Data Quality abaixo

**Limitação importante e deliberada:** não existe join em nível de criativo entre Meta e
Hotmart — a Hotmart não informa qual anúncio gerou qual venda. `metrics.economics` (CPA
financeiro, ROAS financeiro, AOV) é sempre um total do DIA inteiro, nunca por criativo. Um
"Offer/Attribution Agent" futuro precisaria de UTM ou outro mecanismo de atribuição pra ir
além disso — não inventamos essa atribuição aqui.

## Métricas calculadas (determinísticas, sem IA)

`metrics/funnel.js`: CTR, CPM, CPC, custo por LPV, taxa LPV→Checkout, taxa Checkout→Compra.

`metrics/economics.js`: CPA Meta (gasto / compras do pixel), CPA Financeiro (gasto / vendas
reais confirmadas na Hotmart), ROAS Meta, ROAS Financeiro, AOV bruto, AOV líquido (usando a
taxa real `hotmart_fee` de cada transação, não uma taxa estimada), receita por visitante
(receita líquida / LPV), taxa de reembolso, taxa de attach de order bump.

Toda divisão passa por `safeDiv()` — denominador 0 sempre vira `null`, nunca `NaN`/`Infinity`.

## Data Quality — `tracking_flags`

Cada flag é `{ code, severity, message, details }`. **Flags nunca corrigem o dado, só
sinalizam** — a decisão de agir fica com quem lê.

| Code | O que detecta |
|---|---|
| `META_PURCHASE_WITHOUT_HOTMART_SALE` | Meta reportou mais compras do que a Hotmart confirma como venda real no dia |
| `SUSPICIOUS_REPEATED_PURCHASE_VALUE` | valor médio de compra da Meta não bate com nenhum valor bruto/líquido real da Hotmart naquele dia |
| `NEGATIVE_OR_IMPOSSIBLE_REVENUE` | receita negativa em qualquer fonte |
| `CPA_INCONSISTENT` | CPA (Meta) e CPA (Financeiro) divergem 3x ou mais |
| `DUPLICATE_TRANSACTION` | `transaction_id` duplicado nos dados normalizados (não deveria acontecer — o collector já deduplica; isso é um cinto-e-suspensório) |
| `SUDDEN_METRIC_CHANGE` | ROAS financeiro ou CPA financeiro mudou 50%+ em relação ao dia anterior persistido |
| `MISSING_DATA` | uma fonte não retornou dado (falha, ou indisponível por limitação conhecida, ex. Clarity fora da janela de 3 dias) |
| `SOURCE_UNAVAILABLE` | uma fonte falhou na coleta (erro de rede/API/env var faltando) — a coleta continua com as outras |

## Como executar

```bash
cd analytics
cp .env.example .env    # preencha com valores reais — NUNCA commite o .env
# no shell, exporte as variáveis do .env, ou use um gerenciador de env de sua preferência
npm test                 # roda a suíte de testes (node:test, sem dependência externa)
node src/collect.js --date 2026-08-27
```

## Backfill

```bash
node src/collect.js --date 2026-08-27
node src/collect.js --from 2026-08-01 --to 2026-08-27
```

Cada execução é **idempotente**: o snapshot do dia (`daily/{date}.json`) é inteiramente
reconstruído a cada rodada a partir de uma nova consulta às APIs, não é um append — rodar duas
vezes no mesmo dia produz o mesmo resultado (ou um resultado atualizado, se os dados na origem
mudaram), nunca duplica venda/gasto/transação. Transações da Hotmart são deduplicadas por
`transaction_id` dentro do próprio collector.

**Aviso sobre Clarity em backfill:** datas fora da janela de hoje-a-hoje sempre voltam com
`clarity.available: false` — isso é o comportamento correto, não um bug (ver limitação acima).

## Variáveis de ambiente necessárias

Ver `.env.example`. Nenhuma tem valor default — a ausência de qualquer uma faz aquela fonte
específica ser pulada (com uma flag `SOURCE_UNAVAILABLE`), não derruba a coleta inteira.

## Interpretando `tracking_flags`

- `severity: "critical"` — o dado do dia tem uma inconsistência que provavelmente invalida uma
  decisão baseada só nele (ex: venda fantasma). Cheque manualmente antes de agir.
- `severity: "warn"` — sinal de algo que merece investigação, mas não necessariamente errado.
- `severity: "info"` — contexto (fonte indisponível por limitação conhecida, mudança normal de métrica).

## AVISOS — fora do escopo desta etapa (deliberadamente)

Não implementado aqui, por instrução explícita: automação via cron/GitHub Actions, dashboard,
qualquer alteração em campanha/landing page/checkout, correção do problema real do valor do
Pixel (documentado, não corrigido), e qualquer outro agente (Creative/CRO/Offer/Experiment/
Risk/Scaling/CEO). Este módulo só lê e persiste — não escreve em nenhum sistema externo.
