import type { Lang } from "./domain/catalogue";

export const LANGS: Lang[] = ["fr", "en", "es", "pt"];
export const LANG_LABELS: Record<Lang, string> = { fr: "Français", en: "English", es: "Español", pt: "Português" };

const fr = {
  title: "Essayage de coiffes et capes Dofus",
  subtitle: "Essayez les coiffes et les capes de Dofus devant votre webcam.",
  startCamera: "Activer la caméra",
  privacy: "Tout se passe dans votre navigateur : aucune image ne quitte votre appareil.",
  loading: "Chargement du suivi du visage…",
  noFace: "Placez votre visage face à la caméra",
  cameraDenied: "Accès à la caméra refusé. Autorisez-le dans votre navigateur puis rechargez la page.",
  cameraUnavailable: "Aucune caméra disponible.",
  trackerFailed: "Le suivi du visage n'a pas pu démarrer sur ce navigateur.",
  chooseTenue: "Composez votre tenue",
  coiffe: "Coiffe",
  cape: "Cape",
  ailes: "Ailes",
  epaulieres: "Épaulières",
  costume: "Costume",
  none: "Aucune",
  search: "Rechercher par nom…",
  count: "{n} objets",
  countOne: "1 objet",
  noResults: "Aucun objet ne correspond à la recherche.",
  adjust: "Ajuster la position",
  adjustHint: "Si un objet tombe mal, réglez-le ici : glissez-le sur l'image, molette pour la taille. La vue de face et la vue de 3/4 se règlent à part. Vos réglages restent dans ce navigateur.",
  size: "Taille",
  horizontal: "Horizontal",
  vertical: "Vertical",
  freeze: "Figer l'image",
  resume: "Reprendre la vidéo",
  resetView: "Réinitialiser",
  viewFace: "vue de face",
  view34: "vue de 3/4",
  adjusted: "réglé par vous",
  waiting: "en attente de détection",
  loadingBody: "Chargement du suivi des épaules…",
  noBody: "Reculez un peu pour que vos épaules soient visibles",
  takePhoto: "Prendre une photo",
  countdown: "Compte à rebours (3 s)",
  language: "Langue",
  disclaimer: "Fansite non officiel. Dofus est une marque d'Ankama. Aucune image ne quitte votre appareil.",
  photoFile: "dofus",
};

export type Strings = typeof fr;

