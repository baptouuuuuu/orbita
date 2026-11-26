import { z } from 'zod';

export const stationMessage = z.discriminatedUnion('type', [
  z.object({ version: z.literal(1), type: z.literal('status'), status: z.enum(['ready', 'busy', 'finished', 'error', 'offline']), message: z.string().max(500).optional() }).strict(),
  z.object({ version: z.literal(1), type: z.literal('event'), message: z.string().trim().min(1).max(500) }).strict(),
]);
export type StationMessage = z.infer<typeof stationMessage>;

export interface StationAdapter {
  receive(stationId: string, message: StationMessage): void;
  command(stationId: string, command: { version: 1; type: 'ping' }): void;
}
