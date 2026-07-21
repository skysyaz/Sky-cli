/** A loaded skill instruction (SKILL.md / plugin skill). */
export interface Skill {
  name: string;
  description: string;
  /** Full markdown body (may be empty for name+description-only skills). */
  body: string;
  /** Where it was loaded from. */
  source: string;
}
