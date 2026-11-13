import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/storage/state-store.js', () => ({
  stateStore: { get: vi.fn(), set: vi.fn() },
}));
vi.mock('../../src/storage/locks.js', () => ({
  lockManager: {
    withLock: vi.fn(async (_resource: string, callback: () => Promise<unknown>) => callback()),
  },
}));

import { stateStore } from '../../src/storage/state-store.js';
import { lockManager } from '../../src/storage/locks.js';
import { sendCleanDmPanel } from '../../src/bot/dm-cleanup.js';

const BOT_ID = '99999999999999999';
const USER_ID = '88888888888888888';

function makeMessage(id: string, authorId = BOT_ID, deleteImpl: () => Promise<void> = async () => {}) {
  return {
    id,
    author: { id: authorId },
    embeds: [],
    components: [],
    delete: vi.fn(deleteImpl),
  } as any;
}

function makeHarness() {
  const sentMessages: any[] = [];
  const fetched = new Map<string, any>();
  let nextId = 70000000000000000n;
  const channel = {
    send: vi.fn(async () => {
      const message = makeMessage(String(nextId++));
      sentMessages.push(message);
      return message;
    }),
    messages: {
      fetch: vi.fn(async (id: string) => {
        const message = fetched.get(id);
        if (!message) throw Object.assign(new Error('Unknown Message'), { code: 10008 });
        return message;
      }),
    },
  };
  const user = {
    id: USER_ID,
    client: { user: { id: BOT_ID } },
    createDM: vi.fn(async () => channel),
  } as any;
  return { user, channel, sentMessages, fetched };
}

