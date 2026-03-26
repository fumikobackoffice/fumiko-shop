'use client';

import { CartItem, Product, ProductPackage, ShippingRates } from "./types";

/**
 * Calculates the total weight of items in the cart in Kilograms.
 * Only includes items that do NOT have a fixed shipping cost.
 */
export function calculateCartWeight(items: CartItem[]): number {
  return items.reduce((acc, cartItem) => {
    let weight = 0;
    let hasFixedCost = false;

    if (cartItem.type === 'PRODUCT') {
      const product = cartItem.item as Product;
      weight = product.weight || 0;
      hasFixedCost = product.fixedShippingCost !== null && product.fixedShippingCost !== undefined;
    } else if (cartItem.type === 'PACKAGE') {
      weight = (cartItem.item as ProductPackage).weight || 0;
      // Packages currently don't have a fixedShippingCost field in the type, so they default to weight-based
    }

    // Only add weight if the item doesn't have its own fixed shipping cost
    return hasFixedCost ? acc : acc + (weight * cartItem.quantity);
  }, 0);
}

/**
 * Calculates the sum of all fixed shipping costs in the cart.
 */
export function calculateTotalFixedShipping(items: CartItem[]): number {
  return items.reduce((acc, cartItem) => {
    let fixedCost = 0;
    if (cartItem.type === 'PRODUCT') {
      const product = cartItem.item as Product;
      fixedCost = product.fixedShippingCost || 0;
    }
    return acc + (fixedCost * cartItem.quantity);
  }, 0);
}

/**
 * Core shipping calculation logic based on weight and tiered rates.
 * 
 * Formula: Total Cost = Base Rate + (Steps * Step Rate) + (Blocks * Block Rate)
 * Steps = Every 500g exceeding first 500g
 * Blocks = Every 5kg (starting from > 5000g)
 */
export function calculateWeightBasedCost(totalWeightKg: number, rates: ShippingRates): number {
  if (totalWeightKg <= 0) return 0;

  const totalWeightGrams = totalWeightKg * 1000;
  
  // 1. First 500g is covered by base rate
  if (totalWeightGrams <= 500) {
    return rates.baseRate;
  }

  // 2. Steps: every 500g beyond the first 500g (rounded up)
  const steps = Math.ceil((totalWeightGrams - 500) / 500);

  // 3. Blocks: every 5kg entry (e.g., 5001g = 1 block, 10001g = 2 blocks)
  const blocks = Math.floor((totalWeightGrams - 1) / 5000);

  // 4. Sum it up
  const cost = rates.baseRate + (steps * rates.stepRate) + (blocks * rates.blockRate);
  return cost;
}

/**
 * Aggregated shipping calculation that combines Fixed Costs and Weight-based Costs.
 */
export function calculateTotalShipping(items: CartItem[], rates: ShippingRates): number {
  if (items.length === 0) return 0;
  
  const totalFixedCost = calculateTotalFixedShipping(items);
  const weightForRegularItems = calculateCartWeight(items);
  const weightBasedCost = calculateWeightBasedCost(weightForRegularItems, rates);
  
  return totalFixedCost + weightBasedCost;
}
