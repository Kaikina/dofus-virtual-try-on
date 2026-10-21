import { describe, expect, it } from "vitest";
import { ailes, capes, coiffes, epaulieres, filtrer, peutVider, porteSurLeCorps, tenueVide } from "./domain/catalogue";
import { detectLang } from "./i18n";
import { photoFileName, slugify } from "./photo";

describe("detectLang", () => {
  it("prefers the saved language", () => {
    expect(detectLang("pt", ["en-US"])).toBe("pt");
  });
  it("falls back to the first supported browser language", () => {
    expect(detectLang(null, ["de-DE", "es-ES", "en"])).toBe("es");
  });
  it("defaults to French", () => {
    expect(detectLang("xx", ["de"])).toBe("fr");
  });
});

describe("photo file names", () => {
  it("slugifies accented hat names", () => {
    expect(slugify("Coiffe Séculaire")).toBe("coiffe-seculaire");
    expect(slugify("Chapéu do Papatudo")).toBe("chapeu-do-papatudo");
  });
  it("adds a timestamp", () => {
    expect(photoFileName("dofus", ["Solomonk"], new Date(2026, 9, 15, 9, 5, 7))).toBe("dofus-solomonk-20261015-090507.png");
    expect(photoFileName("dofus", ["Solomonk", "Cape Bouffante"], new Date(2026, 9, 15, 9, 5, 7))).toBe("dofus-solomonk-cape-bouffante-20261015-090507.png");
  });
});

describe("peutVider", () => {
  const coiffe = coiffes[0], cape = capes[0], aile = ailes[0];
  it("lets an Emplacement be emptied only while another one stays filled", () => {
    expect(peutVider({ ...tenueVide(), coiffe, cape }, "coiffe")).toBe(true);
    expect(peutVider({ ...tenueVide(), coiffe }, "coiffe")).toBe(false);
    expect(peutVider({ ...tenueVide(), ailes: aile }, "ailes")).toBe(false);
    expect(peutVider({ ...tenueVide(), cape, ailes: aile }, "cape")).toBe(true);
  });
  it("knows when something is placed on the body", () => {
    expect(porteSurLeCorps({ ...tenueVide(), coiffe })).toBe(false);
    expect(porteSurLeCorps({ ...tenueVide(), ailes: aile })).toBe(true);
    expect(porteSurLeCorps({ ...tenueVide(), epaulieres: epaulieres[0] })).toBe(true);
  });
});

describe("filtrer", () => {
  const items = [
    { names: { fr: "Coiffe Séculaire", en: "Secular Hat", es: "x", pt: "x" } },
    { names: { fr: "Coiffe du Bouftou", en: "Gobball Headgear", es: "x", pt: "x" } },
    { names: { fr: "Cape Bouffante", en: "Fluffy Cape", es: "x", pt: "x" } },
  ];
  it("matches every word, ignoring case and accents, in the chosen language", () => {
    expect(filtrer(items, "seculaire", "fr").map(i => i.names.fr)).toEqual(["Coiffe Séculaire"]);
    expect(filtrer(items, "BOUF coiffe", "fr").map(i => i.names.fr)).toEqual(["Coiffe du Bouftou"]);
    expect(filtrer(items, "gobball", "en")).toHaveLength(1);
    expect(filtrer(items, "gobball", "fr")).toHaveLength(0);
  });
  it("keeps everything for an empty query", () => {
    expect(filtrer(items, "  ", "fr")).toHaveLength(3);
  });
});