describe('sendCleanDmPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(stateStore.get).mockResolvedValue(null);
    vi.mocked(stateStore.set).mockResolvedValue(true);
    vi.mocked(lockManager.withLock).mockImplementation(
      async (_resource: string, callback: () => Promise<unknown>) => callback() as any
    );
  });

  it('migrates a legacy ID and persists only the new panel after deletion', async () => {
    const { user, channel, sentMessages, fetched } = makeHarness();
    const old = makeMessage('11111111111111111');
    fetched.set(old.id, old);
    vi.mocked(stateStore.get).mockResolvedValue(old.id);

    const sent = await sendCleanDmPanel(user, { embeds: [{ title: 'new panel' }] } as any);

    expect(old.delete).toHaveBeenCalledOnce();
    expect(sent).toBe(sentMessages[0]);
    expect(stateStore.set).toHaveBeenLastCalledWith(
      `dm:active-panel:${USER_ID}`,
      JSON.stringify([sent.id])
    );
    expect(channel.messages.fetch).toHaveBeenCalledOnce();
  });

  it('retains transient deletion failures and prunes successfully deleted IDs', async () => {
    const { user, fetched } = makeHarness();
    const failed = makeMessage('11111111111111111', BOT_ID, async () => {
      throw Object.assign(new Error('Missing permissions'), { code: 50013 });
    });
    const deleted = makeMessage('22222222222222222');
    fetched.set(failed.id, failed);
    fetched.set(deleted.id, deleted);
    vi.mocked(stateStore.get).mockResolvedValue(JSON.stringify([failed.id, deleted.id, deleted.id]));

    const sent = await sendCleanDmPanel(user, { embeds: [{ title: 'new panel' }] } as any);

    expect(failed.delete).toHaveBeenCalledOnce();
    expect(deleted.delete).toHaveBeenCalledOnce();
    expect(stateStore.set).toHaveBeenLastCalledWith(
      `dm:active-panel:${USER_ID}`,
      JSON.stringify([failed.id, sent.id])
    );
  });

  it('does not overwrite Supabase runtime state or delete old panels when the read fails', async () => {
    const { user, channel, sentMessages } = makeHarness();
    vi.mocked(stateStore.get).mockRejectedValueOnce(new Error('Supabase unavailable'));

    const first = await sendCleanDmPanel(user, { embeds: [{ title: 'first' }] } as any);
    expect(first).toBe(sentMessages[0]);
    expect(stateStore.set).not.toHaveBeenCalled();
    expect(channel.messages.fetch).not.toHaveBeenCalled();

    const second = await sendCleanDmPanel(user, { embeds: [{ title: 'second' }] } as any);
    expect(channel.messages.fetch).toHaveBeenCalledWith(first.id);
    expect(stateStore.set).toHaveBeenLastCalledWith(
      `dm:active-panel:${USER_ID}`,
      JSON.stringify([second.id])
    );
  });

  it('does not delete old panels when write-ahead persistence fails', async () => {
    const { user, channel, fetched } = makeHarness();
    const old = makeMessage('11111111111111111');
    fetched.set(old.id, old);
    vi.mocked(stateStore.get).mockResolvedValue(old.id);
    vi.mocked(stateStore.set).mockRejectedValueOnce(new Error('Supabase write failed'));

    await sendCleanDmPanel(user, { embeds: [{ title: 'new panel' }] } as any);

    expect(old.delete).not.toHaveBeenCalled();
    expect(channel.messages.fetch).not.toHaveBeenCalled();
    expect(stateStore.set).toHaveBeenCalledOnce();
  });

  it('does not delete old panels when sending the replacement fails', async () => {
    const { user, channel } = makeHarness();
    vi.mocked(stateStore.get).mockResolvedValue('11111111111111111');
    channel.send.mockRejectedValueOnce(new Error('Discord send failed'));

    await expect(sendCleanDmPanel(user, { embeds: [{ title: 'replacement' }] } as any)).rejects.toThrow('Discord send failed');
    expect(channel.messages.fetch).not.toHaveBeenCalled();
    expect(stateStore.set).not.toHaveBeenCalled();
  });

  it('never deletes a tracked message authored by someone else', async () => {
    const { user, fetched } = makeHarness();
    const foreign = makeMessage('11111111111111111', '77777777777777777');
    fetched.set(foreign.id, foreign);
    vi.mocked(stateStore.get).mockResolvedValue(JSON.stringify([foreign.id]));

    const sent = await sendCleanDmPanel(user, { embeds: [{ title: 'new panel' }] } as any);

    expect(foreign.delete).not.toHaveBeenCalled();
    expect(stateStore.set).toHaveBeenLastCalledWith(
      `dm:active-panel:${USER_ID}`,
      JSON.stringify([sent.id])
    );
  });

  it('sends without destructive cleanup when the distributed lock is unavailable', async () => {
    const { user, channel } = makeHarness();
    vi.mocked(lockManager.withLock).mockRejectedValueOnce(new Error('lock unavailable'));

    const sent = await sendCleanDmPanel(user, { embeds: [{ title: 'safe fallback' }] } as any);

    expect(sent).toBeDefined();
    expect(channel.messages.fetch).not.toHaveBeenCalled();
    expect(stateStore.get).not.toHaveBeenCalled();
    expect(stateStore.set).not.toHaveBeenCalled();
  });

  it('keeps every failed ID even when more than 100 panels are tracked', async () => {
    const { user, channel } = makeHarness();
    const oldIds = Array.from({ length: 125 }, (_, index) => String(30000000000000000n + BigInt(index)));
    vi.mocked(stateStore.get).mockResolvedValue(JSON.stringify(oldIds));
    channel.messages.fetch.mockRejectedValue(
      Object.assign(new Error('Missing permissions'), { code: 50013 })
    );

    const sent = await sendCleanDmPanel(user, { embeds: [{ title: 'new panel' }] } as any);

    expect(stateStore.set).toHaveBeenLastCalledWith(
      `dm:active-panel:${USER_ID}`,
      JSON.stringify([...oldIds, sent.id])
    );
  });

  it('does not expire tracking keys', async () => {
    const { user } = makeHarness();
    await sendCleanDmPanel(user, { embeds: [{ title: 'persistent panel' }] } as any);
    expect(stateStore.set).toHaveBeenCalledWith(
      `dm:active-panel:${USER_ID}`,
      expect.any(String)
    );
    expect(stateStore.set).toHaveBeenCalledTimes(2);
  });

  it('retains old references when the bot identity is unavailable', async () => {
    const { user, fetched } = makeHarness();
    const old = makeMessage('11111111111111111');
    fetched.set(old.id, old);
    user.client.user = null;
    vi.mocked(stateStore.get).mockResolvedValue(JSON.stringify([old.id]));

    const sent = await sendCleanDmPanel(user, { embeds: [{ title: 'new panel' }] } as any);

    expect(old.delete).not.toHaveBeenCalled();
    expect(stateStore.set).toHaveBeenLastCalledWith(
      `dm:active-panel:${USER_ID}`,
      JSON.stringify([old.id, sent.id])
    );
  });

  it('sends plain-text messages without ever tracking or deleting them', async () => {
    const { user, channel } = makeHarness();
    const old = makeMessage('11111111111111111');
    vi.mocked(stateStore.get).mockResolvedValue(old.id);

    const sent = await sendCleanDmPanel(user, { content: 'conversation text' } as any);

    expect(sent).toBeDefined();
    expect(channel.messages.fetch).not.toHaveBeenCalled();
    expect(stateStore.get).not.toHaveBeenCalled();
    expect(stateStore.set).not.toHaveBeenCalled();
  });
});
