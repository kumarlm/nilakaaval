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

// Approximate geographic centers [lng, lat] for each Tamil Nadu district.
export const DISTRICT_CENTERS: Record<string, [number, number]> = {
  "Ariyalur":         [79.0788, 11.1418],
  "Chengalpattu":     [79.9800, 12.6921],
  "Chennai":          [80.2707, 13.0827],
  "Coimbatore":       [76.9558, 11.0168],
  "Cuddalore":        [79.7567, 11.7480],
  "Dharmapuri":       [78.1582, 12.1280],
  "Dindigul":         [77.9803, 10.3673],
  "Erode":            [77.7172, 11.3410],
  "Kallakurichi":     [79.0000, 11.7386],
  "Kancheepuram":     [79.7036, 12.8317],
  "Kanyakumari":      [77.5385,  8.0883],
  "Karur":            [78.0767, 10.9601],
  "Krishnagiri":      [78.2137, 12.5266],
  "Madurai":          [78.1198,  9.9252],
  "Mayiladuthurai":   [79.6463, 11.1034],
  "Nagapattinam":     [79.8445, 10.7672],
  "Namakkal":         [78.1674, 11.2189],
  "Nilgiris":         [76.7337, 11.4902],
  "Perambalur":       [78.8799, 11.2333],
  "Pudukkottai":      [78.8008, 10.3797],
  "Ramanathapuram":   [78.8308,  9.3710],
  "Ranipet":          [79.3330, 12.9229],
  "Salem":            [78.1460, 11.6643],
  "Sivaganga":        [78.4833,  9.8474],
  "Tenkasi":          [77.3154,  8.9598],
  "Thanjavur":        [79.1441, 10.7870],
  "Theni":            [77.4760,  9.9900],
  "Thoothukudi":      [78.1348,  8.7642],
  "Tiruchirappalli":  [78.7047, 10.7905],
  "Tirunelveli":      [77.7567,  8.7139],
  "Tirupathur":       [78.5678, 12.4942],
  "Tiruppur":         [77.3411, 11.1085],
  "Tiruvallur":       [79.9093, 13.1431],
  "Tiruvannamalai":   [79.0747, 12.2253],
  "Tiruvarur":        [79.6332, 10.7723],
  "Vellore":          [79.1325, 12.9165],
  "Viluppuram":       [79.4870, 11.9395],
  "Virudhunagar":     [77.9579,  9.5851],
};

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
