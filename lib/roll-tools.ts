import { createId, rollFateDice, FATE_PROBABILITIES, type LocalRoll } from '@/lib/fate';
export function validRollHistory(input: unknown): LocalRoll[] {
  if (!Array.isArray(input)) return [];
  const valid = input.filter((roll): roll is LocalRoll => !!roll && typeof roll.id === 'string' && roll.id.length <= 120 && Array.isArray(roll.dice) && roll.dice.length === 4 && roll.dice.every((die: unknown) => die === -1 || die === 0 || die === 1) && Number.isInteger(roll.modifier) && roll.modifier >= -22 && roll.modifier <= 22 && roll.total === roll.dice.reduce((sum: number, die: number) => sum + die, 0) + roll.modifier && typeof roll.label === 'string' && roll.label.length <= 120 && Number.isSafeInteger(roll.createdAt) && roll.createdAt >= 0 && roll.createdAt <= 8640000000000000 && (roll.source === 'room' || roll.source === 'local'));
  return [...new Map(valid.map(roll => [roll.id, roll])).values()].slice(0, 100);
}
export function createLocalRoll(modifier: number, label: string): LocalRoll {
  const result = rollFateDice();
  return { id: createId('roll'), dice: result.dice, modifier, total: result.sum + modifier, label, source: 'local', createdAt: Date.now() };
}
export const outcome = (total: number, difficulty: number) => total < difficulty ? 'failure' : total === difficulty ? 'tie' : total - difficulty >= 3 ? 'style' : 'success';
export function outcomeChances(modifier: number, difficulty: number) {
  const counts = { failure: 0, tie: 0, success: 0, style: 0 };
  for (const { total, ways } of FATE_PROBABILITIES) counts[outcome(total + modifier, difficulty)] += ways;
  return counts;
}
