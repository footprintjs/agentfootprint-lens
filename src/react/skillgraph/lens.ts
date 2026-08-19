/**
 * The debugger's two lenses — one recording, two readers.
 *
 * `'developer'` shows the record: causes, ids, the tool catalog as sent, the
 * refusal sentence the model read. `'product'` shows the SAME facts as the
 * library's own sentences, revealed in cursor order. Neither lens has data the
 * other lacks; they differ in what is said out loud, which is why this is one
 * string and not two components with two data paths.
 */
export type SkillLens = 'developer' | 'product';
