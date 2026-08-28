'use strict';

const fs = require('fs');

// Parser leve, sem dependência nova (regex determinístico) — a LP real é uma página bem
// formada, sem <section> aninhada dentro de <section> (confirmado por leitura manual do HTML
// real em teste-b/index.html), então dividir por <section>...</section> é seguro. NUNCA
// modifica o arquivo — só lê.
function stripTags(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractCtaTexts(html) {
  const links = [...html.matchAll(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)];
  return links.map((m) => ({ href: m[1], text: stripTags(m[2]) })).filter((c) => c.text);
}

function extractPriceMentions(html) {
  const matches = [...html.matchAll(/R\$\s*[\d.,]+/g)];
  return [...new Set(matches.map((m) => m[0].replace(/\s+/g, ' ')))];
}

function extractHeading(html) {
  const m = html.match(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/);
  return m ? { level: `H${m[1]}`, text: stripTags(m[2]) } : null;
}

function parseSections(html) {
  const sectionRegex = /<section([^>]*)>([\s\S]*?)<\/section>/g;
  const sections = [];
  let m;
  let order = 0;
  while ((m = sectionRegex.exec(html))) {
    order += 1;
    const attrs = m[1];
    const inner = m[2];
    const idMatch = attrs.match(/id="([^"]*)"/);
    const heading = extractHeading(inner);
    sections.push({
      order,
      id: idMatch ? idMatch[1] : null,
      heading_level: heading ? heading.level : null,
      heading_text: heading ? heading.text : null,
      cta_texts: extractCtaTexts(inner),
      price_mentions: extractPriceMentions(inner),
      guarantee_mentioned: /garantia/i.test(inner),
      raw_char_length: inner.length,
    });
  }
  return sections;
}

function extractFaqQuestions(html) {
  // Perguntas do FAQ ficam em botões de accordion — texto do botão é a pergunta; o conteúdo da
  // resposta (a <div> associada) pode estar vazio no HTML estático (hidratado via JS) — isso é
  // documentado explicitamente, nunca escondido.
  const buttons = [...html.matchAll(/<button[^>]*aria-expanded="false"[^>]*>([\s\S]*?)<\/button>/g)];
  return buttons.map((m) => stripTags(m[1])).filter(Boolean);
}

function findDuplicateIds(html) {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const counts = {};
  for (const id of ids) counts[id] = (counts[id] || 0) + 1;
  return Object.entries(counts).filter(([, c]) => c > 1).map(([id, c]) => ({ id, occurrences: c }));
}

function parseLandingPageHtml(html) {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/);
  const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/);
  const stickyBarMatch = html.match(/<body>[\s\S]*?<div class="sticky[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  const footerMatch = html.match(/<footer[^>]*>([\s\S]*?)<\/footer>/);
  const checkoutLinks = [...new Set([...html.matchAll(/href="(https:\/\/pay\.hotmart\.com[^"]*)"/g)].map((m) => m[1]))];

  return {
    title: titleMatch ? stripTags(titleMatch[1]) : null,
    meta_description: descMatch ? descMatch[1] : null,
    sticky_bar_text: stickyBarMatch ? stripTags(stickyBarMatch[1]) : null,
    sections: parseSections(html),
    faq_questions: extractFaqQuestions(html),
    checkout_links: checkoutLinks,
    duplicate_ids: findDuplicateIds(html),
    footer_text: footerMatch ? stripTags(footerMatch[1]) : null,
    raw_byte_length: html.length,
  };
}

function readAndParseLandingPage(filePath) {
  if (!fs.existsSync(filePath)) {
    return { found: false, reason: `Arquivo não encontrado: ${filePath}` };
  }
  const html = fs.readFileSync(filePath, 'utf8');
  return { found: true, ...parseLandingPageHtml(html) };
}

module.exports = { parseLandingPageHtml, readAndParseLandingPage, stripTags, extractCtaTexts, extractPriceMentions, extractFaqQuestions, findDuplicateIds };
