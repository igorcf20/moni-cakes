export interface Country {
  code: string;
  name: string;
  dial: string;
  flag: string;
  format: string;
  maxDigits: number;
}

export const COUNTRIES: Country[] = [
  { code: "PT", name: "Portugal", dial: "+351", flag: "🇵🇹", format: "000 000 000", maxDigits: 9 },
  { code: "ES", name: "Espanha", dial: "+34", flag: "🇪🇸", format: "000 000 000", maxDigits: 9 },
  { code: "FR", name: "França", dial: "+33", flag: "🇫🇷", format: "0 00 00 00 00", maxDigits: 9 },
  { code: "GB", name: "Reino Unido", dial: "+44", flag: "🇬🇧", format: "00000 000000", maxDigits: 10 },
  { code: "DE", name: "Alemanha", dial: "+49", flag: "🇩🇪", format: "000 0000000", maxDigits: 10 },
  { code: "IT", name: "Itália", dial: "+39", flag: "🇮🇹", format: "000 0000000", maxDigits: 10 },
  { code: "NL", name: "Países Baixos", dial: "+31", flag: "🇳🇱", format: "00 0000 0000", maxDigits: 9 },
  { code: "BE", name: "Bélgica", dial: "+32", flag: "🇧🇪", format: "000 00 00 00", maxDigits: 9 },
  { code: "LU", name: "Luxemburgo", dial: "+352", flag: "🇱🇺", format: "000 000 000", maxDigits: 9 },
  { code: "CH", name: "Suíça", dial: "+41", flag: "🇨🇭", format: "00 000 00 00", maxDigits: 9 },
  { code: "US", name: "Estados Unidos", dial: "+1", flag: "🇺🇸", format: "(000) 000-0000", maxDigits: 10 },
];

export const getCountryByName = (name: string) => COUNTRIES.find(c => c.name === name);
export const getCountryByCode = (code: string) => COUNTRIES.find(c => c.code === code);
export const getCountryName = (code: string) => getCountryByCode(code)?.name || code;

// Distritos de Portugal (continente + Madeira + Açores)
export const PT_DISTRICTS: { code: string; name: string }[] = [
  { code: "AVR", name: "Aveiro" },
  { code: "BJA", name: "Beja" },
  { code: "BRG", name: "Braga" },
  { code: "BGC", name: "Bragança" },
  { code: "CBR", name: "Castelo Branco" },
  { code: "CBR2", name: "Coimbra" },
  { code: "EVR", name: "Évora" },
  { code: "FAR", name: "Faro" },
  { code: "GRD", name: "Guarda" },
  { code: "LRA", name: "Leiria" },
  { code: "LSB", name: "Lisboa" },
  { code: "PTG", name: "Portalegre" },
  { code: "PRT", name: "Porto" },
  { code: "STR", name: "Santarém" },
  { code: "STB", name: "Setúbal" },
  { code: "VCT", name: "Viana do Castelo" },
  { code: "VRL", name: "Vila Real" },
  { code: "VSU", name: "Viseu" },
  { code: "ACR", name: "Açores" },
  { code: "MDR", name: "Madeira" },
];
