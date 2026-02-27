const BAD_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'dick', 'cunt', 'nigger', 'nigga', 
  'faggot', 'slut', 'whore', 'cock', 'pussy', 'porn', 'sex', 'rape', 'kys', 'retard'
];

export function isNameAppropriate(name: string): { valid: boolean; error?: string } {
  if (!name) return { valid: false, error: "Name cannot be empty" };
  const trimmed = name.trim();
  if (trimmed.length < 3) return { valid: false, error: "Name must be at least 3 characters" };
  if (trimmed.length > 12) return { valid: false, error: "Name must be under 12 characters" };
  if (!/^[a-zA-Z0-9_ ]+$/.test(trimmed)) return { valid: false, error: "Only letters, numbers, and spaces allowed" };
  
  // Normalize leetspeak and symbols for checking
  let normalized = trimmed.toLowerCase()
    .replace(/@/g, 'a')
    .replace(/4/g, 'a')
    .replace(/1/g, 'i')
    .replace(/!/g, 'i')
    .replace(/0/g, 'o')
    .replace(/\$/g, 's')
    .replace(/5/g, 's')
    .replace(/3/g, 'e')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/[^a-z0-9]/g, '');

  for (const word of BAD_WORDS) {
    if (normalized.includes(word)) {
      return { valid: false, error: "Inappropriate name detected" };
    }
  }
  return { valid: true };
}