const STRINGS: Record<Lang, Strings> = {
  fr,
  en: {
    title: "Dofus hat & cape try-on",
    subtitle: "Try on Dofus hats and capes in front of your webcam.",
    startCamera: "Turn on camera",
    privacy: "Everything runs in your browser: no image ever leaves your device.",
    loading: "Loading face tracking…",
    noFace: "Face the camera",
    cameraDenied: "Camera access was denied. Allow it in your browser, then reload the page.",
    cameraUnavailable: "No camera available.",
    trackerFailed: "Face tracking couldn't start in this browser.",
    chooseTenue: "Build your outfit",
    coiffe: "Hat",
    cape: "Cape",
    ailes: "Wings",
    epaulieres: "Shoulder pads",
    costume: "Costume",
    none: "None",
    search: "Search by name…",
    count: "{n} items",
    countOne: "1 item",
    noResults: "No item matches your search.",
    adjust: "Adjust the fit",
    adjustHint: "If an item sits wrong, fix it here: drag it on the image, scroll to resize. The front and 3/4 views are set separately. Your settings stay in this browser.",
    size: "Size",
    horizontal: "Horizontal",
    vertical: "Vertical",
    freeze: "Freeze frame",
    resume: "Resume video",
    resetView: "Reset",
    viewFace: "front view",
    view34: "3/4 view",
    adjusted: "adjusted by you",
    waiting: "waiting for detection",
    loadingBody: "Loading shoulder tracking…",
    noBody: "Step back a little so your shoulders are visible",
    takePhoto: "Take a photo",
    countdown: "Countdown (3 s)",
    language: "Language",
    disclaimer: "Unofficial fansite. Dofus is a trademark of Ankama. No image ever leaves your device.",
    photoFile: "dofus",
  },
  es: {
    title: "Probador de sombreros y capas Dofus",
    subtitle: "Pruébate los sombreros y las capas de Dofus delante de tu webcam.",
    startCamera: "Activar la cámara",
    privacy: "Todo ocurre en tu navegador: ninguna imagen sale de tu dispositivo.",
    loading: "Cargando el seguimiento facial…",
    noFace: "Coloca tu cara frente a la cámara",
    cameraDenied: "Se denegó el acceso a la cámara. Permítelo en tu navegador y recarga la página.",
    cameraUnavailable: "No hay ninguna cámara disponible.",
    trackerFailed: "El seguimiento facial no pudo iniciarse en este navegador.",
    chooseTenue: "Crea tu conjunto",
    coiffe: "Sombrero",
    cape: "Capa",
    ailes: "Alas",
    epaulieres: "Hombreras",
    costume: "Disfraz",
    none: "Ninguno",
    search: "Buscar por nombre…",
    count: "{n} objetos",
    countOne: "1 objeto",
    noResults: "Ningún objeto coincide con la búsqueda.",
    adjust: "Ajustar la posición",
    adjustHint: "Si un objeto queda mal, ajústalo aquí: arrástralo sobre la imagen y usa la rueda para el tamaño. La vista de frente y la de 3/4 se ajustan por separado. Tus ajustes se quedan en este navegador.",
    size: "Tamaño",
    horizontal: "Horizontal",
    vertical: "Vertical",
    freeze: "Congelar imagen",
    resume: "Reanudar vídeo",
    resetView: "Restablecer",
    viewFace: "vista de frente",
    view34: "vista de 3/4",
    adjusted: "ajustado por ti",
    waiting: "esperando la detección",
    loadingBody: "Cargando el seguimiento de los hombros…",
    noBody: "Aléjate un poco para que se vean tus hombros",
    takePhoto: "Hacer una foto",
    countdown: "Cuenta atrás (3 s)",
    language: "Idioma",
    disclaimer: "Fansite no oficial. Dofus es una marca de Ankama. Ninguna imagen sale de tu dispositivo.",
    photoFile: "dofus",
  },
  pt: {
    title: "Provador de chapéus e capas Dofus",
    subtitle: "Experimente os chapéus e as capas de Dofus na frente da sua webcam.",
    startCamera: "Ativar a câmera",
    privacy: "Tudo acontece no seu navegador: nenhuma imagem sai do seu dispositivo.",
    loading: "Carregando o rastreamento facial…",
    noFace: "Posicione o rosto de frente para a câmera",
    cameraDenied: "O acesso à câmera foi negado. Autorize-o no navegador e recarregue a página.",
    cameraUnavailable: "Nenhuma câmera disponível.",
    trackerFailed: "O rastreamento facial não pôde iniciar neste navegador.",
    chooseTenue: "Monte seu visual",
    coiffe: "Chapéu",
    cape: "Capa",
    ailes: "Asas",
    epaulieres: "Ombreiras",
    costume: "Fantasia",
    none: "Nenhum",
    search: "Buscar pelo nome…",
    count: "{n} itens",
    countOne: "1 item",
    noResults: "Nenhum item corresponde à busca.",
    adjust: "Ajustar a posição",
    adjustHint: "Se um item ficar torto, ajuste-o aqui: arraste-o na imagem e use a roda do mouse para o tamanho. A vista de frente e a de 3/4 são ajustadas à parte. Seus ajustes ficam neste navegador.",
    size: "Tamanho",
    horizontal: "Horizontal",
    vertical: "Vertical",
    freeze: "Congelar imagem",
    resume: "Retomar vídeo",
    resetView: "Redefinir",
    viewFace: "vista de frente",
    view34: "vista de 3/4",
    adjusted: "ajustado por você",
    waiting: "aguardando detecção",
    loadingBody: "Carregando o rastreamento dos ombros…",
    noBody: "Afaste-se um pouco para que seus ombros apareçam",
    takePhoto: "Tirar uma foto",
    countdown: "Contagem regressiva (3 s)",
    language: "Idioma",
    disclaimer: "Fansite não oficial. Dofus é uma marca da Ankama. Nenhuma imagem sai do seu dispositivo.",
    photoFile: "dofus",
  },
};

const STORAGE_KEY = "dofus-try-on.lang";

/** Picks the saved language, else the first browser language we support, else French. */
export function detectLang(saved: string | null, browserLangs: readonly string[]): Lang {
  if (saved && (LANGS as string[]).includes(saved)) return saved as Lang;
  for (const l of browserLangs) {
    const base = l.toLowerCase().split("-")[0];
    if ((LANGS as string[]).includes(base)) return base as Lang;
  }
  return "fr";
}

export function initialLang(): Lang {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // storage blocked: fall back to the browser language
  }
  return detectLang(saved, navigator.languages ?? [navigator.language]);
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // not critical
  }
}

export function t(lang: Lang): Strings {
  return STRINGS[lang];
}
