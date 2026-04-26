// Administrative reference data and form vocabularies.
// District list seeded for a single region pilot — replace or extend with
// the districts your deployment serves.

export const DEFAULT_CENTER: [number, number] = [78.6569, 11.1271]; // [lng, lat]
export const DEFAULT_BOUNDS: [[number, number], [number, number]] = [
  [76.2, 8.0],
  [80.4, 13.6],
];

export const DISTRICTS = [
  "Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore",
  "Dharmapuri", "Dindigul", "Erode", "Kallakurichi", "Kancheepuram",
  "Kanyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai",
  "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai",
  "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", "Tenkasi",
  "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli",
  "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur",
  "Vellore", "Viluppuram", "Virudhunagar",
] as const;

export const RESTRICTION_TYPES: Array<{
  value: string;
  label: string;
}> = [
  { value: "reserved_forest", label: "Reserved Forest" },
  { value: "water_body", label: "Water body / Tank / River" },
  { value: "government_poromboke", label: "Government Poromboke" },
  { value: "temple_land", label: "Temple / Endowment land" },
  { value: "archaeological", label: "Archaeological zone" },
  { value: "coastal_regulation_zone", label: "Coastal Regulation Zone (CRZ)" },
  { value: "highway_setback", label: "Highway / Railway setback" },
  { value: "other", label: "Other" },
];
