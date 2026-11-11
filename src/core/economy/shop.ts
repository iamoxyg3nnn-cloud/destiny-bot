import { db } from '../../database/supabase.js';
import { lockManager } from '../../redis/locks.js';
import { ShopItem, UserProfile } from '../types.js';
import { v4 as uuidv4 } from 'uuid';

export class ShopService {
  async getCatalog(): Promise<ShopItem[]> {
    const items = await db.getShopItems();
    return items.filter((i) => i.isActive);
  }

  async purchaseItem(
    userId: string,
    itemId: string
  ): Promise<{ success: boolean; message: string; remainingBalance?: number }> {
    const items = await db.getShopItems();
    const item = items.find((i) => i.id === itemId && i.isActive);
    if (!item) {
      return { success: false, message: 'Item not found in shop catalog.' };
    }
    if (!Number.isSafeInteger(item.price) || item.price <= 0) {
      return { success: false, message: 'This shop item has an invalid price. Please contact an administrator.' };
    }

    return await lockManager.withLock(`lock:shop:${userId}`, async () => {
      // Check existing inventory (unless consumable)
      const userInv = await db.getUserInventory(userId);
      if (!item.metadata?.consumable && userInv.includes(itemId)) {
        return { success: false, message: `You already own ${item.name}. Visit your \`/wardrobe\` to equip it!` };
      }

      // Deduct coins atomically
      const refId = `shop:buy:${uuidv4()}`;
      const tx = await db.executeCoinTransaction(
        userId,
        -item.price,
        'shop_purchase',
        refId,
        { itemId, itemName: item.name }
      );

      if (!tx.success) {
        return { success: false, message: tx.error || 'Insufficient Destiny Coins balance.' };
      }

      // Persist inventory before confirming purchase. If persistence fails,
      // compensate the debit with a unique, idempotent refund transaction.
      let added = false;
      try {
        added = await db.addToUserInventory(userId, itemId, Boolean(item.metadata?.consumable));
      } catch {
        added = false;
      }
      if (!added) {
        const refund = await db.executeCoinTransaction(
          userId,
          item.price,
          'admin_adjustment',
          `shop:refund:${refId}`,
          { itemId, reason: 'inventory_persistence_failed' }
        );
        return {
          success: false,
          message: refund.success
            ? 'Purchase could not be saved; your coins have been refunded. Please try again.'
            : 'Purchase could not be saved and the automatic refund failed. Please contact support.',
        };
      }

      return {
        success: true,
        message: `Successfully purchased **${item.icon} ${item.name}**! You can equip it now in your \`/wardrobe\`.`,
        remainingBalance: tx.newBalance,
      };
    });
  }

  async getUserInventory(userId: string): Promise<ShopItem[]> {
    const allItems = await db.getShopItems();
    const ownedIds = await db.getUserInventory(userId);
    return allItems.filter((i) => ownedIds.includes(i.id));
  }

  /**
   * Equip a card theme cosmetic
   */
  async equipCardTheme(
    user: UserProfile,
    themeId: string
  ): Promise<{ success: boolean; message: string; theme: string }> {
    const allowedThemes = ['obsidian', 'cyber_damask', 'frost_glaze', 'holographic_plat'];
    const themeKey = themeId.replace('theme_', '');

    if (!allowedThemes.includes(themeKey)) {
      return { success: false, message: 'Invalid card theme selection.', theme: user.cardTheme || 'obsidian' };
    }

    // Default obsidian is free for all; others require ownership
    if (themeKey !== 'obsidian') {
      const owned = await db.getUserInventory(user.id);
      if (!owned.includes(`theme_${themeKey}`) && !owned.includes(themeKey)) {
        return {
          success: false,
          message: `You don't own the **${themeKey}** theme skin yet. Visit the \`/shop\` to unlock it!`,
          theme: user.cardTheme || 'obsidian',
        };
      }
    }

    await db.createOrUpdateUser({
      discordUserId: user.discordUserId,
      cardTheme: themeKey,
    });

    return {
      success: true,
      message: `Card theme successfully changed to **${themeKey.toUpperCase()}**!`,
      theme: themeKey,
    };
  }

  /**
   * Set up to 5 equipped insignia rack badges
   */
  async setEquippedBadges(
    user: UserProfile,
    badgeNames: string[]
  ): Promise<{ success: boolean; message: string; equippedBadges: string[] }> {
    const requested = Array.isArray(badgeNames)
      ? [...new Set(badgeNames.filter((name) => typeof name === 'string' && name.trim().length > 0))]
      : [];
    const [inventory, items] = await Promise.all([
      db.getUserInventory(user.id),
      db.getShopItems(),
    ]);
    const ownedBadgeAliases = new Set<string>();
    for (const item of items) {
      if (!item.isActive || item.category !== 'badge' || !inventory.includes(item.id)) continue;
      ownedBadgeAliases.add(item.id);
      ownedBadgeAliases.add(item.name);
      if (typeof item.metadata?.badge === 'string') ownedBadgeAliases.add(item.metadata.badge);
    }
    const cleanBadges = requested.filter((name) => ownedBadgeAliases.has(name)).slice(0, 5);
    if (cleanBadges.length !== requested.length) {
      return {
        success: false,
        message: 'You can equip only badges you own. Purchase additional insignias from the shop first.',
        equippedBadges: user.equippedBadges || [],
      };
    }
    await db.createOrUpdateUser({
      discordUserId: user.discordUserId,
      equippedBadges: cleanBadges,
    });

    return {
      success: true,
      message: `Insignia rack updated with **${cleanBadges.length}** active badges!`,
      equippedBadges: cleanBadges,
    };
  }
}

export const shopService = new ShopService();
