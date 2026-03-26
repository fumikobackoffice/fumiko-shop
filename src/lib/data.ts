import type { Product, Order } from './types';
import { PlaceHolderImages } from './placeholder-images';

// This file now primarily provides mock order data for the seller dashboard.
// Product and user data are now managed via Firestore.

const getImage = (id: string) => {
  const img = PlaceHolderImages.find((p) => p.id === id);
  return {
    imageUrl: img?.imageUrl || 'https://picsum.photos/seed/fallback/600/800',
    imageHint: img?.imageHint || 'product photo',
  };
};

// Mock products for orders. In a real app, this data would be fetched based on order items.
const mockProducts: Product[] = [
  {
    id: 'prod_1',
    name: 'Elegant Ceramic Vase',
    description: 'A beautifully handcrafted ceramic vase, perfect for adding a touch of elegance to any room. Its minimalist design complements both modern and traditional decor.',
    price: 45.0,
    ...getImage('prod_1'),
    sellerId: 'user_2', // Bob Seller's ID
    category: 'Home Decor',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'prod_2',
    name: 'Woven Straw Hat',
    description: 'Stay cool and stylish with our wide-brimmed woven straw hat. Ideal for beach days, gardening, or a sunny stroll through the city.',
    price: 25.0,
    ...getImage('prod_2'),
    sellerId: 'user_2',
    category: 'Accessories',
    createdAt: new Date().toISOString(),
  },
   {
    id: 'prod_3',
    name: 'Artisanal Scented Candle',
    description: 'Relax and unwind with the soothing aroma of our artisanal scented candle. Made with natural soy wax and essential oils, it provides a clean, long-lasting burn.',
    price: 22.0,
    ...getImage('prod_3'),
    sellerId: 'user_2',
    category: 'Home Goods',
    createdAt: new Date().toISOString(),
  },
   {
    id: 'prod_5',
    name: 'Organic Green Tea',
    description: 'Sourced from the finest local farms, our organic green tea offers a refreshing and healthy beverage. Rich in antioxidants and flavor.',
    price: 15.0,
    ...getImage('prod_5'),
    sellerId: 'user_2',
    category: 'Food & Drink',
    createdAt: new Date().toISOString(),
  },
];

export const orders: any[] = [
  {
    id: 'order_1',
    buyerId: 'user_1',
    items: [{ product: mockProducts[0], quantity: 1 }, { product: mockProducts[2], quantity: 2 }],
    totalAmount: 45.00 + (22.00 * 2),
    status: 'Shipped',
    orderDate: '2023-10-26T10:00:00Z',
    customerName: 'Alice Buyer',
  },
  {
    id: 'order_2',
    buyerId: 'user_1',
    items: [{ product: mockProducts[3], quantity: 1 }],
    totalAmount: 15.00,
    status: 'Pending',
    orderDate: '2023-10-27T11:30:00Z',
    customerName: 'Alice Buyer',
  },
  {
    id: 'order_3',
    buyerId: 'user_3',
    items: [{ product: mockProducts[1], quantity: 1 }],
    totalAmount: 25.00,
    status: 'Delivered',
    orderDate: '2023-10-25T09:00:00Z',
    customerName: 'Charlie Customer',
  },
];
