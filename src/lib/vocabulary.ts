/**
 * Transcription vocabularies: domain terms the speech-to-text provider should
 * recognize, chosen per submission. Without them the model guesses at proper
 * nouns it rarely hears — Catholic meditations came back with "São José Maria"
 * for "São Josemaria", and "nosso padre" for "nosso Padre".
 *
 * Both go to stt (pipeline/stt.ts), which runs the configured provider.
 *
 * `keyterms` becomes stt's terms file, one term per line, so a term may contain
 * commas. Soniox takes the whole list; AssemblyAI, still selectable in stt's
 * config, drops terms over 6 words and its Universal-2 fallback uses only the
 * first 200. Keep every list under 200 terms of at most 6 words so either
 * provider gets all of it.
 *
 * `customSpelling` becomes stt's spellings file: a rewrite stt applies to the
 * finished transcript whatever the provider. A `from` form matches as a whole
 * word regardless of case, the longest form wins, and `to` may be several words.
 */
export interface Vocabulary {
  label: string;
  keyterms: string[];
  customSpelling: { from: string[]; to: string }[];
}

export const VOCABULARIES = {
  catolico: {
    label: "Catholic (Opus Dei)",
    keyterms: [
      // St. Josemaría, the Work and its people and places
      "Josemaria", "São Josemaria", "Josemaria Escrivá", "Escrivá", "Opus Dei", "a Obra",
      "Álvaro del Portillo", "Beato Álvaro", "Javier Echevarría", "Fernando Ocáriz",
      "Isidoro Zorzano", "Guadalupe Ortiz de Landázuri", "Montse Grases", "Dora del Hoyo",
      "Ernesto Cofiño", "Toni Zweifel", "Dolores Albás", "Barbastro", "Logroño", "Torreciudad",
      "Villa Tevere", "Cuatro Caminos", "Universidade de Navarra", "Pamplona", "Burgos",
      "Prelazia", "Prelado", "Padre", "numerário", "numerária", "supernumerário",
      "supernumerária", "agregado", "agregada", "numerária auxiliar", "cooperador",
      "Sociedade Sacerdotal da Santa Cruz",
      // Means of formation and the plan of life
      "círculo", "recolhimento", "retiro", "convivência", "conversa fraterna", "confidência",
      "direção espiritual", "plano de vida", "normas de piedade", "oração mental", "Preces",
      "exame de consciência", "leitura espiritual", "Angelus", "Regina Coeli", "jaculatória",
      "mortificação", "filiação divina", "unidade de vida", "santificação do trabalho",
      "contemplativos no meio do mundo", "apostolado", "proselitismo",
      "apostolado de amizade e confidência",
      // His books
      "Caminho", "Sulco", "Forja", "É Cristo que passa", "Amigos de Deus", "Amar a Igreja",
      "Via Sacra", "Santo Rosário", "Em Diálogo com o Senhor", "Cartas",
      // Latin he and his priests quote
      "operatio Dei", "Deo omnis gloria", "Omnes cum Petro", "Serviam", "Possumus",
      "In laetitia", "ipse Christus", "alter Christus", "Duc in altum",
      "Ure igne Sancti Spiritus", "Cor Mariae dulcissimum, iter para tutum",
      "Sancta Maria, Stella Orientis", "Abba, Pater", "Domine, ut videam", "Ecce ancilla Domini",
      "Fiat", "Magnificat", "Te Deum", "Veni Creator", "Vultum tuum, Domine, requiram",
      "Iesus Christus heri et hodie",
      // Liturgy, mysteries, Gospel places and people
      "Sacrário", "Santíssimo Sacramento", "Eucaristia", "Comunhão", "Consagração", "Ofertório",
      "Paráclito", "Espírito Santo", "Santíssima Trindade", "Encarnação", "Ressurreição",
      "Ascensão", "Pentecostes", "Quaresma", "Advento", "Tríduo Pascal", "Epifania",
      "Anunciação", "Visitação", "Assunção", "Imaculada Conceição", "Nossa Senhora",
      "Virgem Maria", "São José", "Sagrada Família", "Nazaré", "Belém", "Betânia", "Getsêmani",
      "Calvário", "Emaús", "Cafarnaum", "Lázaro", "Zaqueu", "Bartimeu", "Nicodemos",
      // Saints, Church, ascetical vocabulary
      "Santo Agostinho", "Santa Teresa", "São João da Cruz", "Santo Tomás de Aquino",
      "São Francisco de Sales", "Santa Teresinha", "Cura d'Ars", "Catecismo", "Magistério",
      "Concílio Vaticano II", "encíclica", "Leão XIV", "Bento XVI", "João Paulo II", "Paulo VI",
      "beatificação", "canonização", "tibieza", "contrição", "penitência", "indulgência",
      "purgatório", "novíssimos", "graça santificante", "virtudes teologais", "magnanimidade",
      "soberba", "concupiscência", "ascética", "Anjo da Guarda", "comunhão dos santos",
      "Evangelho", "Epístola", "homilia", "sacerdote", "oratório", "capelão",
      // Preachers whose meditations are in the library
      "Francisco Faus", "Padre Faus", "Pedro Willemsens", "Milton Ferreroni", "Augusto Dantas",
    ],
    customSpelling: [
      { from: ["José Maria", "Jose Maria", "Josemaría", "Jose Maria Escriva"], to: "Josemaria" },
      { from: ["Escriva"], to: "Escrivá" },
    ],
  },
} satisfies Record<string, Vocabulary>;

export type VocabularyName = keyof typeof VOCABULARIES;

export function isVocabularyName(value: unknown): value is VocabularyName {
  return typeof value === "string" && Object.hasOwn(VOCABULARIES, value);
}

/** Choices for a picker, in declaration order. */
export const VOCABULARY_OPTIONS = (
  Object.entries(VOCABULARIES) as [VocabularyName, Vocabulary][]
).map(([name, v]) => ({ name, label: v.label }));
