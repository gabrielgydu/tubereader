/**
 * Transcription vocabularies: domain terms AssemblyAI should recognize, chosen
 * per submission. Without them the model guesses at proper nouns it rarely
 * hears — Catholic meditations came back with "São José Maria" for
 * "São Josemaria", and "nosso padre" for "nosso Padre".
 *
 * `keyterms` goes to `keyterms_prompt`: Universal-3.5 Pro takes up to 1,000
 * terms, the Universal-2 fallback only 200, each at most 6 words. Keep every
 * list under 200 so a fallback never rejects the request.
 *
 * `customSpelling` goes to `custom_spelling`: an exact rewrite applied after
 * recognition. AssemblyAI requires each `to` to be a single word.
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
