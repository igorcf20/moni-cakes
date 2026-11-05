// Document types by country
export interface DocumentType {
  code: string;
  label: string;
  country: string;
  mask: string;
  maxDigits: number;
  placeholder: string;
}

export const DOCUMENT_TYPES: DocumentType[] = [
  // Portugal
  { code: "nif", label: "NIF (Contribuinte)", country: "PT", mask: "000 000 000", maxDigits: 9, placeholder: "123 456 789" },
  { code: "nipc", label: "NIPC (Empresa)", country: "PT", mask: "000 000 000", maxDigits: 9, placeholder: "500 123 456" },
  { code: "cc", label: "Cartão de Cidadão", country: "PT", mask: "00000000 0 AA0", maxDigits: 12, placeholder: "12345678 9 ZZ0" },
  // Espanha
  { code: "nie", label: "NIE", country: "ES", mask: "A-0000000-A", maxDigits: 9, placeholder: "X-1234567-A" },
  { code: "dni_es", label: "DNI", country: "ES", mask: "00000000-A", maxDigits: 9, placeholder: "12345678-A" },
  // França
  { code: "siret", label: "SIRET", country: "FR", mask: "000 000 000 00000", maxDigits: 14, placeholder: "123 456 789 00012" },
  // UK
  { code: "ni", label: "National Insurance", country: "GB", mask: "AA 00 00 00 A", maxDigits: 9, placeholder: "AB 12 34 56 C" },
  // Genérico
  { code: "tax_id", label: "Tax ID", country: "*", mask: "", maxDigits: 20, placeholder: "Tax ID" },
];

export const getDocumentTypesForCountry = (countryCode: string): DocumentType[] => {
  const countryDocs = DOCUMENT_TYPES.filter(d => d.country === countryCode);
  if (countryDocs.length === 0) return DOCUMENT_TYPES.filter(d => d.country === "*");
  return countryDocs;
};

export const getDocumentType = (code: string): DocumentType | undefined =>
  DOCUMENT_TYPES.find(d => d.code === code);

export const formatDocument = (value: string, docType: string): string => {
  const digits = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  
  switch (docType) {
    case "nif":
    case "nipc": {
      const nums = digits.replace(/\D/g, "").slice(0, 9);
      if (nums.length <= 3) return nums;
      if (nums.length <= 6) return `${nums.slice(0, 3)} ${nums.slice(3)}`;
      return `${nums.slice(0, 3)} ${nums.slice(3, 6)} ${nums.slice(6, 9)}`;
    }
    case "cc": return digits.slice(0, 12);
    case "nie":
    case "dni_es": return digits.slice(0, 9);
    default: return digits.slice(0, 20);
  }
};
