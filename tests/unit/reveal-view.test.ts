import { describe, it, expect } from 'vitest';
import {
  createRevealResultContainer,
  createRevealEmptyContainer,
  resolveRevealPair,
  describeAgreedFields,
} from '../../src/bot/reveal-view.js';

describe('Mutual Reveal Result Rendering', () => {
  const room = { user1Id: 'usr_1', user2Id: 'usr_2' };

  const result = {
    user1Data: {
      destinyId: 'AAA111',
      age: 24,
      gender: 'male' as const,
      interests: ['coding'],
      discordTag: '<@disc_1>',
    },
    user2Data: {
      destinyId: 'BBB222',
      age: 22,
      gender: 'female' as const,
      interests: ['music'],
      discordTag: '<@disc_2>',
    },
  };

  it('should map room slots onto the perspective of the calling user', () => {
    const asUser1 = resolveRevealPair(room, 'usr_1', result);
    expect(asUser1.mine.destinyId).toBe('AAA111');
    expect(asUser1.partner.destinyId).toBe('BBB222');

    const asUser2 = resolveRevealPair(room, 'usr_2', result);
    expect(asUser2.mine.destinyId).toBe('BBB222');
    expect(asUser2.partner.destinyId).toBe('AAA111');
  });

  it('should return empty payloads instead of throwing when data is missing', () => {
    const pair = resolveRevealPair(room, 'usr_1', {});
    expect(pair.mine).toEqual({});
    expect(pair.partner).toEqual({});
  });

  it('should render the actual revealed partner fields, not just field names', () => {
    const { partner } = resolveRevealPair(room, 'usr_1', result);
    const json: any = createRevealResultContainer(partner).toJSON();

    const textComponents = json.components.filter((c: any) => c.type === 10);
    const content: string = textComponents[0].content;

    expect(content).toContain('BBB222');
    expect(content).toContain('22');
    expect(content).toContain('Female');
    expect(content).toContain('`music`');
    expect(content).toContain('<@disc_2>');

    // The other side's private data must never appear.
    expect(content).not.toContain('AAA111');
    expect(content).not.toContain('<@disc_1>');
  });

  it('should not render fields that were not shared', () => {
    const partial = { age: 30, interests: ['chess'] };
    const json: any = createRevealResultContainer(partial).toJSON();
    const content: string = json.components.filter((c: any) => c.type === 10)[0].content;

    expect(content).toContain('30');
    expect(content).toContain('`chess`');
    expect(content).not.toContain('**Discord:**');
    expect(content).not.toContain('**Destiny ID:**');
    expect(content).not.toContain('**Gender:**');
  });

  it('should fall back to the generic container when nothing was shared', () => {
    const json: any = createRevealResultContainer({}).toJSON();
    const content: string = json.components.filter((c: any) => c.type === 10)[0].content;

    expect(content).toContain('Mutual Profile Reveal Complete');
    expect(content).toContain('No common fields were consented to');
    expect(content).toContain('remain strictly protected');
  });

  it('should list the mutually agreed fields on the fallback container', () => {
    const json: any = createRevealEmptyContainer(['age', 'interests']).toJSON();
    const content: string = json.components.filter((c: any) => c.type === 10)[0].content;

    expect(content).toContain('Mutually Agreed Revealed Fields');
    expect(content).toContain('`age`');
    expect(content).toContain('`interests`');
  });

  it('should always include the End Chat button on the reveal result card', () => {
    const { partner } = resolveRevealPair(room, 'usr_1', result);
    const json: any = createRevealResultContainer(partner).toJSON();

    const actionRows = json.components.filter((c: any) => c.type === 1);
    const ids = actionRows.flatMap((row: any) => row.components.map((b: any) => b.custom_id));
    expect(ids).toContain('destiny_btn_leave');
  });

  it('should describe agreed fields in a readable list', () => {
    expect(describeAgreedFields(['age', 'gender'])).toBe('• `age`\n• `gender`');
    expect(describeAgreedFields([])).toBe('*No common fields were consented to.*');
  });
});
