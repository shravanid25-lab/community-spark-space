import { toast } from "sonner";

/**
 * Small campus-appropriate profanity filter.
 * Used on every place students can publish text so foul language is rejected
 * before it reaches the database.
 */
const BANNED = [
  "fuck",
  "fuk",
  "fck",
  "shit",
  "bullshit",
  "bitch",
  "bastard",
  "asshole",
  "dickhead",
  "motherfucker",
  "cunt",
  "slut",
  "whore",
  "rape",
  "retard",
  "nigger",
  "nigga",
  "faggot",
  "wanker",
  "prick",
  "cock",
  "pussy",
  "dumbass",
  "jackass",
  "chutiya",
  "chutiye",
  "madarchod",
  "behenchod",
  "bhenchod",
  "bhosdi",
  "bhosdike",
  "gaandu",
  "gandu",
  "randi",
  "harami",
  "kutta",
  "kamina",
  "kamine",
  "lodu",
  "lauda",
];

// Collapse common letter-swaps (l33t speak) and repeated characters.
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[0]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4@]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z]+/g, " ");
}

/** Returns the first banned word found in the supplied values, if any. */
export function findProfanity(...values: unknown[]): string | null {
  for (const value of values) {
    const parts = Array.isArray(value) ? value : [value];
    for (const part of parts) {
      if (typeof part !== "string" || !part.trim()) continue;
      const text = ` ${normalize(part)} `;
      for (const word of BANNED) {
        if (text.includes(` ${word} `) || text.includes(word)) return word;
      }
    }
  }
  return null;
}

export function containsProfanity(...values: unknown[]): boolean {
  return findProfanity(...values) !== null;
}

/**
 * Toasts and returns true when the content should be blocked.
 * Usage: `if (blockProfanity(title, description)) return;`
 */
export function blockProfanity(...values: unknown[]): boolean {
  if (!containsProfanity(...values)) return false;
  toast.error("Please remove offensive language before posting.");
  return true;
}
